import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";

/** Prototype ceilings, not a claim to index arbitrarily large repositories. */
export const TASK_LIMITS = {
  issues: 256, blobBytes: 64 * 1024, inputBytes: 16 * 1024 * 1024,
  cacheBytes: 16 * 1024 * 1024, depth: 16, nodes: 8192,
  idBytes: 256, componentBytes: 256, titleBytes: 512, descriptionBytes: 16 * 1024,
  dependencies: 32, fileRefs: 32, pathBytes: 1024, noteBytes: 512,
  snapshotBytes: 512 * 1024, detailBytes: 64 * 1024,
  commandMs: 5000, observationMs: 10000,
} as const;
export const TASK_METADATA_REF = "refs/heads/ditz-metadata" as const;
const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).byteLength;
const text = (max: number, min = 0) => z.string().min(min).max(max)
  .refine((value) => bytes(value) <= max, "Task UTF-8 byte limit exceeded")
  .refine((value) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), "Invalid Unicode task text");
const identity = text(256, 1).refine((value) => !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(value), "Invalid task world identity");
const date = z.string().max(32).datetime();
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const boundedJson = (value: unknown, max: number) => bytes(JSON.stringify(value)) <= max;
export const TaskIdSchema = z.string().min(1).max(TASK_LIMITS.idBytes).regex(/^[A-Za-z0-9_-]+$/);
export const GitObjectIdSchema = z.discriminatedUnion("algorithm", [
  z.object({ algorithm: z.literal("sha1"), hex: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
  z.object({ algorithm: z.literal("sha256"), hex: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type GitObjectId = z.infer<typeof GitObjectIdSchema>;
export const sameGitObject = (a: GitObjectId, b: GitObjectId): boolean => a.algorithm === b.algorithm && a.hex === b.hex;
export const TaskStatusSchema = z.enum(["unstarted", "in_progress", "paused", "closed"]);
export const TaskTypeSchema = z.enum(["bugfix", "feature", "task"]);
export const TaskErrorSchema = z.object({
  code: z.enum(["TASK_PROVIDER_UNAVAILABLE", "TASK_METADATA_UNAVAILABLE", "TASK_METADATA_MALFORMED",
    "TASK_LIMIT_EXCEEDED", "TASK_OBSERVATION_FAILED", "TASK_REF_CHANGED", "TASK_RECONNECT_REQUIRED",
    "TASK_REVISION_EXPIRED", "TASK_NOT_FOUND", "TASK_WORLD_MISMATCH"]),
  message: text(512, 1).refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Unsanitized task diagnostic"),
}).strict();
export type TaskError = z.infer<typeof TaskErrorSchema>;
export const TaskBoundaryErrorSchema = TaskErrorSchema.extend({
  // Only failures before a validated provider result use the outer envelope.
  // Revision/not-found and all observation errors require their correlated task payload.
  code: z.enum(["TASK_WORLD_MISMATCH", "TASK_OBSERVATION_FAILED", "CORE_UNAVAILABLE", "CORE_TIMEOUT", "CORE_GENERATION_CHANGED",
    "INVALID_CORE_MESSAGE", "INVALID_REQUEST", "DUPLICATE_REQUEST", "UNTRUSTED_RENDERER"]),
});
const count = z.number().int().nonnegative().max(TASK_LIMITS.dependencies);
export const TaskSummarySchema = z.object({
  id: TaskIdSchema, blob: GitObjectIdSchema, title: text(TASK_LIMITS.titleBytes, 1),
  type: TaskTypeSchema, component: text(TASK_LIMITS.componentBytes), status: TaskStatusSchema,
  counts: z.object({ blocks: count, blockedBy: count,
    fileRefs: z.number().int().nonnegative().max(TASK_LIMITS.fileRefs) }).strict(),
}).strict();
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

/** Syntactic candidate only: the contained-file broker remains final authority. */
export function isTaskSourcePath(value: string): boolean {
  return value.length > 0 && bytes(value) <= TASK_LIMITS.pathBytes &&
    !/[\\:\p{Cc}\p{Cf}]/u.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
export const TaskFileRefSchema = z.object({
  path: text(TASK_LIMITS.pathBytes), line: sequence.min(1).nullable(), note: text(TASK_LIMITS.noteBytes).nullable(),
  navigation: z.enum(["candidate", "unsupported"]),
}).strict().refine((ref) => (ref.navigation === "candidate") === isTaskSourcePath(ref.path),
  "File reference classification must match its literal path");
export type TaskFileRef = z.infer<typeof TaskFileRefSchema>;
export const TaskDependencySchema = z.object({
  taskId: TaskIdSchema, status: TaskStatusSchema.nullable(),
  diagnostics: z.array(z.enum(["missing", "cyclic", "asymmetric"])).max(3),
}).strict().refine((row) => new Set(row.diagnostics).size === row.diagnostics.length &&
  (row.status === null) === row.diagnostics.includes("missing"), "Inconsistent dependency observation");
const dependencies = z.array(TaskDependencySchema).max(TASK_LIMITS.dependencies)
  .refine((rows) => new Set(rows.map((row) => row.taskId)).size === rows.length, "Duplicate dependency identity");
export const TaskDetailSchema = TaskSummarySchema.extend({
  description: text(TASK_LIMITS.descriptionBytes), disposition: text(256).nullable(),
  blocks: dependencies, blockedBy: dependencies,
  fileRefs: z.array(TaskFileRefSchema).max(TASK_LIMITS.fileRefs),
}).superRefine((detail, ctx) => {
  if (detail.counts.blocks !== detail.blocks.length || detail.counts.blockedBy !== detail.blockedBy.length ||
      detail.counts.fileRefs !== detail.fileRefs.length) ctx.addIssue({ code: "custom", message: "Task counts must match complete detail" });
  if (!boundedJson(detail, TASK_LIMITS.detailBytes)) ctx.addIssue({ code: "custom", message: "Task detail byte limit exceeded" });
});
export type TaskDetail = z.infer<typeof TaskDetailSchema>;
const world = { worldId: identity, repositoryId: identity, provider: z.literal("ditz") };
export const TaskSnapshotSchema = z.object({
  ...world, metadataCommit: GitObjectIdSchema, observedAt: date,
  summaries: z.array(TaskSummarySchema).max(TASK_LIMITS.issues),
}).strict().superRefine((snapshot, ctx) => {
  if (new Set(snapshot.summaries.map((item) => item.id)).size !== snapshot.summaries.length)
    ctx.addIssue({ code: "custom", message: "Task identities must be unique" });
  if (snapshot.summaries.some((item) => item.blob.algorithm !== snapshot.metadataCommit.algorithm))
    ctx.addIssue({ code: "custom", message: "Task object algorithms must match the metadata commit" });
  if (!boundedJson(snapshot, TASK_LIMITS.snapshotBytes)) ctx.addIssue({ code: "custom", message: "Task snapshot byte limit exceeded" });
});
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;
export const TaskObservationStatusSchema = z.enum(["unobserved", "loading", "observed", "stale", "unavailable", "malformed", "limited", "error"]);
export type TaskObservationStatus = z.infer<typeof TaskObservationStatusSchema>;
export const TaskObservationSchema = z.object({
  ...world, status: TaskObservationStatusSchema, sequence,
  metadataRef: z.literal(TASK_METADATA_REF), checkedAt: date.nullable(), localRef: GitObjectIdSchema.nullable(),
  reason: TaskErrorSchema.nullable(), snapshot: TaskSnapshotSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const snapshot = value.snapshot;
  if (snapshot && (snapshot.worldId !== value.worldId || snapshot.repositoryId !== value.repositoryId)) issue("Retained snapshot must belong to the observation world");
  if (snapshot && value.checkedAt && Date.parse(snapshot.observedAt) > Date.parse(value.checkedAt)) issue("Check cannot precede snapshot observation");
  if (snapshot && value.localRef && snapshot.metadataCommit.algorithm !== value.localRef.algorithm) issue("Checked ref and retained commit must use the same object algorithm");
  if (value.status === "unobserved" && (snapshot || value.checkedAt || value.localRef || value.reason || value.sequence !== 0)) issue("Unobserved is not an observation");
  if (value.status === "observed" && (!snapshot || !value.checkedAt || !value.localRef || value.reason || !sameGitObject(snapshot.metadataCommit, value.localRef))) issue("Observed requires a complete snapshot at the checked local ref");
  if (value.status === "stale" && (!snapshot || !value.checkedAt || !value.reason)) issue("Stale requires retained snapshot and reason");
  if (["unavailable", "malformed", "limited", "error"].includes(value.status) && (!value.reason || !value.checkedAt)) issue("Failed attempt requires a checked time and reason");
  const allowedReasons: Partial<Record<TaskObservationStatus, readonly TaskError["code"][]>> = {
    unavailable: ["TASK_PROVIDER_UNAVAILABLE", "TASK_METADATA_UNAVAILABLE"], malformed: ["TASK_METADATA_MALFORMED"],
    limited: ["TASK_LIMIT_EXCEEDED"], error: ["TASK_OBSERVATION_FAILED"], stale: ["TASK_REF_CHANGED", "TASK_RECONNECT_REQUIRED"],
  };
  const allowed = allowedReasons[value.status];
  if (allowed && value.reason && !allowed.includes(value.reason.code)) issue("Attempt reason must agree with its status");
  if (value.status === "loading" && value.reason !== null) issue("Loading has not failed");
  if (!boundedJson(value, TASK_LIMITS.snapshotBytes)) issue("Task observation byte limit exceeded");
});
export type TaskObservation = z.infer<typeof TaskObservationSchema>;

const request = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requestId: identity, worldId: identity }).strict();
export const TaskRequestSchema = z.discriminatedUnion("type", [
  request.extend({ type: z.literal("tasks.snapshot"), refresh: z.boolean() }),
  request.extend({ type: z.literal("tasks.read"), metadataCommit: GitObjectIdSchema, taskId: TaskIdSchema }),
]);
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export const TaskReadResultSchema = z.object({
  kind: z.literal("read"), ...world, metadataCommit: GitObjectIdSchema, taskId: TaskIdSchema,
  sequence, checkedAt: date,
  result: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), detail: TaskDetailSchema }).strict(),
    z.object({ ok: z.literal(false), error: TaskErrorSchema }).strict(),
  ]),
}).strict().superRefine((value, ctx) => {
  if (value.result.ok && (value.result.detail.id !== value.taskId || value.result.detail.blob.algorithm !== value.metadataCommit.algorithm))
    ctx.addIssue({ code: "custom", message: "Task detail must match its requested identity and object algorithm" });
  if (!boundedJson(value, TASK_LIMITS.detailBytes)) ctx.addIssue({ code: "custom", message: "Task read response byte limit exceeded" });
});
export type TaskReadResult = z.infer<typeof TaskReadResultSchema>;
export const TaskResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), observation: TaskObservationSchema }).strict()
    .refine((value) => boundedJson(value, TASK_LIMITS.snapshotBytes), "Task snapshot response byte limit exceeded"),
  TaskReadResultSchema,
]);
export type TaskResult = z.infer<typeof TaskResultSchema>;

/** Shape/identity validation is stateless; clients separately gate generation,
 * observation sequence and selection tokens before adopting a result. */
export function parseTaskResultForRequest(input: unknown, request: TaskRequest): TaskResult {
  const result = TaskResultSchema.parse(input);
  if (request.type === "tasks.snapshot") {
    if (result.kind !== "snapshot" || result.observation.worldId !== request.worldId) throw new Error("Task snapshot identity mismatch");
  } else if (result.kind !== "read" || result.worldId !== request.worldId || result.taskId !== request.taskId ||
      !sameGitObject(result.metadataCommit, request.metadataCommit)) throw new Error("Task read identity or revision mismatch");
  return result;
}
