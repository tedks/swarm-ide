import { describe, it, expect, vi } from "vitest";
import { TargetBuildService } from "../core/build-jobs";
import { collectTargetBuild, type TargetBuildResult } from "../core/target-build-process";
import { BuildJobRequestSchema } from "../protocol/build-jobs";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

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
  it.each(["--help", "//...", "//:all", "//pkg:*", "@other//:run", "//../:run", "//pkg:../run", "//pkg:run;rm", "//pkg:run\n"])('rejects non-single target %s', (target) => {
    expect(BuildJobRequestSchema.safeParse({ ...start, target }).success).toBe(false);
  });
  it("validates workspace before admission; observes without building; reserves synchronously", async () => {
    const h = harness();
    expect(() => h.service.request({ ...start, repositoryId: "different" })).toThrow(/different workspace/);
    expect(h.service.request({ ...context, type: "build.observe" }).jobs).toEqual([]);
    expect(h.run).not.toHaveBeenCalled();
    const admitted = h.service.request(start);
    expect(admitted.jobs[0]?.target).toBe("//lib:build");
    expect(() => h.service.request(start)).toThrow(/already running/);
    await tick(); expect(h.run).toHaveBeenCalledTimes(1);
    h.progress("Configured //lib:build");
    expect(h.service.observe().jobs[0]?.message).toBe("Configured //lib:build");
    h.finish(); await tick();
    expect(h.service.observe().jobs[0]?.status).toBe("succeeded");
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
  it("unknown cleanup blocks launches and shutdown attestation", async () => {
    const h = harness(); h.service.request(start); await tick(); h.finish({ cleanup: "unknown" }); await tick();
    expect(h.service.observe().blocked).toBe(true);
    expect(h.service.observe().jobs[0]?.status).toBe("failed");
    expect(() => h.service.request(start)).toThrow(/cleanup/);
    await expect(h.service.dispose()).rejects.toThrow(/cleanup/); expect(h.dispose).not.toHaveBeenCalled();
  });
  it("shutdown waits for the owned active build before disposing its cache", async () => {
    const h = harness(); h.service.request(start); await tick();
    let stopped = false; const closing = h.service.dispose().then(() => { stopped = true; });
    await tick(); expect(h.signal.aborted).toBe(true); expect(stopped).toBe(false); expect(h.dispose).not.toHaveBeenCalled();
    expect(() => h.service.request(start)).toThrow(/shutting down/);
    h.finish(); await closing; expect(h.dispose).toHaveBeenCalledTimes(1);
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
});
