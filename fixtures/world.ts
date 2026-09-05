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
  return { sourceKind: "repo", uri: "repo://swarm-ide/BUILD.bazel", version, observedAt };
}

function buildProvenance(version: string): Provenance {
  return { sourceKind: "build", uri: "bazel://reports/service-topology.json", version, observedAt };
}

const runtimeProvenance: Provenance = {
  sourceKind: "runtime",
  uri: "deploy://local/checkouts/v0.8.4",
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

export const checkoutServiceFocus = focus("service", "service:checkout");
export const paymentsServiceFocus = focus("service", "service:payments");
export const fraudServiceFocus = focus("service", "service:fraud-check");
export const checkoutFileFocus = focus(
  "repo",
  "file:services/checkout/checkout.ts",
  "services/checkout/checkout.ts",
);
export const paymentsFileFocus = focus(
  "repo",
  "file:services/payments/payments.ts",
  "services/payments/payments.ts",
);
export const authorizeFocus = focus(
  "symbol",
  "symbol:payments.authorize",
  "services/payments/payments.ts",
  "authorize",
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
        label: "swarm-ide",
        kind: "repository",
        status: "green",
        position: { x: 0, y: 90 },
        focus: focus("repo", "repo:swarm-ide", "."),
        detail: "one coherent working world",
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
        id: "repo-checkout",
        label: "checkout.ts",
        kind: "file",
        status,
        position: { x: 470, y: 5 },
        focus: checkoutFileFocus,
        detail: "+18 −3 · agent-07",
      },
      {
        id: "repo-payments",
        label: "payments.ts",
        kind: "file",
        status: "green",
        position: { x: 470, y: 175 },
        focus: paymentsFileFocus,
        detail: "p99 84ms",
      },
    ],
    edges: [
      { id: "repo-e1", source: "repo-root", target: "repo-services", kind: "contains", status: "green" },
      { id: "repo-e2", source: "repo-services", target: "repo-checkout", kind: "contains", status },
      { id: "repo-e3", source: "repo-services", target: "repo-payments", kind: "contains", status: "green" },
    ],
  };
}

