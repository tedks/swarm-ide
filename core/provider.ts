import { execFile } from "node:child_process";
import {
  PROTOCOL_VERSION,
  WorkspaceSnapshotSchema,
  type FocusRef,
  type GraphSlice,
  type NavigationMapping,
  type Provenance,
  type Widget,
  type WorkspaceSnapshot,
} from "../protocol/schema";
import { computeWorkingWorldFingerprint } from "./fingerprint";
import { readCanonicalWorkspaceBytes, resolveWorkspaceFile } from "./files";
import {
  ServiceTopologyArtifactSchema,
  adaptServiceTopology,
  artifactBuildId,
  type ServiceTopologyArtifact,
} from "./service-topology";

export const SERVICE_TOPOLOGY_TARGET = "//examples/checkout-world/services/fraudcheck:service_topology";
export const SERVICE_TOPOLOGY_ARTIFACT = "bazel-bin/examples/checkout-world/services/fraudcheck/service-topology.json";
const MANIFEST_PATH = "examples/checkout-world/services/fraudcheck/service.swarm.json";
const SOURCE_PATHS = [
  "examples/checkout-world/services/fraudcheck/fraudcheck.proto",
  "examples/checkout-world/services/fraudcheck/fraudcheck.ts",
];
const DECLARATION_PATHS = [
  "examples/checkout-world/services/fraudcheck/fraudcheck.proto",
  "examples/checkout-world/services/payments/payments.proto",
];
const INTERFACE_DECLARATIONS = new Map([
  ["interface:fraud-check.assess", "examples/checkout-world/services/fraudcheck/fraudcheck.proto"],
  ["interface:payments.authorize", "examples/checkout-world/services/payments/payments.proto"],
]);
const MAX_ARTIFACT_BYTES = 512 * 1024;

export interface ProviderDependencies {
  fingerprint(workspaceRoot: string): Promise<string>;
  build(workspaceRoot: string): Promise<void>;
  readArtifact(workspaceRoot: string): Promise<{ bytes: Buffer; artifact: ServiceTopologyArtifact }>;
  now(): string;
}

export type ProviderPublish = (
  type: "workspace.changed" | "reconciliation.changed" | "graph.published" | "job.changed",
  snapshot: WorkspaceSnapshot,
) => void;

function runBazel(workspaceRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "bazel",
      ["build", SERVICE_TOPOLOGY_TARGET, "--color=no", "--curses=no"],
      { cwd: workspaceRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).trim().slice(-2_000)));
          return;
        }
        resolve();
      },
    );
  });
}

async function readArtifact(workspaceRoot: string): Promise<{ bytes: Buffer; artifact: ServiceTopologyArtifact }> {
  const bytes = await readCanonicalWorkspaceBytes(workspaceRoot, SERVICE_TOPOLOGY_ARTIFACT, MAX_ARTIFACT_BYTES);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("the Bazel topology output is not valid UTF-8 JSON");
  }
  const artifact = ServiceTopologyArtifactSchema.parse(input);
  if (artifact.owningTarget !== "//examples/checkout-world/services/fraudcheck:fraudcheck_sources") {
    throw new Error("the topology artifact names an unexpected owning target");
  }
  if (artifact.implementationPaths.length !== SOURCE_PATHS.length || artifact.implementationPaths.some((path, index) => path !== SOURCE_PATHS[index])) {
    throw new Error("the topology artifact does not contain the exact Bazel-owned source set");
  }
  if (artifact.interfaceDeclarationPaths.length !== INTERFACE_DECLARATIONS.size || artifact.interfaceDeclarationPaths.some(({ interfaceId, path }) => INTERFACE_DECLARATIONS.get(interfaceId) !== path)) {
    throw new Error("the topology artifact does not contain the exact interface declaration set");
  }
  for (const source of artifact.implementationPaths) await resolveWorkspaceFile(workspaceRoot, source);
  for (const declaration of artifact.interfaceDeclarationPaths) await resolveWorkspaceFile(workspaceRoot, declaration.path);
  return { bytes, artifact };
}

const defaultDependencies: ProviderDependencies = {
  fingerprint: computeWorkingWorldFingerprint,
  build: runBazel,
  readArtifact,
  now: () => new Date().toISOString(),
};

function focus(domain: FocusRef["domain"], key: string, fingerprint: string, path?: string): FocusRef {
  return {
    worldId: "world:working",
    revisionKind: "working",
    revisionId: fingerprint,
    domain,
    key,
    ...(path ? { path } : {}),
  };
}

function repoProvenance(fingerprint: string, observedAt: string): Provenance {
  return { sourceKind: "repo", uri: "repo://.", version: fingerprint, observedAt };
}

