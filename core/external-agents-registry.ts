import { z } from "zod";
import { isRepositoryPath } from "../protocol/repository";
import { ExternalSessionId } from "../protocol/external-agents";
import { TmuxTargetSchema } from "./external-agents-handoff";

/** Local operator configuration only; never renderer-supplied authority. */
export const Registration = z.object({ id: ExternalSessionId, label: z.string().min(1).max(120),
  rollout: z.string().min(1).max(4096), evidence: z.enum(["local", "synthetic"]).default("local"),
  role: z.string().max(120).optional(), task: z.string().max(200).optional(),
  contextRoot: z.string().max(4096).optional(),
  contextPaths: z.array(z.string().max(512).refine((p) => isRepositoryPath(p) && p !== "")).max(12).default([]),
  tmux: TmuxTargetSchema.optional(),
}).strict();
export const Registry = z.object({ version: z.literal(1), sessions: z.array(Registration).max(64) }).strict()
  .refine((r) => new Set(r.sessions.map((s) => s.id)).size === r.sessions.length &&
    new Set(r.sessions.map((s) => s.rollout)).size === r.sessions.length, "Duplicate session registration");
export type Registered = z.infer<typeof Registration>;
