// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { RealWorkspaceProvider } from "../core/provider";
import { readCanonicalWorkspaceBytes } from "../core/files";

vi.mock("../core/files", async (original) => ({ ...await original<typeof import("../core/files")>(),
  readCanonicalWorkspaceBytes: vi.fn(), resolveWorkspaceFile: vi.fn(async (_root: string, path: string) => "/registered/workspace/" + path) }));
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../core/fingerprint", () => ({ computeWorkingWorldFingerprint: vi.fn(async () => "a".repeat(64)) }));
vi.mock("../core/repository-registration", () => ({ registerRepository: vi.fn(async (root: string) => ({ root, id: "repository:" + "a".repeat(64), name: "Discovery invocation fixture" })) }));
const providers: RealWorkspaceProvider[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(() => providers.splice(0).forEach((provider) => provider.dispose()));
function trackedFiles(paths: string[]) {
  vi.mocked(execFile).mockImplementation(((file: string, args: string[], _options: unknown, callback: Function) => {
    if (file !== "git" || args.join(" ") !== "ls-files --cached --others --exclude-standard -z") throw new Error("Discovery launched an unexpected process: " + file);
    queueMicrotask(() => callback(null, Buffer.from(paths.length ? paths.join("\0") + "\0" : ""), Buffer.alloc(0)));
    return {};
  }) as typeof execFile);
}
async function observe() {
  const provider = await RealWorkspaceProvider.create("/registered/workspace"); providers.push(provider);
  await provider.startReconciliation(() => {}); return provider.snapshot();
}

describe("service discovery command boundary", () => {
  it("lists declarations with Git only, and never compiles a target in an unrelated repository", async () => {
    trackedFiles(["MODULE.bazel", "BUILD.bazel", "package.json", "src/main.ts"]);
    const snapshot = await observe();
    expect(execFile).toHaveBeenCalledExactlyOnceWith("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      expect.objectContaining({ cwd: "/registered/workspace", encoding: "buffer", timeout: 10_000, signal: expect.any(AbortSignal) }), expect.any(Function));
    expect(readCanonicalWorkspaceBytes).not.toHaveBeenCalled(); expect(snapshot.jobs).toEqual([]);
    expect(snapshot.graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
    expect(snapshot.reconciliation.message).toBe("No service declarations found");
  });

  it("reads Compose directly without running Docker, scripts, or a build command", async () => {
    trackedFiles(["compose.yaml"]);
    vi.mocked(readCanonicalWorkspaceBytes).mockResolvedValue(Buffer.from("services:\n  alpha:\n    image: local/alpha\n    depends_on: [beta]\n  beta:\n    image: local/beta\n"));
    const snapshot = await observe(), service = snapshot.graphs.find((graph) => graph.topologyId === "service")!;
    expect(execFile).toHaveBeenCalledTimes(1); expect(execFile).toHaveBeenCalledWith("git", expect.any(Array), expect.any(Object), expect.any(Function));
    expect(service.nodes.map((node) => node.label)).toEqual(["alpha", "beta"]);
    expect(service.edges.map((edge) => edge.kind)).toEqual(["starts-after"]);
    expect(snapshot.jobs).toEqual([]); expect(snapshot.revisions.built.sourceFingerprint).toBe("");
  });

  it("reads a generic native declaration with explicit target metadata but never builds that target", async () => {
    trackedFiles(["services/alpha/service.swarm.json"]);
    vi.mocked(readCanonicalWorkspaceBytes).mockResolvedValue(Buffer.from(JSON.stringify({ schemaVersion: 1,
      service: { id: "service:alpha", displayName: "Alpha" }, owningTarget: "//services/alpha:sources", implementationPaths: ["services/alpha/main.ts"] })));
    const snapshot = await observe();
    expect(execFile).toHaveBeenCalledTimes(1); expect(snapshot.serviceDeclarations?.services[0]).toMatchObject({ id: "service:alpha", owningTarget: "//services/alpha:sources" });
    expect(snapshot.jobs).toEqual([]); expect(snapshot.serviceContext).toBeUndefined();
    expect(snapshot.revisions.built).toEqual({ id: "", sourceFingerprint: "" });
  });
});
