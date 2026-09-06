import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreSupervisor } from "../app/electron/core-supervisor";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import { unavailableAgentSnapshot } from "../core/agents/unavailable";

class FakeCore extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => true);
  ready() { this.emit("message", { type: "core.ready" }); }
  shutdownReady() { this.emit("message", { type: "core.shutdown.ready" }); }
  exit() { this.emit("exit", 1); }
}
const read = (id = "read"): CoreRequest => ({ protocolVersion: PROTOCOL_VERSION, requestId: id, type: "workspace.snapshot" });
const write = (id = "write"): CoreRequest => ({ protocolVersion: PROTOCOL_VERSION, requestId: id, type: "file.write", path: "file.ts", expectedRevision: "a".repeat(64), content: "next" });
const ok = (requestId: string) => ({ protocolVersion: PROTOCOL_VERSION, requestId, ok: true, sequence: 0, snapshot: initialSnapshot() });
function setup() {
  const children: FakeCore[] = [];
  const hooks = { launch: vi.fn(() => { const child = new FakeCore(); children.push(child); return child; }), status: vi.fn(), event: vi.fn() };
  const supervisor = new CoreSupervisor(hooks);
  supervisor.start();
  return { supervisor, children, hooks, first: children[0]! };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("utility-process supervision", () => {
  const agent = (type: "agent.launch" | "agent.steer" | "agent.cancel"): CoreRequest => ({
    protocolVersion: PROTOCOL_VERSION, requestId: type, type,
    runId: "11111111-1111-4111-8111-111111111111",
    ...(type === "agent.launch" ? { contextHash: "a".repeat(64) } : {}),
    ...(type === "agent.steer" ? { expectedTurnId: "turn", text: "Focus on failures" } : {}),
  } as CoreRequest);
  const agentAck = (type: "agent.launch" | "agent.steer" | "agent.cancel") => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const timestamp = "2026-09-06T01:00:00.000Z";
    const result = type === "agent.launch"
      ? { kind: "launch", receipt: { runId, contextHash: "a".repeat(64), admittedAt: timestamp, status: "admitted" } }
      : type === "agent.cancel"
        ? { kind: "cancel", receipt: { runId, requestId: type, requestedAt: timestamp, status: "requested" } }
        : { kind: "steer", runId, receipt: { requestId: type, expectedTurnId: "turn", text: "Focus on failures", textHash: "a".repeat(64),
          status: "accepted", submittedAt: timestamp, settledAt: timestamp, error: null } };
    return { ...ok(type), agent: result };
  };
  it.each(["agent.launch", "agent.steer", "agent.cancel"] as const)("drains %s acknowledgement without waiting for a turn and closes admission", async (type) => {
    const { supervisor, first, children } = setup(); first.ready();
    const pending = supervisor.request(agent(type));
    supervisor.restart();
    expect(await supervisor.request(agent(type))).toMatchObject({ error: { code: "CORE_UNAVAILABLE" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    expect(first.kill).not.toHaveBeenCalled();
    first.emit("message", agentAck(type));
    expect(await pending).toMatchObject({ ok: true, agent: { kind: type.slice(6) } });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    expect(first.kill).not.toHaveBeenCalled();
    // No terminal provider event is needed: this was an acknowledgement wait only.
    first.shutdownReady(); first.shutdownReady();
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(1);
    first.exit(); children[1]!.ready();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(children[1]!.kill).not.toHaveBeenCalled();
    expect(children[1]!.postMessage).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("caps the acknowledgement grace at 1000ms across repeated rebuilds and never accepts late acknowledgement as replay authority", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    const pending = supervisor.request(agent("agent.steer"));
    supervisor.restart();
    await vi.advanceTimersByTimeAsync(750); supervisor.restart();
    await vi.advanceTimersByTimeAsync(249);
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    first.emit("message", agentAck("agent.steer")); supervisor.restart();
    expect(first.postMessage).toHaveBeenCalledTimes(2);
    expect(first.kill).not.toHaveBeenCalled();
    first.shutdownReady(); first.exit(); children[1]!.ready();
    expect(children[1]!.postMessage).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("retains earlier command deadlines instead of adding 1000ms to them", async () => {
    const { supervisor, first } = setup(); first.ready();
    const pending = supervisor.request(agent("agent.launch"));
    await vi.advanceTimersByTimeAsync(4_500); supervisor.restart();
    await vi.advanceTimersByTimeAsync(499);
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    supervisor.stop();
  });
  it("waits for every outstanding mutation acknowledgement, preserving confirmed ones", async () => {
    const { supervisor, first } = setup(); first.ready();
    const steering = supervisor.request(agent("agent.steer"));
    const cancelling = supervisor.request(agent("agent.cancel"));
    supervisor.restart(); first.emit("message", agentAck("agent.steer"));
    expect(await steering).toMatchObject({ ok: true });
    expect(first.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await cancelling).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    supervisor.stop();
  });
  it("preserves file-write protection after agent acknowledgement grace expires", async () => {
    const { supervisor, first } = setup(); first.ready();
    const writing = supervisor.request(write());
    const steering = supervisor.request(agent("agent.steer"));
    supervisor.restart(); await vi.advanceTimersByTimeAsync(10_000);
    expect(await steering).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(first.postMessage).toHaveBeenCalledTimes(2);
    expect(first.kill).not.toHaveBeenCalled();
    first.emit("message", ok("write")); await writing;
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    first.shutdownReady(); expect(first.kill).toHaveBeenCalledTimes(1);
    supervisor.stop();
  });
  it("crashes immediately during acknowledgement drain and clears timers belonging to the old core", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    const pending = supervisor.request(agent("agent.launch"));
    supervisor.restart(); await vi.advanceTimersByTimeAsync(500); first.exit();
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(children).toHaveLength(2); children[1]!.ready();
    first.shutdownReady();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(children[1]!.kill).not.toHaveBeenCalled();
    expect(children[1]!.postMessage).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("bounds shutdown confirmation separately and waits for actual exit before replacement", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    first.shutdownReady(); expect(first.kill).not.toHaveBeenCalled();
    supervisor.restart();
    expect(first.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "core.shutdown" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(first.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(supervisor.state).toMatchObject({ phase: "unavailable", message: expect.stringContaining("unknown") });
    expect(children).toHaveLength(1);
    first.shutdownReady(); expect(first.kill).toHaveBeenCalledTimes(1);
    first.exit(); children[1]!.ready();
    first.shutdownReady();
    expect(children[1]!.kill).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("kills immediately if the private shutdown transport fails and never retries it", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    first.postMessage.mockImplementation(() => { throw new Error("closed"); });
    supervisor.restart(); supervisor.restart();
    expect(first.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "core.shutdown" });
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(supervisor.state.message).toContain("unknown");
    first.exit(); children[1]!.ready(); await vi.advanceTimersByTimeAsync(3_000);
    expect(children[1]!.kill).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("explicit application stop bypasses both grace periods and cancels restart", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    const pending = supervisor.request(agent("agent.launch"));
    supervisor.restart(); supervisor.stop();
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(first.postMessage).toHaveBeenCalledTimes(1);
    first.exit(); await vi.advanceTimersByTimeAsync(10_000);
    expect(children).toHaveLength(1); expect(supervisor.state.phase).toBe("stopped");
  });
  it.each(["agent.launch", "agent.steer", "agent.cancel"] as const)("settles %s as unknown on crash/restart/timeout/transport without replay", async (type) => {
    for (const failure of ["crash", "restart", "timeout", "transport", "invalid"] as const) {
      const { supervisor, first, children } = setup(); first.ready();
      if (failure === "transport") first.postMessage.mockImplementation(() => { throw new Error("pipe lost"); });
      const pending = supervisor.request(agent(type));
      if (failure === "crash") first.exit();
      if (failure === "restart") { supervisor.restart(); first.exit(); }
      if (failure === "timeout") await vi.advanceTimersByTimeAsync(5_000);
      if (failure === "invalid") first.emit("message", ok(type)); // workspace success cannot acknowledge an agent command
      expect(await pending).toMatchObject({ ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN" } });
      await vi.advanceTimersByTimeAsync(100);
      if (children[1]) { children[1].ready(); expect(children[1].postMessage).not.toHaveBeenCalled(); }
      supervisor.stop();
    }
  });
  it("forwards agent snapshots with the same generation and rejects old-core events", async () => {
    const { supervisor, first, children, hooks } = setup(); first.ready();
    const event = { protocolVersion: PROTOCOL_VERSION, type: "agent.changed", sequence: 9,
      emittedAt: "2026-09-06T01:00:00.000Z", snapshot: unavailableAgentSnapshot() };
    first.emit("message", event);
    expect(hooks.event).toHaveBeenCalledWith(1, event);
    supervisor.restart(); first.exit(); children[1]!.ready();
    first.emit("message", { ...event, sequence: 99 });
    expect(hooks.event).toHaveBeenCalledTimes(1);
    const input: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "agents", type: "agent.snapshot" };
    const pending = supervisor.request(input);
    children[1]!.emit("message", { ...ok("agents"), agent: { kind: "snapshot", snapshot: unavailableAgentSnapshot() } });
    expect(await pending).toMatchObject({ ok: true, agent: { kind: "snapshot" } });
    supervisor.stop();
  });
  it("waits for readiness and bounds read deadlines", async () => {
    const { supervisor, first } = setup();
    expect(await supervisor.request(read())).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
    first.ready();
    const pending = supervisor.request(read());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toMatchObject({ ok: false, error: { code: "CORE_TIMEOUT" } });
    supervisor.stop();
  });
  it("settles reads and reports unknown writes on crash, without replay", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    const reading = supervisor.request(read()); const writing = supervisor.request(write());
    first.exit();
    expect(await reading).toMatchObject({ error: { code: "CORE_UNAVAILABLE" } });
    expect(await writing).toMatchObject({ error: { code: "WRITE_OUTCOME_UNKNOWN" } });
    await vi.advanceTimersByTimeAsync(100); children[1]!.ready();
    expect(children[1]!.postMessage).not.toHaveBeenCalled();
    supervisor.stop();
  });
  it("drains writes without a timeout before intentional restart and coalesces requests", async () => {
    const { supervisor, first, children } = setup(); first.ready();
    const writing = supervisor.request(write()); const reading = supervisor.request(read());
    supervisor.restart(); supervisor.restart();
    expect(await reading).toMatchObject({ error: { code: "CORE_UNAVAILABLE" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.kill).not.toHaveBeenCalled();
    expect(await supervisor.request(write("later"))).toMatchObject({ error: { code: "CORE_UNAVAILABLE" } });
    first.emit("message", ok("write")); await writing;
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    expect(first.kill).not.toHaveBeenCalled();
    first.shutdownReady();
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(1);
    first.exit(); expect(children).toHaveLength(2);
    supervisor.stop();
  });
  it("rejects stale replies/events and exit callbacks from replaced cores", async () => {
    const { supervisor, first, children, hooks } = setup(); first.ready(); supervisor.restart(); first.exit();
    const second = children[1]!; second.ready();
    const request = supervisor.request(read());
    first.emit("message", ok("read")); first.exit();
    expect(supervisor.state).toMatchObject({ generation: 2, phase: "ready" });
    expect(hooks.event).not.toHaveBeenCalled();
    second.emit("message", ok("read")); expect(await request).toMatchObject({ ok: true });
    supervisor.stop();
  });
  it("bounds crash loops even when each short-lived process reports ready", async () => {
    const { supervisor, children } = setup();
    for (const delay of [100, 500, 1500]) { children.at(-1)!.ready(); children.at(-1)!.exit(); await vi.advanceTimersByTimeAsync(delay); }
    children.at(-1)!.ready(); children.at(-1)!.exit();
    expect(supervisor.state.phase).toBe("failed");
    await vi.advanceTimersByTimeAsync(100_000); expect(children).toHaveLength(4);
    supervisor.stop();
  });
  it("fails readiness and refuses to overlap a process that has not exited", async () => {
    const { supervisor, children, first } = setup();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(first.kill).toHaveBeenCalledTimes(1); expect(children).toHaveLength(1);
    first.exit(); await vi.advanceTimersByTimeAsync(100); expect(children).toHaveLength(2);
    supervisor.stop();
  });
  it("shutdown cancels a scheduled retry and never respawns after exit", async () => {
    const { supervisor, first, children } = setup(); first.exit(); supervisor.stop();
    await vi.advanceTimersByTimeAsync(100_000); supervisor.restart();
    expect(children).toHaveLength(1); expect(supervisor.state.phase).toBe("stopped");
  });
  it("rejects duplicate pending IDs and settles a transport failure", async () => {
    const { supervisor, first } = setup(); first.ready();
    const pending = supervisor.request(read());
    expect(await supervisor.request(read())).toMatchObject({ error: { code: "DUPLICATE_REQUEST" } });
    first.emit("message", ok("read")); await pending;
    first.postMessage.mockImplementation(() => { throw new Error("closed"); });
    expect(await supervisor.request(write())).toMatchObject({ error: { code: "WRITE_OUTCOME_UNKNOWN" } });
    supervisor.stop();
  });
});
