/** Deterministic TEST DATA, never production capability or policy evidence.
 * Import explicitly from core/component tests. There is no environment switch,
 * renderer command, process, timer, credential lookup or production fallback.
 * Frames are observations, not a replacement service/reducer/persistence layer.
 */
import { createHash } from "node:crypto";
import type { AdapterEvent, AgentAdapter, AgentOperation } from "../core/agents/adapter";
import {
  AGENT_LIMITS, AgentCapabilitiesSchema, AgentEventSchema, AgentResultSchema,
  AgentSnapshotSchema, CleanupEvidenceSchema, InstructionReceiptSchema,
  PreparedAgentContextSchema, RunSchema, TranscriptPageSchema, utf8Bytes,
  type AgentError, type AgentResult, type CleanupEvidence, type InstructionReceipt,
  type PreparedAgentContext, type Run, type TranscriptRecord,
} from "../protocol/agents";
import { PROTOCOL_VERSION } from "../protocol/common";
// Tests must inject this clock; accidental wall-clock validation stays expired.
export const AGENT_FIXTURE_AT = "2000-01-01T00:00:00.000Z";
export const AGENT_FIXTURE_TURN = "fixture-turn";
export const AGENT_FIXTURE_THREAD = "fixture-thread";
export const AGENT_FIXTURE_CALL_LIMIT = 512;
const thread = AGENT_FIXTURE_THREAD;
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const time = (offset: number) => new Date(Date.parse(AGENT_FIXTURE_AT) + offset).toISOString();
const capabilities = () => AgentCapabilitiesSchema.parse({
  availability: "available", reason: null, provider: "deterministic-fixture", version: "test-only",
  controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only",
});

/** Synthetic bytes with genuine hashes; no filesystem observation is claimed.
 * Like E1, contextHash hashes the exact submitted prompt, which embeds the
 * attached bytes, focus and other launch fields. This is not a drift detector.
 */
export function agentFixtureContext(): PreparedAgentContext {
  const prompt = "FIXTURE ONLY: explain the synthetic FraudCheck interface; no provider contacted.";
  const content = "// FIXTURE ONLY\nexport const fraudcheck = (amount: number) => amount < 100;\n";
  const fields = {
    worldId: "fixture-world", repositoryId: "synthetic-fixture", root: "/fixture/not-a-real-workspace", head: null,
    workingFingerprint: digest("synthetic fixture world"),
    focus: { worldId: "fixture-world", revisionKind: "working", revisionId: "working", domain: "repo",
      key: "fixture-file", path: "examples/services/fraudcheck.ts" },
    taskText: prompt, links: { parentRunId: null, task: null, spec: null },
    requested: { model: null, effort: null },
    attachments: [{ path: "examples/services/fraudcheck.ts", content, digest: digest(content), startLine: 1, endLine: 2 }],
    instructionSources: [], configurationSources: [], diskOnly: true,
    access: { policy: "read-only", toolNetwork: false, approvals: "never", hostConfidentiality: false,
      sendsSelectedContentToProvider: true },
  };
  const submittedPrompt = `${prompt}\n${JSON.stringify(fields)}`;
  const contextHash = digest(submittedPrompt);
  return PreparedAgentContextSchema.parse({
    runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", contextHash,
    preparedAt: AGENT_FIXTURE_AT, expiresAt: time(AGENT_LIMITS.draftMs), capabilities: capabilities(),
    launchContext: { ...fields, submittedPrompt, contextHash },
  });
}

export const AGENT_FIXTURE_PHASES = [
  "admitted", "streaming", "steering-pending", "steering-accepted", "steering-unknown", "steering-stale",
  "cancel-requested", "completed-live", "completed-cleaned", "cancelled", "recovered-unknown", "setup-rejected",
] as const;
export type AgentFixturePhase = typeof AGENT_FIXTURE_PHASES[number];

function instruction(status: InstructionReceipt["status"]): InstructionReceipt {
  const text = "FIXTURE: focus on interface failures instead.";
  return InstructionReceiptSchema.parse({
    requestId: "fixture-steer", expectedTurnId: status === "rejected" ? "fixture-old-turn" : AGENT_FIXTURE_TURN,
    text, textHash: digest(text), status,
    submittedAt: time(100), settledAt: status === "pending" ? null : time(200),
    error: status === "rejected" ? { code: "STALE_TURN", message: "Fixture turn already ended; text was not resent." }
      : status === "delivery-unknown" ? { code: "AGENT_OUTCOME_UNKNOWN", message: "Fixture reply lost; never resend automatically." } : null,
  });
}

