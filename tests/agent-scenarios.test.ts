import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AdapterEvent } from "../core/agents/adapter";
import {
  AGENT_FIXTURE_AT, AGENT_FIXTURE_CALL_LIMIT, AGENT_FIXTURE_PHASES, AGENT_FIXTURE_THREAD, AGENT_FIXTURE_TURN, agentFixtureContext, agentFixtureFailures,
  agentFixtureFrames, agentFixturePage, agentFixtureRecords, agentFixtureReordering, createAgentAdapterFixture,
} from "../fixtures/agents";
import {
  AGENT_LIMITS, AgentCapabilitiesSchema, AgentEventSchema, AgentRequestSchema, AgentResultSchema,
  AgentSnapshotSchema, PreparedAgentContextSchema, RunSchema, TranscriptPageSchema, utf8Bytes,
  type AgentRequest, type AgentResult,
} from "../protocol/agents";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../protocol/schema";
import { EventEnvelopeSchema } from "../app/lifecycle";
import { initialSnapshot } from "../fixtures/world";
import { unavailableAgentRequest } from "../core/agents/unavailable";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const terminal: AdapterEvent = { type: "terminal", at: AGENT_FIXTURE_AT,
  outcome: { kind: "turn", threadId: AGENT_FIXTURE_THREAD, turnId: AGENT_FIXTURE_TURN, status: "completed", observedAt: AGENT_FIXTURE_AT } };
const cleanup = { status: "confirmed" as const, observedAt: AGENT_FIXTURE_AT, detail: "FIXTURE ONLY: simulated owner termination." };

async function start() {
  const fixture = createAgentAdapterFixture();
  const events: AdapterEvent[] = [];
  const handle = await fixture.adapter.start(agentFixtureContext(), (event) => events.push(event));
  return { fixture, events, handle };
}
async function dispose(f: Awaited<ReturnType<typeof start>>) {
  const pending = f.handle.dispose(); f.fixture.settleCleanup(cleanup); await pending;
}

