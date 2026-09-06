import { z } from "zod";
import { FocusRefSchema, PROTOCOL_VERSION } from "./common";

// Transport bounds, not claims that persistence or provider policy exists yet.
export const AGENT_LIMITS = {
  taskBytes: 16 * 1024, attachmentBytes: 64 * 1024, contextBytes: 128 * 1024,
  providerLineBytes: 1024 * 1024, recordBytes: 64 * 1024, pageBytes: 256 * 1024,
  tailBytes: 512 * 1024, transcriptBytes: 8 * 1024 * 1024, storeBytes: 64 * 1024 * 1024,
  history: 20, tailRecords: 32, pageRecords: 2048, receipts: 128, draftMs: 5 * 60_000, deadlineMs: 10 * 60_000,
} as const;
const encoder = new TextEncoder();
export const utf8Bytes = (text: string): number => encoder.encode(text).byteLength;
const text = (max: number, min = 1) => z.string().min(min).max(max)
  .refine((value) => utf8Bytes(value) <= max, "UTF-8 byte limit exceeded");
const id = text(256).refine((value) => !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(value), "Invalid identifier");
const path = text(4096).refine((value) =>
  !/[\\\x00-\x1f\x7f:]/.test(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
  "Expected normalized repository-relative path");
const date = z.string().max(32).datetime();
const cursor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const RunIdSchema = z.string().uuid();
export const AgentErrorSchema = z.object({
  code: z.enum(["STALE_CONTEXT", "BUSY", "ADAPTER_UNAVAILABLE", "ADAPTER_POLICY_UNAVAILABLE",
    "UNSUPPORTED_CONTROL", "RUN_NOT_ACTIVE", "STALE_TURN", "OUTPUT_LIMIT",
    "STORAGE_UNAVAILABLE", "STORAGE_FULL", "AGENT_OUTCOME_UNKNOWN", "INVALID_CURSOR", "INSTRUCTION_LIMIT"]),
  message: text(512).refine((value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), "Unsanitized error message"),
}).strict();
export type AgentError = z.infer<typeof AgentErrorSchema>;
// The shared transport may fail before the agent service has handled a command.
export const AgentBoundaryErrorSchema = AgentErrorSchema.extend({
  code: z.union([AgentErrorSchema.shape.code, z.enum([
    "CORE_UNAVAILABLE", "CORE_TIMEOUT", "CORE_GENERATION_CHANGED", "INVALID_CORE_MESSAGE",
    "INVALID_REQUEST", "DUPLICATE_REQUEST", "UNTRUSTED_RENDERER",
  ])]),
});

export const AgentFocusSchema = FocusRefSchema.extend({
  worldId: id, revisionId: id, key: text(4096), path: path.optional(), symbol: text(4096).optional(),
  range: z.object({ startLine: cursor.min(1), endLine: cursor.min(1) }).strict()
    .refine((value) => value.endLine >= value.startLine, "Invalid line range").optional(),
}).strict();
export const AgentLinksSchema = z.object({
  parentRunId: RunIdSchema.nullable(), task: path.nullable(), spec: path.nullable(),
}).strict();
export const AgentPrepareInputSchema = z.object({
  worldId: id, focus: AgentFocusSchema, taskText: text(AGENT_LIMITS.taskBytes),
  model: text(256).nullable(), effort: text(64).nullable(), links: AgentLinksSchema,
}).strict().refine((input) => input.worldId === input.focus.worldId && input.focus.revisionKind === "working",
  "Preparation requires the selected working world");
export type AgentPrepareInput = z.infer<typeof AgentPrepareInputSchema>;
const base = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requestId: id }).strict();
export const AgentRequestSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("agent.prepare"), ...AgentPrepareInputSchema.shape })
    .refine((input) => input.worldId === input.focus.worldId && input.focus.revisionKind === "working",
      "Preparation requires the selected working world"),
  base.extend({ type: z.literal("agent.launch"), runId: RunIdSchema, contextHash: hash }),
  base.extend({ type: z.literal("agent.steer"), runId: RunIdSchema, expectedTurnId: id, text: text(AGENT_LIMITS.taskBytes) }),
  base.extend({ type: z.literal("agent.cancel"), runId: RunIdSchema }),
  base.extend({ type: z.literal("agent.snapshot") }),
  base.extend({ type: z.literal("agent.read"), runId: RunIdSchema, afterRecord: cursor }),
]);
export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export const AgentCapabilitiesSchema = z.object({
  availability: z.enum(["available", "unavailable"]),
  reason: AgentErrorSchema.nullable(),
  provider: text(128).nullable(), version: text(128).nullable(),
  controls: z.object({ launch: z.boolean(), steer: z.boolean(), cancel: z.boolean() }).strict(),
  policy: z.enum(["unverified", "verified-read-only"]),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "unavailable" &&
      (!value.reason || Object.values(value.controls).some(Boolean))) {
    ctx.addIssue({ code: "custom", message: "Unavailable capability requires a reason and disabled controls" });
  }
  if (value.availability === "available" &&
      (value.reason !== null || value.policy !== "verified-read-only" || !value.provider || !value.version)) {
    ctx.addIssue({ code: "custom", message: "Available capability requires verified policy and provider identity" });
  }
});
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
const instructionSource = z.object({
  path: text(4096), digest: hash.nullable(),
  observation: z.enum(["observed", "unobserved", "changing"]),
  before: date.nullable(), after: date.nullable(),
}).strict().refine((source) => source.observation !== "observed" || source.digest !== null,
  "Observed instructions require a digest");
