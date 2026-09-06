import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { createAgentClient } from "../app/renderer/agents/client-memory";
import { displayAgentText, emptyLiveAgentState, type LiveAgentState } from "../app/renderer/agents/live-state";
import { fixtureLaunchContext } from "../app/renderer/agents/client";
import { emptyAgentWorkbench, fixtureReducer, FIXTURE_TIME } from "../app/renderer/agents/state";
import type { SwarmBridge } from "../app/electron/preload";
import type { Lifecycle, LifecycleBridge } from "../app/lifecycle";
import { AgentSnapshotSchema, PreparedAgentContextSchema, type AgentCapabilities, type AgentResult, type AgentSnapshot, type Run, type TranscriptRecord } from "../protocol/agents";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";

afterEach(() => vi.restoreAllMocks());
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const workspace = initialSnapshot(paymentsFileFocus);
// Test injection only: this does not select or attest a production provider.
const testCapabilities: AgentCapabilities = { availability: "available", reason: null, provider: "deterministic-test-only", version: "test-1",
  policy: "verified-read-only", controls: { launch: true, steer: true, cancel: true } };
const emptySnapshot = (): AgentSnapshot => AgentSnapshotSchema.parse({ ...emptyAgentWorkbench().snapshot, capabilities: testCapabilities });
function fixture(steps = 1) {
  let state = fixtureReducer(emptyAgentWorkbench(), { type: "launch", context: fixtureLaunchContext(paymentsFileFocus, "Explain interfaces", "", "") });
  for (let i = 0; i < steps; i++) state = fixtureReducer(state, { type: "advance" });
  return { ...state, snapshot: AgentSnapshotSchema.parse({ ...state.snapshot, capabilities: testCapabilities }) };
}
type Pending = ReturnType<typeof deferred<CoreResponse>> & { input: CoreRequest };
function harness() {
  const order: string[] = []; const calls: Pending[] = [];
  let event: Parameters<SwarmBridge["onEvent"]>[0] = () => undefined;
  let status: (value: Lifecycle) => void = () => undefined;
  const initialStatus = deferred<Lifecycle>();
  const bridge: SwarmBridge = {
    onEvent(listener) { order.push("subscribe-event"); event = listener; return () => { event = () => undefined; }; },
    request(input) { order.push(input.type); const pending = { ...deferred<CoreResponse>(), input }; calls.push(pending); return pending.promise; },
  };
  const lifecycle: LifecycleBridge = {
    onStatus(listener) { order.push("subscribe-status"); status = listener; return () => { status = () => undefined; }; },
    status() { order.push("read-status"); return initialStatus.promise; }, reload() { throw new Error("Reload is not authorized by client tests"); },
  };
  const latest = (type: CoreRequest["type"]) => calls.filter((call) => call.input.type === type).at(-1)!;
  const reply = (call: Pending, agent: AgentResult, sequence = 1) => call.resolve(CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION, requestId: call.input.requestId, ok: true, snapshot: workspace, sequence, agent,
  }));
  const changed = (snapshot: AgentSnapshot, sequence: number) => event({ protocolVersion: PROTOCOL_VERSION, type: "agent.changed", emittedAt: FIXTURE_TIME, sequence, snapshot });
  const life = (generation: number, phase: Lifecycle["core"]["phase"] = "ready"): Lifecycle => ({
    revision: generation, core: { generation, phase, message: `Core ${generation} ${phase}` }, reload: "idle", notice: "Test lifecycle",
  });
  const read = (call: Pending, run: Run, records: TranscriptRecord[] = [], sequence = 1, truncated = false) => reply(call, {
    kind: "read", run, page: { records, nextCursor: records.at(-1)?.recordId ?? (call.input.type === "agent.read" ? call.input.afterRecord : 0), truncated },
  }, sequence);
  return { bridge, lifecycle, calls, order, initialStatus, latest, reply, changed, life, read, event: (input: Parameters<typeof event>[0]) => event(input), status: (value: Lifecycle) => status(value) };
}
async function connected(snapshot = emptySnapshot()) {
  const h = harness(); const client = new AgentBridgeClient(); client.connect(h.bridge);
  h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot }); await drain();
  return { h, client };
}
async function selected(steps = 1) {
  const state = fixture(steps); const { h, client } = await connected(state.snapshot);
  client.select(state.run!.runId); h.read(h.latest("agent.read"), state.run!, state.records); await drain();
  return { h, client, state };
}
function prepared(call: Pending) {
  if (call.input.type !== "agent.prepare") throw new Error("Expected prepare request");
  return PreparedAgentContextSchema.parse({ runId: fixture(0).run!.runId, contextHash: "0".repeat(64),
    preparedAt: new Date(Date.now()).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), capabilities: testCapabilities,
    launchContext: fixtureLaunchContext(call.input.focus, call.input.taskText, call.input.model ?? "", call.input.effort ?? ""),
  });
}

