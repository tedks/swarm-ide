import { AGENT_LIMITS, AgentSnapshotSchema, RunSchema, TranscriptRecordSchema, isTerminalRunState, type AgentSnapshot, type LaunchContext, type Run, type TranscriptRecord } from "../../../protocol/agents";

export interface AgentWorkbenchState {
  snapshot: AgentSnapshot;
  run: Run | null;
  records: TranscriptRecord[];
  selected: boolean;
  draftOpen: boolean;
  step: number;
  fixtureGeneration: number;
  streamedSecond: boolean;
}

export const emptyAgentWorkbench = (): AgentWorkbenchState => ({
  snapshot: AgentSnapshotSchema.parse({ runs: [], activeRunId: null, tail: [], capabilities: {
    availability: "unavailable", reason: { code: "ADAPTER_UNAVAILABLE", message: "Live agent service is not connected in this slice." },
    provider: null, version: null, controls: { launch: false, steer: false, cancel: false }, policy: "unverified",
  } }), run: null, records: [], selected: false, draftOpen: false, step: 0, fixtureGeneration: 0, streamedSecond: false,
});

const label = (value: string): string => {
  let result = "";
  for (const char of value) {
    if (new TextEncoder().encode(result + char).length > 240) break;
    result += char;
  }
  return result;
};
export const canPrepareFixture = (state: AgentWorkbenchState): boolean => !state.run ||
  (isTerminalRunState(state.run.state) && (state.run.processState === "exited" || state.run.cleanup.status === "not-needed"));

// This reducer is a local presentation rehearsal, not the durable W2 service.
// Every fixture state still passes the actual public runtime schemas.
export function projectFixture(state: AgentWorkbenchState, run: Run, records = state.records): AgentWorkbenchState {
  const validated = RunSchema.parse(run);
  const bounded = records.slice(-AGENT_LIMITS.tailRecords).map((record) => TranscriptRecordSchema.parse(record));
  const active = !isTerminalRunState(run.state);
  return { ...state, run: validated, records: bounded, snapshot: AgentSnapshotSchema.parse({
    ...state.snapshot, runs: [{ runId: run.runId, state: run.state, createdAt: run.createdAt, updatedAt: run.updatedAt,
      endedAt: run.endedAt, taskLabel: label(run.launchContext.taskText), focusLabel: label(run.launchContext.focus.path ?? run.launchContext.focus.key) }],
    activeRunId: active ? run.runId : null, tail: active ? bounded : [],
  }) };
}

export type FixtureAction =
  | { type: "launch"; context: LaunchContext }
  | { type: "advance" }
  | { type: "steer"; text: string; outcome: "accepted" | "rejected" | "delivery-unknown" }
  | { type: "stop" };

export const FIXTURE_TIME = "2026-09-06T02:00:00.000Z";
const stamp = (step: number) => new Date(Date.parse(FIXTURE_TIME) + step * 1000).toISOString();
const zeroHash = "0".repeat(64);