/** 40 ordered records span multiple pages and exceed the 32-record event tail.
 * Literal HTML and multibyte text are deliberately untrusted display content.
 */
export function agentFixtureRecords(): TranscriptRecord[] {
  return TranscriptPageSchema.parse({
    records: Array.from({ length: 40 }, (_, index) => ({
      recordId: index + 1, timestamp: time(index), providerItemId: null,
      kind: index === 19 ? "gap" : "message",
      text: index === 19 ? "FIXTURE GAP: earlier provider output was truncated."
        : index === 20 ? "<img src=x onerror=alert('fixture')> — literal text, not markup"
          : `FIXTURE record ${index + 1}: interface → réponse 🧪`,
    })), nextCursor: 40, truncated: true,
  }).records;
}

/** A bounded recorded page, not a production pagination implementation.
 * `truncated` records irreversible output loss, NOT "has more pages". Even
 * EOF retains that warning. Stop at run.transcript.lastRecord or no progress.
 */
export function agentFixturePage(afterRecord: number) {
  if (!Number.isSafeInteger(afterRecord) || afterRecord < 0 || afterRecord > 40) throw new RangeError("Invalid fixture cursor");
  const records = agentFixtureRecords().filter((record) => record.recordId > afterRecord).slice(0, 16);
  return TranscriptPageSchema.parse({ records, nextCursor: records.at(-1)?.recordId ?? afterRecord, truncated: true });
}

