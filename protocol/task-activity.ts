import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { GitObjectIdSchema, TaskIdSchema } from "./tasks";

const text = (limit: number) => z.string().max(limit).refine((value) => new TextEncoder().encode(value).length <= limit);
const identity = text(256).refine((value) => value.length > 0 && !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(value));
const date = z.string().max(64).datetime({ offset: true });
export const TaskActivityEventSchema = z.object({ ordinal: z.number().int().nonnegative(), time: date,
  who: text(512), what: text(1024), comment: text(4096) }).strict();
export const TaskActivitySchema = z.object({ blob: GitObjectIdSchema, createdAt: date.nullable(),
  events: z.array(TaskActivityEventSchema).max(32), total: z.number().int().nonnegative().max(8192),
  omitted: z.number().int().nonnegative().max(8192), status: z.enum(["complete", "partial", "unavailable"]),
}).strict().refine((value) => value.events.length + value.omitted === value.total)
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024);
export type TaskActivity = z.infer<typeof TaskActivitySchema>;
export const TaskActivityRequestSchema = z.object({ type: z.literal("taskActivity.read"), protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: identity, worldId: identity, repositoryId: identity, metadataCommit: GitObjectIdSchema, taskId: TaskIdSchema }).strict();
export type TaskActivityRequest = z.infer<typeof TaskActivityRequestSchema>;
export const TaskActivityResultSchema = z.object({ worldId: identity, repositoryId: identity,
  metadataCommit: GitObjectIdSchema, taskId: TaskIdSchema, activity: TaskActivitySchema.nullable(),
  unavailable: z.enum(["not-cached", "revision-expired", "not-found", "unsupported"]).nullable(),
}).strict().refine((value) => (value.activity === null) !== (value.unavailable === null));
export type TaskActivityResult = z.infer<typeof TaskActivityResultSchema>;