function serviceGraph(
  status: GraphSlice["reconciliation"],
  epoch: number,
  includeFraud: boolean,
  inputFingerprint: string,
  buildId: string,
): GraphSlice {
  const nodes: GraphSlice["nodes"] = [
    {
      id: "service-gateway",
      label: "Gateway",
      kind: "service",
      status: "green",
      position: { x: 0, y: 100 },
      focus: focus("service", "service:gateway"),
      detail: "12.4k rpm",
    },
    {
      id: "service-checkout",
      label: "Checkout",
      kind: "service",
      status,
      position: { x: 250, y: 100 },
      focus: checkoutServiceFocus,
      detail: status === "yellow" ? "reconciling source changes" : "v0.9.1 working",
    },
    {
      id: "service-payments",
      label: "Payments",
      kind: "service",
      status: "green",
      position: { x: 520, y: 100 },
      focus: paymentsServiceFocus,
      detail: "v0.8.4 deployed",
    },
  ];
  const edges: GraphSlice["edges"] = [
    {
      id: "service-e1",
      source: "service-gateway",
      target: "service-checkout",
      kind: "rpc",
      label: "CreateOrder",
      status: "green",
    },
  ];

  if (includeFraud) {
    nodes.push({
      id: "service-fraud",
      label: "FraudCheck",
      kind: "service",
      status: "green",
      position: { x: 390, y: 5 },
      focus: fraudServiceFocus,
      detail: `new · ${buildId}`,
    });
    edges.push(
      {
        id: "service-e2",
        source: "service-checkout",
        target: "service-fraud",
        kind: "rpc",
        label: "Assess",
        status: "green",
      },
      {
        id: "service-e3",
        source: "service-fraud",
        target: "service-payments",
        kind: "rpc",
        label: "Authorize",
        status: "green",
      },
    );
  } else {
    edges.push({
      id: "service-e2",
      source: "service-checkout",
      target: "service-payments",
      kind: "rpc",
      label: "Authorize",
      status,
    });
  }

  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "service",
    title: "Service calls",
    scope: "checkout path",
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
    from: checkoutFileFocus,
    targetTopology: "service",
    ambiguous: false,
    candidates: [
      {
        focus: checkoutServiceFocus,
        nodeId: "service-checkout",
        confidence: 1,
        reason: "declared implementation path",
      },
    ],
  },
  {
    from: paymentsFileFocus,
    targetTopology: "service",
    ambiguous: true,
    candidates: [
      {
        focus: paymentsServiceFocus,
        nodeId: "service-payments",
        confidence: 0.9,
        reason: "primary owning target",
      },
      {
        focus: checkoutServiceFocus,
        nodeId: "service-checkout",
        confidence: 0.62,
        reason: "generated client is compiled into checkout",
      },
    ],
  },
  {
    from: checkoutServiceFocus,
    targetTopology: "repo",
    ambiguous: false,
    candidates: [
      {
        focus: checkoutFileFocus,
        nodeId: "repo-checkout",
        confidence: 1,
        reason: "service implementation glob",
      },
    ],
  },
  {
    from: paymentsServiceFocus,
    targetTopology: "repo",
    ambiguous: false,
    candidates: [
      {
        focus: paymentsFileFocus,
        nodeId: "repo-payments",
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
  if (selected.key.includes("payments") || selected.key.includes("authorize")) {
    return [
      { ...common, id: "latency", title: "Production latency", kind: "metric", value: "18 / 24 / 52 / 84", unit: "ms · mean / p50 / p90 / p99", provenance: runtimeProvenance },
      { ...common, id: "callers", title: "Call sites", kind: "list", value: ["Checkout.submit", "RetryWorker.run", "Admin.capture"] },
      { ...common, id: "contract", title: "Interface", kind: "code", value: "Authorize(Payment) → Decision" },
    ];
  }
  return [
    { ...common, id: "diff", title: "Working change", kind: "status", value: "+18 −3 · checkout.ts" },
    { ...common, id: "contracts", title: "Contracts", kind: "list", value: ["CreateOrder", "Authorize", "OrderEvents"] },
    { ...common, id: "bugs", title: "Relevant bugs", kind: "list", value: ["checkout-timeout", "retry-budget"] },
    { ...common, id: "deploy", title: "Latest deployment", kind: "status", value: "local · v0.8.4 · 17m ago", provenance: runtimeProvenance },
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
  const affectedNodes = new Set(["repo-services", "repo-checkout", "service-checkout"]);
  const affectedEdges = new Set(["repo-e2", "service-e2"]);
  return graphs.map((graph) => ({
    ...graph,
    epoch,
    reconciliation: "yellow",
    nodes: graph.nodes.map((node) => ({
      ...node,
      status: affectedNodes.has(node.id) ? "yellow" : node.status === "red" ? "green" : node.status,
      detail: node.id === "service-checkout" ? "reconciling source changes" : node.detail,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      status: affectedEdges.has(edge.id) ? "yellow" : edge.status === "red" ? "green" : edge.status,
    })),
  }));
}

const baseActivity: Activity[] = [
  { id: "a1", at: observedAt, kind: "agent", summary: "agent-07 opened checkout.ts", status: "yellow" },
  { id: "a2", at: observedAt, kind: "diff", summary: "+18 −3 across checkout", status: "yellow" },
  { id: "a3", at: observedAt, kind: "build", summary: "//services/payments:all green", status: "green" },
];

export function initialSnapshot(selected: FocusRef = checkoutServiceFocus): WorkspaceSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    project: { id: "project:swarm-ide", name: "swarm-ide" },
    world: { id: "world:working", label: "working tree" },
    revisions: {
      working: { id: "work:a1", fingerprint: "work:a1" },
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
      working: { id: workingId, fingerprint: workingId },
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
  const fraudAlreadyVisible = previous.graphs.some((graph) =>
    graph.nodes.some((node) => node.id === "service-fraud"),
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
        from: fraudServiceFocus,
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
      { id: `activity:${epoch}:published`, at: observedAtOffset(epoch + 1), kind: "system" as const, summary: fraudAlreadyVisible ? `Topology published for ${buildId}` : "FraudCheck appeared in the service graph", status: "green" as const },
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
      message: "Service topology extractor failed at checkout.ts:84",
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