export const LaunchContextSchema = z.object({
  worldId: id, repositoryId: id, root: text(4096), head: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).nullable(),
  workingFingerprint: hash, focus: AgentFocusSchema, taskText: text(AGENT_LIMITS.taskBytes),
  links: AgentLinksSchema,
  requested: z.object({ model: text(256).nullable(), effort: text(64).nullable() }).strict(),
  attachments: z.array(z.object({
    path, content: text(AGENT_LIMITS.attachmentBytes, 0), digest: hash,
    startLine: cursor.min(1), endLine: cursor.min(1),
  }).strict().refine((a) => a.endLine >= a.startLine, "Invalid attachment range")).max(1),
  instructionSources: z.array(instructionSource).max(32),
  configurationSources: z.array(instructionSource).max(32),
  submittedPrompt: text(AGENT_LIMITS.contextBytes), contextHash: hash,
  diskOnly: z.literal(true),
  access: z.object({
    policy: z.literal("read-only"), toolNetwork: z.literal(false), approvals: z.literal("never"),
    hostConfidentiality: z.literal(false), sendsSelectedContentToProvider: z.literal(true),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.worldId !== value.focus.worldId || value.focus.revisionKind !== "working") {
    ctx.addIssue({ code: "custom", message: "Launch context must refer to its working world" });
  }
  if (utf8Bytes(JSON.stringify(value)) > AGENT_LIMITS.contextBytes) {
    ctx.addIssue({ code: "custom", message: "Total launch context exceeds UTF-8 byte limit" });
  }
});
export type LaunchContext = z.infer<typeof LaunchContextSchema>;
export const PreparedAgentContextSchema = z.object({
  runId: RunIdSchema, contextHash: hash, preparedAt: date, expiresAt: date,
  launchContext: LaunchContextSchema, capabilities: AgentCapabilitiesSchema,
}).strict().superRefine((value, ctx) => {
  const lifetime = Date.parse(value.expiresAt) - Date.parse(value.preparedAt);
  if (lifetime <= 0 || lifetime > AGENT_LIMITS.draftMs || value.contextHash !== value.launchContext.contextHash) {
    ctx.addIssue({ code: "custom", message: "Invalid prepared context hash or expiry" });
  }
});
export type PreparedAgentContext = z.infer<typeof PreparedAgentContextSchema>;

export const InstructionReceiptSchema = z.object({
  requestId: id, expectedTurnId: id, text: text(AGENT_LIMITS.taskBytes), textHash: hash,
  status: z.enum(["pending", "accepted", "rejected", "delivery-unknown"]),
  submittedAt: date, settledAt: date.nullable(), error: AgentErrorSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "pending") !== (value.settledAt === null) ||
      (value.settledAt !== null && Date.parse(value.settledAt) < Date.parse(value.submittedAt)) ||
      (value.status === "rejected" && value.error === null) ||
      ((value.status === "accepted" || value.status === "pending") && value.error !== null)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent instruction receipt" });
  }
});
export type InstructionReceipt = z.infer<typeof InstructionReceiptSchema>;
export const TranscriptRecordSchema = z.object({
  recordId: cursor.min(1), timestamp: date,
  kind: z.enum(["user", "message", "tool", "status", "gap", "recap"]),
  providerItemId: id.nullable(), text: text(AGENT_LIMITS.recordBytes, 0),
}).strict();
export type TranscriptRecord = z.infer<typeof TranscriptRecordSchema>;
function records(maxRecords: number, maxBytes: number) {
  return z.array(TranscriptRecordSchema).max(maxRecords).superRefine((items, ctx) => {
    if (items.some((item, i) => i > 0 && item.recordId <= items[i - 1]!.recordId)) {
      ctx.addIssue({ code: "custom", message: "Record IDs must increase" });
    }
    if (utf8Bytes(JSON.stringify(items)) > maxBytes) {
      ctx.addIssue({ code: "custom", message: "Transcript byte limit exceeded" });
    }
  });
}
export const RunStateSchema = z.enum(["starting", "running", "cancelling", "completed", "failed", "cancelled", "unknown"]);
export type RunState = z.infer<typeof RunStateSchema>;
export const isTerminalRunState = (state: RunState): boolean => ["completed", "failed", "cancelled", "unknown"].includes(state);
const transitions: Record<RunState, readonly RunState[]> = {
  starting: ["running", "cancelling", "failed", "unknown"],
  running: ["cancelling", "completed", "failed", "cancelled", "unknown"],
  cancelling: ["cancelled", "completed", "failed", "unknown"],
  completed: [], failed: [], cancelled: [], unknown: [],
};
export const canTransitionRun = (from: RunState, to: RunState): boolean =>
  from === to || transitions[from].includes(to);
