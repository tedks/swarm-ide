/** Explicit synthetic TEST DATA. No production provider imports this world.
 * Reader/writer and the optional validator exercise graph identity, ambiguity,
 * delayed publication and retained failures; they describe no real project.
 */
import {
  PROTOCOL_VERSION,
  type Activity,
  type FocusRef,
  type GraphSlice,
  type NavigationMapping,
  type Provenance,
  type Widget,
  type WorkspaceSnapshot,
} from "../protocol/schema";

const observedAt = "2026-09-05T06:00:00.000Z";

function observedAtOffset(seconds: number): string {
  return new Date(Date.parse(observedAt) + seconds * 1_000).toISOString();
}

function repoProvenance(version: string): Provenance {
  return { sourceKind: "repo", uri: "fixture://source/BUILD.bazel", version, observedAt };
}

function buildProvenance(version: string): Provenance {
  return { sourceKind: "build", uri: "fixture://build/service-topology.json", version, observedAt };
}

const runtimeProvenance: Provenance = {
  sourceKind: "runtime",
  uri: "fixture://deployment/test-version",
  version: "deploy:local-084",
  observedAt,
};

function focus(
  domain: FocusRef["domain"],
  key: string,
  path?: string,
  symbol?: string,
): FocusRef {
  return {
    worldId: "world:working",
    revisionKind: "working",
    revisionId: "work:a1",
    domain,
    key,
    ...(path ? { path } : {}),
    ...(symbol ? { symbol } : {}),
  };
}

function revisionId(kind: "work" | "build", epoch: number): string {
  const generation = epoch <= 26 ? String.fromCharCode(96 + epoch) : `e${epoch}`;
  return `${kind}:${generation}${epoch}`;
}

export const readerServiceFocus = focus("service", "service:reader");
export const writerServiceFocus = focus("service", "service:writer");
export const validatorServiceFocus = focus("service", "service:validator");
export const readerFileFocus = focus(
  "repo",
  "file:services/reader/reader.ts",
  "services/reader/reader.ts",
);
export const writerFileFocus = focus(
  "repo",
  "file:services/writer/writer.ts",
  "services/writer/writer.ts",
);
export const writeFocus = focus(
  "symbol",
  "symbol:writer.write",
  "services/writer/writer.ts",
  "write",
);

function repoGraph(
  status: GraphSlice["reconciliation"],
  epoch: number,
  inputFingerprint: string,
): GraphSlice {
  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "repo",
    title: "Repository topology",
    scope: "//services/...",
    zoomBand: "file",
    epoch,
    reconciliation: status,
    inputFingerprint,
    provenance: [repoProvenance(inputFingerprint)],
    nodes: [
      {
        id: "repo-root",
        label: "Test fixture",
        kind: "repository",
        status: "green",
        position: { x: 0, y: 90 },
        focus: focus("repo", "repo:test-fixture", "."),
        detail: "synthetic repository; test data only",
      },
      {
        id: "repo-services",
        label: "services/",
        kind: "directory",
        status,
        position: { x: 230, y: 90 },
        focus: focus("repo", "dir:services", "services"),
      },
      {
        id: "repo-reader",
        label: "reader.ts",
        kind: "file",
        status,
        position: { x: 470, y: 5 },
        focus: readerFileFocus,
        detail: "+18 −3 · agent-07",
      },
      {
        id: "repo-writer",
        label: "writer.ts",
        kind: "file",
        status: "green",
        position: { x: 470, y: 175 },
        focus: writerFileFocus,
        detail: "synthetic unchanged source",
      },
    ],
    edges: [
      { id: "repo-e1", source: "repo-root", target: "repo-services", kind: "contains", status: "green" },
      { id: "repo-e2", source: "repo-services", target: "repo-reader", kind: "contains", status },
      { id: "repo-e3", source: "repo-services", target: "repo-writer", kind: "contains", status: "green" },
    ],
  };
}

function serviceGraph(
  status: GraphSlice["reconciliation"],
  epoch: number,
  includeValidator: boolean,
  inputFingerprint: string,
  buildId: string,
): GraphSlice {
  const nodes: GraphSlice["nodes"] = [
    {
      id: "service-reader",
      label: "Reader",
      kind: "service",
      status,
      position: { x: 250, y: 100 },
      focus: readerServiceFocus,
      detail: status === "yellow" ? "synthetic pending source changes" : "synthetic test service",
    },
    {
      id: "service-writer",
      label: "Writer",
      kind: "service",
      status: "green",
      position: { x: 520, y: 100 },
      focus: writerServiceFocus,
      detail: "synthetic test service",
    },
  ];
  const edges: GraphSlice["edges"] = [
    {
      id: "service-e1",
      source: "service-reader",
      target: "service-writer",
      kind: "rpc",
      label: "Write (test relationship)",
      status: "green",
    },
  ];

  if (includeValidator) {
    nodes.push({
      id: "service-validator",
      label: "Validator",
      kind: "service",
      status: "green",
      position: { x: 390, y: 5 },
      focus: validatorServiceFocus,
      detail: `new · ${buildId}`,
    });
  }

  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "service",
    title: "Synthetic service graph",
    scope: "test fixture only",
    zoomBand: "service",
    epoch,
    reconciliation: status,
    inputFingerprint,
    provenance: [buildProvenance(buildId)],
    nodes,
    edges,
  };
}

