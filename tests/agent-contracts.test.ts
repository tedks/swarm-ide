import { describe, expect, it } from "vitest";
import {
  AGENT_LIMITS, AgentEventSchema, AgentRequestSchema, AgentResultSchema, AgentSnapshotSchema,
  InstructionReceiptSchema, LaunchContextSchema, PreparedAgentContextSchema, RunSchema,
  TranscriptPageSchema, TranscriptRecordSchema, canTransitionRun, type AgentRequest, type Run,
} from "../protocol/agents";
import { PROTOCOL_VERSION, CoreRequestSchema, CoreResponseSchema, parseCoreResponseForRequest } from "../protocol/schema";
import { EventEnvelopeSchema, ResponseEnvelopeSchema } from "../app/lifecycle";
import { unavailableAgentRequest, unavailableAgentSnapshot } from "../core/agents/unavailable";
import { initialSnapshot } from "../fixtures/world";

const runId = "11111111-1111-4111-8111-111111111111";
const anotherRun = "22222222-2222-4222-8222-222222222222";
const at = "2026-09-06T01:00:00.000Z";
const digest = "a".repeat(64);
const focus = { worldId: "local", revisionKind: "working" as const, revisionId: "working", domain: "repo" as const, key: "file", path: "src/file.ts" };
const links = { parentRunId: null, task: null, spec: "docs/design.md" };
const prepare = { protocolVersion: PROTOCOL_VERSION, requestId: "prepare", type: "agent.prepare" as const,
  worldId: "local", focus, taskText: "Explain this interface", model: null, effort: null, links };
const launchContext = {
  worldId: "local", repositoryId: "repo", root: "/registered/repo", head: "a".repeat(40),
  workingFingerprint: digest, focus, taskText: prepare.taskText, links, requested: { model: null, effort: null },
  attachments: [{ path: "src/file.ts", content: "export {};", digest, startLine: 1, endLine: 1 }],
  instructionSources: [], configurationSources: [], submittedPrompt: "Explain this interface", contextHash: digest,
  diskOnly: true as const,
  access: { policy: "read-only" as const, toolNetwork: false as const, approvals: "never" as const,
    hostConfidentiality: false as const, sendsSelectedContentToProvider: true as const },
};
const capabilities = unavailableAgentSnapshot().capabilities;
const draft = { runId, contextHash: digest, preparedAt: at, expiresAt: "2026-09-06T01:05:00.000Z", launchContext, capabilities };
const record = { recordId: 1, timestamp: at, kind: "message" as const, providerItemId: null, text: "Visible commentary" };
const receipt = { requestId: "steer", expectedTurnId: "turn", text: "Focus on failures", textHash: digest,
  status: "pending" as const, submittedAt: at, settledAt: null, error: null };
