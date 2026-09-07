import { z } from "zod";
import { PlanReadRequestSchema, PlanReadResultSchema } from "./plans";
import { sameAgentTaskReference } from "./agent-task";
import { PROTOCOL_VERSION, FocusRefSchema } from "./common";
import { AgentRequestSchema, AgentResultSchema, AgentFocusSchema, AgentLinksSchema, AgentBoundaryErrorSchema, type AgentRequest } from "./agents";
import { TaskRequestSchema, TaskResultSchema, TaskBoundaryErrorSchema, parseTaskResultForRequest, type TaskRequest } from "./tasks";
import { RepositoryObservationSchema, RepositoryPathSchema, RepositoryRequestSchema, RepositoryResultSchema, parseRepositoryResultForRequest } from "./repository";
import { RepositorySearchRequestSchema, RepositorySearchResultSchema, parseRepositorySearchResult } from "./repository-search";
import { BuildGraphRequestSchema, BuildGraphObservationSchema } from "./build-graph";
import { ServiceContextObservationSchema } from "./context";
export { PROTOCOL_VERSION, FocusRefSchema, RevisionKindSchema, type FocusRef, type RevisionKind } from "./common";

export const MAX_EDITABLE_FILE_BYTES = 2 * 1024 * 1024;

export const ReconciliationStatusSchema = z.enum([
  "gray",
  "yellow",
  "green",
  "red",
]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

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
  nodes: z.array(GraphNodeSchema).max(500),
  edges: z.array(GraphEdgeSchema).max(2_000),
  provenance: z.array(ProvenanceSchema).min(1).max(16),
  directory: RepositoryObservationSchema.optional(),
}).superRefine((graph, context) => {
  if (graph.directory && (graph.topologyId !== "repo" || graph.reconciliation !== "gray" ||
      !graph.provenance.some((item) => item.sourceKind === "repo" && item.version === graph.directory!.observationId)))
    context.addIssue({ code: "custom", message: "Directory slices require neutral repository observation provenance" });
  if (graph.directory && (graph.nodes.length !== graph.directory.entries.length + 1 ||
      graph.nodes.some((node) => node.status !== "gray") || graph.edges.some((edge) => edge.status !== "gray" || edge.kind !== "contains") ||
      graph.directory.entries.some((entry) => !graph.nodes.some((node) => node.id === entry.id && node.kind === entry.kind && (node.focus.path ?? null) === entry.path))))
    context.addIssue({ code: "custom", message: "Directory graph nodes must match their neutral captured page" });
});
export type GraphSlice = z.infer<typeof GraphSliceSchema>;