function repositoryGraph(fingerprint: string, epoch: number, status: "gray" | "yellow" | "green" | "red", observedAt: string): GraphSlice {
  const paths = [...new Set([MANIFEST_PATH, ...SOURCE_PATHS, ...DECLARATION_PATHS])];
  const nodes: GraphSlice["nodes"] = [
    { id: "repo:root", label: "swarm-ide", kind: "repository", status: "green", position: { x: 0, y: 105 }, focus: focus("repo", "repo:swarm-ide", fingerprint), detail: "opened working tree" },
    { id: "repo:fraudcheck", label: "fraudcheck/", kind: "directory", status: "green", position: { x: 225, y: 105 }, focus: focus("repo", "dir:fraudcheck", fingerprint), detail: "Bazel package" },
  ];
  paths.forEach((path, index) => nodes.push({
    id: `repo:file:${path}`,
    label: path.split("/").at(-1)!,
    kind: "file",
    status: "green",
    position: { x: 465, y: index * 92 },
    focus: focus("repo", `file:${path}`, fingerprint, path),
    detail: path,
  }));
  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "repo",
    title: "Repository topology",
    scope: "examples/checkout-world/services/fraudcheck",
    zoomBand: "file",
    epoch,
    reconciliation: status,
    inputFingerprint: fingerprint,
    nodes,
    edges: [
      { id: "repo:contains:fraudcheck", source: "repo:root", target: "repo:fraudcheck", kind: "contains", status: "green" },
      ...paths.map((path) => ({ id: `repo:contains:${path}`, source: "repo:fraudcheck", target: `repo:file:${path}`, kind: "contains", status: "green" as const })),
    ],
    provenance: [repoProvenance(fingerprint, observedAt)],
  };
}

function emptyServiceGraph(fingerprint: string, epoch: number, status: "gray" | "yellow" | "red", observedAt: string): GraphSlice {
  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "service",
    title: "Service topology",
    scope: SERVICE_TOPOLOGY_TARGET,
    zoomBand: "service",
    epoch,
    reconciliation: status,
    inputFingerprint: fingerprint,
    nodes: [],
    edges: [],
    provenance: [{ sourceKind: "repo", uri: `repo://${MANIFEST_PATH}`, version: fingerprint, observedAt }],
  };
}

function initialWidgets(fingerprint: string, observedAt: string): Widget[] {
  const provenance = repoProvenance(fingerprint, observedAt);
  return [
    { id: "topology-target", title: "Topology target", kind: "code", priority: 1, value: SERVICE_TOPOLOGY_TARGET, provenance },
    { id: "observation", title: "Build-derived topology", kind: "status", priority: 2, value: "unobserved", provenance },
    { id: "deployment", title: "Deployment", kind: "status", priority: 3, value: "not configured", provenance },
  ];
}

function retagFocus(value: FocusRef, fingerprint: string): FocusRef {
  return value.revisionKind === "working" ? { ...value, revisionId: fingerprint } : value;
}

function retagSnapshot(snapshot: WorkspaceSnapshot, fingerprint: string): WorkspaceSnapshot {
  return {
    ...snapshot,
    focus: retagFocus(snapshot.focus, fingerprint),
    graphs: snapshot.graphs.map((graph) => ({ ...graph, nodes: graph.nodes.map((node) => ({ ...node, focus: retagFocus(node.focus, fingerprint) })) })),
    mappings: snapshot.mappings.map((mapping) => ({
      ...mapping,
      from: retagFocus(mapping.from, fingerprint),
      candidates: mapping.candidates.map((candidate) => ({ ...candidate, focus: retagFocus(candidate.focus, fingerprint) })),
    })),
  };
}

export class RealWorkspaceProvider {
  private snapshotValue!: WorkspaceSnapshot;
  private currentAttempt = 0;
  private serviceMappings: NavigationMapping[] = [];
  private serviceWidgets: Widget[] = [];

  private constructor(
    private readonly workspaceRoot: string,
    private readonly dependencies: ProviderDependencies,
  ) {}

