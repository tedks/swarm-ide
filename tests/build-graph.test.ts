import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { BUILD_QUERY_ARGS, BuildGraphProvider, BuildQueryCleanupError, buildInputDigest, collectBuildQuery, parseBuildQuery, queryBuildGraph } from "../core/build-graph";
import type { CodexTransportSink } from "../core/agents/codex-app-server";
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

const cleanupEvidence = { status: "confirmed" as const, observedAt: "2026-09-07T18:00:00.000Z", detail: "Controlled owner cleanup" };
it("declares pinned runtime paths and rejects missing or repository-controlled Bazel configuration", async () => {
  const flake = await readFile("flake.nix", "utf8");
  expect(flake).toContain('SWARM_BAZEL_BIN = "${pkgs.bazel_7}/bin/bazel-${pkgs.bazel_7.version}-linux-');
  expect(flake).toContain('SWARM_BAZEL_JAVA_HOME = "${pkgs.jdk21_headless}"');
  expect(BUILD_QUERY_ARGS).toContain("--repository_disable_download");
  expect(BUILD_QUERY_ARGS.at(-1)).toBe("//...:*");
  try {
    vi.stubEnv("SWARM_BAZEL_JAVA_HOME", "/nix/store/fixed-java");
    for (const path of ["", "/tmp/repository/tools/bazel", "/nix/store/fixed/bin/bazel", "/nix/store/../tmp/bazel-7.6.0-linux-x86_64"]) {
      vi.stubEnv("SWARM_BAZEL_BIN", path);
      await expect(queryBuildGraph("/unused-root", new AbortController().signal)).rejects.toThrow(/Configured pinned Bazel 7/);
    }
  } finally { vi.unstubAllEnvs(); }
});
it("closes the owner on exit, then drains late stdout and waits for confirmed cleanup", async () => {
  let sink!: CodexTransportSink, release!: (value: typeof cleanupEvidence) => void;
  const close = vi.fn(() => new Promise<typeof cleanupEvidence>((done) => { release = done; }));
  const result = collectBuildQuery((listener) => { sink = listener; return { write() {}, close }; }, new AbortController().signal);
  let done = false; void result.then(() => { done = true; });
  sink.stdout(Buffer.from("first")); sink.exit(0); expect(close).toHaveBeenCalledTimes(1);
  sink.stdout(Buffer.from("last\n")); await flush(); expect(done).toBe(false);
  sink.end(); await flush(); expect(done).toBe(false); release(cleanupEvidence);
  expect(Buffer.from(await result).toString()).toBe("firstlast\n"); expect(close).toHaveBeenCalledTimes(1);
});
it("handles stdout EOF before exit and refuses unknown cleanup", async () => {
  let sink!: CodexTransportSink;
  const close = vi.fn(async () => ({ ...cleanupEvidence, status: "unknown" as const }));
  const result = collectBuildQuery((listener) => { sink = listener; return { write() {}, close }; }, new AbortController().signal);
  const failure = expect(result).rejects.toBeInstanceOf(BuildQueryCleanupError);
  sink.end(); expect(close).not.toHaveBeenCalled(); sink.exit(0); await failure;
});
it("bounds query timeout, output and explicit cancellation with one owned close", async () => {
  vi.useFakeTimers();
  try {
    for (const kind of ["timeout", "overflow", "cancel"] as const) {
      let sink!: CodexTransportSink; const controller = new AbortController();
      const close = vi.fn(async () => cleanupEvidence);
      const result = collectBuildQuery((listener) => { sink = listener; return { write() {}, close }; }, controller.signal);
      const failure = expect(result).rejects.toThrow(kind === "timeout" ? /deadline/ : kind === "overflow" ? /byte bound/ : /cancelled/);
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(30000);
      else if (kind === "overflow") sink.stderr(Buffer.alloc(BUILD_GRAPH_LIMITS.bytes + 1));
      else controller.abort();
      await failure; expect(close).toHaveBeenCalledTimes(1);
    }
  } finally { vi.useRealTimers(); }
});

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
it("preserves declared external edges as explicitly unresolved targets, not invented rules", () => {
  const parsed = parseBuildQuery(output(rule("//a:x", ["@dep//b:y"])));
  expect(parsed.targets[1]).toEqual({ label: "@dep//b:y", kind: "unresolved", path: null });
  expect(parsed.edges).toEqual([{ from: "//a:x", to: "@dep//b:y" }]); expect(parsed.complete).toBe(false);
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
  it("preserves an initial failure across passive demand so explicit retry remains available", async () => {
    let now = 1000;
    const query = vi.fn(async () => { throw new Error("initial query failed"); });
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => digest, query, now: () => now });
    provider.observe(); await flush(); expect(provider.observe().status).toBe("error");
    now += 2000; provider.observe(); await flush(); expect(provider.observe().status).toBe("error");
    expect(query).toHaveBeenCalledTimes(1); await provider.dispose();
  });
  it("coalesces demand, ignores source-only digest repeats and refreshes changed inputs", async () => {
    let now = 1000, current = digest;
    const query = vi.fn(async () => sample());
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => current, query, now: () => now });
    expect(provider.observe().status).toBe("refreshing"); provider.observe(false); await flush();
    expect(provider.observe().status).toBe("current"); expect(query).toHaveBeenCalledTimes(1);
    now += 2000; provider.observe(); await flush(); expect(query).toHaveBeenCalledTimes(1);
    current = other; now += 2000; provider.observe(); await flush();
    expect(query).toHaveBeenCalledTimes(2); expect(provider.observe().graph?.inputDigest).toBe(other);
    await provider.dispose(); expect(() => provider.observe()).toThrow(/disposed/);
  });
  it("holds subsequent queries and shutdown attestation after unknown cleanup", async () => {
    const query = vi.fn(async () => { throw new BuildQueryCleanupError("unknown cleanup"); });
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: async () => digest, query, now: () => 1000 });
    provider.observe(); await flush(); provider.observe(true); await flush(); expect(query).toHaveBeenCalledTimes(1);
    await expect(provider.dispose()).rejects.toBeInstanceOf(BuildQueryCleanupError);
  });
  it("coalesces explicit refreshes arriving behind an in-flight input sample into one next query", async () => {
    let release!: (value: string) => void;
    const sampleDigest = vi.fn().mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; })).mockResolvedValue(digest);
    const query = vi.fn(async () => sample());
    const provider = new BuildGraphProvider("/a", "r", "w", { digest: sampleDigest, query, now: () => 1000 });
    provider.observe(); provider.observe(true); provider.observe(true); release(digest); await flush(); await flush();
    expect(query).toHaveBeenCalledTimes(2); expect(provider.observe().status).toBe("current"); await provider.dispose();
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
  execFileSync("git", ["add", "--all"], { cwd: root });
  const signal = new AbortController().signal;
  const before = await buildInputDigest(root, signal);
  await writeFile(join(root, "pkg/a.txt"), "source edit"); expect(await buildInputDigest(root, signal)).toBe(before);
  await writeFile(join(root, "pkg/b.txt"), "membership"); expect(await buildInputDigest(root, signal)).not.toBe(before);
  const added = await buildInputDigest(root, signal);
  await writeFile(join(root, "pkg/BUILD"), "filegroup(name='other')\n"); expect(await buildInputDigest(root, signal)).not.toBe(added);
  const changed = await buildInputDigest(root, signal);
  await unlink(join(root, "pkg/a.txt")); expect(await buildInputDigest(root, signal)).not.toBe(changed);
  await symlink("pkg", join(root, "alias")); const linked = await buildInputDigest(root, signal);
  await unlink(join(root, "alias")); await symlink("elsewhere", join(root, "alias")); expect(await buildInputDigest(root, signal)).not.toBe(linked);
  await symlink("BUILD", join(root, "pkg/linked.bzl")); await expect(buildInputDigest(root, signal)).rejects.toThrow(/Symlinked build definitions are unsupported/);
});
