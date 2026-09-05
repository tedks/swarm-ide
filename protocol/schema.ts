import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export const RevisionKindSchema = z.enum(["working", "built", "deployed"]);
export type RevisionKind = z.infer<typeof RevisionKindSchema>;

export const ReconciliationStatusSchema = z.enum([
  "gray",
  "yellow",
  "green",
  "red",
]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

export const FocusRefSchema = z.object({
  worldId: z.string().min(1),
  revisionKind: RevisionKindSchema,
  revisionId: z.string().min(1),
  domain: z.enum(["repo", "service", "symbol", "design"]),
  key: z.string().min(1),
  path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  range: z
    .object({
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
    })
    .refine((range) => range.endLine >= range.startLine, {
      message: "endLine must not precede startLine",
    })
    .optional(),
});
export type FocusRef = z.infer<typeof FocusRefSchema>;

export const ProvenanceSchema = z.object({
  sourceKind: z.enum(["repo", "build", "runtime", "mock"]),
  uri: z.string().min(1),
  version: z.string().min(1),
  observedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.string().min(1),
  status: ReconciliationStatusSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  focus: FocusRefSchema,
  detail: z.string().optional(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().optional(),
  status: ReconciliationStatusSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphSliceSchema = z.object({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  topologyId: z.string().min(1),
  title: z.string().min(1),
  scope: z.string().min(1),
  zoomBand: z.enum(["overview", "service", "component", "file", "symbol"]),
  epoch: z.number().int().nonnegative(),
  reconciliation: ReconciliationStatusSchema,
  inputFingerprint: z.string().min(1),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  provenance: z.array(ProvenanceSchema).min(1),
});
export type GraphSlice = z.infer<typeof GraphSliceSchema>;

export const NavigationMappingSchema = z.object({
  from: FocusRefSchema,
  targetTopology: z.string().min(1),
  candidates: z.array(
    z.object({
      focus: FocusRefSchema,
      nodeId: z.string().min(1),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1),
    }),
  ),
  ambiguous: z.boolean(),
});
export type NavigationMapping = z.infer<typeof NavigationMappingSchema>;

export const WidgetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["metric", "list", "code", "status", "action"]),
  priority: z.number().int(),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  unit: z.string().optional(),
  provenance: ProvenanceSchema,
});
export type Widget = z.infer<typeof WidgetSchema>;

export const JobSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["build", "test", "extract", "agent"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  progress: z.number().min(0).max(1),
  resources: z.object({
    cpuPercent: z.number().min(0),
    memoryMiB: z.number().min(0),
  }),
  message: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const ActivitySchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  kind: z.enum(["diff", "build", "agent", "system"]),
  summary: z.string().min(1),
  status: ReconciliationStatusSchema,
});
export type Activity = z.infer<typeof ActivitySchema>;

export const WorkspaceSnapshotSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  project: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  world: z.object({ id: z.string().min(1), label: z.string().min(1) }),
  revisions: z.object({
    working: z.object({ id: z.string(), fingerprint: z.string() }),
    built: z.object({ id: z.string(), sourceFingerprint: z.string() }),
    deployed: z.object({ id: z.string(), buildId: z.string(), environment: z.string() }),
  }),
  focus: FocusRefSchema,
  graphs: z.array(GraphSliceSchema).min(1),
  mappings: z.array(NavigationMappingSchema),
  widgets: z.array(WidgetSchema),
  jobs: z.array(JobSchema),
  activity: z.array(ActivitySchema),
  reconciliation: z.object({
    epoch: z.number().int().nonnegative(),
    status: ReconciliationStatusSchema,
    inputFingerprint: z.string().min(1),
    lastConsistentFingerprint: z.string().min(1),
    message: z.string().min(1),
  }),
}).superRefine((snapshot, context) => {
  if (
    snapshot.focus.revisionKind === "working" &&
    snapshot.focus.revisionId !== snapshot.revisions.working.id
  ) {
    context.addIssue({
      code: "custom",
      path: ["focus", "revisionId"],
      message: "working focus must identify the current working revision",
    });
  }

  const topologyIds = new Set<string>();
  for (const [graphIndex, graph] of snapshot.graphs.entries()) {
    if (topologyIds.has(graph.topologyId)) {
      context.addIssue({ code: "custom", path: ["graphs", graphIndex, "topologyId"], message: "topology ids must be unique" });
    }
    topologyIds.add(graph.topologyId);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const [edgeIndex, edge] of graph.edges.entries()) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        context.addIssue({ code: "custom", path: ["graphs", graphIndex, "edges", edgeIndex], message: "edge endpoints must exist in the same bounded slice" });
      }
    }
  }

  if (snapshot.reconciliation.status === "green") {
    const fingerprint = snapshot.revisions.working.fingerprint;
    if (
      snapshot.reconciliation.inputFingerprint !== fingerprint ||
      snapshot.revisions.built.sourceFingerprint !== fingerprint
    ) {
      context.addIssue({ code: "custom", path: ["reconciliation"], message: "green publication must match its exact working fingerprint" });
    }
    for (const [graphIndex, graph] of snapshot.graphs.entries()) {
      if (graph.reconciliation === "green" && graph.inputFingerprint !== fingerprint) {
        context.addIssue({ code: "custom", path: ["graphs", graphIndex, "inputFingerprint"], message: "green graph must match the working fingerprint" });
      }
    }
  }
});
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;

const RequestBaseSchema = z.object({
  requestId: z.string().min(1),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

export const CoreRequestSchema = z.discriminatedUnion("type", [
  RequestBaseSchema.extend({ type: z.literal("workspace.snapshot") }),
  RequestBaseSchema.extend({
    type: z.literal("focus.select"),
    focus: FocusRefSchema,
  }),
  RequestBaseSchema.extend({
    type: z.literal("reconciliation.start"),
    mode: z.enum(["success", "failure", "stale"]),
  }),
  RequestBaseSchema.extend({ type: z.literal("fixture.reset") }),
]);
export type CoreRequest = z.infer<typeof CoreRequestSchema>;

export const CoreResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: z.string().min(1),
    ok: z.literal(true),
    snapshot: WorkspaceSnapshotSchema,
  }),
  z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: z.string().min(1),
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);
export type CoreResponse = z.infer<typeof CoreResponseSchema>;

export const CoreEventSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.enum([
    "workspace.changed",
    "reconciliation.changed",
    "graph.published",
    "job.changed",
  ]),
  sequence: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  snapshot: WorkspaceSnapshotSchema,
});
export type CoreEvent = z.infer<typeof CoreEventSchema>;

export function parseCoreRequest(input: unknown): CoreRequest {
  return CoreRequestSchema.parse(input);
}

export function parseCoreResponse(input: unknown): CoreResponse {
  return CoreResponseSchema.parse(input);
}

export function parseCoreEvent(input: unknown): CoreEvent {
  return CoreEventSchema.parse(input);
}