export const NavigationMappingSchema = z.object({
  from: FocusRefSchema,
  targetTopology: z.string().min(1),
  candidates: z.array(
    z.object({
      focus: FocusRefSchema,
      nodeId: z.string().min(1).optional(),
      revealPath: RepositoryPathSchema.optional(),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1),
    }).strict().superRefine((candidate, context) => {
      if (Boolean(candidate.nodeId) === Boolean(candidate.revealPath))
        context.addIssue({ code: "custom", message: "Exactly one loaded node or reveal recipe is required" });
      if (candidate.revealPath && (candidate.focus.domain !== "repo" || candidate.focus.path !== candidate.revealPath || candidate.focus.key !== `file:${candidate.revealPath}`))
        context.addIssue({ code: "custom", message: "Reveal recipes require the same canonical repository file focus" });
    }),
  ).max(32),
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
    // Registration coordinates identify a world, not observed content. Existing
    // snapshots default to observed; empty never-observed fingerprints do not.
    working: z.object({ id: z.string(), fingerprint: z.string(), evidence: z.enum(["observed", "unavailable"]).default("observed") }),
    built: z.object({ id: z.string(), sourceFingerprint: z.string() }),
    deployed: z.object({ id: z.string(), buildId: z.string(), environment: z.string() }),
  }),
  focus: FocusRefSchema,
  graphs: z.array(GraphSliceSchema).min(1).max(8),
  mappings: z.array(NavigationMappingSchema).max(2_000),
  widgets: z.array(WidgetSchema).max(64),
  serviceContext: ServiceContextObservationSchema.optional(),
  jobs: z.array(JobSchema).max(128),
  activity: z.array(ActivitySchema).max(256),
  reconciliation: z.object({
    epoch: z.number().int().nonnegative(),
    status: ReconciliationStatusSchema,
    inputFingerprint: z.string().min(1),
    lastConsistentFingerprint: z.string().min(1),
    message: z.string().min(1),
  }),
}).superRefine((snapshot, context) => {
  const service = snapshot.serviceContext;
  if (service && (service.repositoryId !== snapshot.project.id || service.worldId !== snapshot.world.id))
    context.addIssue({ code: "custom", path: ["serviceContext"], message: "Context must identify this repository and world" });
  if (service?.status === "observed" && (service.buildId !== snapshot.revisions.built.id || service.sourceFingerprint !== snapshot.revisions.built.sourceFingerprint ||
      !snapshot.graphs.some((graph) => graph.topologyId === "service" && graph.nodes.some((node) => node.id === service.service.id && node.focus.domain === "service") && graph.inputFingerprint === service.sourceFingerprint && graph.provenance.some((item) => item.sourceKind === "build" && item.version === service.buildId && item.uri === service.artifactUri))))
    context.addIssue({ code: "custom", path: ["serviceContext"], message: "Service context must belong to the atomically published build and service graph" });
  const working = snapshot.revisions.working;
  if ((!working.fingerprint && (working.evidence !== "unavailable" || !working.id.startsWith("unobserved:"))) ||
      (working.id.startsWith("unobserved:") && (working.fingerprint !== "" || working.evidence !== "unavailable" ||
        snapshot.reconciliation.lastConsistentFingerprint !== "unobserved")) ||
      (working.evidence === "unavailable" && (snapshot.reconciliation.status === "green" || snapshot.graphs.some((graph) => graph.reconciliation === "green"))))
    context.addIssue({ code: "custom", path: ["revisions", "working"], message: "Unavailable working evidence cannot confer content or green authority" });
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
    if (nodeIds.size !== graph.nodes.length) {
      context.addIssue({ code: "custom", path: ["graphs", graphIndex, "nodes"], message: "node ids must be unique within a topology" });
    }
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    if (edgeIds.size !== graph.edges.length) {
      context.addIssue({ code: "custom", path: ["graphs", graphIndex, "edges"], message: "edge ids must be unique within a topology" });
    }
    for (const [edgeIndex, edge] of graph.edges.entries()) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        context.addIssue({ code: "custom", path: ["graphs", graphIndex, "edges", edgeIndex], message: "edge endpoints must exist in the same bounded slice" });
      }
    }
  }

  const graphsById = new Map(snapshot.graphs.map((graph) => [graph.topologyId, graph]));
  for (const [mappingIndex, mapping] of snapshot.mappings.entries()) {
    const target = graphsById.get(mapping.targetTopology);
    if (!target) {
      context.addIssue({ code: "custom", path: ["mappings", mappingIndex, "targetTopology"], message: "mapping target topology must exist" });
      continue;
    }
    const targetNodes = new Set(target.nodes.map((node) => node.id));
    for (const [candidateIndex, candidate] of mapping.candidates.entries()) {
      if (candidate.nodeId ? !targetNodes.has(candidate.nodeId) : mapping.targetTopology !== "repo") {
        context.addIssue({ code: "custom", path: ["mappings", mappingIndex, "candidates", candidateIndex, "nodeId"], message: "mapping candidate must reference a node in its target topology" });
      }
    }
    if (mapping.ambiguous !== (mapping.candidates.length > 1)) {
      context.addIssue({ code: "custom", path: ["mappings", mappingIndex, "ambiguous"], message: "ambiguity must reflect whether multiple candidates exist" });
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
      const acceptedVersions = new Set([
        fingerprint,
        snapshot.revisions.built.id,
        snapshot.revisions.deployed.id,
      ]);
      if (!graph.directory && !graph.provenance.some((item) => acceptedVersions.has(item.version))) {
        context.addIssue({ code: "custom", path: ["graphs", graphIndex, "provenance"], message: "green graph provenance must identify the working, built, or deployed revision" });
      }
    }
    for (const [widgetIndex, widget] of snapshot.widgets.entries()) {
      const expectedVersion = {
        repo: snapshot.revisions.working.id,
        build: snapshot.revisions.built.id,
        runtime: snapshot.revisions.deployed.id,
        mock: widget.provenance.version,
      }[widget.provenance.sourceKind];
      if (widget.provenance.version !== expectedVersion) {
        context.addIssue({ code: "custom", path: ["widgets", widgetIndex, "provenance", "version"], message: "green widget provenance must match its source revision" });
      }
    }
  }
});
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;

