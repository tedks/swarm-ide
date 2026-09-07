import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { AgentPrepareInputSchema, utf8Bytes } from "./agents";

const text = (max: number) => z.string().max(max).refine((s) => utf8Bytes(s) <= max);
const id = z.string().uuid();
const base = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1).max(160) });
export const TrustedRequestSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("trusted.snapshot") }).strict(),
  base.extend({ type: z.literal("trusted.prepare"), input: AgentPrepareInputSchema }).strict(),
  base.extend({ type: z.literal("trusted.launch"), token: id }).strict(),
  base.extend({ type: z.literal("trusted.send"), token: id, text: text(16384).min(1) }).strict(),
  base.extend({ type: z.literal("trusted.decide"), token: id, approvalId: text(256), choice: text(128) }).strict(),
  base.extend({ type: z.literal("trusted.stop"), token: id }).strict(),
]);
export type TrustedRequest = z.infer<typeof TrustedRequestSchema>;
export const TrustedSnapshotSchema = z.object({
  instanceId: id, profile: z.literal("trusted-local"), workspace: text(4096),
  preparation: z.object({ token: id, prompt: text(131072), expiresAt: z.string().datetime(), model: text(256).nullable() }).strict().nullable(),
  runToken: id.nullable(),
  status: z.enum(["idle", "preparing", "starting", "ready", "running", "stopping", "closed", "failed"]),
  threadId: text(256).nullable(), turnId: text(256).nullable(),
  output: text(262144), message: text(4096),
  approvals: z.array(z.object({ id: text(256), method: text(256), summary: text(16384), choices: z.array(text(128)).max(8) }).strict()).max(16),
}).strict();
export type TrustedSnapshot = z.infer<typeof TrustedSnapshotSchema>;
export const TrustedResultSchema = z.object({ kind: z.literal("trusted"), snapshot: TrustedSnapshotSchema }).strict();
