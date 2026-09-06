// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreSupervisor } from "../app/electron/core-supervisor";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { TaskProvider } from "../core/tasks/contracts";
import type { WorkerDependencies } from "../core/worker-runtime";
import { unavailableAgentRequest, unavailableAgentSnapshot } from "../core/agents/unavailable";
import { initialSnapshot } from "../fixtures/world";
import { TASK_FIXTURE_COMMIT, TASK_FIXTURE_WORLD, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";

const boundary = vi.hoisted(() => ({
  agentRequest: vi.fn(), agentShutdown: vi.fn(), sourceRead: vi.fn(), sourceWrite: vi.fn(),
  filesystem: vi.fn(), subprocess: vi.fn(), fingerprint: vi.fn(),
}));
const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(), listeners: new Map<string, (...args: unknown[]) => void>(),
  invoke: vi.fn(), removeListener: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (name: string, value: unknown) => electron.exposed.set(name, value) },
  ipcRenderer: { invoke: electron.invoke,
    on: (name: string, listener: (...args: unknown[]) => void) => electron.listeners.set(name, listener),
    removeListener: electron.removeListener },
}));
vi.mock("../core/provider", () => ({ RealWorkspaceProvider: {
  create: async () => ({ snapshot: () => initialSnapshot() }),
} }));
vi.mock("../core/agents/production", () => ({ createProductionAgentService: vi.fn(() => {
  throw new Error("The test must inject its agent service");
}) }));
vi.mock("../core/files", () => ({
  readWorkspaceFile: boundary.sourceRead, writeWorkspaceFile: boundary.sourceWrite,
  WorkspaceFileError: class extends Error { constructor(public readonly code: string, message: string) { super(message); } },
}));
vi.mock("../core/fingerprint", () => ({ computeWorkingWorldFingerprint: boundary.fingerprint }));
vi.mock("../core/watchers", () => ({ WorkspaceFileWatchers: class { closeAll() {} } }));
vi.mock("../core/working-world-observer", () => ({ WorkingWorldObserver: class { start() {} close() {} } }));
// Any accidental Git/Ditz invocation or direct metadata access fails visibly.
// The worker's ordinary startup services are isolated above, not real readers.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const blocked = Object.fromEntries(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]
    .map((name) => [name, (...args: unknown[]) => { boundary.subprocess(name, ...args); throw new Error("Unexpected subprocess"); }]));
  return { ...actual, ...blocked, default: { ...actual, ...blocked } };
});
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const blocked = Object.fromEntries(Object.entries(actual).filter(([, value]) => typeof value === "function")
    .map(([name]) => [name, (...args: unknown[]) => { boundary.filesystem(name, ...args); throw new Error("Unexpected filesystem access"); }]));
  return { ...actual, ...blocked, default: { ...actual, ...blocked } };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const blocked = Object.fromEntries(Object.entries(actual).filter(([, value]) => typeof value === "function")
    .map(([name]) => [name, (...args: unknown[]) => { boundary.filesystem(name, ...args); throw new Error("Unexpected filesystem access"); }]));
  return { ...actual, ...blocked, default: { ...actual, ...blocked } };
});