export const CleanupEvidenceSchema = z.object({
  status: z.enum(["not-needed", "pending", "confirmed", "unknown"]),
  observedAt: date, detail: text(512),
}).strict();
export type CleanupEvidence = z.infer<typeof CleanupEvidenceSchema>;
export const ProviderOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("setup-rejected"), detail: text(512) }).strict(),
  z.object({ kind: z.literal("turn"), threadId: id, turnId: id,
    status: z.enum(["completed", "failed", "interrupted"]), observedAt: date }).strict(),
  z.object({ kind: z.literal("owned-termination"), afterCancellation: z.literal(true), observedAt: date }).strict(),
  z.object({ kind: z.literal("dispatch-prevented"), observedAt: date }).strict(),
]);
export const RunSchema = z.object({
  runId: RunIdSchema, providerThreadId: id.nullable(), providerTurnId: id.nullable(),
  launchContext: LaunchContextSchema, state: RunStateSchema,
  createdAt: date, updatedAt: date, startedAt: date.nullable(), endedAt: date.nullable(),
  terminalReason: text(512).nullable(), providerOutcome: ProviderOutcomeSchema,
  providerObservation: z.object({
    provider: text(128), version: text(128), model: text(256), cwd: text(4096),
    policy: z.literal("read-only"), instructionSources: z.array(instructionSource).max(32), observedAt: date,
  }).strict().nullable(),
  processState: z.enum(["not-started", "live", "exited", "unknown"]), exitCode: z.number().int().nullable(),
  cleanup: CleanupEvidenceSchema,
  transcript: z.object({ lastRecord: cursor, bytes: cursor.max(AGENT_LIMITS.transcriptBytes),
    truncated: z.boolean(), tailMayBeLost: z.boolean() }).strict(),
  instructions: z.array(InstructionReceiptSchema).max(AGENT_LIMITS.receipts),
}).strict().superRefine((run, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const terminal = isTerminalRunState(run.state);
  if (terminal !== (run.endedAt !== null) || terminal !== (run.terminalReason !== null)) issue("Terminal states require end time and reason");
  if (Date.parse(run.updatedAt) < Date.parse(run.createdAt) ||
      (run.startedAt !== null && run.endedAt !== null && Date.parse(run.endedAt) < Date.parse(run.startedAt)) ||
      [run.startedAt, run.endedAt].some((at) => at !== null &&
        (Date.parse(at) < Date.parse(run.createdAt) || Date.parse(at) > Date.parse(run.updatedAt)))) issue("Invalid run timestamps");
  if (run.providerTurnId && !run.providerThreadId) issue("A turn requires its thread");
  if (run.state === "running" && (!run.providerThreadId || !run.providerTurnId || !run.startedAt || run.processState !== "live")) issue("Running requires a confirmed live turn");
  if (run.exitCode !== null && run.processState !== "exited") issue("Exit code requires observed exit");
  if (run.processState === "not-started" && (run.providerThreadId !== null || run.providerTurnId !== null || run.providerObservation !== null)) issue("Unstarted process cannot have provider identity");
  if ((run.cleanup.status === "confirmed" && run.processState !== "exited") ||
      (run.cleanup.status === "not-needed" && run.processState !== "not-started") ||
      (run.processState === "not-started" && run.cleanup.status !== "not-needed")) issue("Cleanup must agree with observed process state");
  if (run.providerOutcome.kind === "turn" &&
      (run.providerOutcome.threadId !== run.providerThreadId || run.providerOutcome.turnId !== run.providerTurnId || run.startedAt === null)) issue("Terminal evidence must match the run's confirmed turn");
  const outcome = run.providerOutcome;
  if (run.state === "completed" && !(outcome.kind === "turn" && outcome.status === "completed")) issue("Completion requires terminal provider evidence");
  if (run.state === "failed" && !(outcome.kind === "setup-rejected" || (outcome.kind === "turn" && outcome.status === "failed"))) issue("Failure requires setup or terminal provider evidence");
  if (run.state === "cancelled" && !((outcome.kind === "turn" && outcome.status === "interrupted") ||
      (outcome.kind === "owned-termination" && run.processState === "exited" && run.cleanup.status === "confirmed") ||
      (outcome.kind === "dispatch-prevented" && run.processState === "not-started" && run.cleanup.status === "not-needed"))) issue("Cancellation requires interruption, verified owned termination or prevented dispatch");
  if ((!terminal || run.state === "unknown") && outcome.kind !== "none") issue("Known terminal evidence cannot be nonterminal or unknown");
  if (run.instructions.filter((receipt) => receipt.status === "pending").length > 1 ||
      new Set(run.instructions.map((receipt) => receipt.requestId)).size !== run.instructions.length) issue("Instructions require unique IDs and one pending receipt");
});
export type Run = z.infer<typeof RunSchema>;

