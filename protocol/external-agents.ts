import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";

export const ExternalSessionId = z.string().uuid();
export const EXTERNAL_MESSAGE_MAX_BYTES = 4000;
export const ExternalMessageSchema = z.string().min(1).max(EXTERNAL_MESSAGE_MAX_BYTES)
  .refine((value) => !!value.trim() && !value.includes("\0") && new TextEncoder().encode(value).length <= EXTERNAL_MESSAGE_MAX_BYTES,
    "Message must be nonblank, without NUL, and at most 4000 UTF-8 bytes");
const Text = z.string().max(4096);
export const ExternalAgentSummarySchema = z.object({
  id: ExternalSessionId,
  label: z.string().min(1).max(120),
  evidence: z.enum(["local", "synthetic"]),
  status: z.enum(["observed", "unavailable"]),
  parentId: ExternalSessionId.nullable(),
  ancestry: z.enum(["root", "registered-parent", "unknown-parent", "cycle", "unavailable"]),
  observationId: z.string().max(64),
  observedAt: z.string().datetime(),
  message: Text,
  role: z.string().max(120).optional(),
  task: z.string().max(200).optional(),
  contextPaths: z.array(z.string().min(1).max(512)).max(12),
}).strict();
export type ExternalAgentSummary = z.infer<typeof ExternalAgentSummarySchema>;
export const ExternalEntrySchema = z.object({
  id: z.string().max(100), at: z.string().max(64),
  kind: z.enum(["assistant", "tool-call", "tool-result", "turn-start", "turn-complete"]),
  text: Text, attribution: z.enum(["assistant-reported", "recorded-tool-event", "harness-event"]),
}).strict();
export type ExternalEntry = z.infer<typeof ExternalEntrySchema>;
export const ExternalSnapshotSchema = z.object({
  status: z.enum(["observed", "unavailable"]), message: Text, observedAt: z.string().datetime(),
  sessions: z.array(ExternalAgentSummarySchema).max(64),
}).strict();
export type ExternalSnapshot = z.infer<typeof ExternalSnapshotSchema>;
export const ExternalDetailSchema = z.object({
  session: ExternalAgentSummarySchema,
  entries: z.array(ExternalEntrySchema).max(120),
  coverage: z.object({ tailBytes: z.number().int().min(0).max(262144), partial: z.boolean(), omittedRecords: z.number().int().nonnegative(), message: Text }).strict(),
  handoff: z.enum(["unconfigured", "available", "unavailable"]),
}).strict();
export type ExternalDetail = z.infer<typeof ExternalDetailSchema>;
const Base = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1).max(160) });
export const ExternalRequestSchema = z.discriminatedUnion("type", [
  Base.extend({ type: z.literal("externalAgents.snapshot") }).strict(),
  Base.extend({ type: z.literal("externalAgents.read"), sessionId: ExternalSessionId }).strict(),
  Base.extend({ type: z.literal("externalAgents.handoff"), sessionId: ExternalSessionId, observationId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  Base.extend({ type: z.literal("externalAgents.send"), sessionId: ExternalSessionId, observationId: z.string().regex(/^[a-f0-9]{64}$/), text: ExternalMessageSchema }).strict(),
]);
export type ExternalRequest = z.infer<typeof ExternalRequestSchema>;
export const ExternalResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), snapshot: ExternalSnapshotSchema }).strict(),
  z.object({ kind: z.literal("read"), detail: ExternalDetailSchema }).strict(),
  z.object({ kind: z.literal("handoff"), sessionId: ExternalSessionId, status: z.enum(["opened", "unavailable"]), message: Text }).strict(),
  z.object({ kind: z.literal("send"), sessionId: ExternalSessionId, receiptId: z.string().uuid(), status: z.enum(["queued", "rejected", "delivery-unknown"]), message: Text }).strict(),
]);
export type ExternalResult = z.infer<typeof ExternalResultSchema>;
export function parseExternalResult(input: unknown, request: ExternalRequest): ExternalResult {
  const result = ExternalResultSchema.parse(input);
  if (result.kind !== request.type.split(".")[1] ||
      request.type === "externalAgents.read" && (result.kind !== "read" || result.detail.session.id !== request.sessionId) ||
      request.type === "externalAgents.handoff" && (result.kind !== "handoff" || result.sessionId !== request.sessionId) ||
      request.type === "externalAgents.send" && (result.kind !== "send" || result.sessionId !== request.sessionId))
    throw new Error("External observation response identity mismatch");
  return result;
}
