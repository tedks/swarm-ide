import { describe, expect, it } from "vitest";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { createAgentClient, type AgentClientMemory } from "../app/renderer/agents/client-memory";
import { emptyLiveAgentState, protectsAgentIntent, type LocalOperation } from "../app/renderer/agents/live-state";
import { fixtureLaunchContext } from "../app/renderer/agents/client";
import { emptyAgentWorkbench, fixtureReducer, FIXTURE_TIME } from "../app/renderer/agents/state";
import type { SwarmBridge } from "../app/electron/preload";
import { AgentSnapshotSchema, PreparedAgentContextSchema, type AgentResult, type Run } from "../protocol/agents";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";

const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const capabilities = { availability: "available", reason: null, provider: "deterministic-test-only", version: "test-1",
  policy: "verified-read-only", controls: { launch: true, steer: true, cancel: true } } as const;
function fixture() {
  const launched = fixtureReducer(emptyAgentWorkbench(), { type: "launch", context: fixtureLaunchContext(paymentsFileFocus, "Explain interfaces", "", "") });
  return fixtureReducer(launched, { type: "advance" });
}
const run = fixture().run!;
const operation = (kind: LocalOperation["kind"] = "launch", requestId = "local-command"): LocalOperation => ({
  requestId, runId: run.runId, kind, text: "Private local command", status: "delivery-unknown", message: "Unknown delivery",
});
type Pending = ReturnType<typeof deferred<CoreResponse>> & { input: CoreRequest };
function harness() {
  const calls: Pending[] = [];
  let event: Parameters<SwarmBridge["onEvent"]>[0] = () => undefined;
  const bridge: SwarmBridge = {
    onEvent(listener) { event = listener; return () => { event = () => undefined; }; },
    request(input) { const pending = { ...deferred<CoreResponse>(), input }; calls.push(pending); return pending.promise; },
  };
  const latest = (type: CoreRequest["type"]) => calls.filter((call) => call.input.type === type).at(-1)!;
  const reply = (call: Pending, agent: AgentResult, sequence = 1) => call.resolve(CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION, requestId: call.input.requestId, ok: true,
    snapshot: initialSnapshot(paymentsFileFocus), sequence, agent,
  }));
  const read = (call: Pending, value: Run = run, sequence = 1) => reply(call, { kind: "read", run: value,
    page: { records: [], nextCursor: 0, truncated: false } }, sequence);
  const snapshot = AgentSnapshotSchema.parse({ ...emptyAgentWorkbench().snapshot, capabilities });
  const changed = (sequence: number) => event({ protocolVersion: PROTOCOL_VERSION, type: "agent.changed", emittedAt: FIXTURE_TIME, sequence, snapshot });
  return { bridge, calls, latest, reply, read, snapshot, changed };
}
async function connected(operations: LocalOperation[] = []) {
  const h = harness(); const client = new AgentBridgeClient({ ...emptyLiveAgentState(), operations });
  const disconnect = client.connect(h.bridge);
  h.reply(h.latest("agent.snapshot"), { kind: "snapshot", snapshot: h.snapshot }); await drain();
  return { h, client, disconnect };
}