export function agentFixtureFrames(input = agentFixtureContext()) {
  const context = PreparedAgentContextSchema.parse(input);
  return Object.fromEntries(AGENT_FIXTURE_PHASES.map((phase, index) => {
    const records = phase === "admitted" || phase === "setup-rejected" ? [] : agentFixtureRecords();
    const run: Run = {
      runId: context.runId, launchContext: context.launchContext,
      providerThreadId: thread, providerTurnId: AGENT_FIXTURE_TURN, state: "running",
      createdAt: AGENT_FIXTURE_AT, updatedAt: time(300), startedAt: time(10), endedAt: null, terminalReason: null,
      providerOutcome: { kind: "none" },
      // Process setup/observation precedes startedAt, which marks TURN start.
      providerObservation: { provider: "deterministic-fixture", version: "test-only", model: "fixture-observed-model",
        cwd: context.launchContext.root, policy: "read-only", instructionSources: [], observedAt: time(5) },
      processState: "live", exitCode: null,
      cleanup: { status: "pending", observedAt: time(5), detail: "FIXTURE: cleanup not yet observed." },
      transcript: { lastRecord: records.length, bytes: utf8Bytes(JSON.stringify(records)), truncated: records.some((record) => record.kind === "gap"), tailMayBeLost: false },
      instructions: [],
    };
    if (phase === "admitted" || phase === "setup-rejected") {
      Object.assign(run, { state: "starting", providerThreadId: null, providerTurnId: null, providerObservation: null,
        startedAt: null, processState: "not-started",
        cleanup: { status: "not-needed", observedAt: AGENT_FIXTURE_AT, detail: "FIXTURE: no process dispatched." } });
    }
    const statuses: Partial<Record<AgentFixturePhase, InstructionReceipt["status"]>> = {
      "steering-pending": "pending", "steering-accepted": "accepted", "steering-unknown": "delivery-unknown", "steering-stale": "rejected",
    };
    const status = statuses[phase];
    if (status) run.instructions = [instruction(status)];
    if (phase === "cancel-requested") run.state = "cancelling";
    if (["completed-live", "completed-cleaned", "cancelled"].includes(phase)) {
      run.state = phase === "cancelled" ? "cancelled" : "completed";
      run.providerOutcome = { kind: "turn", threadId: thread, turnId: AGENT_FIXTURE_TURN,
        status: phase === "cancelled" ? "interrupted" : "completed", observedAt: time(250) };
      run.endedAt = time(250); run.terminalReason = "FIXTURE: observed terminal turn, not proof of correct software.";
    }
    if (phase === "completed-cleaned" || phase === "cancelled") {
      run.processState = "exited"; run.exitCode = 0;
      run.cleanup = { status: "confirmed", observedAt: time(300), detail: "FIXTURE ONLY: simulated owner confirmed exit." };
    }
    if (phase === "recovered-unknown") {
      run.state = "unknown"; run.endedAt = time(250); run.terminalReason = "FIXTURE: core lost; outcome unknown, no replay.";
      run.processState = "unknown"; run.transcript.tailMayBeLost = true;
      run.cleanup = { status: "unknown", observedAt: time(300), detail: "FIXTURE: termination not established; launch remains blocked." };
      run.instructions = [instruction("delivery-unknown")];
    }
    if (phase === "setup-rejected") {
      run.state = "failed"; run.endedAt = time(250); run.terminalReason = "FIXTURE: setup rejected before dispatch.";
      run.providerOutcome = { kind: "setup-rejected", detail: run.terminalReason };
    }
    const checked = RunSchema.parse(run);
    // R0 activeRunId means nonterminal turn, NOT admission/cleanup eligibility.
    // Completed-live/unknown cleanup still needs agent.read before a new launch.
    const active = checked.endedAt === null;
    const snapshot = AgentSnapshotSchema.parse({
      runs: [{ runId: checked.runId, state: checked.state, createdAt: checked.createdAt, updatedAt: checked.updatedAt,
        endedAt: checked.endedAt, taskLabel: "FIXTURE: explain FraudCheck", focusLabel: "FIXTURE: fraudcheck.ts" }],
      activeRunId: active ? checked.runId : null, capabilities: context.capabilities,
      tail: active ? records.slice(-AGENT_LIMITS.tailRecords) : [],
    });
    const page = records.length ? agentFixturePage(0) : { records: [], nextCursor: 0, truncated: false };
    const read = AgentResultSchema.parse({ kind: "read", run: checked, page }) as Extract<AgentResult, { kind: "read" }>;
    const event = AgentEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "agent.changed",
      sequence: index + 1, emittedAt: checked.updatedAt, snapshot });
    return [phase, { run: checked, snapshot, read, event }];
  })) as Record<AgentFixturePhase, { run: Run; snapshot: ReturnType<typeof AgentSnapshotSchema.parse>;
    read: Extract<AgentResult, { kind: "read" }>; event: ReturnType<typeof AgentEventSchema.parse> }>;
}

/** Correctly shaped but hostile delivery order. The consumer owns rejection.
 * Sequence gaps are deliberate: graph/file events share the core sequence.
 * Envelopes are plain data here; tests validate the existing lifecycle schema.
 */
export function agentFixtureReordering() {
  const frames = agentFixtureFrames();
  return [
    { generation: 3, event: frames.streaming.event },
    { generation: 3, event: frames["steering-unknown"].event },
    { generation: 3, event: frames["steering-pending"].event },
    { generation: 3, event: frames["steering-unknown"].event },
    { generation: 2, event: { ...frames["completed-cleaned"].event, sequence: 999 } },
    { generation: 4, event: { ...frames["recovered-unknown"].event, sequence: 1 } },
  ].map((envelope) => structuredClone(envelope));
}

const failure = (code: AgentError["code"], message: string) =>
  Object.freeze({ ok: false as const, error: Object.freeze({ code, message }) });
export const agentFixtureFailures = Object.freeze({
  stale: failure("STALE_CONTEXT", "FIXTURE: disk changed; prepare again."),
  storage: failure("STORAGE_FULL", "FIXTURE: admission refused before any process."),
  unavailable: failure("ADAPTER_POLICY_UNAVAILABLE", "FIXTURE: effective policy is unverified."),
  unknown: failure("AGENT_OUTCOME_UNKNOWN", "FIXTURE: delivery unknown; do not replay."),
}) satisfies Record<string, AgentOperation<never>>;

function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { settle = resolve; });
  return { promise, settle };
}

