// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BuildGraphProvider, buildQueryArgs, collectBuildQuery, type BuildQueryOptions } from "../core/build-graph";
import { RealWorkspaceProvider } from "../core/provider";
import { discoverServices } from "../core/service-discovery";
import { BuildGraphRequestSchema } from "../protocol/build-graph";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
const output = Buffer.from(JSON.stringify({ type: "RULE", rule: { name: "//:own", ruleClass: "filegroup", location: "BUILD.bazel:1:1" } }) + "\n");
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

it("observes an unrelated Bazel project with no service declarations without producing build evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "swarm-service-compatibility-")); paths.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  await writeFile(join(root, "MODULE.bazel"), 'module(name="other")');
  const fingerprint = vi.fn(async () => "a".repeat(64));
  const discover = vi.fn(discoverServices);
  const provider = await RealWorkspaceProvider.create(root, { register: async () => ({ root, id: `repository:${"a".repeat(64)}`, name: "Other" }),
    discover, fingerprint, now: () => new Date().toISOString() });
  try {
    await provider.startReconciliation(() => {});
    expect(discover).toHaveBeenCalledExactlyOnceWith(root, expect.any(AbortSignal)); expect(fingerprint).toHaveBeenCalledTimes(2);
    expect(provider.snapshot().jobs).toEqual([]); expect(provider.snapshot().revisions.built).toEqual({ id: "", sourceFingerprint: "" });
    expect(provider.snapshot().reconciliation.message).toBe("No service declarations found");
    expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
  } finally { provider.dispose(); }
});

it("keeps passive queries offline; only deliberate refresh authorizes declared dependency loading", async () => {
  expect(buildQueryArgs()).toContain("--repository_disable_download");
  expect(buildQueryArgs(true)).not.toContain("--repository_disable_download");
  expect(buildQueryArgs(true)).toContain("--lockfile_mode=off");
  expect(buildQueryArgs(true)).toContain("//...:*");
  const query = vi.fn(async (_root: string, _signal: AbortSignal, _trace?: unknown, options?: BuildQueryOptions) => {
    if (!options?.allowDownloads) throw new Error("rules_python: download is disabled");
    options.onProgress?.("Downloading rules_python"); return output;
  });
  let now = 2000;
  const provider = new BuildGraphProvider("/other", "r", "w", { digest: async () => "a".repeat(64), query, now: () => now });
  provider.observe(); await flush(); expect(provider.observe().message).toContain("download is disabled");
  now += 2000; provider.observe(); await flush(); expect(query).toHaveBeenCalledTimes(1);
  provider.observe(true); await flush(); expect(provider.observe().status).toBe("current");
  expect(query.mock.calls.map((call) => call[3]?.allowDownloads)).toEqual([false, true]);
  await provider.dispose();
});

it("cancels loading, retains prior graph and does not restart it on passive observation", async () => {
  let loading = false;
  const query = vi.fn(async (_root: string, signal: AbortSignal) => {
    if (!loading) return output;
    return new Promise<Buffer>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Build query cancelled")), { once: true }));
  });
  const provider = new BuildGraphProvider("/other", "r", "w", { digest: async () => "a".repeat(64), query, now: Date.now });
  provider.observe(); await flush(); const graph = provider.observe().graph;
  loading = true; provider.observe(true); await flush();
  expect(provider.cancel().message).toContain("cleanup"); await flush();
  expect(provider.observe()).toMatchObject({ status: "error", message: "Build query cancelled", graph });
  provider.observe(); await flush(); expect(query).toHaveBeenCalledTimes(2);
  loading = false; provider.observe(true); await flush(); expect(provider.observe().status).toBe("current");
  await provider.dispose();
});

it("retains useful bounded stderr and progress, waits for cleanup on query failure", async () => {
  let sink!: CodexTransportSink;
  let finish!: (value: { status: "confirmed"; observedAt: string; detail: string }) => void;
  const cleanup = new Promise<{ status: "confirmed"; observedAt: string; detail: string }>((resolve) => { finish = resolve; });
  const progress = vi.fn();
  const pending = collectBuildQuery((value) => { sink = value; return { write() {}, close: () => cleanup }; }, new AbortController().signal, undefined, { allowDownloads: true, onProgress: progress });
  sink.stderr(Buffer.from("x".repeat(8000) + "\nERROR: rules_python download failed: certificate rejected\n"));
  sink.exit(7); sink.end();
  const assertion = expect(pending).rejects.toThrow(/rules_python download failed: certificate rejected/);
  finish({ status: "confirmed", observedAt: new Date().toISOString(), detail: "controlled cleanup" }); await assertion;
  expect(progress.mock.calls[0]![0].length).toBeLessThanOrEqual(460);
});

it("does not publish current when cancelled during the final input read", async () => {
  let release!: (digest: string) => void, reads = 0;
  const provider = new BuildGraphProvider("/other", "r", "w", { digest: async () => ++reads === 2 ? new Promise<string>((resolve) => { release = resolve; }) : "a".repeat(64), query: async () => output, now: Date.now });
  provider.observe(true); await flush(); provider.cancel(); release("a".repeat(64)); await flush();
  expect(provider.observe()).toMatchObject({ status: "error", message: "Build query cancelled" });
  expect(provider.observe().graph).toBeUndefined(); await provider.dispose();
});

it("a coalesced second observation does not strand the owned discovery failure", async () => {
  let rejectDiscovery!: (error: Error) => void;
  const provider = await RealWorkspaceProvider.create("/unused", { register: async (root) => ({ root, id: `repository:${"a".repeat(64)}`, name: "Controlled" }),
    fingerprint: async () => "a".repeat(64), now: () => new Date().toISOString(),
    discover: () => new Promise((_resolve, reject) => { rejectDiscovery = reject; }) });
  const admitted = provider.startReconciliation(() => {}); await flush();
  expect(provider.snapshot().reconciliation.status).toBe("yellow");
  const coalesced = provider.startReconciliation(() => {}); expect(coalesced).toBe(admitted);
  rejectDiscovery(new Error("actual declaration scan failed")); await admitted;
  expect(provider.snapshot().reconciliation).toMatchObject({ status: "red", message: "actual declaration scan failed" });
  expect(provider.snapshot().jobs).toEqual([]); provider.dispose();
});

it("keeps refresh and cancel mutually exclusive under the typed repository/world request", () => {
  const request = { protocolVersion: 7, requestId: "r", type: "buildGraph.observe", repositoryId: "repo", worldId: "world", refresh: false, cancel: true };
  // Use the current protocol rather than freezing a historical wire version.
  return import("../protocol/common").then(({ PROTOCOL_VERSION }) => {
    expect(BuildGraphRequestSchema.safeParse({ ...request, protocolVersion: PROTOCOL_VERSION }).success).toBe(true);
    expect(BuildGraphRequestSchema.safeParse({ ...request, protocolVersion: PROTOCOL_VERSION, refresh: true }).success).toBe(false);
  });
});
