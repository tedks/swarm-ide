// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { RealWorkspaceProvider, SERVICE_TOPOLOGY_TARGET } from "../core/provider";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../core/fingerprint", () => ({
  computeWorkingWorldFingerprint: vi.fn(async () => "a".repeat(64)),
}));

describe("fixed topology build invocation", () => {
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
