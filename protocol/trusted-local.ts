import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { AgentPrepareInputSchema, utf8Bytes } from "./agents";
import { AgentTaskReferenceSchema } from "./agent-task";

const text = (max: number) => z.string().max(max).refine((s) => utf8Bytes(s) <= max);
const id = z.string().uuid();
const base = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1).max(160) });
export const TrustedRequestSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("trusted.snapshot"), token: id.optional() }).strict(),
  base.extend({ type: z.literal("trusted.prepare"), input: AgentPrepareInputSchema }).strict(),
  base.extend({ type: z.literal("trusted.launch"), token: id }).strict(),
  base.extend({ type: z.literal("trusted.send"), token: id, text: text(16384).min(1), expectedTurnId: text(256).nullable().optional() }).strict(),
  base.extend({ type: z.literal("trusted.decide"), token: id, approvalId: text(256), choice: text(128) }).strict(),
  base.extend({ type: z.literal("trusted.stop"), token: id }).strict(),
]);
export type TrustedRequest = z.infer<typeof TrustedRequestSchema>;
export const TrustedStatusSchema = z.enum(["idle", "preparing", "starting", "ready", "running", "stopping", "closed", "failed"]);
export const TrustedActivitySchema = z.object({
  id: text(256).min(1), at: z.string().datetime(), turnId: text(256).nullable(),
  kind: z.enum(["command", "fileChange", "tool", "turn"]),
  status: z.enum(["running", "completed", "failed"]), summary: text(4096),
}).strict();
export type TrustedActivity = z.infer<typeof TrustedActivitySchema>;
export const TrustedRunSummarySchema = z.object({
  runToken: id, title: text(256), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  status: TrustedStatusSchema, archived: z.boolean(), approvalCount: z.number().int().min(0).max(16),
  taskReference: AgentTaskReferenceSchema.nullable(), message: text(4096),
}).strict();
export type TrustedRunSummary = z.infer<typeof TrustedRunSummarySchema>;
export const TrustedSnapshotSchema = z.object({
  instanceId: id, profile: z.literal("trusted-local"), workspace: text(4096),
  preparation: z.object({ token: id, prompt: text(131072), expiresAt: z.string().datetime(), model: text(256).nullable() }).strict().nullable(),
  runToken: id.nullable(),
  status: TrustedStatusSchema,
  threadId: text(256).nullable(), turnId: text(256).nullable(),
  output: text(262144), message: text(4096),
  approvals: z.array(z.object({ id: text(256), method: text(256), summary: text(16384), choices: z.array(text(128)).max(8) }).strict()).max(16),
  runs: z.array(TrustedRunSummarySchema).max(20).optional(),
  taskReference: AgentTaskReferenceSchema.nullable().optional(),
  activities: z.array(TrustedActivitySchema).max(100).optional(),
  archived: z.boolean().optional(),
}).strict();
export type TrustedSnapshot = z.infer<typeof TrustedSnapshotSchema>;
export const TrustedResultSchema = z.object({ kind: z.literal("trusted"), snapshot: TrustedSnapshotSchema }).strict();