const snapshotRequest = (requestId = "tasks-snapshot", refresh = true): CoreRequest => ({
  protocolVersion: PROTOCOL_VERSION, requestId, type: "tasks.snapshot", worldId: TASK_FIXTURE_WORLD.worldId, refresh,
});
const readRequest = (requestId = "tasks-read"): CoreRequest => ({
  protocolVersion: PROTOCOL_VERSION, requestId, type: "tasks.read", worldId: TASK_FIXTURE_WORLD.worldId,
  metadataCommit: TASK_FIXTURE_COMMIT, taskId: "task-fixture",
});
const success = (requestId: string, task: unknown) => ({
  protocolVersion: PROTOCOL_VERSION, requestId, ok: true, sequence: 1, snapshot: initialSnapshot(), task,
});
function provider() {
  return { snapshot: vi.fn(async () => taskObservationFixture()), read: vi.fn(async () => taskReadFixture()),
    dispose: vi.fn(async () => {}) } satisfies TaskProvider;
}
function expectNoTaskSideEffects() {
  for (const name of ["agentRequest", "sourceRead", "sourceWrite", "filesystem", "subprocess", "fingerprint"] as const)
    expect(boundary[name], `${name} must not be called by task inspection`).not.toHaveBeenCalled();
}
type WorkerHarness = {
  dispatch(input: unknown): Promise<void>;
  response(requestId: string): CoreResponse;
  posts: ReturnType<typeof vi.fn>;
};
async function withWorker(run: (worker: WorkerHarness) => Promise<void>, createTasks?: WorkerDependencies["createTasks"]) {
  const parent = new EventEmitter() as EventEmitter & { postMessage: ReturnType<typeof vi.fn> };
  parent.postMessage = vi.fn();
  const previous = Object.getOwnPropertyDescriptor(process, "parentPort");
  const exitListeners = process.listeners("exit");
  Object.defineProperty(process, "parentPort", { configurable: true, value: parent });
  vi.stubEnv("SWARM_WORKSPACE_ROOT", "/registered/task-test-root");
  vi.stubEnv("SWARM_AGENT_STORE_ROOT", "/registered/test-agent-store");
  let dispatch: WorkerHarness["dispatch"] | undefined;
  try {
    const { startCoreWorker } = await import("../core/worker-runtime");
    startCoreWorker({ createTasks, createAgents: async () => ({ request: boundary.agentRequest, shutdown: boundary.agentShutdown }) });
    await vi.waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "agent.changed" })));
    expect(parent.postMessage).toHaveBeenCalledWith({ type: "core.ready" });
    expect(boundary.agentRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "agent.snapshot" }));
    // Startup honestly loads agent state; the ledger below measures task requests only.
    boundary.agentRequest.mockClear();
    const listener = parent.listeners("message")[0] as (event: { data: unknown }) => Promise<void>;
    dispatch = (input) => listener({ data: input });
    await run({ dispatch, posts: parent.postMessage, response(requestId) {
      const messages = parent.postMessage.mock.calls.map(([value]) => value).filter((value) => value.requestId === requestId);
      expect(messages, `one response for ${requestId}`).toHaveLength(1);
      return messages[0] as CoreResponse;
    } });
  } finally {
    await dispatch?.({ type: "core.shutdown" });
    parent.removeAllListeners();
    for (const listener of process.listeners("exit")) if (!exitListeners.includes(listener)) process.removeListener("exit", listener);
    if (previous) Object.defineProperty(process, "parentPort", previous);
    else Reflect.deleteProperty(process, "parentPort");
    vi.unstubAllEnvs();
  }
}
beforeEach(() => {
  boundary.agentRequest.mockImplementation(async (request) => unavailableAgentRequest(request));
  boundary.agentShutdown.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers(); vi.resetModules(); vi.resetAllMocks(); vi.unstubAllEnvs();
  electron.exposed.clear(); electron.listeners.clear();
});