describe("agent bridge observation and recovery (injected transport, never a production provider)", () => {
  it("subscribes before initial reads and lets an event outrank a delayed snapshot independently of workspace events", async () => {
    const h = harness(); const client = new AgentBridgeClient(); client.connect(h.bridge, h.lifecycle);
    expect(h.order).toEqual(["subscribe-event", "subscribe-status", "read-status"]);
    h.initialStatus.resolve(h.life(1)); await drain();
    expect(h.order.at(-1)).toBe("agent.snapshot");
    h.event({ protocolVersion: PROTOCOL_VERSION, type: "workspace.changed", sequence: 900,
      epoch: workspace.reconciliation.epoch, emittedAt: FIXTURE_TIME, snapshot: workspace });
    const newer = fixture().snapshot; h.changed(newer, 5);
    h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: emptySnapshot() }, 1); await drain();
    expect(client.getSnapshot().snapshot).toEqual(newer);
    h.changed(emptySnapshot(), 4);
    expect(client.getSnapshot().snapshot).toEqual(newer);
  });

  it("ignores an obsolete initial lifecycle read and a stale generation after newer status", async () => {
    const h = harness(); const client = new AgentBridgeClient(); client.connect(h.bridge, h.lifecycle);
    h.status(h.life(2)); h.initialStatus.resolve(h.life(1, "failed")); await drain();
    h.status(h.life(1, "unavailable"));
    expect(client.getSnapshot().connected).toBe(true);
    expect(h.calls.filter((call) => call.input.type === "agent.snapshot")).toHaveLength(1);
  });

  it("rejects out-of-order explicit snapshot replies even when their sequence ties", async () => {
    const { h, client } = await connected();
    const first = client.refresh(); const older = h.latest("agent.snapshot");
    const second = client.refresh(); const newer = h.latest("agent.snapshot");
    h.reply(newer, { kind: "snapshot", snapshot: fixture().snapshot }, 2); await second;
    h.reply(older, { kind: "snapshot", snapshot: emptySnapshot() }, 2); await first;
    expect(client.getSnapshot().snapshot?.runs).toHaveLength(1);
  });

  it("turns a pending instruction unknown on generation replacement and never replays its text", async () => {
    const state = fixture(); const h = harness(); const client = new AgentBridgeClient(); client.connect(h.bridge, h.lifecycle);
    h.status(h.life(1)); h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: state.snapshot }); await drain();
    client.select(state.run!.runId); h.read(h.latest("agent.read"), state.run!, state.records); await drain();
    client.instruction("Preserve this exact unsent/uncertain text"); const sending = client.steer(); const old = h.latest("agent.steer");
    expect(client.getSnapshot().operations[0]?.status).toBe("pending");
    h.status(h.life(2, "starting"));
    expect(client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    old.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: old.input.requestId, ok: false, error: { code: "STALE_TURN", message: "Old rejection" } }); await sending;
    h.status(h.life(2)); h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: state.snapshot }); await drain();
    h.read(h.latest("agent.read"), state.run!, state.records); await drain(); await client.steer();
    expect(client.getSnapshot().instructions[state.run!.runId]).toBe("Preserve this exact unsent/uncertain text");
    expect(client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    expect(h.calls.filter((call) => call.input.type === "agent.steer")).toHaveLength(1);
  });

  it("recovers selection, dock size, frozen draft, unsent and pending text through an HMR checkpoint without dispatch", () => {
    const state = fixture(); const runId = state.run!.runId;
    const checkpoint: LiveAgentState = { ...emptyLiveAgentState(), connected: true, selectedRunId: runId, paneOpen: true, height: 350,
      snapshot: state.snapshot, run: state.run, reading: true, detailStale: false, instructions: { [runId]: "unsent text" },
      draft: { focus: paymentsFileFocus, task: "draft text", model: "requested-model", prepared: null, preparing: true, confirmed: true },
      operations: [{ requestId: "pending-test", runId, kind: "steer", text: "dispatched text", status: "pending", message: "Awaiting acknowledgement" }],
    };
    const save = vi.fn(); const client = new AgentBridgeClient(checkpoint, save); const recovered = client.getSnapshot();
    expect(recovered).toMatchObject({ selectedRunId: runId, height: 350, paneOpen: true, connected: false, reading: false, detailStale: true,
      instructions: { [runId]: "unsent text" }, draft: { task: "draft text", model: "requested-model", preparing: false, confirmed: false } });
    expect(recovered.operations[0]).toMatchObject({ text: "dispatched text", status: "delivery-unknown" });
    client.openDraft({ ...paymentsFileFocus, key: "different-focus" });
    expect(client.getSnapshot().draft?.focus).toEqual(paymentsFileFocus);
    expect(checkpoint.operations[0]?.status).toBe("pending");
    client.resize(900); expect(save.mock.lastCall?.[0].height).toBe(420);
  });

  it("discards a delayed detail reply when another historical run has been selected", async () => {
    const state = fixture(4); const firstRun = state.run!; const secondRun = { ...firstRun, runId: "22222222-2222-4222-8222-222222222222" };
    const snapshot = AgentSnapshotSchema.parse({ ...state.snapshot, runs: [state.snapshot.runs[0], { ...state.snapshot.runs[0], runId: secondRun.runId }] });
    const { h, client } = await connected(snapshot);
    client.select(firstRun.runId); const firstRead = h.latest("agent.read");
    client.select(secondRun.runId); h.read(h.latest("agent.read"), secondRun, state.records, 3); await drain();
    h.read(firstRead, firstRun, state.records, 4); await drain();
    expect(client.getSnapshot().run?.runId).toBe(secondRun.runId);
    expect(client.getSnapshot().selectedRunId).toBe(secondRun.runId);
    expect(h.calls.every((call) => call.input.type.startsWith("agent."))).toBe(true);
  });

  it("replaces bounded historical pages and retains explicit truncation and plaintext gap records", async () => {
    const { h, client, state } = await selected(4);
    const records: TranscriptRecord[] = Array.from({ length: 140 }, (_, i) => ({ recordId: i + 1, timestamp: FIXTURE_TIME,
      kind: i === 12 ? "gap" : "message", providerItemId: null, text: i === 12 ? "Earlier output truncated" : "<script>not executable</script>" }));
    const run = { ...state.run!, transcript: { ...state.run!.transcript, lastRecord: 141, truncated: true } };
    const first = client.read(true); h.read(h.latest("agent.read"), run, records, 2, true); await first;
    expect(client.getSnapshot().records).toHaveLength(140);
    expect(client.getSnapshot().records.map((record) => record.recordId)).toEqual(records.map((record) => record.recordId));
    expect(client.getSnapshot().records[12]).toMatchObject({ recordId: 13, kind: "gap" });
    expect(client.getSnapshot().pageTruncated).toBe(true);
    expect(client.getSnapshot().pageCursor).toBe(140);
    const next = client.read(); expect(h.latest("agent.read").input).toMatchObject({ afterRecord: 140 });
    h.read(h.latest("agent.read"), run, [{ ...records[139]!, recordId: 141 }], 2); await next;
    expect(client.getSnapshot().records).toHaveLength(1);
    expect(client.getSnapshot().records[0]?.text).toBe("<script>not executable</script>");
  });

  it("does not replace current detail with a read older than an observed agent event", async () => {
    const { h, client, state } = await selected();
    const reading = client.read(true); const old = h.latest("agent.read"); h.changed(state.snapshot, 8);
    h.read(old, state.run!, state.records, 7); await reading; await drain();
    expect(client.getSnapshot().detailStale).toBe(true);
    h.read(h.latest("agent.read"), state.run!, state.records, 8); await drain();
    expect(client.getSnapshot().detailStale).toBe(false);
  });

  it("sanitizes boundary diagnostics and never promotes unavailable transport into fixture acceptance", async () => {
    const client = new AgentBridgeClient(); client.connect(undefined); await client.refresh();
    expect(client.getSnapshot().snapshot).toBeNull(); expect(client.getSnapshot().notice).toContain("ADAPTER_UNAVAILABLE");
    const { h, client: online } = await connected(); const refresh = online.refresh(); const call = h.latest("agent.snapshot");
    call.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: call.input.requestId, ok: false,
      error: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Hooks \u202e cannot be verified" } }); await refresh;
    expect(online.getSnapshot().notice).toBe("ADAPTER_POLICY_UNAVAILABLE: Hooks \\u{202e} cannot be verified");
    const invalid = online.refresh(); h.latest("agent.snapshot").resolve({ ...workspace } as unknown as CoreResponse); await invalid;
    expect(online.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    expect(displayAgentText("a\u0000\u202eb\n\t")).toBe("a\\u{0}\\u{202e}b\n\t");
    expect(online.getSnapshot().snapshot?.runs).toEqual([]);
  });

  it("rejects a schema-valid prepared reply that changes requested task context", async () => {
    const { h, client } = await connected(); client.openDraft(paymentsFileFocus); const preparing = client.prepare(); const call = h.latest("agent.prepare");
    const draft = prepared(call); draft.launchContext.taskText = "Different task";
    h.reply(call, { kind: "prepare", draft }); await preparing;
    expect(client.getSnapshot().draft?.prepared).toBeNull(); expect(client.getSnapshot().draft?.preparing).toBe(false);
    expect(client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    await client.launch(); expect(h.calls.some((entry) => entry.input.type === "agent.launch")).toBe(false);
  });

  it("requires explicit inspected confirmation and unexpired launch capabilities, with admission separate from running", async () => {
    const { h, client } = await connected(); client.openDraft(paymentsFileFocus); client.editDraft({ task: "Inspect the disk context", model: "requested-model" });
    const preparing = client.prepare(); const call = h.latest("agent.prepare"); const draft = prepared(call);
    expect(call.input).toMatchObject({ model: "requested-model", effort: null });
    h.reply(call, { kind: "prepare", draft }); await preparing;
    await client.launch(); expect(h.calls.some((entry) => entry.input.type === "agent.launch")).toBe(false);
    client.confirmDraft(true); vi.spyOn(Date, "now").mockReturnValue(Date.parse(draft.expiresAt));
    await client.launch(); expect(client.getSnapshot().notice).toContain("STALE_CONTEXT");
    vi.restoreAllMocks(); h.changed(emptyAgentWorkbench().snapshot, 2);
    await client.launch(); expect(h.calls.some((entry) => entry.input.type === "agent.launch")).toBe(false);
    h.changed(emptySnapshot(), 3); const launching = client.launch(); const launch = h.latest("agent.launch");
    expect(client.getSnapshot().operations[0]?.status).toBe("pending");
    h.reply(launch, { kind: "launch", receipt: { runId: draft.runId, contextHash: draft.contextHash, admittedAt: FIXTURE_TIME, status: "admitted" } }, 3); await launching;
    expect(client.getSnapshot().operations[0]).toMatchObject({ status: "accepted", message: "Admission recorded; not provider activity or completion." });
    expect(client.getSnapshot().run).toBeNull(); expect(client.getSnapshot().draft).toBeNull();
  });

  it("keeps Stop acknowledgement separate from terminal turn and process cleanup", async () => {
    const { h, client, state } = await selected(); const stopping = client.stop(); const call = h.latest("agent.cancel");
    h.reply(call, { kind: "cancel", receipt: { runId: state.run!.runId, requestId: call.input.requestId, requestedAt: FIXTURE_TIME, status: "requested" } }); await stopping;
    expect(client.getSnapshot().run?.state).toBe("running");
    expect(client.getSnapshot().operations[0]).toMatchObject({ status: "accepted", message: "Stop requested; interruption and cleanup are not yet confirmed." });
    await client.stop(); expect(h.calls.filter((entry) => entry.input.type === "agent.cancel")).toHaveLength(1);
    const completed = fixture(3); h.changed(completed.snapshot, 3); h.read(h.latest("agent.read"), completed.run!, completed.records, 3); await drain();
    expect(client.getSnapshot().run).toMatchObject({ state: "completed", processState: "live" });
    const exited = fixture(4); h.changed(exited.snapshot, 4); h.read(h.latest("agent.read"), exited.run!, exited.records, 4); await drain();
    expect(client.getSnapshot().run).toMatchObject({ state: "completed", processState: "exited", cleanup: { status: "confirmed" } });
  });

  it("launches while historical detail is pending without leaving the new run's reading state stuck", async () => {
    const historical = fixture(4); const { h, client } = await connected(historical.snapshot);
    client.select(historical.run!.runId); const oldRead = h.latest("agent.read");
    expect(client.getSnapshot().reading).toBe(true);
    client.openDraft(paymentsFileFocus); const preparing = client.prepare(); const draft = {
      ...prepared(h.latest("agent.prepare")), runId: "33333333-3333-4333-8333-333333333333",
    };
    h.reply(h.latest("agent.prepare"), { kind: "prepare", draft }); await preparing; client.confirmDraft(true);
    const launching = client.launch();
    expect(client.getSnapshot()).toMatchObject({ selectedRunId: draft.runId, reading: false });
    h.read(oldRead, historical.run!, historical.records); await drain();
    expect(client.getSnapshot()).toMatchObject({ selectedRunId: draft.runId, reading: false, run: null });
    h.reply(h.latest("agent.launch"), { kind: "launch", receipt: {
      runId: draft.runId, contextHash: draft.contextHash, admittedAt: FIXTURE_TIME, status: "admitted",
    } }); await launching;
    const admitted = fixture(0); const run = { ...admitted.run!, runId: draft.runId, launchContext: draft.launchContext };
    h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: AgentSnapshotSchema.parse({ ...admitted.snapshot,
      runs: [historical.snapshot.runs[0], { ...admitted.snapshot.runs[0], runId: draft.runId }], activeRunId: draft.runId,
    }) }, 2); await drain();
    expect(h.latest("agent.read").input).toMatchObject({ runId: draft.runId });
    h.read(h.latest("agent.read"), run, admitted.records, 2); await drain();
    expect(client.getSnapshot()).toMatchObject({ reading: false, detailStale: false, run: { runId: draft.runId, state: "starting" } });
  });

  it.each(["edit-current", "replace-draft"] as const)("late admission preserves newer %s text, historical selection and pane closure", async (intent) => {
    const historical = fixture(4); const { h, client } = await connected(historical.snapshot);
    client.openDraft(paymentsFileFocus); const preparing = client.prepare(); const draft = {
      ...prepared(h.latest("agent.prepare")), runId: "33333333-3333-4333-8333-333333333333",
    };
    h.reply(h.latest("agent.prepare"), { kind: "prepare", draft }); await preparing; client.confirmDraft(true);
    const launching = client.launch(); const pendingLaunch = h.latest("agent.launch");
    if (intent === "replace-draft") { client.closeDraft(); client.openDraft({ ...paymentsFileFocus, key: "new-draft-focus" }); }
    client.editDraft({ task: "Newer user intent must survive admission", model: "new-model-request" });
    client.select(historical.run!.runId); h.read(h.latest("agent.read"), historical.run!, historical.records); await drain();
    client.closePane(); const newerFocus = client.getSnapshot().draft!.focus;
    h.reply(pendingLaunch, { kind: "launch", receipt: {
      runId: draft.runId, contextHash: draft.contextHash, admittedAt: FIXTURE_TIME, status: "admitted",
    } }); await launching;
    expect(client.getSnapshot()).toMatchObject({ selectedRunId: historical.run!.runId, paneOpen: false,
      draft: { task: "Newer user intent must survive admission", model: "new-model-request", focus: newerFocus },
      run: { runId: historical.run!.runId },
    });
    expect(client.getSnapshot().records).toEqual(historical.records);
    expect(client.getSnapshot().operations[0]?.status).toBe("accepted");
  });

  it("reserves cancellation capacity when 128 local instruction operations are already retained", async () => {
    const state = fixture(); const runId = state.run!.runId; const h = harness();
    const operations: LiveAgentState["operations"] = Array.from({ length: 128 }, (_, i) => ({
      requestId: `retained-instruction-${i}`, runId, kind: "steer", text: `Retained text ${i}`, status: "accepted", message: "Acknowledged, not completion",
    }));
    const client = new AgentBridgeClient({ ...emptyLiveAgentState(), selectedRunId: runId, snapshot: state.snapshot, run: state.run, operations });
    client.connect(h.bridge); h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: state.snapshot }); await drain();
    h.read(h.latest("agent.read"), state.run!, state.records); await drain();
    const stopping = client.stop(); expect(h.calls.filter((call) => call.input.type === "agent.cancel")).toHaveLength(1);
    const cancel = h.latest("agent.cancel"); h.reply(cancel, { kind: "cancel", receipt: {
      runId, requestId: cancel.input.requestId, requestedAt: FIXTURE_TIME, status: "requested",
    } }); await stopping;
    expect(client.getSnapshot().operations.filter((operation) => operation.kind === "steer")).toEqual(operations);
    expect(client.getSnapshot().operations.at(-1)).toMatchObject({ kind: "cancel", status: "accepted" });
    await client.stop(); expect(h.calls.filter((call) => call.input.type === "agent.cancel")).toHaveLength(1);
  });

  it("prevents an obsolete HMR client acknowledgement from overwriting its replacement's checkpoint", async () => {
    const memory: { state?: LiveAgentState; owner?: symbol } = {}; const state = fixture(); const h = harness();
    const oldClient = createAgentClient(memory); const disconnect = oldClient.connect(h.bridge);
    h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: state.snapshot }); await drain();
    oldClient.select(state.run!.runId); h.read(h.latest("agent.read"), state.run!, state.records); await drain();
    oldClient.instruction("Previously dispatched instruction"); const sending = oldClient.steer(); const pending = h.latest("agent.steer");
    disconnect(); const replacement = createAgentClient(memory); replacement.instruction("New unsent text after renderer replacement");
    expect(memory.state?.instructions[state.run!.runId]).toBe("New unsent text after renderer replacement");
    pending.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: pending.input.requestId, ok: false,
      error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Old acknowledgement did not arrive" } }); await sending;
    expect(memory.state?.instructions[state.run!.runId]).toBe("New unsent text after renderer replacement");
    expect(memory.state?.operations[0]).toMatchObject({ text: "Previously dispatched instruction", status: "delivery-unknown" });
    expect(h.calls.filter((call) => call.input.type === "agent.steer")).toHaveLength(1);
  });
});
