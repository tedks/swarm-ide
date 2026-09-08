import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";

const identity = z.string().min(1).max(512);
/** A single local label, never a pattern, flag, external repository or traversal. */
export const SelectedBuildTargetSchema = z.string().max(512).regex(/^\/\/[A-Za-z0-9_./+-]*:[A-Za-z0-9_./+-]+$/)
  .refine((label) => !label.split(/[/:]/).some((part) => part === "." || part === "..") &&
    !label.includes("...") && !["all", "all-targets"].includes(label.split(":")[1]!), "Choose one exact local Bazel target");
const context = { protocolVersion: z.literal(PROTOCOL_VERSION), requestId: identity, repositoryId: identity, worldId: identity };
export const BuildJobRequestSchema = z.discriminatedUnion("type", [
  z.object({ ...context, type: z.literal("build.observe") }).strict(),
  z.object({ ...context, type: z.literal("build.start"), target: SelectedBuildTargetSchema }).strict(),
  z.object({ ...context, type: z.literal("build.cancel"), jobId: identity }).strict(),
]);
export const TargetBuildJobSchema = z.object({
  id: identity, target: SelectedBuildTargetSchema,
  status: z.enum(["running", "stopping", "succeeded", "failed", "cancelled"]),
  startedAt: z.string().datetime(), finishedAt: z.string().datetime().optional(),
  elapsedMs: z.number().nonnegative(), message: z.string().max(512),
  output: z.string().max(4096), exitCode: z.number().int().nullable().optional(),
  cleanup: z.enum(["pending", "confirmed", "unknown"]),
}).strict();
export const BuildJobsObservationSchema = z.object({
  repositoryId: identity, worldId: identity,
  jobs: z.array(TargetBuildJobSchema).max(20), blocked: z.boolean(),
}).strict();
export type BuildJobRequest = z.infer<typeof BuildJobRequestSchema>;
export type TargetBuildJob = z.infer<typeof TargetBuildJobSchema>;
export type BuildJobsObservation = z.infer<typeof BuildJobsObservationSchema>;
