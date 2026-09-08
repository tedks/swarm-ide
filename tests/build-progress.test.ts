// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdtemp, open, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BUILD_PROGRESS_LIMITS, BuildProgressDecoder, buildMilestone, watchBuildProgress } from "../core/build-progress";
import { RealWorkspaceProvider, type ProviderDependencies } from "../core/provider";
import { contextDependencies } from "./context-fixture";

const roots: string[] = [];
const readers: ReturnType<typeof watchBuildProgress>[] = [];
const configured = (label = "//pkg:目标") => ({ id: { targetConfigured: { label } }, configured: { targetKind: "genrule" } });
const line = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-progress-test-")); roots.push(root); return join(root, "events.jsonl");
}
afterEach(async () => {
  await Promise.all(readers.splice(0).map((reader) => reader.stop()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("BEP milestone decoder", () => {
  it("waits for complete lines and split UTF-8, preserving the latest meaningful event", () => {
    const decoder = new BuildProgressDecoder(), bytes = line(configured());
    const split = bytes.indexOf(Buffer.from("目")) + 1;
    expect(decoder.append(bytes.subarray(0, split))).toBeUndefined();
    expect(decoder.append(bytes.subarray(split, -1))).toBeUndefined();
    expect(decoder.append(bytes.subarray(-1))).toBe("Configured //pkg:目标");
    expect(decoder.append(Buffer.concat([line(configured("//:a")), line({ id: { unknown: {} }, data: "ignored" }), line(configured("//:b"))]))).toBe("Configured //:b");
  });
  it("bounds total input, incomplete lines and malformed records", () => {
    expect(() => new BuildProgressDecoder().append(Buffer.alloc(BUILD_PROGRESS_LIMITS.bytes + 1))).toThrow(/byte limit/);
    expect(() => new BuildProgressDecoder().append(Buffer.alloc(BUILD_PROGRESS_LIMITS.lineBytes + 1))).toThrow(/line limit/);
    expect(() => new BuildProgressDecoder().append(Buffer.from("{bad}\n"))).toThrow();
    expect(() => new BuildProgressDecoder().append(Buffer.from([0xff, 10]))).toThrow();
  });
  it("reports events, not percentages or command-line/configuration values", () => {
    expect(buildMilestone({ id: { targetCompleted: { label: "//:a" } }, completed: { success: true } })).toBe("Built //:a");
    expect(buildMilestone({ id: { targetCompleted: { label: "//:a" } }, completed: {} })).toBe("Target failed: //:a");
    expect(buildMilestone({ id: { targetConfigured: { label: "//:a" } }, aborted: { reason: "USER_INTERRUPTED" } })).toBe("Build step stopped: //:a");
    expect(buildMilestone({ id: { testSummary: { label: "//:test" } }, testSummary: { overallStatus: "PASSED" } })).toBe("Test //:test: passed");
    expect(buildMilestone({ id: { testResult: { label: "//:test" } }, testResult: { status: "FAILED" } })).toBe("Test //:test: failed");
    expect(buildMilestone({ id: { progress: {} }, progress: { stderr: "first\n", stdout: "\u001b[31mCompiling two files\u001b[0m\n" } })).toBe("Compiling two files");
    expect(buildMilestone({ id: { progress: {} }, progress: { stdout: "x".repeat(1000) } })).toHaveLength(300);
    expect(buildMilestone({ id: { optionsParsed: {} }, optionsParsed: { explicitCmdLine: ["private"] } })).toBeUndefined();
  });
  it("handles repeated unterminated terminal escape prefixes without backtracking", () => {
    expect(buildMilestone({ id: { progress: {} }, progress: { stdout: "kept " + "\x1b]".repeat(100_000) } })).toBe("kept");
    expect(buildMilestone({ id: { progress: {} }, progress: { stdout: "before \x1b]hidden\x1b\\after" } })).toBe("before after");
  });
});

describe("one private live BEP file", () => {
  it("keeps a close rejection advisory and stop idempotent", async () => {
    const path = await fixture(), published = vi.fn(); await writeFile(path, line(configured()));
    const reader = watchBuildProgress(path, published, async (file, flags) => {
      const handle = await open(file, flags), close = handle.close.bind(handle);
      handle.close = async () => { await close(); throw new Error("controlled close failure after real cleanup"); };
      return handle;
    }); readers.push(reader);
    await expect(reader.stop()).resolves.toBeUndefined();
    await expect(reader.stop()).resolves.toBeUndefined();
    expect(published).toHaveBeenCalledWith("Build progress is unavailable; waiting for the build result");
  });
  it("delivers during execution, coalesces appends, drains final lines and stops forever", async () => {
    const path = await fixture(), published = vi.fn();
    const reader = watchBuildProgress(path, published); readers.push(reader);
    await writeFile(path, line(configured("//:early")));
    await vi.waitFor(() => expect(published).toHaveBeenCalledWith("Configured //:early"));
    const count = published.mock.calls.length;
    await appendFile(path, Buffer.concat([line(configured("//:middle")), line(configured("//:last"))]));
    await reader.stop();
    expect(published.mock.calls.slice(count).map(([message]) => message)).toEqual(["Configured //:last"]);
    await appendFile(path, line(configured("//:after")));
    await reader.stop();
    expect(published).not.toHaveBeenCalledWith("Configured //:after");
  });
  it("does not publish an incomplete final event", async () => {
    const path = await fixture(), published = vi.fn();
    await writeFile(path, line(configured()).subarray(0, -1));
    const reader = watchBuildProgress(path, published); readers.push(reader);
    await reader.stop(); expect(published).not.toHaveBeenCalled();
  });
  it.each(["replace", "truncate", "symlink"])("stops advisory progress on %s without throwing from shutdown", async (kind) => {
    const path = await fixture(), published = vi.fn();
    await writeFile(path, line(configured()));
    const reader = watchBuildProgress(path, published); readers.push(reader);
    await vi.waitFor(() => expect(published).toHaveBeenCalledWith("Configured //pkg:目标"));
    if (kind === "truncate") await writeFile(path, "");
    else {
      await rename(path, `${path}.old`);
      if (kind === "replace") await writeFile(path, line(configured("//:replacement")));
      else await symlink(`${path}.old`, path);
    }
    await reader.stop();
    expect(published).toHaveBeenCalledWith("Build progress is unavailable; waiting for the build result");
    expect(published).not.toHaveBeenCalledWith("Configured //:replacement");
  });
});

describe("current build job publication", () => {
  it("publishes real callback messages as running-zero until final artifact checks finish", async () => {
    let progress!: (message: string) => void, complete!: () => void;
    const deps: ProviderDependencies = { ...contextDependencies, build: async (_root, callback) => {
      progress = callback!; await new Promise<void>((resolve) => { complete = resolve; }); return { artifactPath: "/unused" };
    } };
    const provider = await RealWorkspaceProvider.create("/unused", deps), publish = vi.fn();
    const running = provider.startReconciliation(publish);
    await vi.waitFor(() => expect(progress).toBeTypeOf("function"));
    progress("Configured //:target"); progress("Configured //:target");
    expect(publish.mock.calls.filter(([type]) => type === "job.changed")).toHaveLength(1);
    expect(provider.snapshot().jobs[0]).toMatchObject({ status: "running", progress: 0, message: "Configured //:target" });
    expect(provider.snapshot().reconciliation.status).toBe("yellow");
    complete(); await running; expect(provider.snapshot().reconciliation.status).toBe("green");
    const count = publish.mock.calls.length; progress("late callback");
    expect(publish).toHaveBeenCalledTimes(count); provider.dispose();
  });
  it.each(["source-change", "superseded", "disposed"])("rejects callbacks after %s", async (mode) => {
    const callbacks: Array<(message: string) => void> = [], releases: Array<() => void> = [];
    const deps: ProviderDependencies = { ...contextDependencies, build: async (_root, callback) => {
      callbacks.push(callback!); await new Promise<void>((resolve) => { releases.push(resolve); }); return { artifactPath: "/unused" };
    } };
    const provider = await RealWorkspaceProvider.create("/unused", deps), publish = vi.fn();
    const first = provider.startReconciliation(publish);
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    let second: Promise<void> | undefined;
    if (mode === "source-change") provider.markWorkingWorldChanged("b".repeat(64), publish);
    if (mode === "disposed") provider.dispose();
    if (mode === "superseded") { second = provider.startReconciliation(publish); await vi.waitFor(() => expect(callbacks).toHaveLength(2)); }
    const count = publish.mock.calls.length; callbacks[0]!("obsolete milestone");
    expect(publish).toHaveBeenCalledTimes(count);
    for (const release of releases) release(); await Promise.all([first, second]); provider.dispose();
  });
});
