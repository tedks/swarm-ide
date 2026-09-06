// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import { unavailableAgentSnapshot } from "../core/agents/unavailable";

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
vi.mock("../core/watchers", () => ({ WorkspaceFileWatchers: class { closeAll() {} } }));
vi.mock("../core/working-world-observer", () => ({ WorkingWorldObserver: class { start() {} close() {} } }));

afterEach(() => {
  vi.resetModules(); vi.clearAllMocks(); electron.exposed.clear(); electron.listeners.clear();
});
describe("agent unavailable bridge integration", () => {
  it("runs the actual worker dispatcher without a provider adapter or fake run", async () => {
    const parent = new EventEmitter() as EventEmitter & { postMessage: ReturnType<typeof vi.fn> };
    parent.postMessage = vi.fn();
    const previous = Object.getOwnPropertyDescriptor(process, "parentPort");
    const exitListeners = process.listeners("exit");
    Object.defineProperty(process, "parentPort", { configurable: true, value: parent });
    try {
      await import("../core/worker");
      await vi.waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith({ type: "core.ready" }));
      const dispatch = parent.listeners("message")[0] as (message: { data: CoreRequest }) => Promise<void>;
      await dispatch({ data: { protocolVersion: PROTOCOL_VERSION, requestId: "agents", type: "agent.snapshot" } });
      expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        requestId: "agents", ok: true, agent: { kind: "snapshot", snapshot: unavailableAgentSnapshot() },
      }));
      await dispatch({ data: { protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch",
        runId: "11111111-1111-4111-8111-111111111111", contextHash: "a".repeat(64) } });
      expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        requestId: "launch", ok: false, error: expect.objectContaining({ code: "ADAPTER_UNAVAILABLE" }),
      }));
      await dispatch({ data: { protocolVersion: PROTOCOL_VERSION, requestId: "workspace", type: "workspace.snapshot" } });
      expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: "workspace", ok: true, snapshot: initialSnapshot() }));
      const agentEvent = parent.postMessage.mock.calls.find(([value]) => value.type === "agent.changed")![0];
      expect(agentEvent).toMatchObject({ sequence: 1, snapshot: unavailableAgentSnapshot() });
    } finally {
      for (const listener of process.listeners("exit")) if (!exitListeners.includes(listener)) process.removeListener("exit", listener);
      if (previous) Object.defineProperty(process, "parentPort", previous);
      else Reflect.deleteProperty(process, "parentPort");
    }
  });
  it("preload validates result identity and rejects old-generation agent events and mutations", async () => {
    await import("../app/electron/preload");
    const bridge = electron.exposed.get("swarm") as import("../app/electron/preload").SwarmBridge;
    const listener = vi.fn(); bridge.onEvent(listener);
    const status = (generation: number) => electron.listeners.get("swarm:lifecycle")!({}, {
      revision: generation, core: { generation, phase: "ready", message: "ready" }, reload: "idle", notice: "",
    });
    status(3);
    const event = { protocolVersion: PROTOCOL_VERSION, type: "agent.changed", sequence: 5,
      emittedAt: "2026-09-06T01:00:00.000Z", snapshot: unavailableAgentSnapshot() };
    electron.listeners.get("swarm:event")!({}, { generation: 2, event });
    expect(listener).not.toHaveBeenCalled();
    electron.listeners.get("swarm:event")!({}, { generation: 3, event });
    expect(listener).toHaveBeenCalledWith(event);
    const request: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch",
      runId: "11111111-1111-4111-8111-111111111111", contextHash: "a".repeat(64) };
    electron.invoke.mockResolvedValue({ generation: 2, response: { protocolVersion: PROTOCOL_VERSION, requestId: "launch",
      ok: false, error: { code: "ADAPTER_UNAVAILABLE", message: "not installed" } } });
    expect(await bridge.request(request)).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    electron.invoke.mockResolvedValue({ generation: 3, response: { protocolVersion: PROTOCOL_VERSION, requestId: "launch",
      ok: true, sequence: 0, snapshot: initialSnapshot() } });
    expect(await bridge.request(request)).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    electron.invoke.mockRejectedValue(new Error("IPC vanished"));
    expect(await bridge.request(request)).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(electron.invoke).toHaveBeenCalledTimes(3); // no replay
  });
});