describe("task worker read boundary", () => {
  it("returns honest unavailable snapshot and correlated detail failure without any task side effects", async () => {
    await withWorker(async ({ dispatch, response }) => {
      for (const refresh of [false, true]) {
        const request = snapshotRequest(`snapshot-${refresh}`, refresh);
        await dispatch(request);
        expect(response(request.requestId)).toMatchObject({ ok: true, sequence: 1, task: { kind: "snapshot", observation: {
          ...TASK_FIXTURE_WORLD, status: "unavailable", snapshot: null, localRef: null,
          sequence: refresh ? 2 : 1, reason: { code: "TASK_PROVIDER_UNAVAILABLE" },
        } } });
      }
      await dispatch(readRequest());
      expect(response("tasks-read")).toMatchObject({ ok: true, sequence: 1, task: {
        kind: "read", ...TASK_FIXTURE_WORLD, metadataCommit: TASK_FIXTURE_COMMIT, taskId: "task-fixture", sequence: 3,
        result: { ok: false, error: { code: "TASK_PROVIDER_UNAVAILABLE" } },
      } });
      expectNoTaskSideEffects();
    });
  });

  it("injects only the registered context, dispatches exact read arguments and rejects wrong worlds before provider calls", async () => {
    const tasks = provider(); const createTasks = vi.fn(async () => tasks);
    await withWorker(async ({ dispatch, response }) => {
      expect(createTasks).toHaveBeenCalledExactlyOnceWith({ root: "/registered/task-test-root",
        worldId: TASK_FIXTURE_WORLD.worldId, repositoryId: TASK_FIXTURE_WORLD.repositoryId });
      for (const request of [snapshotRequest("wrong-snapshot"), readRequest("wrong-read")]) {
        await dispatch({ ...request, worldId: "world:other" });
        expect(response(request.requestId)).toMatchObject({ ok: false, error: { code: "TASK_WORLD_MISMATCH" } });
      }
      expect(tasks.snapshot).not.toHaveBeenCalled(); expect(tasks.read).not.toHaveBeenCalled();
      await dispatch(snapshotRequest("valid-snapshot", false)); await dispatch(readRequest("valid-read"));
      expect(tasks.snapshot).toHaveBeenCalledExactlyOnceWith({ refresh: false });
      expect(tasks.read).toHaveBeenCalledExactlyOnceWith({ metadataCommit: TASK_FIXTURE_COMMIT, taskId: "task-fixture" });
      expect(response("valid-snapshot")).toMatchObject({ ok: true, task: { kind: "snapshot", observation: taskObservationFixture() } });
      expect(response("valid-read")).toMatchObject({ ok: true, task: taskReadFixture() });
      expectNoTaskSideEffects();
    }, createTasks);
    expect(tasks.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects old protocol and renderer-supplied paths, refs, argv and malformed identities before dispatch", async () => {
    const tasks = provider();
    await withWorker(async ({ dispatch, response, posts }) => {
      const invalidRequests = [
        { ...readRequest(), protocolVersion: PROTOCOL_VERSION - 1 },
        { ...snapshotRequest(), root: "/renderer-selected-root" },
        { ...snapshotRequest(), ref: "refs/heads/other" },
        { ...snapshotRequest(), argv: ["git", "fetch"] },
        { ...readRequest(), blobPath: ".ditz/issue-other.yaml" },
        { ...readRequest(), taskId: "../other" },
        { ...readRequest(), metadataCommit: { algorithm: "sha1", hex: "a".repeat(39) } },
      ];
      for (const request of invalidRequests) {
        posts.mockClear(); await dispatch(request);
        expect(response("invalid-request")).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      }
      expect(tasks.snapshot).not.toHaveBeenCalled(); expect(tasks.read).not.toHaveBeenCalled();
      expectNoTaskSideEffects();
    }, async () => tasks);
  });

  it.each(["throw", "kind", "world", "repository", "task", "revision", "hash", "extra"] as const)("rejects and sanitizes a provider %s failure", async (fault) => {
    const tasks = provider();
    tasks.read.mockImplementation(async () => {
      if (fault === "throw") throw new Error("sensitive raw metadata: private body /home/private/path");
      const result = taskReadFixture();
      const hostile = fault === "kind" ? { kind: "snapshot", observation: taskObservationFixture() }
        : fault === "world" ? { ...result, worldId: "world:other" }
        : fault === "repository" ? { ...result, repositoryId: "project:other" }
        : fault === "task" ? { ...result, taskId: "other-task" }
        : fault === "revision" ? { ...result, metadataCommit: { algorithm: "sha1", hex: "c".repeat(40) } }
        : fault === "hash" ? { ...result, metadataCommit: { algorithm: "sha1", hex: "a".repeat(39) } }
        : { ...result, unexpected: "not allowed" };
      return hostile as ReturnType<typeof taskReadFixture>;
    });
    await withWorker(async ({ dispatch, response }) => {
      await dispatch(readRequest());
      const reply = response("tasks-read");
      expect(reply).toMatchObject({ ok: false, error: { code: "TASK_OBSERVATION_FAILED" } });
      expect(reply).not.toHaveProperty("task");
      expect(JSON.stringify(reply)).not.toMatch(/sensitive|private body|\/home\/private/);
      expectNoTaskSideEffects();
    }, async () => tasks);
  });

  it("contains provider initialization failures as unavailable, not empty observed truth", async () => {
    await withWorker(async ({ dispatch, response }) => {
      await dispatch(snapshotRequest());
      expect(response("tasks-snapshot")).toMatchObject({ ok: true, task: { observation: {
        status: "unavailable", snapshot: null, reason: { code: "TASK_PROVIDER_UNAVAILABLE" },
      } } });
      expectNoTaskSideEffects();
    }, async () => { throw new Error("private constructor diagnostic"); });
  });

  it("disposes once, rejects new reads and never publishes a pending detail after shutdown", async () => {
    const tasks = provider(); let finish!: (result: ReturnType<typeof taskReadFixture>) => void;
    tasks.read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await withWorker(async ({ dispatch, response, posts }) => {
      const pending = dispatch(readRequest("pending"));
      await vi.waitFor(() => expect(tasks.read).toHaveBeenCalledTimes(1));
      await dispatch({ type: "core.shutdown" }); await dispatch({ type: "core.shutdown" });
      expect(tasks.dispose).toHaveBeenCalledTimes(1); expect(boundary.agentShutdown).toHaveBeenCalledTimes(1);
      expect(posts.mock.calls.filter(([value]) => value.type === "core.shutdown.ready")).toHaveLength(1);
      finish(taskReadFixture()); await pending;
      expect(response("pending")).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
      await dispatch(readRequest("after-read")); await dispatch(snapshotRequest("after-snapshot"));
      expect(response("after-read")).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
      expect(response("after-snapshot")).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
      expect(tasks.read).toHaveBeenCalledTimes(1); expect(tasks.snapshot).not.toHaveBeenCalled();
      expectNoTaskSideEffects();
    }, async () => tasks);
    expect(tasks.dispose).toHaveBeenCalledTimes(1);
  });

  it("leaves existing workspace, source and agent success/error dispatch intact", async () => {
    await withWorker(async ({ dispatch, response }) => {
      await dispatch(snapshotRequest()); await dispatch(readRequest()); expectNoTaskSideEffects();
      await dispatch({ protocolVersion: PROTOCOL_VERSION, requestId: "workspace", type: "workspace.snapshot" });
      expect(response("workspace")).toMatchObject({ ok: true, snapshot: initialSnapshot() });
      const file = { kind: "read", path: "docs/task.txt", content: "task\n", revision: "a".repeat(64), size: 5 };
      boundary.sourceRead.mockResolvedValueOnce(file);
      await dispatch({ protocolVersion: PROTOCOL_VERSION, requestId: "source", type: "file.read", path: file.path });
      expect(response("source")).toMatchObject({ ok: true, file });
      const { WorkspaceFileError } = await import("../core/files");
      boundary.sourceRead.mockRejectedValueOnce(new WorkspaceFileError("FILE_NOT_FOUND", "Missing file"));
      await dispatch({ protocolVersion: PROTOCOL_VERSION, requestId: "missing", type: "file.read", path: "missing.txt" });
      expect(response("missing")).toMatchObject({ ok: false, error: { code: "FILE_NOT_FOUND", message: "Missing file" } });
      await dispatch({ protocolVersion: PROTOCOL_VERSION, requestId: "agents", type: "agent.snapshot" });
      expect(response("agents")).toMatchObject({ ok: true, agent: { kind: "snapshot", snapshot: unavailableAgentSnapshot() } });
      await dispatch({ protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch",
        runId: "11111111-1111-4111-8111-111111111111", contextHash: "a".repeat(64) });
      expect(response("launch")).toMatchObject({ ok: false, error: { code: "ADAPTER_UNAVAILABLE" } });
      expect(boundary.agentRequest.mock.calls.map(([request]) => request.type)).toEqual(["agent.snapshot", "agent.launch"]);
      expect(boundary.sourceWrite).not.toHaveBeenCalled(); expect(boundary.filesystem).not.toHaveBeenCalled();
      expect(boundary.subprocess).not.toHaveBeenCalled();
    });
  });
});

describe("task transport lifetime and correlation", () => {
  it("preload rejects old-generation and mismatched task responses without replay", async () => {
    await import("../app/electron/preload");
    const bridge = electron.exposed.get("swarm") as import("../app/electron/preload").SwarmBridge;
    const status = (generation: number) => electron.listeners.get("swarm:lifecycle")!({}, {
      revision: generation, core: { generation, phase: "ready", message: "ready" }, reload: "idle", notice: "",
    });
    status(3);
    let finish!: (value: unknown) => void;
    electron.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = bridge.request(readRequest()); status(4);
    finish({ generation: 3, response: success("tasks-read", taskReadFixture()) });
    expect(await pending).toMatchObject({ ok: false, error: { code: "CORE_GENERATION_CHANGED" } });
    const invalidResults = [
      { kind: "snapshot", observation: taskObservationFixture() },
      { ...taskReadFixture(), worldId: "world:other" },
      { ...taskReadFixture(), metadataCommit: { algorithm: "sha1", hex: "c".repeat(40) } },
    ];
    for (const task of invalidResults) {
      electron.invoke.mockResolvedValueOnce({ generation: 4, response: success("tasks-read", task) });
      expect(await bridge.request(readRequest())).toMatchObject({ ok: false, error: { code: "INVALID_CORE_MESSAGE" } });
    }
    electron.invoke.mockResolvedValueOnce({ generation: 4, response: success("tasks-read", taskReadFixture()) });
    expect(await bridge.request(readRequest())).toMatchObject({ ok: true, task: taskReadFixture() });
    expect(electron.invoke).toHaveBeenCalledTimes(5);
    expect(electron.invoke.mock.calls.every(([channel, request]) => channel === "swarm:request" && request.type === "tasks.read")).toBe(true);
  });

  it("supervisor expires task reads on restart and rejects wrong results and old-core replies without replay", async () => {
    vi.useFakeTimers();
    class FakeCore extends EventEmitter { postMessage = vi.fn(); kill = vi.fn(() => true); }
    const children: FakeCore[] = []; const event = vi.fn();
    const supervisor = new CoreSupervisor({ launch: () => { const child = new FakeCore(); children.push(child); return child; }, status: vi.fn(), event });
    try {
      supervisor.start(); const first = children[0]!; first.emit("message", { type: "core.ready" });
      const pending = supervisor.request(readRequest()); supervisor.restart();
      expect(await pending).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
      expect(first.postMessage.mock.calls.map(([message]) => message.type)).toEqual(["tasks.read", "core.shutdown"]);
      first.emit("message", { type: "core.shutdown.ready" }); first.emit("exit", 0);
      const second = children[1]!; second.emit("message", { type: "core.ready" });
      expect(second.postMessage).not.toHaveBeenCalled();
      const resolved = vi.fn(); const current = supervisor.request(readRequest()).then((reply) => { resolved(reply); return reply; });
      first.emit("message", success("tasks-read", taskReadFixture()));
      await Promise.resolve(); expect(resolved).not.toHaveBeenCalled();
      second.emit("message", success("tasks-read", { kind: "snapshot", observation: taskObservationFixture() }));
      expect(await current).toMatchObject({ ok: false, error: { code: "INVALID_CORE_MESSAGE" } });
      const valid = supervisor.request(readRequest("current-read"));
      second.emit("message", success("current-read", taskReadFixture()));
      expect(await valid).toMatchObject({ ok: true, task: taskReadFixture() });
      expect(second.postMessage).toHaveBeenCalledTimes(2); expect(event).not.toHaveBeenCalled();
    } finally { supervisor.stop(); }
  });
});