function run(): Run {
  return {
    runId, providerThreadId: null, providerTurnId: null, launchContext, state: "starting",
    createdAt: at, updatedAt: at, startedAt: null, endedAt: null, terminalReason: null,
    providerOutcome: { kind: "none" }, providerObservation: null, processState: "not-started", exitCode: null,
    cleanup: { status: "not-needed", observedAt: at, detail: "Not dispatched" },
    transcript: { lastRecord: 1, bytes: 0, truncated: false, tailMayBeLost: false }, instructions: [],
  };
}
const requests: AgentRequest[] = [
  prepare,
  { protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch", runId, contextHash: digest },
  { protocolVersion: PROTOCOL_VERSION, requestId: "steer", type: "agent.steer", runId, expectedTurnId: "turn", text: receipt.text },
  { protocolVersion: PROTOCOL_VERSION, requestId: "cancel", type: "agent.cancel", runId },
  { protocolVersion: PROTOCOL_VERSION, requestId: "snapshot", type: "agent.snapshot" },
  { protocolVersion: PROTOCOL_VERSION, requestId: "read", type: "agent.read", runId, afterRecord: 0 },
];
describe("strict agent contract v3", () => {
  it("accepts the six frozen payloads and refuses extra authority at any depth", () => {
    expect(PROTOCOL_VERSION).toBe(3);
    for (const request of requests) {
      expect(CoreRequestSchema.parse(request)).toEqual(request);
      expect(() => CoreRequestSchema.parse({ ...request, cwd: "/escape" })).toThrow();
      expect(() => CoreRequestSchema.parse({ ...request, protocolVersion: 2 })).toThrow();
    }
    for (const bad of [
      { ...prepare, focus: { ...focus, execute: true } },
      { ...prepare, links: { ...links, command: "exec" } },
      { ...prepare, focus: { ...focus, range: { startLine: 1, endLine: 2, hidden: true } } },
      { ...prepare, worldId: "other" },
      { ...prepare, focus: { ...focus, revisionKind: "built" } },
    ]) expect(() => CoreRequestSchema.parse(bad)).toThrow();
  });
  it("bounds UTF-8 bytes, UUIDs, cursors and normalized links", () => {
    expect(AgentRequestSchema.parse({ ...prepare, taskText: "é".repeat(8192) })).toBeDefined();
    for (const bad of [
      { ...prepare, taskText: "é".repeat(8193) },
      { ...prepare, requestId: "x".repeat(257) },
      { ...prepare, model: "🚀".repeat(100) },
      { ...requests[1], runId: "not-uuid" },
      { ...requests[2], text: "🚀".repeat(4097) },
      ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((afterRecord) => ({ ...requests[5], afterRecord })),
      ...["../x", "/root", "a//b", "a/./b", "https://example.test", "a\\b", "a\u0000b"].map((spec) => ({ ...prepare, links: { ...links, spec } })),
    ]) expect(() => AgentRequestSchema.parse(bad)).toThrow();
  });
  it("validates immutable disk context, nested unknowns, size and draft expiry", () => {
    expect(PreparedAgentContextSchema.parse(draft)).toEqual(draft);
    for (const bad of [
      { ...launchContext, diskOnly: false },
      { ...launchContext, root: "/registered/repo", cwd: "/other" },
      { ...launchContext, attachments: [{ ...launchContext.attachments[0], content: "🚀".repeat(16385) }] },
      { ...launchContext, submittedPrompt: "x".repeat(AGENT_LIMITS.contextBytes) },
      { ...launchContext, access: { ...launchContext.access, approvals: "always" } },
    ]) expect(() => LaunchContextSchema.parse(bad)).toThrow();
    expect(() => PreparedAgentContextSchema.parse({ ...draft, contextHash: "b".repeat(64) })).toThrow();
    expect(() => PreparedAgentContextSchema.parse({ ...draft, expiresAt: at })).toThrow();
    expect(() => PreparedAgentContextSchema.parse({ ...draft, expiresAt: "2026-09-06T01:05:01.000Z" })).toThrow();
  });
  it("requires turn evidence for completion, separate from exit zero", () => {
    expect(RunSchema.parse(run())).toBeDefined();
    const ended = { ...run(), state: "completed", endedAt: at, terminalReason: "No final answer supplied", processState: "exited", exitCode: 0 };
    expect(() => RunSchema.parse(ended)).toThrow("terminal provider evidence");
    const completed = { ...ended, providerThreadId: "thread", providerTurnId: "turn",
      providerOutcome: { kind: "turn", threadId: "thread", turnId: "turn", status: "completed", observedAt: at } };
    expect(RunSchema.parse({ ...completed, processState: "live", exitCode: null }).state).toBe("completed");
    expect(() => RunSchema.parse({ ...completed, providerTurnId: "other" })).toThrow();
    expect(() => RunSchema.parse({ ...run(), state: "running" })).toThrow();
    expect(() => RunSchema.parse({ ...run(), exitCode: 0 })).toThrow();
    expect(() => RunSchema.parse({ ...completed, state: "unknown" })).toThrow();
    expect(() => RunSchema.parse({ ...run(), instructions: [receipt, receipt] })).toThrow();
  });
  it("requires confirmed cancellation evidence and never regresses terminal states", () => {
    const cancelled = { ...run(), state: "cancelled", endedAt: at, terminalReason: "Stopped",
      providerOutcome: { kind: "owned-termination", afterCancellation: true, observedAt: at } };
    expect(() => RunSchema.parse(cancelled)).toThrow();
    expect(RunSchema.parse({ ...cancelled, processState: "exited",
      cleanup: { status: "confirmed", observedAt: at, detail: "Owned tree exited" } }).state).toBe("cancelled");
    expect(RunSchema.parse({ ...cancelled, providerOutcome: { kind: "dispatch-prevented", observedAt: at } }).state).toBe("cancelled");
    for (const terminal of ["completed", "cancelled", "failed", "unknown"] as const) {
      expect(canTransitionRun(terminal, "running")).toBe(false);
      expect(canTransitionRun(terminal, terminal)).toBe(true);
    }
    expect(canTransitionRun("starting", "completed")).toBe(false);
    expect(canTransitionRun("cancelling", "completed")).toBe(true);
  });
  it("distinguishes persisted steering pending/accepted/rejected/unknown receipts", () => {
    expect(InstructionReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(() => InstructionReceiptSchema.parse({ ...receipt, status: "accepted" })).toThrow();
    expect(InstructionReceiptSchema.parse({ ...receipt, status: "accepted", settledAt: at }).status).toBe("accepted");
    expect(() => InstructionReceiptSchema.parse({ ...receipt, status: "rejected", settledAt: at })).toThrow();
    expect(InstructionReceiptSchema.parse({ ...receipt, status: "delivery-unknown", settledAt: at,
      error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Do not resend" } }).text).toBe(receipt.text);
  });
  it("bounds ordered transcript pages and limits broadcast tails to one active run", () => {
    expect(TranscriptRecordSchema.parse(record)).toEqual(record);
    expect(() => TranscriptRecordSchema.parse({ ...record, rawReasoning: "secret" })).toThrow();
    expect(() => TranscriptRecordSchema.parse({ ...record, text: "🚀".repeat(16385) })).toThrow();
    expect(() => TranscriptPageSchema.parse({ records: [record, record], nextCursor: 1, truncated: false })).toThrow();
    expect(() => TranscriptPageSchema.parse({ records: [record], nextCursor: 2, truncated: false })).toThrow();
    const oversized = Array.from({ length: 5 }, (_, i) => ({ ...record, recordId: i + 1, text: "x".repeat(65536) }));
    expect(() => TranscriptPageSchema.parse({ records: oversized, nextCursor: 5, truncated: false })).toThrow();
    const snapshot = unavailableAgentSnapshot();
    expect(() => AgentSnapshotSchema.parse({ ...snapshot, tail: [record] })).toThrow();
    const summary = { runId, state: "starting", createdAt: at, updatedAt: at, endedAt: null, taskLabel: "Explain", focusLabel: "file.ts" };
    const active = { ...snapshot, runs: [summary], activeRunId: runId, tail: [record] };
    expect(AgentSnapshotSchema.parse(active)).toBeDefined();
    expect(() => AgentSnapshotSchema.parse({ ...active, runs: [summary, { ...summary, runId: anotherRun }] })).toThrow();
    expect(() => AgentSnapshotSchema.parse({ ...active, tail: Array.from({ length: 33 }, (_, i) => ({ ...record, recordId: i + 1 })) })).toThrow();
    expect(() => AgentSnapshotSchema.parse({ ...snapshot, capabilities: { ...capabilities, availability: "available" } })).toThrow();
  });
  it("validates all named result payloads with no empty-success fallback", () => {
    const results = [
      { kind: "prepare", draft },
      { kind: "launch", receipt: { runId, contextHash: digest, admittedAt: at, status: "admitted" } },
      { kind: "steer", runId, receipt },
      { kind: "cancel", receipt: { runId, requestId: "cancel", requestedAt: at, status: "requested" } },
      { kind: "snapshot", snapshot: unavailableAgentSnapshot() },
      { kind: "read", run: run(), page: { records: [record], nextCursor: 1, truncated: false } },
    ];
    results.forEach((agent, i) => {
      expect(AgentResultSchema.parse(agent)).toEqual(agent);
      expect(() => AgentResultSchema.parse({ ...agent, hidden: true })).toThrow();
      const response = { protocolVersion: PROTOCOL_VERSION, requestId: requests[i]!.requestId,
        ok: true, sequence: 1, snapshot: initialSnapshot(), agent };
      expect(parseCoreResponseForRequest(response, requests[i]!).ok).toBe(true);
      expect(() => parseCoreResponseForRequest({ ...response, agent: undefined }, requests[i]!)).toThrow();
      expect(() => parseCoreResponseForRequest({ ...response, requestId: "other" }, requests[i]!)).toThrow();
      expect(() => CoreResponseSchema.parse({ ...response, protocolVersion: 2 })).toThrow();
    });
  });
  it("carries honest unavailability through the normal response and generation envelopes", () => {
    requests.forEach((request) => {
      const result = unavailableAgentRequest(request);
      if (request.type !== "agent.snapshot") {
        expect(result).toMatchObject({ ok: false, error: { code: "ADAPTER_UNAVAILABLE" } });
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected explicit capability snapshot");
      const envelope = ResponseEnvelopeSchema.parse({ generation: 3,
        response: { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true,
          sequence: 8, snapshot: initialSnapshot(), agent: result.value } });
      expect(parseCoreResponseForRequest(envelope.response, request)).toMatchObject({
        agent: { snapshot: { capabilities: { availability: "unavailable" }, runs: [] } },
      });
    });
    const event = { protocolVersion: PROTOCOL_VERSION, type: "agent.changed", sequence: 9, emittedAt: at, snapshot: unavailableAgentSnapshot() };
    expect(EventEnvelopeSchema.parse({ generation: 3, event }).event.type).toBe("agent.changed");
    expect(() => AgentEventSchema.parse({ ...event, epoch: 1 })).toThrow();
    expect(() => EventEnvelopeSchema.parse({ generation: 3, event: { ...event, protocolVersion: 2 } })).toThrow();
  });
});