export function fixtureReducer(state: AgentWorkbenchState, action: FixtureAction): AgentWorkbenchState {
  if (action.type === "launch") {
    // No replacement of active or uncertain work, and no hidden queue.
    if (!canPrepareFixture(state)) return state;
    const fixtureGeneration = state.fixtureGeneration + 1;
    return projectFixture({ ...state, selected: true, draftOpen: false, step: 0, fixtureGeneration, streamedSecond: false }, RunSchema.parse({
      runId: `11111111-1111-4111-8111-${fixtureGeneration.toString(16).padStart(12, "0")}`, launchContext: action.context, state: "starting",
      providerThreadId: null, providerTurnId: null, providerObservation: null, providerOutcome: { kind: "none" },
      createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME, startedAt: null, endedAt: null, terminalReason: null,
      processState: "not-started", exitCode: null, cleanup: { status: "not-needed", observedAt: FIXTURE_TIME, detail: "Fixture: no real process exists." },
      transcript: { lastRecord: 1, bytes: 0, truncated: false, tailMayBeLost: false }, instructions: [],
    }), [{ recordId: 1, timestamp: FIXTURE_TIME, kind: "status", providerItemId: null, text: "FIXTURE admission recorded. No provider turn has started." }]);
  }
  if (!state.run) return state;
  let run = structuredClone(state.run);
  const step = state.step + 1;
  const now = stamp(step);
  let message = "";
  if (action.type === "steer") {
    if (run.state !== "running" || !run.providerTurnId || run.instructions.length >= AGENT_LIMITS.receipts) return state;
    const text = action.text.trim();
    if (!text || new TextEncoder().encode(text).length > AGENT_LIMITS.taskBytes) return state;
    run.instructions.push({ requestId: `fixture-instruction-${step}`, expectedTurnId: run.providerTurnId, text, textHash: zeroHash,
      submittedAt: now, settledAt: now, status: action.outcome,
      error: action.outcome === "rejected" ? { code: "STALE_TURN", message: "Fixture rejection: turn no longer accepts this instruction." }
        : action.outcome === "delivery-unknown" ? { code: "AGENT_OUTCOME_UNKNOWN", message: "Fixture acknowledgement lost; never resend automatically." } : null });
    message = `FIXTURE instruction ${action.outcome}. Acceptance is not turn completion.`;
  } else if (action.type === "stop") {
    if (run.state !== "starting" && run.state !== "running") return state;
    run.state = "cancelling";
    message = "FIXTURE Stop requested; neither interruption nor process exit has been confirmed.";
  } else if (run.state === "starting") {
    run = { ...run, state: "running", providerThreadId: "fixture-thread", providerTurnId: "fixture-turn", startedAt: now,
      processState: "live", cleanup: { status: "pending", observedAt: now, detail: "Simulated process lifecycle only." } };
    message = "FIXTURE stream 1/2: tracing the selected focus and its interface boundaries…";
  } else if (run.state === "running" && !state.streamedSecond) {
    message = "FIXTURE stream 2/2: distinguish caller validation, service errors, and retry semantics. This is scripted text, not a source analysis.";
  } else if (run.state === "running" || run.state === "cancelling") {
    const interrupted = run.state === "cancelling";
    const prevented = interrupted && run.processState === "not-started";
    run.state = interrupted ? "cancelled" : "completed";
    run.endedAt = now;
    run.terminalReason = prevented ? "Fixture dispatch prevented." : interrupted ? "Fixture provider reports interruption." : "Fixture provider reports turn completion.";
    run.providerOutcome = prevented ? { kind: "dispatch-prevented", observedAt: now }
      : { kind: "turn", threadId: run.providerThreadId!, turnId: run.providerTurnId!, status: interrupted ? "interrupted" : "completed", observedAt: now };
    message = interrupted ? run.terminalReason : "FIXTURE FINAL: inspect the request contract, failure behavior and downstream callers together. No code was analyzed or changed by a model.";
  } else if (run.processState === "live") {
    run.processState = "exited";
    run.exitCode = 0;
    run.cleanup = { status: "confirmed", observedAt: now, detail: "Fixture process exit observed separately from terminal turn." };
    message = "FIXTURE process exited. Turn outcome is unchanged.";
  } else return state;
  run.updatedAt = now;
  const record: TranscriptRecord = { recordId: run.transcript.lastRecord + 1, timestamp: now,
    kind: run.state === "completed" && run.processState === "live" ? "recap" : "message",
    providerItemId: message.startsWith("FIXTURE stream 2") ? "fixture-commentary-2" : null, text: message };
  run.transcript.lastRecord = record.recordId;
  run.transcript.bytes += new TextEncoder().encode(JSON.stringify(record)).length;
  run.transcript.truncated ||= state.records.length >= AGENT_LIMITS.tailRecords;
  return projectFixture({ ...state, step, streamedSecond: state.streamedSecond || record.providerItemId === "fixture-commentary-2" }, run, [...state.records, record]);
}