const RequestBaseSchema = z.object({
  requestId: z.string().min(1),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

const WorkspaceRequestSchema = z.discriminatedUnion("type", [
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
  RequestBaseSchema.extend({
    type: z.literal("file.read"),
    path: z.string().min(1).max(4_096),
  }),
  RequestBaseSchema.extend({
    type: z.literal("file.write"),
    path: z.string().min(1).max(4_096),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    content: z.string().max(MAX_EDITABLE_FILE_BYTES),
  }),
  RequestBaseSchema.extend({
    type: z.literal("file.watch"),
    path: z.string().min(1).max(4_096),
  }),
  RequestBaseSchema.extend({
    type: z.literal("file.unwatch"),
    path: z.string().min(1).max(4_096),
  }),
]);
export const CoreRequestSchema = z.union([WorkspaceRequestSchema, AgentRequestSchema, TaskRequestSchema, RepositoryRequestSchema, RepositorySearchRequestSchema, PlanReadRequestSchema, BuildGraphRequestSchema]);
export type CoreRequest = z.infer<typeof CoreRequestSchema>;

export const FileResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("read"),
    path: z.string().min(1),
    content: z.string(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative().max(MAX_EDITABLE_FILE_BYTES),
  }),
  z.object({
    kind: z.literal("write"),
    path: z.string().min(1),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    workingFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    fingerprintError: z.string().min(1).max(512).optional(),
  }).superRefine((result, context) => {
    if ((result.workingFingerprint === null) !== Boolean(result.fingerprintError)) {
      context.addIssue({ code: "custom", path: ["workingFingerprint"], message: "a missing post-save fingerprint requires an explicit error" });
    }
  }),
]);
export type FileResult = z.infer<typeof FileResultSchema>;

export const CoreResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: z.string().min(1),
    ok: z.literal(true),
    sequence: z.number().int().nonnegative(),
    snapshot: WorkspaceSnapshotSchema,
    file: FileResultSchema.optional(),
    agent: AgentResultSchema.optional(),
    task: TaskResultSchema.optional(),
    repo: RepositoryResultSchema.optional(),
    search: RepositorySearchResultSchema.optional(),
    plans: PlanReadResultSchema.optional(),
    buildGraph: BuildGraphObservationSchema.optional(),
  }).strict(),
  z.object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: z.string().min(1),
    ok: z.literal(false),
    // Do not strip invalid fields before request-specific agent validation.
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  }).strict(),
]);
export type CoreResponse = z.infer<typeof CoreResponseSchema>;

export const CoreEventSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.enum([
    "workspace.changed",
    "workspace.reset",
    "reconciliation.changed",
    "graph.published",
    "job.changed",
  ]),
  sequence: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  snapshot: WorkspaceSnapshotSchema,
}).superRefine((event, context) => {
  if (event.epoch !== event.snapshot.reconciliation.epoch) {
    context.addIssue({ code: "custom", path: ["epoch"], message: "event epoch must match its snapshot epoch" });
  }
});
export type CoreEvent = z.infer<typeof CoreEventSchema>;

export const FileEventSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("file.changed"),
  sequence: z.number().int().positive(),
  emittedAt: z.string().datetime(),
  path: z.string().min(1).max(4_096),
  revision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  change: z.enum(["modified", "deleted", "error"]),
  message: z.string().min(1).max(512).optional(),
});
export type FileEvent = z.infer<typeof FileEventSchema>;

export function parseCoreRequest(input: unknown): CoreRequest {
  return CoreRequestSchema.parse(input);
}

export function parseCoreResponse(input: unknown): CoreResponse {
  return CoreResponseSchema.parse(input);
}

