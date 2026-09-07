import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { BuildGraphProvider, buildInputDigest, parseBuildQuery } from "../core/build-graph";
import { BUILD_GRAPH_LIMITS, BuildGraphDataSchema, BuildGraphRequestSchema } from "../protocol/build-graph";
import { buildTargets, fileBuildTargets, selectBuildView } from "../app/renderer/repository/build-view";
import { buildGraphLinks } from "../app/renderer/repository/use-build-graph";

const digest = "a".repeat(64), other = "b".repeat(64);
const rule = (name: string, inputs: string[] = []) => ({ type: "RULE", rule: { name, ruleClass: "filegroup", location: `${name.slice(2).split(":")[0]}/BUILD:1:1`, ruleInput: inputs } });
const output = (...values: unknown[]) => Buffer.from(values.map((value) => JSON.stringify(value)).join("\n") + "\n");
const sample = () => output(rule("//a:looks.ts", ["//b:library", "//a:no_extension"]), rule("//b:library"), rule("//b:isolated"), { type: "SOURCE_FILE", sourceFile: { name: "//a:no_extension" } });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

it("uses typed rule/file membership, preserves isolated and cross-package rules, and opens actual BUILD", () => {
  const parsed = parseBuildQuery(sample());
  const graph = BuildGraphDataSchema.parse({ ...parsed, repositoryId: "repo-a", worldId: "world-a", inputDigest: digest, observedAt: new Date().toISOString(), command: "fixed query" });
  const links = buildGraphLinks({ repositoryId: "repo-a", worldId: "world-a", generation: 1, status: "current", message: "observed", graph })!;
  expect(buildTargets(links)).toEqual(["//a:looks.ts", "//b:isolated", "//b:library"]);
  expect(fileBuildTargets(links, "a/no_extension")).toEqual(["//a:looks.ts"]);
  expect(selectBuildView(links, ["//..."], false).depths.size).toBe(3);
  expect(parsed.targets[0]?.buildFile).toBe("a/BUILD");
  expect(parsed.complete).toBe(true);
});
it("keeps external target identity without fabricating a local path", () => {
  const parsed = parseBuildQuery(output(rule("//a:x", ["@dep//b:y"]), rule("@dep//b:y")));
  expect(parsed.targets[1]?.path).toBeNull();
  expect(parsed.edges).toEqual([{ from: "//a:x", to: "@dep//b:y" }]);
});
it("rejects malformed/truncated/duplicate/invalid utf8 output and labels omitted inputs partial", () => {
  for (const value of [Buffer.from("{"), Buffer.from('{"type":"RULE"}\n'), Buffer.from([0xff, 10]), output(rule("//a:x"), rule("//a:x"))])
    expect(() => parseBuildQuery(value)).toThrow();
  expect(parseBuildQuery(output(rule("//a:x", ["//unknown:omitted"]))).complete).toBe(false);
  expect(() => parseBuildQuery(Buffer.alloc(BUILD_GRAPH_LIMITS.bytes + 1))).toThrow(/bound/);
});
it("reports target overflow as partial with no dangling edges", () => {
  const parsed = parseBuildQuery(output(...Array.from({ length: BUILD_GRAPH_LIMITS.targets + 1 }, (_, index) => rule(`//a:n${index}`, ["//a:n2000"]))));
  expect(parsed.targets).toHaveLength(BUILD_GRAPH_LIMITS.targets);
  expect(parsed.complete).toBe(false); expect(parsed.edges).toHaveLength(0);
});
it("rejects renderer executable/cwd/query authority", () => {
  const request = { protocolVersion: 7, requestId: "a", type: "buildGraph.observe", repositoryId: "r", worldId: "w", refresh: false };
  expect(BuildGraphRequestSchema.parse(request)).toEqual(request);
  for (const field of ["cwd", "query", "executable"]) expect(BuildGraphRequestSchema.safeParse({ ...request, [field]: "arbitrary" }).success).toBe(false);
});

describe("repository observation lifetime", () => {
  it("coalesces demand, ignores source-only digest repeats and refreshes changed inputs", async () => {
    let now = 1000, current = digest;
    const query = vi.fn(async () => sample());
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => current, query, now: () => now });
    expect(provider.observe().status).toBe("refreshing"); provider.observe(true); await flush();
    expect(provider.observe().status).toBe("current"); expect(query).toHaveBeenCalledTimes(1);
    now += 2000; provider.observe(); await flush(); expect(query).toHaveBeenCalledTimes(1);
    current = other; now += 2000; provider.observe(); await flush();
    expect(query).toHaveBeenCalledTimes(2); expect(provider.observe().graph?.inputDigest).toBe(other);
    await provider.dispose(); expect(() => provider.observe()).toThrow(/disposed/);
  });
  it("retains prior graph while refreshing/failure and does not auto-retry unchanged failed inputs", async () => {
    let now = 1000, current = digest, fail = false;
    const query = vi.fn(async () => { if (fail) throw new Error("bounded failure"); return sample(); });
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => current, query, now: () => now });
    provider.observe(); await flush(); const old = provider.observe().graph;
    current = other; fail = true; now += 2000; provider.observe(); await flush();
    expect(provider.observe().status).toBe("error"); expect(provider.observe().graph).toEqual(old);
    now += 2000; provider.observe(); await flush(); expect(query).toHaveBeenCalledTimes(2);
    fail = false; provider.observe(true); await flush(); expect(provider.observe().status).toBe("current");
    await provider.dispose();
  });
  it("fences input movement and disposal during a held query, never sharing another repository", async () => {
    let resolve!: (value: Uint8Array) => void, moved = false;
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => moved ? other : digest, query: () => new Promise((done) => { resolve = done; }), now: () => 1000 });
    provider.observe(); await flush(); moved = true; resolve(sample()); await flush();
    expect(provider.observe().status).toBe("stale"); expect(provider.observe().graph).toBeUndefined();
    provider.observe(true); await flush(); const closing = provider.dispose(); resolve(sample()); await closing;
    const separate = new BuildGraphProvider("/b", "other-repo", "other-world", { digest: async () => null, query: vi.fn(), now: () => 1000 });
    separate.observe(); await flush(); expect(separate.observe().status).toBe("unavailable"); expect(separate.observe().graph).toBeUndefined();
    await separate.dispose();
  });
});

it("observes real tracked/nonignored membership and definitions but not source text edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "swarm-build-input-test-")); paths.push(root);
  execFileSync("git", ["init", "-q", root]);
  await writeFile(join(root, "WORKSPACE"), "workspace(name='demo')\n"); await mkdir(join(root, "pkg"));
  await writeFile(join(root, "pkg/BUILD"), "filegroup(name='files', srcs=glob(['*.txt']))\n"); await writeFile(join(root, "pkg/a.txt"), "a");
  const signal = new AbortController().signal;
  const before = await buildInputDigest(root, signal);
  await writeFile(join(root, "pkg/a.txt"), "source edit"); expect(await buildInputDigest(root, signal)).toBe(before);
  await writeFile(join(root, "pkg/b.txt"), "membership"); expect(await buildInputDigest(root, signal)).not.toBe(before);
  const added = await buildInputDigest(root, signal);
  await writeFile(join(root, "pkg/BUILD"), "filegroup(name='other')\n"); expect(await buildInputDigest(root, signal)).not.toBe(added);
});