/** Manual gates make delay/race tests deterministic without real-clock sleeps.
 * Call advance-by-event and settle methods explicitly; nothing completes itself.
 * This is intentionally a hostile adapter double, not the service state machine.
 * calls() logs EVERY invocation, including rejected/coalesced controls. If the
 * bounded diagnostic ledger overflows, calls() throws rather than give partial
 * evidence; the provider operations/cleanup themselves are never blocked by it.
 * Ledger entries count attempts, not forwarding, acceptance or terminal outcome.
 */
export function createAgentAdapterFixture() {
  let emit: ((event: AdapterEvent) => void) | undefined;
  let started = false, disposed = false, ledgerIncomplete = false, cleanupSettled = false;
  let steering: ReturnType<typeof deferred<AgentOperation<{ status: "accepted" }>>> | undefined;
  let interrupt: ReturnType<typeof deferred<AgentOperation<{ status: "requested" }>>> | undefined;
  let cleanup: ReturnType<typeof deferred<CleanupEvidence>> | undefined;
  const calls: { method: "start" | "steer" | "interrupt" | "dispose"; turnId?: string; text?: string }[] = [];
  function record(call: typeof calls[number]) {
    if (calls.length >= AGENT_FIXTURE_CALL_LIMIT ||
        (call.text !== undefined && utf8Bytes(call.text) > AGENT_LIMITS.taskBytes) ||
        (call.turnId !== undefined && utf8Bytes(call.turnId) > 256)) {
      ledgerIncomplete = true;
    } else calls.push(call);
  }
  const denied = (code: AgentError["code"], message: string) => ({ ok: false as const, error: { code, message: `FIXTURE: ${message}` } });
  const adapter: AgentAdapter = {
    probe: async () => ({ provider: "deterministic-fixture", version: "test-only", executable: "/fixture/no-executable",
      available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }),
    async start(context, listener) {
      record({ method: "start" });
      PreparedAgentContextSchema.parse(context);
      if (started) throw new Error("Use one fixture instance per run; duplicate start is a test failure");
      started = true; emit = listener;
      return {
        steer(turnId, text) {
          record({ method: "steer", turnId, text });
          if (disposed) return Promise.resolve(denied("RUN_NOT_ACTIVE", "disposed"));
          if (turnId !== AGENT_FIXTURE_TURN) return Promise.resolve(denied("STALE_TURN", "wrong turn"));
          if (steering) return Promise.resolve(denied("BUSY", "one pending steer"));
          steering = deferred(); return steering.promise;
        },
        interrupt() {
          record({ method: "interrupt" });
          if (disposed) return Promise.resolve(denied("RUN_NOT_ACTIVE", "disposed"));
          if (interrupt) return interrupt.promise;
          interrupt = deferred(); return interrupt.promise;
        },
        dispose() {
          record({ method: "dispose" });
          if (!cleanup) {
            disposed = true; cleanup = deferred();
            steering?.settle(denied("AGENT_OUTCOME_UNKNOWN", "disposed before steering reply; no replay")); steering = undefined;
            interrupt?.settle(denied("AGENT_OUTCOME_UNKNOWN", "disposed before interrupt reply; no replay")); interrupt = undefined;
          }
          return cleanup.promise;
        },
      };
    },
  };
  return {
    adapter,
    calls() {
      if (ledgerIncomplete) throw new Error("Fixture call ledger incomplete; cannot attest invocation history");
      return structuredClone(calls);
    },
    emit(event: AdapterEvent) {
      if (!emit) throw new Error("Start the fixture before emitting");
      emit(structuredClone(event)); // Explicit late events remain available for consumer race tests.
    },
    settleSteer(result: AgentOperation<{ status: "accepted" }>) {
      if (!steering) throw new Error("No pending fixture steer");
      steering.settle(structuredClone(result)); steering = undefined;
    },
    settleInterrupt(result: AgentOperation<{ status: "requested" }>) {
      if (!interrupt) throw new Error("No pending fixture interrupt");
      interrupt.settle(structuredClone(result)); interrupt = undefined;
    },
    settleCleanup(evidence: CleanupEvidence) {
      if (!cleanup) throw new Error("Dispose before settling fixture cleanup");
      if (cleanupSettled) throw new Error("Fixture cleanup already settled");
      cleanup.settle(CleanupEvidenceSchema.parse(evidence));
      cleanupSettled = true;
    },
  };
}
