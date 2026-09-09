import { afterEach, describe, it, expect, vi } from "vitest";
import { TargetBuildService } from "../core/build-jobs";
import { collectTargetBuild, createTargetBuildExecutor, type TargetBuildResult } from "../core/target-build-process";
import { BuildJobRequestSchema, TargetBuildJobSchema } from "../protocol/build-jobs";
import { createOwnedCodexTransport } from "../core/agents/owner";
import { watchBuildProgress } from "../core/build-progress";
import { mkdtemp, rm } from "node:fs/promises";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

vi.mock("../core/agents/owner", () => ({ createOwnedCodexTransport: vi.fn() }));
vi.mock("../core/build-progress", () => ({ watchBuildProgress: vi.fn(() => ({ stop: async () => {} })) }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  access: vi.fn(async () => {}), realpath: vi.fn(async (path: string) => path),
  mkdtemp: vi.fn(async () => "/tmp/swarm-selected-target-unit"), rm: vi.fn(async () => {}),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const context = { repositoryId: "repo", worldId: "world", requestId: "request", protocolVersion: 7 as const };
const start = { ...context, type: "build.start" as const, target: "//lib:build" };
const confirmed = { status: "confirmed" as const, observedAt: "2026-09-08T12:00:00.000Z", detail: "owned cleanup" };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness() {
  let resolve!: (value: TargetBuildResult) => void, signal!: AbortSignal, progress!: (message: string) => void;
  const run = vi.fn((_target: string, abort: AbortSignal, publish: (message: string) => void) => {
    signal = abort; progress = publish;
    return new Promise<TargetBuildResult>((done) => { resolve = done; });
  });
  const dispose = vi.fn(async () => {});
  const service = new TargetBuildService("/repo", "repo", "world", { run, dispose });
  return { service, run, dispose, get signal() { return signal; }, progress(message: string) { progress(message); }, finish(value: Partial<TargetBuildResult> = {}) { resolve({ exitCode: 0, cleanup: "confirmed", output: "", ...value }); } };
}

describe("explicit target jobs", () => {
  it.each(["build", "test"])("admits the fixed %s operation and preserves legacy job observations", (operation) => {
    expect(BuildJobRequestSchema.safeParse({ ...start, operation }).success).toBe(true);
    const legacy = { id: "legacy", target: start.target, status: "succeeded", startedAt: confirmed.observedAt,
      elapsedMs: 1, message: "Build complete", output: "", cleanup: "confirmed" };
    expect(TargetBuildJobSchema.parse(legacy)).toEqual(legacy);
  });
  it.each(["run", "clean", "test --run_under=sh", "", null])("rejects unsupported operation %s", (operation) => {
    expect(BuildJobRequestSchema.safeParse({ ...start, operation }).success).toBe(false);
  });
  it.each(["--help", "//...", "//:all", "//pkg:all-targets", "//pkg:*", "@other//:run", "//../:run", "//pkg:../run", "//pkg:run;rm", "//pkg:run\n"])('rejects non-single target %s', (target) => {
    expect(BuildJobRequestSchema.safeParse({ ...start, target }).success).toBe(false);
  });
  it("validates workspace before admission; observes without building; reserves synchronously", async () => {
    const h = harness();
    expect(() => h.service.request({ ...start, repositoryId: "different" })).toThrow(/different workspace/);
    expect(h.service.request({ ...context, type: "build.observe" }).jobs).toEqual([]);
    expect(h.run).not.toHaveBeenCalled();
    const admitted = h.service.request(start);
    expect(admitted.jobs[0]?.target).toBe("//lib:build");
    expect(admitted.jobs[0]?.operation).toBe("build");
    expect(() => h.service.request(start)).toThrow(/already running/);
    await tick(); expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenCalledWith(start.target, h.signal, expect.any(Function), "build");
    h.progress("Configured //lib:build");
    expect(h.service.observe().jobs[0]?.message).toBe("Configured //lib:build");
    h.finish(); await tick();
    expect(h.service.observe().jobs[0]?.status).toBe("succeeded");
    await h.service.dispose();
  });
  it("passes explicit tests to the executor and reports tests passed only after completion", async () => {
    const h = harness();
    expect(h.service.request({ ...start, operation: "test" }).jobs[0]).toMatchObject({ operation: "test", status: "running", message: "Starting Bazel tests" });
    await tick();
    expect(h.run).toHaveBeenCalledWith(start.target, h.signal, expect.any(Function), "test");
    h.finish(); await tick();
    expect(h.service.observe().jobs[0]).toMatchObject({ operation: "test", status: "succeeded", message: "Tests passed" });
    await h.service.dispose();
  });
  it.each([
    { exitCode: 3, output: "assertion failed", message: "Tests failed: Bazel exited with 3" },
    { exitCode: 4, output: "No test targets were found", message: "Tests failed: no tests were found for the selected target" },
    { exitCode: 0, output: "", error: "Tests exceeded their time limit", message: "Tests failed: Tests exceeded their time limit" },
  ])("does not call failed, empty or timed-out tests a success: $exitCode $error", async ({ message, ...result }) => {
    const h = harness(); h.service.request({ ...start, operation: "test" }); await tick(); h.finish(result); await tick();
    expect(h.service.observe().jobs[0]).toMatchObject({ status: "failed", operation: "test", message, output: result.output });
    await h.service.dispose();
  });
  it("retains test identity when Stop wins a successful exit race", async () => {
    const h = harness(), jobId = h.service.request({ ...start, operation: "test" }).jobs[0]!.id; await tick();
    expect(h.service.request({ ...context, type: "build.cancel", jobId }).jobs[0]).toMatchObject({ status: "stopping", message: "Stopping tests" });
    h.progress("late build completion"); expect(h.service.observe().jobs[0]?.message).toBe("Stopping tests");
    h.finish(); await tick();
    expect(h.service.observe().jobs[0]).toMatchObject({ status: "cancelled", operation: "test", message: "Tests cancelled" });
    await h.service.dispose();
  });
  it("retains failed and successful jobs independent of subsequent reads/source refresh", async () => {
    const h = harness(); h.service.request(start); await tick(); h.finish(); await tick();
    const first = h.service.observe().jobs[0];
    h.service.request({ ...start, target: "//lib:fails" }); await tick(); h.finish({ exitCode: 1, output: "compiler error" }); await tick();
    const observed = h.service.request({ ...context, type: "build.observe" });
    expect(observed.jobs.map((job) => job.status)).toEqual(["failed", "succeeded"]);
    expect(observed.jobs[0]?.output).toBe("compiler error");
    expect(observed.jobs[1]).toEqual(first);
    observed.jobs.pop(); expect(h.service.observe().jobs).toHaveLength(2);
    await h.service.dispose();
  });
  it("Stop is scoped/idempotent and does not call cancelled complete until cleanup finishes", async () => {
    const h = harness(); const id = h.service.request(start).jobs[0]!.id; await tick();
    expect(() => h.service.request({ ...context, type: "build.cancel", jobId: "wrong" })).toThrow(/not present/);
    const cancel = { ...context, type: "build.cancel" as const, jobId: id };
    expect(h.service.request(cancel).jobs[0]?.status).toBe("stopping");
    expect(h.signal.aborted).toBe(true); h.service.request(cancel);
    h.progress("late milestone"); expect(h.service.observe().jobs[0]?.message).toBe("Stopping build");
    h.finish(); await tick(); expect(h.service.observe().jobs[0]?.status).toBe("cancelled");
    h.service.request(cancel); expect(h.run).toHaveBeenCalledTimes(1); await h.service.dispose();
  });
  it.each(["build", "test"] as const)("unknown %s cleanup blocks launches and shutdown attestation", async (operation) => {
    const h = harness(); h.service.request({ ...start, operation }); await tick(); h.finish({ cleanup: "unknown" }); await tick();
    expect(h.service.observe().blocked).toBe(true);
    expect(h.service.observe().jobs[0]?.status).toBe("failed");
    expect(() => h.service.request(start)).toThrow(/cleanup/);
    await expect(h.service.dispose()).rejects.toThrow(/cleanup/); expect(h.dispose).not.toHaveBeenCalled();
  });
  it.each(["build", "test"] as const)("shutdown waits for the owned active %s before disposing its cache", async (operation) => {
    const h = harness(); h.service.request({ ...start, operation }); await tick();
    let stopped = false; const closing = h.service.dispose().then(() => { stopped = true; });
    await tick(); expect(h.signal.aborted).toBe(true); expect(stopped).toBe(false); expect(h.dispose).not.toHaveBeenCalled();
    expect(() => h.service.request(start)).toThrow(/shutting down/);
    h.finish(); await closing; expect(h.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("fixed target operation execution", () => {
  it.each([undefined, "build", "test"] as const)("launches only the selected %s operation in the owned root and private cache", async (operation) => {
    vi.stubEnv("PATH", "/fixed/bin");
    vi.stubEnv("SWARM_BAZEL_BIN", "/nix/store/fixed/bin/bazel-7.6.0-linux-x86_64");
    vi.stubEnv("SWARM_BAZEL_JAVA_HOME", "/nix/store/fixed-java");
    vi.mocked(createOwnedCodexTransport).mockImplementation((_options, sink) => {
      queueMicrotask(() => { sink.exit(0); sink.end(); });
      return { write() {}, close: async () => confirmed };
    });
    const executor = createTargetBuildExecutor("/owned/repository"), progress = vi.fn();
    const signal = new AbortController().signal;
    expect(await executor.run("//lib:chosen", signal, progress, operation)).toMatchObject({ exitCode: 0, cleanup: "confirmed" });
    const options = vi.mocked(createOwnedCodexTransport).mock.calls[0]![0];
    expect(options).toMatchObject({ root: "/owned/repository", executable: "/nix/store/fixed/bin/bazel-7.6.0-linux-x86_64" });
    expect(options.args).toEqual([
      "--batch", "--nosystem_rc", "--nohome_rc", "--host_jvm_args=-Xmx512m", "--host_jvm_args=-XX:ActiveProcessorCount=3",
      "--server_javabase=/nix/store/fixed-java", "--output_user_root=/tmp/swarm-selected-target-unit", "--output_base=/tmp/swarm-selected-target-unit/output",
      operation ?? "build", "--jobs=3", "--color=no", "--curses=no", expect.stringMatching(/^--build_event_json_file=\/tmp\/swarm-selected-target-unit\/events-\d+\.jsonl$/),
      ...(operation === "test" ? ["--build", "--test_output=errors", "--test_tag_filters="] : []), "--", "//lib:chosen",
    ]);
    const publish = vi.mocked(watchBuildProgress).mock.calls[0]![1]; publish("Configured //lib:chosen");
    expect(progress).toHaveBeenCalledWith(operation === "test" ? "Tests: Configured //lib:chosen" : "Configured //lib:chosen");
    await executor.run("//lib:other", signal, progress, operation);
    expect(mkdtemp).toHaveBeenCalledTimes(1);
    await executor.dispose(); expect(rm).toHaveBeenCalledWith("/tmp/swarm-selected-target-unit", { recursive: true, force: true });
  });
  it("rejects an unsupported executor operation before launching any process", async () => {
    vi.stubEnv("PATH", "/fixed/bin");
    vi.stubEnv("SWARM_BAZEL_BIN", "/nix/store/fixed/bin/bazel-7.6.0-linux-x86_64");
    vi.stubEnv("SWARM_BAZEL_JAVA_HOME", "/nix/store/fixed-java");
    const executor = createTargetBuildExecutor("/owned/repository");
    await expect(executor.run(start.target, new AbortController().signal, () => {}, "clean" as "test")).rejects.toThrow();
    expect(createOwnedCodexTransport).not.toHaveBeenCalled();
    await executor.dispose();
  });
});

describe("owned build collector", () => {
  it("closes on exit but waits for EOF and confirmed cleanup, including late diagnostics", async () => {
    let sink!: CodexTransportSink, close!: (value: typeof confirmed) => void;
    const closing = new Promise<typeof confirmed>((done) => { close = done; });
    const closeFn = vi.fn(() => closing);
    const pending = collectTargetBuild((value) => { sink = value; return { write() {}, close: closeFn }; }, new AbortController().signal);
    sink.stderr(Buffer.from("failure\n")); sink.exit(1);
    expect(closeFn).toHaveBeenCalledTimes(1);
    sink.stderr(Buffer.from("late\n")); sink.end(); close(confirmed);
    expect(await pending).toMatchObject({ exitCode: 1, cleanup: "confirmed", output: "failure\nlate\n" });
  });
  it("never turns unknown cleanup into successful exit", async () => {
    let sink!: CodexTransportSink;
    const pending = collectTargetBuild((value) => { sink = value; return { write() {}, close: async () => ({ ...confirmed, status: "unknown" }) }; }, new AbortController().signal);
    sink.exit(0); sink.end(); expect((await pending).cleanup).toBe("unknown");
  });
  it("reports unknown cleanup promptly even when a failed guardian never closes stdout", async () => {
    let sink!: CodexTransportSink;
    const pending = collectTargetBuild((value) => { sink = value; return { write() {}, close: async () => ({ ...confirmed, status: "unknown" }) }; }, new AbortController().signal);
    sink.exit(0); // Deliberately no end: the owner deadline has already failed.
    expect((await pending).cleanup).toBe("unknown");
  });
  it("cancels the process and has a finite output tail", async () => {
    const abort = new AbortController(); let sink!: CodexTransportSink;
    const close = vi.fn(async () => confirmed);
    const pending = collectTargetBuild((value) => { sink = value; return { write() {}, close }; }, abort.signal);
    sink.stderr(Buffer.from("x".repeat(9000))); abort.abort();
    const result = await pending; expect(close).toHaveBeenCalledTimes(1); expect(result.output.length).toBe(4096); expect(result.error).toBe("Build cancelled");
  });
  it("does not launch an already-cancelled operation", async () => {
    const connect = vi.fn(); const abort = new AbortController(); abort.abort();
    expect((await collectTargetBuild(connect, abort.signal)).cleanup).toBe("confirmed"); expect(connect).not.toHaveBeenCalled();
  });
  it.each(["timeout", "overflow", "cancel"] as const)("preserves owned cleanup and test-specific %s failures", async (kind) => {
    vi.useFakeTimers();
    try {
      let sink!: CodexTransportSink; const controller = new AbortController();
      const close = vi.fn(async () => confirmed);
      const pending = collectTargetBuild((listener) => { sink = listener; return { write() {}, close }; }, controller.signal, undefined, "test");
      if (kind === "timeout") await vi.advanceTimersByTimeAsync(15 * 60_000);
      else if (kind === "overflow") sink.stderr(Buffer.alloc(8 * 1024 * 1024 + 1));
      else controller.abort();
      const result = await pending;
      expect(result).toMatchObject({ cleanup: "confirmed", error: expect.stringMatching(/^Tests /) });
      expect(result.error).toMatch(kind === "timeout" ? /15-minute/ : kind === "overflow" ? /8 MiB/ : /cancelled/);
      expect(close).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