describe("shared fixture observations use the frozen R0 contract", () => {
  it("labels synthetic context and observed identity honestly, with exact byte digests", () => {
    const context = agentFixtureContext();
    expect(PreparedAgentContextSchema.parse(context)).toEqual(context);
    expect(context.capabilities.provider).toBe("deterministic-fixture");
    expect(context.launchContext.root).toBe("/fixture/not-a-real-workspace");
    expect(context.contextHash).toBe(hash(context.launchContext.submittedPrompt));
    const attachment = context.launchContext.attachments[0]!;
    expect(attachment.digest).toBe(hash(attachment.content));
    expect(context.launchContext.submittedPrompt).toContain("FIXTURE ONLY");
    expect(context.launchContext.instructionSources).toEqual([]);
    expect(context.launchContext.configurationSources).toEqual([]);
    const { submittedPrompt, contextHash: _contextHash, ...fields } = context.launchContext;
    expect(JSON.parse(submittedPrompt.split("\n")[1]!)).toEqual(fields);
    expect(Date.parse(context.expiresAt)).toBeLessThan(Date.parse("2001-01-01T00:00:00Z"));
  });
  it.each(AGENT_FIXTURE_PHASES)("validates %s frame, read result, broadcast tail and event", (phase) => {
    const frame = agentFixtureFrames()[phase];
    expect(RunSchema.parse(frame.run)).toEqual(frame.run);
    expect(AgentResultSchema.parse(frame.read)).toEqual(frame.read);
    expect(AgentEventSchema.parse(frame.event)).toEqual(frame.event);
    expect(AgentSnapshotSchema.parse(frame.snapshot)).toEqual(frame.snapshot);
    expect(frame.event.snapshot).toEqual(frame.snapshot);
    expect(frame.read.run).toEqual(frame.run);
  });
  it("keeps admission, steering acknowledgement, terminal turn and cleanup independent", () => {
    const frames = agentFixtureFrames();
    expect(frames.admitted.run).toMatchObject({ state: "starting", providerTurnId: null, processState: "not-started" });
    expect(frames["steering-accepted"].run).toMatchObject({ state: "running", endedAt: null, providerOutcome: { kind: "none" } });
    expect(frames["cancel-requested"].run).toMatchObject({ state: "cancelling", endedAt: null, cleanup: { status: "pending" } });
    expect(frames["completed-live"].run).toMatchObject({ state: "completed", processState: "live", cleanup: { status: "pending" } });
    expect(frames["completed-cleaned"].run).toMatchObject({ state: "completed", processState: "exited", cleanup: { status: "confirmed" } });
    expect(frames.cancelled.run.providerOutcome).toMatchObject({ kind: "turn", status: "interrupted" });
    expect(frames["recovered-unknown"].run).toMatchObject({ state: "unknown", processState: "unknown", providerOutcome: { kind: "none" },
      cleanup: { status: "unknown" }, transcript: { tailMayBeLost: true } });
    expect(frames["setup-rejected"].run).toMatchObject({ state: "failed", processState: "not-started", providerOutcome: { kind: "setup-rejected" } });
  });
  it("retains exact steering text through pending, rejection and lost acknowledgement", () => {
    const frames = agentFixtureFrames();
    const pending = frames["steering-pending"].run.instructions[0]!;
    for (const phase of ["steering-accepted", "steering-unknown", "steering-stale", "recovered-unknown"] as const) {
      const receipt = frames[phase].run.instructions[0]!;
      expect(receipt.text).toBe(pending.text);
      expect(receipt.textHash).toBe(hash(pending.text));
      expect(receipt.requestId).toBe(pending.requestId);
      expect(receipt.settledAt).not.toBeNull();
    }
    expect(frames["steering-stale"].run.instructions[0]!.error?.code).toBe("STALE_TURN");
    expect(frames["recovered-unknown"].run.instructions[0]!.status).toBe("delivery-unknown");
    expect(frames["steering-stale"].run.instructions[0]!.expectedTurnId).not.toBe(frames["steering-stale"].run.providerTurnId);
  });
  it("returns independent frames and invocations, including nested arrays", () => {
    const first = agentFixtureFrames();
    first.streaming.run.launchContext.attachments[0]!.content = "mutated";
    first.streaming.snapshot.runs[0]!.taskLabel = "mutated";
    first.streaming.read.page.records[0]!.text = "mutated";
    expect(first.streaming.read.run.launchContext.attachments[0]!.content).not.toBe("mutated");
    expect(first.streaming.event.snapshot.runs[0]!.taskLabel).not.toBe("mutated");
    expect(JSON.stringify(first["steering-pending"])).not.toContain("mutated");
    expect(JSON.stringify(agentFixtureFrames())).not.toContain("mutated");
  });
  it("pages 40 records exactly once, exposes gaps/HTML as text, and bounds active tails", () => {
    const pages = [agentFixturePage(0), agentFixturePage(16), agentFixturePage(32), agentFixturePage(40)];
    expect(pages.map((page) => page.records.length)).toEqual([16, 16, 8, 0]);
    expect(pages.map((page) => page.nextCursor)).toEqual([16, 32, 40, 40]);
    expect(pages.every((page) => page.truncated)).toBe(true); // Historical loss is still true at EOF, not a has-more flag.
    const all = pages.flatMap((page) => page.records);
    expect(all.map((record) => record.recordId)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(all.find((record) => record.kind === "gap")?.text).toContain("truncated");
    expect(all.some((record) => record.text.startsWith("<img"))).toBe(true);
    for (const page of pages) {
      expect(TranscriptPageSchema.safeParse(page).success).toBe(true);
      expect(utf8Bytes(JSON.stringify(page.records))).toBeLessThan(AGENT_LIMITS.pageBytes);
    }
    const frames = agentFixtureFrames();
    expect(frames.streaming.snapshot.tail).toHaveLength(AGENT_LIMITS.tailRecords);
    expect(frames.streaming.snapshot.tail[0]!.recordId).toBe(9);
    expect(frames["completed-live"].snapshot.tail).toEqual([]);
    expect(frames["completed-live"].read.page.records).toHaveLength(16);
    expect(frames["recovered-unknown"].snapshot.tail).toEqual([]);
    expect(frames["recovered-unknown"].snapshot.activeRunId).toBeNull(); // No active turn does not prove cleanup/admission safety.
    expect(frames["recovered-unknown"].read.run.cleanup.status).toBe("unknown");
  });
  it.each([-1, 0.5, 41, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects fixture cursor %s", (cursor) => {
    expect(() => agentFixturePage(cursor)).toThrow(RangeError);
  });
  it("supplies valid bounded history samples and byte-limit counterexamples", () => {
    const summary = agentFixtureFrames()["completed-cleaned"].snapshot.runs[0]!;
    const runs = Array.from({ length: AGENT_LIMITS.history }, (_, index) => ({ ...summary,
      runId: `${String(index).padStart(8, "0")}-eeee-4eee-8eee-eeeeeeeeeeee` }));
    const history = { ...agentFixtureFrames()["completed-cleaned"].snapshot, runs };
    expect(AgentSnapshotSchema.parse(history).runs).toHaveLength(20);
    expect(AgentSnapshotSchema.safeParse({ ...history, runs: [...runs, { ...summary, runId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] }).success).toBe(false);
    const record = agentFixtureRecords()[0]!;
    expect(TranscriptPageSchema.safeParse({ records: [{ ...record, text: "🧪".repeat(AGENT_LIMITS.recordBytes / 4 + 1) }],
      nextCursor: record.recordId, truncated: false }).success).toBe(false);
  });
  it("delivers schema-valid duplicate/out-of-order and old-generation observations, not a second reducer", () => {
    const deliveries = agentFixtureReordering();
    deliveries.forEach((delivery) => expect(EventEnvelopeSchema.parse(delivery)).toEqual(delivery));
    expect(deliveries.map((delivery) => [delivery.generation, delivery.event.sequence])).toEqual([
      [3, 2], [3, 5], [3, 3], [3, 5], [2, 999], [4, 1],
    ]);
    expect(deliveries[1]).toEqual(deliveries[3]);
    // W2/preload owns accepting/rejecting these. Valid shape is not fresh state.
  });
  it("correlates fixtures through all six actual bridge result kinds", () => {
    const draft = agentFixtureContext();
    const frame = agentFixtureFrames()["steering-pending"];
    const base = { protocolVersion: PROTOCOL_VERSION, requestId: "fixture-command" };
    const pairs: [AgentRequest, AgentResult][] = [
      [{ ...base, type: "agent.prepare", worldId: draft.launchContext.worldId, focus: draft.launchContext.focus,
        taskText: draft.launchContext.taskText, model: null, effort: null, links: draft.launchContext.links }, { kind: "prepare", draft }],
      [{ ...base, type: "agent.launch", runId: draft.runId, contextHash: draft.contextHash },
        { kind: "launch", receipt: { runId: draft.runId, contextHash: draft.contextHash, admittedAt: AGENT_FIXTURE_AT, status: "admitted" } }],
      [{ ...base, type: "agent.steer", runId: draft.runId, expectedTurnId: AGENT_FIXTURE_TURN, text: frame.run.instructions[0]!.text },
        { kind: "steer", runId: draft.runId, receipt: { ...frame.run.instructions[0]!, requestId: base.requestId } }],
      [{ ...base, type: "agent.cancel", runId: draft.runId },
        { kind: "cancel", receipt: { runId: draft.runId, requestId: base.requestId, requestedAt: AGENT_FIXTURE_AT, status: "requested" } }],
      [{ ...base, type: "agent.snapshot" }, { kind: "snapshot", snapshot: frame.snapshot }],
      [{ ...base, type: "agent.read", runId: draft.runId, afterRecord: 0 }, frame.read],
    ];
    for (const [request, agent] of pairs) {
      AgentRequestSchema.parse(request);
      const response = { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true,
        sequence: 10, snapshot: initialSnapshot(), agent };
      expect(parseCoreResponseForRequest(response, request)).toMatchObject({ ok: true, agent });
      for (const failure of Object.values(agentFixtureFailures)) {
        expect(parseCoreResponseForRequest({ ...base, ...failure }, request)).toMatchObject(failure);
      }
    }
  });
  it("never grants production fixture authority through extra renderer payload fields", () => {
    const draft = agentFixtureContext();
    const request: AgentRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "fixture-test", type: "agent.launch", runId: draft.runId, contextHash: draft.contextHash };
    expect(AgentRequestSchema.safeParse({ ...request, fixture: "happy-path" }).success).toBe(false);
    expect(AgentRequestSchema.safeParse({ ...request, adapter: "deterministic-fixture" }).success).toBe(false);
    expect(unavailableAgentRequest(request)).toMatchObject({ ok: false, error: { code: "ADAPTER_UNAVAILABLE" } });
    expect(AgentCapabilitiesSchema.safeParse({ ...draft.capabilities, availability: "unavailable" }).success).toBe(false);
  });
});

describe("manually gated adapter fixture for deterministic delay and race tests", () => {
  it("has no implicit work or clock, and fails duplicate starts", async () => {
    const f = await start();
    await Promise.resolve(); await Promise.resolve();
    expect(f.events).toEqual([]);
    expect(f.fixture.calls()).toEqual([{ method: "start" }]);
    await expect(f.fixture.adapter.start(agentFixtureContext(), () => undefined)).rejects.toThrow("one fixture instance");
    await dispose(f);
  });
  it("keeps steering pending until its reply, even if terminal evidence arrives first", async () => {
    const f = await start();
    let settled = false;
    const pending = f.handle.steer(AGENT_FIXTURE_TURN, "fixture instruction").then((value) => { settled = true; return value; });
    await Promise.resolve(); expect(settled).toBe(false);
    f.fixture.emit(terminal);
    await Promise.resolve(); expect(settled).toBe(false);
    f.fixture.settleSteer({ ok: true, value: { status: "accepted" } });
    expect(await pending).toEqual({ ok: true, value: { status: "accepted" } });
    expect(f.events).toEqual([terminal]);
    expect(f.fixture.calls().filter((call) => call.method === "start")).toHaveLength(1);
    await dispose(f);
  });
  it("supports lost-reply and stale-turn results without hidden retries", async () => {
    const f = await start();
    expect(await f.handle.steer("old-turn", "stale")).toMatchObject({ error: { code: "STALE_TURN" } });
    const pending = f.handle.steer(AGENT_FIXTURE_TURN, "keep my text");
    expect(await f.handle.steer(AGENT_FIXTURE_TURN, "second")).toMatchObject({ error: { code: "BUSY" } });
    f.fixture.settleSteer(agentFixtureFailures.unknown);
    expect(await pending).toEqual(agentFixtureFailures.unknown);
    expect(f.fixture.calls()).toEqual([{ method: "start" }, { method: "steer", turnId: "old-turn", text: "stale" },
      { method: "steer", turnId: AGENT_FIXTURE_TURN, text: "keep my text" },
      { method: "steer", turnId: AGENT_FIXTURE_TURN, text: "second" }]);
    await dispose(f);
  });
  it("separates Stop acknowledgement from interruption and completion racing with Stop", async () => {
    const f = await start();
    const pending = f.handle.interrupt();
    expect(f.handle.interrupt()).toBe(pending);
    f.fixture.emit(terminal);
    f.fixture.settleInterrupt({ ok: true, value: { status: "requested" } });
    expect(await pending).toEqual({ ok: true, value: { status: "requested" } });
    expect(f.events).toEqual([terminal]);
    expect(f.fixture.calls().filter((call) => call.method === "interrupt")).toHaveLength(2); // Both invocations count, even if coalesced.
    await dispose(f);
  });
  it("requires explicit cleanup evidence, settles lost controls as unknown, and retains late events", async () => {
    const f = await start();
    const steer = f.handle.steer(AGENT_FIXTURE_TURN, "unacknowledged");
    const stop = f.handle.interrupt();
    let disposed = false;
    const pending = f.handle.dispose(); pending.then(() => { disposed = true; });
    expect(f.handle.dispose()).toBe(pending);
    expect(await steer).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(await stop).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(disposed).toBe(false);
    f.fixture.emit({ type: "process-exit", exitCode: 0, at: AGENT_FIXTURE_AT });
    expect(disposed).toBe(false);
    f.fixture.settleCleanup({ ...cleanup, status: "unknown", detail: "FIXTURE: owner evidence lost." });
    expect(await pending).toMatchObject({ status: "unknown" });
    expect(await f.handle.steer(AGENT_FIXTURE_TURN, "late")).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    expect(await f.handle.interrupt()).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    expect(f.events).toHaveLength(1); // Exit zero did not invent a terminal event.
  });
  it.each(["steer", "interrupt"] as const)("copies %s reply evidence before promise observation", async (method) => {
    const f = await start();
    const result = structuredClone(agentFixtureFailures.unknown);
    const pending = method === "steer" ? f.handle.steer(AGENT_FIXTURE_TURN, "fixture") : f.handle.interrupt();
    if (method === "steer") f.fixture.settleSteer(result); else f.fixture.settleInterrupt(result);
    Object.assign(result.error, { message: "mutated before await" });
    const received = await pending;
    expect(received).toEqual(agentFixtureFailures.unknown);
    if (received.ok) throw new Error("Expected fixture failure");
    received.error.message = "mutated by consumer";
    expect(result.error.message).toBe("mutated before await");
    expect(agentFixtureFailures.unknown.error.message).toBe("FIXTURE: delivery unknown; do not replay.");
    expect(Object.isFrozen(agentFixtureFailures)).toBe(true);
    expect(Object.isFrozen(agentFixtureFailures.unknown)).toBe(true);
    expect(Object.isFrozen(agentFixtureFailures.unknown.error)).toBe(true);
    await dispose(f);
  });
  it("exercises all receipt slots and still disposes with a pending control after diagnostic-log overflow", async () => {
    const f = await start();
    for (let index = 0; index < AGENT_LIMITS.receipts; index++) {
      const steering = f.handle.steer(AGENT_FIXTURE_TURN, `fixture ${index}`);
      f.fixture.settleSteer({ ok: true, value: { status: "accepted" } });
      expect(await steering).toMatchObject({ ok: true });
    }
    const pending = f.handle.steer(AGENT_FIXTURE_TURN, "pending at log limit");
    const interrupted = f.handle.interrupt();
    expect(f.fixture.calls()).toHaveLength(AGENT_LIMITS.receipts + 3);
    for (let index = 0; index < AGENT_FIXTURE_CALL_LIMIT; index++) f.handle.interrupt();
    expect(() => f.fixture.calls()).toThrow("ledger incomplete");
    const disposing = f.handle.dispose();
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(await interrupted).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    f.fixture.settleCleanup(cleanup);
    expect(await disposing).toEqual(cleanup);
    expect(() => f.fixture.calls()).toThrow("ledger incomplete");
    expect(() => f.fixture.settleCleanup(cleanup)).toThrow("already settled");
  });
  it("fails explicit test-driver misuse and copies caller-owned observations", async () => {
    const fixture = createAgentAdapterFixture();
    expect(() => fixture.emit(terminal)).toThrow("Start");
    expect(() => fixture.settleSteer({ ok: true, value: { status: "accepted" } })).toThrow("No pending");
    expect(() => fixture.settleInterrupt({ ok: true, value: { status: "requested" } })).toThrow("No pending");
    expect(() => fixture.settleCleanup(cleanup)).toThrow("Dispose");
    const f = await start();
    const message: AdapterEvent = { type: "item", itemId: null, kind: "message", text: "original", at: AGENT_FIXTURE_AT };
    f.fixture.emit(message); message.text = "mutated";
    expect(f.events[0]).toMatchObject({ text: "original" });
    const calls = f.fixture.calls(); calls.length = 0;
    expect(f.fixture.calls()).toHaveLength(1);
    await dispose(f);
  });
  it("refuses to attest a ledger containing an oversized text attempt without blocking cleanup", async () => {
    const f = await start();
    const pending = f.handle.steer(AGENT_FIXTURE_TURN, "🧪".repeat(AGENT_LIMITS.taskBytes / 4 + 1));
    expect(() => f.fixture.calls()).toThrow("ledger incomplete");
    const disposing = f.handle.dispose();
    expect(await pending).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    f.fixture.settleCleanup(cleanup); await disposing;
  });
});
