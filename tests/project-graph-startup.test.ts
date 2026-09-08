// @vitest-environment node
import { expect, it, vi } from "vitest";
import { BuildGraphProvider, collectBuildQuery, parseBuildQuery, type BuildQueryOptions } from "../core/build-graph";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

const record = (extra = "") => Buffer.from(JSON.stringify({ type: "RULE", rule: {
  name: "//:app", ruleClass: "filegroup", location: "BUILD.bazel:1:1", ignoredMetadata: extra,
} }) + "\n");
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

it("loads declared dependencies on first observation and changed build inputs, never unchanged ticks", async () => {
  let now = 2000, digest = "a".repeat(64);
  const query = vi.fn(async (_root: string, _signal: AbortSignal, _trace?: unknown, options?: BuildQueryOptions) => {
    if (!options?.allowDownloads) throw new Error("dependency setup requires downloads");
    return record();
  });
  const provider = new BuildGraphProvider("/project", "repo", "world", { digest: async () => digest, query, now: () => now });
  provider.observe(); await flush();
  expect(provider.observe().status).toBe("current");
  const initial = provider.observe().graph;
  now += 2000; provider.observe(); await flush();
  expect(provider.observe().graph).toEqual(initial); expect(query).toHaveBeenCalledOnce();
  digest = "b".repeat(64); now += 2000;
  expect(provider.observe().graph).toEqual(initial); await flush();
  expect(provider.observe().graph?.inputDigest).toBe(digest);
  expect(query.mock.calls.map((call) => call[3]?.allowDownloads)).toEqual([true, true]);
  await provider.dispose();
});

it("waits for explicit retry after unchanged automatic setup fails", async () => {
  let now = 2000;
  const query = vi.fn(async () => { throw new Error("network unavailable"); });
  const provider = new BuildGraphProvider("/project", "repo", "world", { digest: async () => "a".repeat(64), query, now: () => now });
  provider.observe(); await flush();
  for (let i = 0; i < 5; i++) { now += 5000; provider.observe(); await flush(); }
  expect(query).toHaveBeenCalledOnce(); expect(provider.observe().status).toBe("error");
  provider.observe(true); await flush(); expect(query).toHaveBeenCalledTimes(2);
  await provider.dispose();
});

it("parses useful targets from a valid raw record exceeding the old 4 MiB output cap", () => {
  const bytes = record("x".repeat(4 * 1024 * 1024));
  expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024);
  expect(parseBuildQuery(bytes)).toMatchObject({ complete: true, targets: [{ label: "//:app", kind: "rule" }] });
});

it("drains raw query output above 4 MiB with bounded diagnostics and confirmed cleanup", async () => {
  let sink!: CodexTransportSink;
  const close = vi.fn(async () => ({ status: "confirmed" as const, observedAt: new Date().toISOString(), detail: "owned test process" }));
  const progress = vi.fn();
  const result = collectBuildQuery((listener) => { sink = listener; return { write() {}, close }; }, new AbortController().signal,
    undefined, { maximumBytes: null, onProgress: progress });
  const bytes = record("x".repeat(5 * 1024 * 1024));
  sink.stderr(Buffer.alloc(5 * 1024 * 1024, 120));
  for (let offset = 0; offset < bytes.length; offset += 65536) sink.stdout(bytes.subarray(offset, offset + 65536));
  sink.exit(0); sink.end();
  expect(Buffer.from(await result).equals(bytes)).toBe(true); expect(close).toHaveBeenCalledOnce();
  expect(progress.mock.calls.some(([message]) => message.includes("5 MiB"))).toBe(true);
  expect(progress.mock.calls.every(([message]) => message.length <= 460)).toBe(true);
});