export const RunSummarySchema = z.object({
  runId: RunIdSchema, state: RunStateSchema, createdAt: date, updatedAt: date,
  endedAt: date.nullable(), taskLabel: text(256), focusLabel: text(256),
}).strict().refine((run) => isTerminalRunState(run.state) === (run.endedAt !== null) &&
  Date.parse(run.updatedAt) >= Date.parse(run.createdAt) &&
  (run.endedAt === null || (Date.parse(run.endedAt) >= Date.parse(run.createdAt) && Date.parse(run.endedAt) <= Date.parse(run.updatedAt))),
  "Inconsistent run summary");
export type RunSummary = z.infer<typeof RunSummarySchema>;
export const AgentSnapshotSchema = z.object({
  runs: z.array(RunSummarySchema).max(AGENT_LIMITS.history),
  activeRunId: RunIdSchema.nullable(), capabilities: AgentCapabilitiesSchema,
  tail: records(AGENT_LIMITS.tailRecords, AGENT_LIMITS.tailBytes),
}).strict().superRefine((value, ctx) => {
  const active = value.runs.filter((run) => !isTerminalRunState(run.state));
  if (new Set(value.runs.map((run) => run.runId)).size !== value.runs.length ||
      active.length > 1 || (active[0]?.runId ?? null) !== value.activeRunId ||
      (value.activeRunId === null && value.tail.length > 0)) {
    ctx.addIssue({ code: "custom", message: "Snapshot requires unique history and only the active run's tail" });
  }
});
export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;
export const AdmissionReceiptSchema = z.object({
  runId: RunIdSchema, contextHash: hash, admittedAt: date, status: z.literal("admitted"),
}).strict();
export type AdmissionReceipt = z.infer<typeof AdmissionReceiptSchema>;
export const CancellationReceiptSchema = z.object({
  runId: RunIdSchema, requestId: id, requestedAt: date, status: z.literal("requested"),
}).strict();
export type CancellationReceipt = z.infer<typeof CancellationReceiptSchema>;
export const TranscriptPageSchema = z.object({
  records: records(AGENT_LIMITS.pageRecords, AGENT_LIMITS.pageBytes), nextCursor: cursor, truncated: z.boolean(),
}).strict().refine((page) => page.records.length === 0 || page.nextCursor === page.records.at(-1)!.recordId,
  "Cursor must identify last returned record");
export type TranscriptPage = z.infer<typeof TranscriptPageSchema>;
export const AgentResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prepare"), draft: PreparedAgentContextSchema }).strict(),
  z.object({ kind: z.literal("launch"), receipt: AdmissionReceiptSchema }).strict(),
  z.object({ kind: z.literal("steer"), runId: RunIdSchema, receipt: InstructionReceiptSchema }).strict(),
  z.object({ kind: z.literal("cancel"), receipt: CancellationReceiptSchema }).strict(),
  z.object({ kind: z.literal("snapshot"), snapshot: AgentSnapshotSchema }).strict(),
  z.object({ kind: z.literal("read"), run: RunSchema, page: TranscriptPageSchema }).strict()
    .refine((result) => result.page.nextCursor <= result.run.transcript.lastRecord, "Page cursor exceeds run history"),
]);
export type AgentResult = z.infer<typeof AgentResultSchema>;
export const AgentEventSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("agent.changed"),
  sequence: cursor.min(1), emittedAt: date, snapshot: AgentSnapshotSchema,
}).strict();
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export const parseAgentEvent = (input: unknown): AgentEvent => AgentEventSchema.parse(input);
