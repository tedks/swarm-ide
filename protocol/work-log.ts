import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { AgentExecutionStateSchema } from "./agent-lifecycle";

export const WorkLogSettingsSchema = z.object({
  harness: z.literal("codex").default("codex"),
  model: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/).default("gpt-5.6-luna"),
  debounceSeconds: z.number().int().min(10).max(600).default(30),
}).strict();
export const WorkLogEntrySchema = z.object({
  id: z.string().min(1).max(160), sessionId: z.string().min(1).max(160),
  agent: z.string().min(1).max(120), taskId: z.string().max(200).nullable(),
  origin: z.enum(["milestone", "terminal"]).optional(),
  at: z.string().datetime(), state: AgentExecutionStateSchema,
  outcome: z.string().min(1).max(1600), areas: z.array(z.string().max(160)).max(12),
  checks: z.array(z.string().max(320)).max(8), followUps: z.array(z.string().max(320)).max(8),
  recorded: z.boolean().default(false),
}).strict();
export const WorkLogSnapshotSchema = z.object({
  running: z.boolean(), summarizing: z.boolean(), settings: WorkLogSettingsSchema,
  entries: z.array(WorkLogEntrySchema).max(200), notice: z.string().max(512),
}).strict();
const base = { protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1).max(200) };
export const WorkLogRequestSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("workLog.read") }).strict(),
  z.object({ ...base, type: z.literal("workLog.start"), settings: WorkLogSettingsSchema }).strict(),
  z.object({ ...base, type: z.literal("workLog.stop") }).strict(),
  z.object({ ...base, type: z.literal("workLog.record"), entryId: z.string().min(1).max(160), taskId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/) }).strict(),
]);
export type WorkLogSettings = z.infer<typeof WorkLogSettingsSchema>;
export type WorkLogEntry = z.infer<typeof WorkLogEntrySchema>;
export type WorkLogSnapshot = z.infer<typeof WorkLogSnapshotSchema>;
export type WorkLogRequest = z.infer<typeof WorkLogRequestSchema>;
