import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { ExternalSessionId } from "./external-agents";
import { WorktreeChangeSchema } from "./worktree-inspection";

export const WorkspaceIdSchema = z.string().min(1).max(256);
export const WorkspaceProjectIdSchema = z.string().regex(/^[a-f0-9]{64}$/).nullable();
export const WorkspaceOpenRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1),
  type: z.literal("workspace.open"), sessionId: ExternalSessionId.nullable(), identityOnly: z.boolean().optional(),
}).strict();
export const WorkspaceSelectionSchema = z.object({
  id: WorkspaceIdSchema, root: z.string().min(1).max(4096), label: z.string().min(1).max(256),
  projectId: WorkspaceProjectIdSchema.default(null), agentVisibility: z.enum(["project", "worktree"]).default("worktree"),
  sessionId: ExternalSessionId.nullable(), branch: z.string().max(256).nullable(),
  base: z.string().max(160).nullable(), changes: z.array(WorktreeChangeSchema).max(400),
  changesComplete: z.boolean(), notice: z.string().max(512).optional(),
}).strict();
export type WorkspaceSelection = z.infer<typeof WorkspaceSelectionSchema>;
export type WorkspaceDescriptor = WorkspaceSelection;

/** Observation/steering belongs to the long-lived harness, not the browsed tree. */
export function isSharedWorkspaceRequest(request: { type: string }): boolean {
  return request.type.startsWith("externalAgents.") || request.type.startsWith("workLog.") ||
    request.type.startsWith("agent.") || request.type.startsWith("trusted.") ||
    request.type.startsWith("worktree.");
}
