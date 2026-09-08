// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdtemp, open, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BUILD_PROGRESS_LIMITS, BuildProgressDecoder, buildMilestone, watchBuildProgress } from "../core/build-progress";

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