/** Successful agent replies must identify the exact command, never empty success. */
const agentResultKind = {
  "agent.prepare": "prepare", "agent.launch": "launch", "agent.steer": "steer",
  "agent.cancel": "cancel", "agent.snapshot": "snapshot", "agent.read": "read",
} as const;
export function parseCoreResponseForRequest(input: unknown, request: CoreRequest): CoreResponse {
  const response = parseCoreResponse(input);
  if (response.requestId !== request.requestId) throw new Error("Response request ID mismatch");
  if (request.type === "plans.read") {
    if (response.ok && (!response.plans || response.file || response.agent || response.task || response.repo || response.search || response.buildGraph ||
      response.snapshot.world.id !== request.worldId || response.snapshot.project.id !== request.repositoryId))
      throw new Error("Unexpected plan response authority or identity");
  } else if (response.ok && response.plans) throw new Error("Plan result supplied for a different command");
  if (request.type === "buildGraph.observe") {
    if (response.ok && (!response.buildGraph || response.file || response.agent || response.task || response.repo || response.search || response.plans ||
        response.snapshot.project.id !== request.repositoryId || response.snapshot.world.id !== request.worldId ||
        response.buildGraph.repositoryId !== request.repositoryId || response.buildGraph.worldId !== request.worldId))
      throw new Error("Build graph response authority mismatch");
  } else if (response.ok && response.buildGraph) throw new Error("Build graph supplied for a different command");
  if (request.type === "repo.search") {
    if (response.ok) {
      if (response.file || response.agent || response.task || response.repo || response.snapshot.project.id !== request.repositoryId)
        throw new Error("Unexpected search response authority");
      parseRepositorySearchResult(response.search, request);
    }
  } else if (response.ok && response.search) throw new Error("Search result supplied for a different command");
  if (request.type === "repo.list") {
    if (response.ok) {
      if (response.file || response.agent || response.task) throw new Error("Unexpected repository response authority");
      parseRepositoryResultForRequest(response.repo, request);
    }
  } else if (response.ok && response.repo) throw new Error("Repository result supplied for a different command");
  if (isTaskRequest(request)) {
    if (!response.ok) TaskBoundaryErrorSchema.parse(response.error);
    else {
      if (response.file || response.agent || response.snapshot.world.id !== request.worldId) throw new Error("Unexpected task response authority");
      const task = parseTaskResultForRequest(response.task, request);
      const repositoryId = task.kind === "snapshot" ? task.observation.repositoryId : task.repositoryId;
      if (repositoryId !== response.snapshot.project.id) throw new Error("Task repository identity mismatch");
    }
  } else if (response.ok && response.task) throw new Error("Task result supplied for a different command");
  if (!response.ok && isAgentRequest(request)) AgentBoundaryErrorSchema.parse(response.error);
  if (response.ok && isAgentRequest(request)) {
    if (!response.agent || response.agent.kind !== agentResultKind[request.type]) {
      throw new Error("Missing or mismatched agent result");
    }
    const result = response.agent;
    if ((request.type === "agent.prepare" && result.kind === "prepare" &&
         (request.worldId !== result.draft.launchContext.worldId ||
          request.taskText !== result.draft.launchContext.taskText ||
          request.model !== result.draft.launchContext.requested.model ||
          request.effort !== result.draft.launchContext.requested.effort ||
          JSON.stringify(AgentFocusSchema.parse(request.focus)) !== JSON.stringify(result.draft.launchContext.focus) ||
          JSON.stringify(AgentLinksSchema.parse(request.links)) !== JSON.stringify(result.draft.launchContext.links) ||
          !sameAgentTaskReference(request.taskReference, result.draft.launchContext.repositoryTask?.reference))) ||
        (request.type === "agent.launch" && result.kind === "launch" &&
         (request.runId !== result.receipt.runId || request.contextHash !== result.receipt.contextHash)) ||
        (request.type === "agent.steer" && result.kind === "steer" &&
         (request.runId !== result.runId || request.requestId !== result.receipt.requestId ||
          request.expectedTurnId !== result.receipt.expectedTurnId || request.text !== result.receipt.text)) ||
        (request.type === "agent.cancel" && result.kind === "cancel" &&
         (request.runId !== result.receipt.runId || request.requestId !== result.receipt.requestId)) ||
        (request.type === "agent.read" && result.kind === "read" &&
         (request.runId !== result.run.runId || result.page.nextCursor < request.afterRecord ||
          result.page.records.some((record) => record.recordId <= request.afterRecord)))) {
      throw new Error("Agent result does not match the command identity or cursor");
    }
  }
  return response;
}

export function isAgentRequest(request: CoreRequest): request is AgentRequest {
  return request.type.startsWith("agent.");
}

export function isTaskRequest(request: CoreRequest): request is TaskRequest {
  return request.type === "tasks.snapshot" || request.type === "tasks.read";
}

export function uncertainMutationCode(request: CoreRequest): "WRITE_OUTCOME_UNKNOWN" | "AGENT_OUTCOME_UNKNOWN" | null {
  if (request.type === "file.write") return "WRITE_OUTCOME_UNKNOWN";
  return ["agent.launch", "agent.steer", "agent.cancel"].includes(request.type)
    ? "AGENT_OUTCOME_UNKNOWN" : null;
}

export function parseCoreEvent(input: unknown): CoreEvent {
  return CoreEventSchema.parse(input);
}

export function parseFileEvent(input: unknown): FileEvent {
  return FileEventSchema.parse(input);
}