export const mappings: NavigationMapping[] = [
  {
    from: readerFileFocus,
    targetTopology: "service",
    ambiguous: false,
    candidates: [
      {
        focus: readerServiceFocus,
        nodeId: "service-reader",
        confidence: 1,
        reason: "declared implementation path",
      },
    ],
  },
  {
    from: writerFileFocus,
    targetTopology: "service",
    ambiguous: true,
    candidates: [
      {
        focus: writerServiceFocus,
        nodeId: "service-writer",
        confidence: 0.9,
        reason: "primary owning target",
      },
      {
        focus: readerServiceFocus,
        nodeId: "service-reader",
        confidence: 0.62,
        reason: "generated client is compiled into reader",
      },
    ],
  },
  {
    from: readerServiceFocus,
    targetTopology: "repo",
    ambiguous: false,
    candidates: [
      {
        focus: readerFileFocus,
        nodeId: "repo-reader",
        confidence: 1,
        reason: "service implementation glob",
      },
    ],
  },
  {
    from: writerServiceFocus,
    targetTopology: "repo",
    ambiguous: false,
    candidates: [
      {
        focus: writerFileFocus,
        nodeId: "repo-writer",
        confidence: 1,
        reason: "service implementation glob",
      },
    ],
  },
];

function widgetsFor(selected: FocusRef): Widget[] {
  const common = {
    priority: 10,
    provenance: repoProvenance(selected.revisionId),
  };
  if (selected.key.includes("writer") || selected.key.includes("write")) {
    return [
      { ...common, id: "fixture-metric", title: "Synthetic test metric", kind: "metric", value: "4", unit: "test units", provenance: runtimeProvenance },
      { ...common, id: "callers", title: "Synthetic test caller", kind: "list", value: ["Reader.run"] },
      { ...common, id: "contract", title: "Test interface", kind: "code", value: "Write(Value) → Result" },
    ];
  }
  return [
    { ...common, id: "diff", title: "Working change", kind: "status", value: "+18 −3 · reader.ts" },
    { ...common, id: "contracts", title: "Test contracts", kind: "list", value: ["Read", "Write"] },
    { ...common, id: "bugs", title: "Synthetic test issues", kind: "list", value: ["fixture-timeout", "fixture-retry"] },
    { ...common, id: "deploy", title: "Synthetic test deployment", kind: "status", value: "fixture only · no process started", provenance: runtimeProvenance },
  ];
}

function retagWorkingReferences(snapshot: WorkspaceSnapshot, revisionId: string): WorkspaceSnapshot {
  const retag = (value: FocusRef): FocusRef =>
    value.revisionKind === "working" ? { ...value, revisionId } : value;
  const retaggedFocus = retag(snapshot.focus);
  return {
    ...snapshot,
    focus: retaggedFocus,
    graphs: snapshot.graphs.map((graph) => ({
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, focus: retag(node.focus) })),
    })),
    mappings: snapshot.mappings.map((mapping) => ({
      ...mapping,
      from: retag(mapping.from),
      candidates: mapping.candidates.map((candidate) => ({
        ...candidate,
        focus: retag(candidate.focus),
      })),
    })),
    widgets: widgetsFor(retaggedFocus),
  };
}

function markGraphsPending(graphs: GraphSlice[], epoch: number): GraphSlice[] {
  const affectedNodes = new Set(["repo-services", "repo-reader", "service-reader"]);
  const affectedEdges = new Set(["repo-e2", "service-e1"]);
  return graphs.map((graph) => ({
    ...graph,
    epoch,
    reconciliation: "yellow",
    nodes: graph.nodes.map((node) => ({
      ...node,
      status: affectedNodes.has(node.id) ? "yellow" : node.status === "red" ? "green" : node.status,
      detail: node.id === "service-reader" ? "reconciling source changes" : node.detail,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      status: affectedEdges.has(edge.id) ? "yellow" : edge.status === "red" ? "green" : edge.status,
    })),
  }));
}

const baseActivity: Activity[] = [
  { id: "a1", at: observedAt, kind: "agent", summary: "agent-07 opened reader.ts", status: "yellow" },
  { id: "a2", at: observedAt, kind: "diff", summary: "+18 −3 across reader", status: "yellow" },
  { id: "a3", at: observedAt, kind: "build", summary: "//services/writer:all green", status: "green" },
];