describe("document-loss guard local client intent", () => {
  it("protects whitespace and nonselected run text but not authoritative historical output", () => {
    const state = { ...emptyLiveAgentState(), run, records: fixture().records, snapshot: fixture().snapshot,
      operations: [{ ...operation(), status: "accepted" as const }, { ...operation("cancel", "rejected"), status: "rejected" as const }] };
    expect(protectsAgentIntent(state)).toBe(false);
    expect(protectsAgentIntent({ ...state, instructions: { hidden: " \n\t" } })).toBe(true);
    expect(protectsAgentIntent({ ...state, instructions: { hidden: "" } })).toBe(false);
    expect(protectsAgentIntent({ ...state, operations: [operation()] })).toBe(true);
    expect(protectsAgentIntent({ ...state, operations: [{ ...operation(), documentLossAcknowledged: true }] })).toBe(false);
  });

  it("clears only observed draft/text and leaves a replacement draft and changed text protected", () => {
    const client = new AgentBridgeClient({ ...emptyLiveAgentState(), selectedRunId: run.runId,
      instructions: { [run.runId]: "old", hidden: "unchanged" } });
    client.openDraft(paymentsFileFocus); const observed = client.getSnapshot();
    client.editDraft({ task: "replacement" }); client.instruction("newer");
    client.clearLocalIntent(observed, true);
    expect(client.getSnapshot().draft?.task).toBe("replacement");
    expect(client.getSnapshot().instructions).toEqual({ [run.runId]: "newer", hidden: "unchanged" });
    expect(protectsAgentIntent(client.getSnapshot())).toBe(true);
    client.clearLocalIntent(client.getSnapshot());
    expect(protectsAgentIntent(client.getSnapshot())).toBe(false);
  });

  it("preserves instruction intent replaced A to B to A after the discard controls rendered", () => {
    const client = new AgentBridgeClient({ ...emptyLiveAgentState(), selectedRunId: run.runId,
      instructions: { [run.runId]: "A", hidden: "other run" } });
    const observed = client.getSnapshot();
    client.instruction("B"); client.instruction("A");
    const replacement = client.getSnapshot().instructions;
    client.clearLocalIntent(observed, true);
    expect(client.getSnapshot().instructions).toBe(replacement);
    expect(client.getSnapshot().instructions).toEqual({ [run.runId]: "A", hidden: "other run" });
    expect(protectsAgentIntent(client.getSnapshot())).toBe(true);
    client.clearLocalIntent(client.getSnapshot(), true);
    expect(client.getSnapshot().instructions).toEqual({});
    expect(protectsAgentIntent(client.getSnapshot())).toBe(false);
  });

  it("clearing text alone does not acknowledge unresolved receipts; explicit loss retains identities/status", () => {
    const client = new AgentBridgeClient({ ...emptyLiveAgentState(), operations: [operation("steer"), operation("cancel", "stop")], instructions: { hidden: "draft" } });
    client.clearLocalIntent(client.getSnapshot());
    expect(protectsAgentIntent(client.getSnapshot())).toBe(true);
    const before = client.getSnapshot().operations;
    client.clearLocalIntent(client.getSnapshot(), true);
    expect(client.getSnapshot().operations).toEqual(before.map((op) => ({ ...op, text: null, documentLossAcknowledged: true })));
    expect(protectsAgentIntent(client.getSnapshot())).toBe(false);
    client.openDraft(paymentsFileFocus);
    expect(protectsAgentIntent(client.getSnapshot())).toBe(true);
  });

  it("a stale discard cannot acknowledge a newly created local command", async () => {
    const { h, client } = await connected(); const observed = client.getSnapshot();
    h.changed(2);
    // Recovering another controller models new command evidence arriving after the observed UI.
    const current = new AgentBridgeClient({ ...client.getSnapshot(), operations: [operation()] });
    current.clearLocalIntent(observed, true);
    expect(current.getSnapshot().operations[0]?.documentLossAcknowledged).toBeUndefined();
    expect(protectsAgentIntent(current.getSnapshot())).toBe(true);
  });

  it("invalidates an in-flight preparation when cleared and keeps replacement draft untouched", async () => {
    const { h, client } = await connected(); client.openDraft(paymentsFileFocus);
    const preparing = client.prepare(); const call = h.latest("agent.prepare");
    if (call.input.type !== "agent.prepare") throw new Error("Expected preparation");
    const context = fixtureLaunchContext(call.input.focus, call.input.taskText, "", "");
    const draft = PreparedAgentContextSchema.parse({ runId: run.runId, contextHash: context.contextHash,
      preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), capabilities, launchContext: context });
    client.clearLocalIntent(client.getSnapshot(), true); client.openDraft(paymentsFileFocus); client.editDraft({ task: "new private draft" });
    h.reply(call, { kind: "prepare", draft }); await preparing;
    expect(client.getSnapshot().draft).toMatchObject({ task: "new private draft", prepared: null, preparing: false });
  });

  it("allows late durable admission after loss acknowledgement without replay or selection/reveal", async () => {
    const { h, client } = await connected([operation()]);
    client.clearLocalIntent(client.getSnapshot(), true);
    const before = client.getSnapshot(); const reading = client.reconcileOperation("local-command");
    h.read(h.latest("agent.read")); await reading;
    expect(client.getSnapshot().operations[0]).toMatchObject({ requestId: "local-command", status: "accepted", text: null, documentLossAcknowledged: true });
    expect(client.getSnapshot().selectedRunId).toBe(before.selectedRunId);
    expect(client.getSnapshot().run).toBe(before.run);
    expect(client.getSnapshot().records).toBe(before.records);
    expect(h.calls.map((call) => call.input.type)).toEqual(["agent.snapshot", "agent.read"]);
    expect(protectsAgentIntent(client.getSnapshot())).toBe(false);
  });

  it("keeps pending launch identity across discard and a late acknowledgement cannot clear replacement intent", async () => {
    const { h, client } = await connected(); client.openDraft(paymentsFileFocus);
    const preparing = client.prepare(); const preparation = h.latest("agent.prepare");
    if (preparation.input.type !== "agent.prepare") throw new Error("Expected preparation");
    const context = fixtureLaunchContext(preparation.input.focus, preparation.input.taskText, "", "");
    const draft = PreparedAgentContextSchema.parse({ runId: run.runId, contextHash: context.contextHash,
      preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), capabilities, launchContext: context });
    h.reply(preparation, { kind: "prepare", draft }); await preparing; client.confirmDraft(true);
    const launching = client.launch(); const pending = h.latest("agent.launch");
    expect(client.getSnapshot().operations[0]?.status).toBe("pending");
    client.clearLocalIntent(client.getSnapshot(), true); client.openDraft(paymentsFileFocus); client.editDraft({ task: "replacement task" });
    await client.launch();
    h.reply(pending, { kind: "launch", receipt: { runId: draft.runId, contextHash: draft.contextHash, admittedAt: FIXTURE_TIME, status: "admitted" } }); await launching;
    expect(client.getSnapshot().operations[0]).toMatchObject({ requestId: pending.input.requestId, status: "accepted", text: null, documentLossAcknowledged: true });
    expect(client.getSnapshot().draft?.task).toBe("replacement task");
    expect(h.calls.filter((call) => call.input.type === "agent.launch")).toHaveLength(1);
    expect(protectsAgentIntent(client.getSnapshot())).toBe(true);
  });

  it("reconciles a matching steering receipt but never infers Stop acknowledgement from run state", async () => {
    const { h, client } = await connected([operation("steer", "instruction"), operation("cancel", "stop")]);
    const receipt = { requestId: "instruction", expectedTurnId: run.providerTurnId!, text: "Private local command", textHash: "0".repeat(64),
      submittedAt: FIXTURE_TIME, settledAt: FIXTURE_TIME, status: "accepted" as const, error: null };
    const steering = client.reconcileOperation("instruction"); h.read(h.latest("agent.read"), { ...run, instructions: [receipt] }); await steering;
    expect(client.getSnapshot().operations[0]?.status).toBe("accepted");
    const stop = client.reconcileOperation("stop"); h.read(h.latest("agent.read")); await stop;
    expect(client.getSnapshot().operations[1]?.status).toBe("delivery-unknown");
    expect(client.getSnapshot().notice).toContain("absence is not rejection");
    expect(h.calls.every((call) => call.input.type === "agent.read" || call.input.type === "agent.snapshot")).toBe(true);
  });

  it("ignores stale and disconnected reconciliation replies and deduplicates overlapping reads", async () => {
    const { h, client, disconnect } = await connected([operation()]);
    const first = client.reconcileOperation("local-command"); await client.reconcileOperation("local-command");
    expect(h.calls.filter((call) => call.input.type === "agent.read")).toHaveLength(1);
    h.changed(4); h.read(h.latest("agent.read"), run, 3); await first;
    expect(client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    const second = client.reconcileOperation("local-command"); const pending = h.latest("agent.read"); disconnect();
    h.read(pending, run, 5); await second;
    expect(client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    const count = h.calls.length; await client.reconcileOperation("local-command"); expect(h.calls).toHaveLength(count);
  });

  it("preserves loss acknowledgement in HMR memory while an obsolete owner cannot erase new intent", () => {
    const memory: AgentClientMemory = { state: { ...emptyLiveAgentState(), operations: [operation()] } };
    const old = createAgentClient(memory); old.connect(undefined); old.clearLocalIntent(old.getSnapshot(), true);
    createAgentClient(memory); // StrictMode's discarded render must not claim ownership.
    old.openDraft(paymentsFileFocus); expect(memory.state?.draft).not.toBeNull();
    const current = createAgentClient(memory); current.connect(undefined); current.editDraft({ task: "replacement owner" });
    old.clearLocalIntent(old.getSnapshot(), true);
    expect(memory.state?.draft?.task).toBe("replacement owner");
    expect(current.getSnapshot().operations[0]?.documentLossAcknowledged).toBe(true);
    expect(protectsAgentIntent(current.getSnapshot())).toBe(true);
  });
});
