import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { ExternalSessionId } from "./external-agents";
import { RepositoryPathSchema, RepositoryDirectorySchema, RepositoryObservationSchema } from "./repository";

export const WorktreeInspectionRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1).max(160),
  type: z.literal("worktree.inspect"),
  sessionId: ExternalSessionId,
  path: RepositoryPathSchema,
  comparison: z.literal("master").optional(),
}).strict();
export type WorktreeInspectionRequest = z.infer<typeof WorktreeInspectionRequestSchema>;

export const WorktreeInspectionResultSchema = z.object({
  sessionId: ExternalSessionId,
  path: RepositoryPathSchema,
  label: z.string().min(1).max(120),
  worktree: z.string().min(1).max(4096),
  content: z.string().max(2 * 1024 * 1024).nullable(),
  diff: z.string().max(256 * 1024),
  diffNotice: z.string().max(512).optional(),
  comparison: z.literal("master").optional(),
  base: z.string().max(160).nullable().optional(),
  contentNotice: z.string().max(512).optional(),
}).strict();
export type WorktreeInspectionResult = z.infer<typeof WorktreeInspectionResultSchema>;

export const WorktreeBrowseRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1).max(160),
  type: z.literal("worktree.browse"),
  sessionId: ExternalSessionId,
  directory: RepositoryDirectorySchema,
  page: z.number().int().min(0).max(20).default(0),
}).strict();
export type WorktreeBrowseRequest = z.infer<typeof WorktreeBrowseRequestSchema>;
export const WorktreeChangeSchema = z.object({
  path: RepositoryPathSchema,
  status: z.enum(["added", "modified", "deleted", "renamed", "copied", "type-changed", "unmerged", "untracked"]),
  previousPath: RepositoryPathSchema.optional(),
}).strict();
export type WorktreeChange = z.infer<typeof WorktreeChangeSchema>;
export const WorktreeBrowseResultSchema = z.object({
  sessionId: ExternalSessionId,
  label: z.string().min(1).max(120),
  worktree: z.string().min(1).max(4096),
  branch: z.string().max(256).nullable(),
  base: z.string().max(160).nullable(),
  directory: RepositoryObservationSchema,
  changes: z.array(WorktreeChangeSchema).max(400),
  changesComplete: z.boolean(),
  notice: z.string().max(512).optional(),
}).strict();
export type WorktreeBrowseResult = z.infer<typeof WorktreeBrowseResultSchema>;
