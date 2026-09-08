import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { isRepositoryPath } from "./repository";

export const BUILD_GRAPH_LIMITS = { targets: 2000, edges: 8000, bytes: 4 * 1024 * 1024, queryMs: 30_000, setupMs: 120_000, files: 20_000, inputBytes: 8 * 1024 * 1024 } as const;
const text = z.string().min(1).max(512);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const label = text.regex(/^(?:@@?[^/\s]+)?\/\/[^\s:]*:[^\s:]+$/);
export const BuildTargetSchema = z.object({
  label, kind: z.enum(["rule", "source", "generated", "package-group", "environment-group", "unresolved"]),
  ruleClass: text.optional(),
  /** Null for external labels; never map them into the registered filesystem. */
  path: z.string().max(4096).refine((p) => isRepositoryPath(p, true)).nullable(),
  buildFile: z.string().max(4096).refine((p) => isRepositoryPath(p)).optional(),
}).strict();
export const BuildGraphDataSchema = z.object({
  repositoryId: text, worldId: text, inputDigest: digest, observedAt: z.string().datetime(),
  command: text, targets: z.array(BuildTargetSchema).max(BUILD_GRAPH_LIMITS.targets),
  edges: z.array(z.object({ from: label, to: label }).strict()).max(BUILD_GRAPH_LIMITS.edges),
  complete: z.boolean(), coverage: text,
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.targets.map((target) => target.label));
  if (ids.size !== value.targets.length || value.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to)) ||
      new Set(value.edges.map((edge) => JSON.stringify([edge.from, edge.to]))).size !== value.edges.length)
    ctx.addIssue({ code: "custom", message: "Graph requires unique targets and unique non-dangling edges" });
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BUILD_GRAPH_LIMITS.bytes)
    ctx.addIssue({ code: "custom", message: "Build graph exceeds its byte limit" });
});
export const BuildGraphObservationSchema = z.object({
  repositoryId: text, worldId: text, generation: z.number().int().nonnegative(),
  status: z.enum(["unavailable", "refreshing", "current", "stale", "error"]),
  message: text, loadingDependencies: z.boolean().optional(), graph: BuildGraphDataSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === "current" && !value.graph || value.graph &&
      (value.graph.repositoryId !== value.repositoryId || value.graph.worldId !== value.worldId))
    ctx.addIssue({ code: "custom", message: "Observation graph must match its repository/world authority" });
});
export const BuildGraphRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: text, type: z.literal("buildGraph.observe"),
  repositoryId: text, worldId: text, refresh: z.boolean(), cancel: z.boolean().optional(),
}).strict().refine((value) => !(value.refresh && value.cancel), "Cannot refresh and cancel together");
export type BuildTarget = z.infer<typeof BuildTargetSchema>;
export type BuildGraphData = z.infer<typeof BuildGraphDataSchema>;
export type BuildGraphObservation = z.infer<typeof BuildGraphObservationSchema>;
