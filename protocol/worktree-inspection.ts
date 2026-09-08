import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { ExternalSessionId } from "./external-agents";
import { RepositoryPathSchema } from "./repository";

export const WorktreeInspectionRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1).max(160),
  type: z.literal("worktree.inspect"),
  sessionId: ExternalSessionId,
  path: RepositoryPathSchema,
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
}).strict();
export type WorktreeInspectionResult = z.infer<typeof WorktreeInspectionResultSchema>;
