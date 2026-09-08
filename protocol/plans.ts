import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { isTaskSourcePath, TASK_LIMITS, TaskIdSchema } from "./tasks";

/** V1 is an authored forest, not inferred architecture. References are literal
 * candidates; the contained-file broker remains authority when opening them. */
export const PLAN_INDEX_PATH = ".swarm/plans.json" as const;
export const PLAN_LIMITS = {
  indexBytes: 64 * 1024, nodes: 128, idBytes: 128, titleBytes: 256,
  taskIdsPerNode: 32, contextRefsPerNode: 16,
  pathBytes: TASK_LIMITS.pathBytes, noteBytes: 512,
} as const;

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value).byteLength;
const text = (maximum: number, minimum = 0) => z.string().min(minimum).max(maximum)
  .refine((value) => bytes(value) <= maximum, "Plan UTF-8 byte limit exceeded")
  .refine((value) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), "Invalid Unicode plan text");
const id = z.string().min(1).max(PLAN_LIMITS.idBytes).regex(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/);
const path = text(PLAN_LIMITS.pathBytes, 1).refine(isTaskSourcePath, "A canonical repository-relative path is required");
// The whole index is byte-bounded. A large but valid component must not make
// the entire design unavailable; reference disclosure is a presentation choice.
const paths = z.array(path);
export const PlanBuildLabelSchema = z.string().max(256).regex(/^\/\/(?:[A-Za-z0-9_.+-]+\/)*[A-Za-z0-9_.+-]*:[A-Za-z0-9_.+/-]+$/)
  .refine((value) => !value.split(/[/:]/).some((part) => part === "." || part === ".."), "Canonical local Bazel label required");
const PlanNodeSchema = z.object({
  id, kind: z.enum(["plan", "component"]),
  title: text(PLAN_LIMITS.titleBytes, 1).refine((value) => value.trim().length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value), "Invalid plan title"),
  parentId: id.nullable(), docs: paths, sourcePaths: paths,
  taskIds: z.array(TaskIdSchema).max(PLAN_LIMITS.taskIdsPerNode),
  contextRefs: z.array(z.object({
    kind: z.enum(["doctrine", "contract", "lesson"]), path,
    note: text(PLAN_LIMITS.noteBytes).nullable(),
  }).strict()).max(PLAN_LIMITS.contextRefsPerNode),
  design: z.object({
    summary: text(2048, 1), state: z.enum(["implemented", "planned"]),
    constraints: z.array(text(512, 1)).optional(),
    connections: z.array(z.object({
      targetId: id, label: text(128, 1),
      kind: z.enum(["request", "result", "data", "navigation"]).optional(),
      detail: text(1024, 1).optional(),
    }).strict()).max(16),
    buildTargets: z.array(z.object({
      label: PlanBuildLabelSchema, role: text(256, 1),
      dependencies: z.array(z.object({ label: PlanBuildLabelSchema, relation: z.enum(["srcs", "data", "tools", "actual", "tests"]) }).strict()).max(32),
    }).strict()).max(16),
  }).strict().optional(),
}).strict();
export type PlanNode = z.infer<typeof PlanNodeSchema>;

export const PlanIndexSchema = z.object({
  version: z.literal(1), nodes: z.array(PlanNodeSchema).max(PLAN_LIMITS.nodes),
}).strict().superRefine((index, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (bytes(JSON.stringify(index)) > PLAN_LIMITS.indexBytes) fail("Plan index byte limit exceeded");
  const nodes = new Map(index.nodes.map((node) => [node.id, node]));
  if (nodes.size !== index.nodes.length) { fail("Plan identities must be unique"); return; }
  for (const node of index.nodes) {
    if (node.parentId !== null && !nodes.has(node.parentId)) { fail("Plan parent must exist in the index"); return; }
    if (node.design?.connections.some((edge) => edge.targetId === node.id || !nodes.has(edge.targetId))) {
      fail("Design connections must reference another existing component"); return;
    }
    if (node.design && new Set(node.design.buildTargets.map((target) => target.label)).size !== node.design.buildTargets.length) {
      fail("Design build targets must be unique per component"); return;
    }
  }
  // Bounded iterative ancestor walks avoid recursion, including at the maximum depth.
  for (const node of index.nodes) {
    const seen = new Set<string>();
    let current: PlanNode | undefined = node;
    while (current) {
      if (seen.has(current.id)) { fail("Plan hierarchy must be an acyclic rooted forest"); return; }
      seen.add(current.id);
      current = current.parentId === null ? undefined : nodes.get(current.parentId);
    }
  }
});
export type PlanIndex = z.infer<typeof PlanIndexSchema>;

export const PLAN_READ_MESSAGES = {
  PLAN_INDEX_UNAVAILABLE: "The plan index is unavailable. Check that .swarm/plans.json is a readable canonical repository file.",
  PLAN_INDEX_MALFORMED: "The plan index is not a valid version 1 authored forest.",
  PLAN_INDEX_LIMIT_EXCEEDED: "The plan index exceeds the 64 KiB file limit.",
} as const;
export const PlanReadResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("observed"), index: PlanIndexSchema,
    revision: z.string().regex(/^[a-f0-9]{64}$/), observedAt: z.string().max(32).datetime(),
  }).strict(),
  z.object({
    status: z.literal("unavailable"), code: z.enum(["PLAN_INDEX_UNAVAILABLE", "PLAN_INDEX_MALFORMED", "PLAN_INDEX_LIMIT_EXCEEDED"]),
    message: z.enum([PLAN_READ_MESSAGES.PLAN_INDEX_UNAVAILABLE, PLAN_READ_MESSAGES.PLAN_INDEX_MALFORMED, PLAN_READ_MESSAGES.PLAN_INDEX_LIMIT_EXCEEDED]),
    missing: z.literal(true).optional(),
  }).strict(),
]).refine((result) => result.status === "observed" || (result.message === PLAN_READ_MESSAGES[result.code] && (!result.missing || result.code === "PLAN_INDEX_UNAVAILABLE")), "Plan diagnostic must match its code");
export type PlanReadResult = z.infer<typeof PlanReadResultSchema>;

export const PlanReadRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), type: z.literal("plans.read"),
  requestId: z.string().min(1).max(256), worldId: z.string().min(1).max(256), repositoryId: z.string().min(1).max(256),
}).strict();
