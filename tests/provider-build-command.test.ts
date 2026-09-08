// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { RealWorkspaceProvider, SERVICE_TOPOLOGY_TARGET } from "../core/provider";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../core/fingerprint", () => ({
  computeWorkingWorldFingerprint: vi.fn(async () => "a".repeat(64)),
}));
vi.mock("../core/repository-registration", () => ({
  registerRepository: vi.fn(async (root: string) => ({ root, id: `repository:${"a".repeat(64)}`, name: "Build invocation fixture" })),
}));

describe("fixed topology build invocation", () => {
  it("streams a complete BEP milestone before the existing build process completes", async () => {
    let finish!: Function;
    vi.mocked(execFile).mockImplementation(((_file: string, args: string[], _options: unknown, callback: Function) => {
      finish = callback;
      const path = args.find((arg) => arg.startsWith("--build_event_json_file="))!.slice("--build_event_json_file=".length);
      void writeFile(path, JSON.stringify({ id: { targetConfigured: { label: SERVICE_TOPOLOGY_TARGET } }, configured: {} }) + "\n");
      return {};
    }) as typeof execFile);
    const provider = await RealWorkspaceProvider.create("/registered/workspace"), published = vi.fn();
    const running = provider.startReconciliation(published);
    await vi.waitFor(() => expect(published.mock.calls.some(([type]) => type === "job.changed")).toBe(true));
    expect(provider.snapshot().jobs[0]).toMatchObject({ status: "running", progress: 0, message: `Configured ${SERVICE_TOPOLOGY_TARGET}` });
    finish(new Error("controlled final rejection"), "", "controlled final rejection"); await running;
    expect(provider.snapshot().reconciliation.status).toBe("red");
    provider.dispose();
    vi.mocked(execFile).mockClear();
  });
  it("bounds nested concurrency independently of the caller's Bazel flags", async () => {
    // Exercise the default builder, but never launch a process. Rejection also
    // proves a bounded command does not manufacture a successful publication.
    vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: Function) => {
      queueMicrotask(() => callback(new Error("fixture build rejection"), "", "fixture build rejection"));
      return {};
    }) as typeof execFile);
    const provider = await RealWorkspaceProvider.create("/registered/workspace");
    await provider.startReconciliation(() => undefined);
    expect(execFile).toHaveBeenCalledExactlyOnceWith("bazel", [
      "build", SERVICE_TOPOLOGY_TARGET, "--jobs=3", "--color=no", "--curses=no",
      expect.stringMatching(/^--build_event_json_file=.+\/swarm-ide-build-events-[^/]+\/topology\.jsonl$/),
    ], { cwd: "/registered/workspace", encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, expect.any(Function));
    expect(provider.snapshot().reconciliation.status).toBe("red");
  });
});