export function initialSnapshot(selected: FocusRef = readerServiceFocus): WorkspaceSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    project: { id: "project:test-fixture", name: "Test fixture" },
    world: { id: "world:working", label: "synthetic working tree" },
    revisions: {
      working: { id: "work:a1", fingerprint: "work:a1", evidence: "observed" },
      built: { id: "build:a1", sourceFingerprint: "work:a1" },
      deployed: { id: "deploy:local-084", buildId: "build:a0", environment: "local" },
    },
    focus: selected,
    graphs: [repoGraph("green", 1, "work:a1"), serviceGraph("green", 1, false, "work:a1", "build:a1")],
    mappings,
    widgets: widgetsFor(selected),
    jobs: [],
    activity: baseActivity,
    reconciliation: {
      epoch: 1,
      status: "green",
      inputFingerprint: "work:a1",
      lastConsistentFingerprint: "work:a1",
      message: "Derived views match working source",
    },
  };
}

export function dirtySnapshot(previous: WorkspaceSnapshot): WorkspaceSnapshot {
  const epoch = previous.reconciliation.epoch + 1;
  const workingId = revisionId("work", epoch);
  return retagWorkingReferences({
    ...previous,
    revisions: {
      ...previous.revisions,
      working: { id: workingId, fingerprint: workingId, evidence: "observed" },
    },
    graphs: markGraphsPending(previous.graphs, epoch),
    jobs: [
      {
        id: `job:reconcile-${epoch}`,
        label: "bazel build //services/...",
        kind: "build",
        status: "running",
        progress: 0.08,
        resources: { cpuPercent: 24, memoryMiB: 612 },
        message: "Analyzing affected targets",
      },
    ],
    activity: [
      { id: `activity:${epoch}:start`, at: observedAtOffset(epoch), kind: "build" as const, summary: `Reconciliation started for ${workingId}`, status: "yellow" as const },
      ...previous.activity,
    ].slice(0, 32),
    reconciliation: {
      epoch,
      status: "yellow",
      inputFingerprint: workingId,
      lastConsistentFingerprint: previous.reconciliation.lastConsistentFingerprint,
      message: "Source changed; retaining the last consistent topology",
    },
  }, workingId);
}

export function progressSnapshot(previous: WorkspaceSnapshot, progress: number): WorkspaceSnapshot {
  const cpu = Math.round(32 + progress * 58);
  return {
    ...previous,
    jobs: previous.jobs.map((job) => ({
      ...job,
      progress,
      resources: { cpuPercent: cpu, memoryMiB: Math.round(640 + progress * 720) },
      message: progress < 0.7 ? "Compiling and extracting call edges" : "Publishing consistency group",
    })),
  };
}

export function successfulSnapshot(previous: WorkspaceSnapshot): WorkspaceSnapshot {
  const epoch = previous.reconciliation.epoch;
  const workingId = previous.revisions.working.fingerprint;
  const buildId = revisionId("build", epoch);
  const validatorAlreadyVisible = previous.graphs.some((graph) =>
    graph.nodes.some((node) => node.id === "service-validator"),
  );
  return retagWorkingReferences({
    ...previous,
    revisions: {
      ...previous.revisions,
      built: { id: buildId, sourceFingerprint: workingId },
    },
    graphs: [repoGraph("green", epoch, workingId), serviceGraph("green", epoch, true, workingId, buildId)],
    mappings: [
      ...mappings,
      {
        from: validatorServiceFocus,
        targetTopology: "repo",
        ambiguous: false,
        candidates: [],
      },
    ],
    jobs: previous.jobs.map((job) => ({
      ...job,
      status: "succeeded",
      progress: 1,
      resources: { cpuPercent: 0, memoryMiB: 0 },
      message: "Topology and documentation published atomically",
    })),
    activity: [
      { id: `activity:${epoch}:published`, at: observedAtOffset(epoch + 1), kind: "system" as const, summary: validatorAlreadyVisible ? `Topology published for ${buildId}` : "Validator appeared in the service graph", status: "green" as const },
      ...previous.activity,
    ].slice(0, 32),
    reconciliation: {
      epoch,
      status: "green",
      inputFingerprint: workingId,
      lastConsistentFingerprint: workingId,
      message: `Build-derived views match ${workingId}`,
    },
  }, workingId);
}

export function failedSnapshot(previous: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...previous,
    graphs: previous.graphs.map((graph) => ({ ...graph, reconciliation: "red" })),
    jobs: previous.jobs.map((job) => ({
      ...job,
      status: "failed",
      resources: { cpuPercent: 0, memoryMiB: 0 },
      message: "Service topology extractor failed at reader.ts:84",
    })),
    activity: [
      { id: `activity:${previous.reconciliation.epoch}:failed`, at: observedAtOffset(previous.reconciliation.epoch + 2), kind: "build" as const, summary: "Extraction failed; last green graph retained", status: "red" as const },
      ...previous.activity,
    ].slice(0, 32),
    reconciliation: {
      ...previous.reconciliation,
      status: "red",
      message: `Extraction failed; showing the ${previous.reconciliation.lastConsistentFingerprint} consistent snapshot`,
    },
  };
}

export function selectFocus(snapshot: WorkspaceSnapshot, selected: FocusRef): WorkspaceSnapshot {
  return { ...snapshot, focus: selected, widgets: widgetsFor(selected) };
}