  static async create(workspaceRoot: string, dependencies: ProviderDependencies = defaultDependencies): Promise<RealWorkspaceProvider> {
    const provider = new RealWorkspaceProvider(workspaceRoot, dependencies);
    const fingerprint = await dependencies.fingerprint(workspaceRoot);
    const observedAt = dependencies.now();
    provider.snapshotValue = WorkspaceSnapshotSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      project: { id: "project:swarm-ide", name: "swarm-ide" },
      world: { id: "world:working", label: "working tree" },
      revisions: {
        working: { id: fingerprint, fingerprint },
        built: { id: "", sourceFingerprint: "" },
        deployed: { id: "", buildId: "", environment: "not configured" },
      },
      focus: focus("repo", "repo:swarm-ide", fingerprint),
      graphs: [repositoryGraph(fingerprint, 0, "gray", observedAt), emptyServiceGraph(fingerprint, 0, "gray", observedAt)],
      mappings: [],
      widgets: initialWidgets(fingerprint, observedAt),
      jobs: [],
      activity: [],
      reconciliation: {
        epoch: 0,
        status: "gray",
        inputFingerprint: fingerprint,
        lastConsistentFingerprint: "unobserved",
        message: "Service topology has not been built for this working world",
      },
    });
    return provider;
  }

  snapshot(): WorkspaceSnapshot {
    return this.snapshotValue;
  }

  selectFocus(selected: FocusRef): WorkspaceSnapshot {
    if (selected.worldId !== this.snapshotValue.world.id || selected.revisionKind !== "working" || selected.revisionId !== this.snapshotValue.revisions.working.id) {
      throw new Error("Focus does not belong to the current working world");
    }
    const sourceWidget = selected.path ? [{
      id: "selected-source",
      title: "Selected source",
      kind: "code" as const,
      priority: 0,
      value: selected.path,
      provenance: repoProvenance(this.snapshotValue.revisions.working.id, this.dependencies.now()),
    }] : [];
    this.snapshotValue = WorkspaceSnapshotSchema.parse({
      ...this.snapshotValue,
      focus: selected,
      widgets: [...sourceWidget, ...(this.serviceWidgets.length ? this.serviceWidgets : initialWidgets(this.snapshotValue.revisions.working.id, this.dependencies.now()))],
    });
    return this.snapshotValue;
  }

  markWorkingWorldChanged(fingerprint: string, publish: ProviderPublish): WorkspaceSnapshot {
    if (fingerprint === this.snapshotValue.revisions.working.fingerprint) return this.snapshotValue;
    ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    const observedAt = this.dependencies.now();
    const hadGreen = this.snapshotValue.reconciliation.lastConsistentFingerprint !== "unobserved";
    const previousServiceGraph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "service")!;
    this.snapshotValue = WorkspaceSnapshotSchema.parse(retagSnapshot({
      ...this.snapshotValue,
      revisions: { ...this.snapshotValue.revisions, working: { id: fingerprint, fingerprint } },
      graphs: [
        repositoryGraph(fingerprint, epoch, "yellow", observedAt),
        hadGreen
          ? { ...previousServiceGraph, epoch, reconciliation: "yellow" as const }
          : emptyServiceGraph(fingerprint, epoch, "yellow", observedAt),
      ],
      mappings: hadGreen ? this.snapshotValue.mappings : [],
      widgets: hadGreen ? this.serviceWidgets : initialWidgets(fingerprint, observedAt),
      jobs: [],
      activity: [{
        id: `activity:working:${epoch}:changed`,
        at: observedAt,
        kind: "diff" as const,
        summary: hadGreen ? "Working source changed; last consistent topology retained" : "Working source changed before its first topology observation",
        status: "yellow" as const,
      }, ...this.snapshotValue.activity].slice(0, 32),
      reconciliation: {
        epoch,
        status: "yellow",
        inputFingerprint: fingerprint,
        lastConsistentFingerprint: this.snapshotValue.reconciliation.lastConsistentFingerprint,
        message: hadGreen ? "Working source changed; rebuild to reconcile the retained topology" : "Working source changed; build to observe its service topology",
      },
    }, fingerprint));
    publish("workspace.changed", this.snapshotValue);
    return this.snapshotValue;
  }

  markWorkingWorldUnknown(message: string, publish: ProviderPublish): WorkspaceSnapshot {
    ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    this.snapshotValue = WorkspaceSnapshotSchema.parse({
      ...this.snapshotValue,
      graphs: this.snapshotValue.graphs.map((graph) => ({ ...graph, epoch, reconciliation: "red" as const })),
      jobs: [],
      activity: [{ id: `activity:working:${epoch}:unknown`, at: this.dependencies.now(), kind: "diff", summary: "Working source changed but its fingerprint is unavailable", status: "red" }, ...this.snapshotValue.activity].slice(0, 32),
      reconciliation: {
        ...this.snapshotValue.reconciliation,
        epoch,
        status: "red",
        message: `Working-world fingerprint failed: ${message.slice(0, 240)}`,
      },
    });
    publish("workspace.changed", this.snapshotValue);
    return this.snapshotValue;
  }

  async startReconciliation(publish: ProviderPublish): Promise<void> {
    const attempt = ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    let started = false;
    try {
      const beforeFingerprint = await this.dependencies.fingerprint(this.workspaceRoot);
      if (attempt !== this.currentAttempt) return;
      const observedAt = this.dependencies.now();
      const hadGreen = this.snapshotValue.reconciliation.lastConsistentFingerprint !== "unobserved";
      const previousServiceGraph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "service")!;
      this.snapshotValue = WorkspaceSnapshotSchema.parse(retagSnapshot({
        ...this.snapshotValue,
        revisions: { ...this.snapshotValue.revisions, working: { id: beforeFingerprint, fingerprint: beforeFingerprint } },
        graphs: [
          repositoryGraph(beforeFingerprint, epoch, "yellow", observedAt),
          hadGreen
            ? { ...previousServiceGraph, epoch, reconciliation: "yellow" as const }
            : emptyServiceGraph(beforeFingerprint, epoch, "yellow", observedAt),
        ],
        jobs: [{
          id: `job:service-topology:${epoch}`,
          label: `bazel build ${SERVICE_TOPOLOGY_TARGET}`,
          kind: "build",
          status: "running",
          progress: 0,
          resources: { cpuPercent: 0, memoryMiB: 0 },
          message: "Resource telemetry unavailable; building exact working fingerprint",
        }],
        activity: [{ id: `activity:topology:${epoch}:start`, at: observedAt, kind: "build" as const, summary: `Building ${SERVICE_TOPOLOGY_TARGET}`, status: "yellow" as const }, ...this.snapshotValue.activity].slice(0, 32),
        reconciliation: {
          epoch,
          status: "yellow",
          inputFingerprint: beforeFingerprint,
          lastConsistentFingerprint: this.snapshotValue.reconciliation.lastConsistentFingerprint,
          message: hadGreen ? "Building current source; retaining the last consistent topology" : "Building the first service topology observation",
        },
      }, beforeFingerprint));
      started = true;
      publish("reconciliation.changed", this.snapshotValue);

      await this.dependencies.build(this.workspaceRoot);
      if (attempt !== this.currentAttempt) return;
      const { bytes, artifact } = await this.dependencies.readArtifact(this.workspaceRoot);
      if (attempt !== this.currentAttempt) return;
      const afterFingerprint = await this.dependencies.fingerprint(this.workspaceRoot);
      if (attempt !== this.currentAttempt) return;
      if (afterFingerprint !== beforeFingerprint) throw new Error("working source changed during the build; refusing stale green publication");
      const buildId = artifactBuildId(bytes);
      const adapted = adaptServiceTopology(artifact, `bazel://${SERVICE_TOPOLOGY_ARTIFACT}`, buildId, beforeFingerprint, epoch, this.dependencies.now());
      this.serviceMappings = adapted.mappings;
      this.serviceWidgets = adapted.widgets;
      const repoGraph = repositoryGraph(beforeFingerprint, epoch, "green", this.dependencies.now());
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue,
        revisions: {
          ...this.snapshotValue.revisions,
          built: { id: buildId, sourceFingerprint: beforeFingerprint },
        },
        graphs: [repoGraph, adapted.graph],
        mappings: adapted.mappings,
        widgets: adapted.widgets,
        jobs: this.snapshotValue.jobs.map((job) => ({ ...job, status: "succeeded" as const, progress: 1, message: `Published artifact sha256:${buildId.slice(0, 12)}` })),
        activity: [{ id: `activity:topology:${epoch}:green`, at: this.dependencies.now(), kind: "system", summary: `FraudCheck topology published from ${SERVICE_TOPOLOGY_TARGET}`, status: "green" }, ...this.snapshotValue.activity].slice(0, 32),
        reconciliation: {
          epoch,
          status: "green",
          inputFingerprint: beforeFingerprint,
          lastConsistentFingerprint: beforeFingerprint,
          message: `Build-derived topology matches ${beforeFingerprint.slice(0, 12)}`,
        },
      });
      publish("graph.published", this.snapshotValue);
    } catch (error) {
      if (attempt !== this.currentAttempt) return;
      const message = error instanceof Error ? error.message : "unknown topology build failure";
      const observedAt = this.dependencies.now();
      const currentFingerprint = this.snapshotValue.revisions.working.fingerprint;
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue,
        graphs: this.snapshotValue.graphs.map((graph) => ({ ...graph, epoch, reconciliation: "red" as const })),
        jobs: started
          ? this.snapshotValue.jobs.map((job) => ({ ...job, status: "failed" as const, message: message.slice(0, 300) }))
          : [{ id: `job:service-topology:${epoch}`, label: `bazel build ${SERVICE_TOPOLOGY_TARGET}`, kind: "build", status: "failed", progress: 0, resources: { cpuPercent: 0, memoryMiB: 0 }, message: message.slice(0, 300) }],
        activity: [{ id: `activity:topology:${epoch}:red`, at: observedAt, kind: "build", summary: "Topology build failed; last consistent graph retained", status: "red" }, ...this.snapshotValue.activity].slice(0, 32),
        reconciliation: {
          ...this.snapshotValue.reconciliation,
          epoch,
          status: "red",
          inputFingerprint: currentFingerprint,
          message: `Topology build failed: ${message.slice(0, 240)}`,
        },
      });
      publish("reconciliation.changed", this.snapshotValue);
    }
  }
}
