import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { watchBuildProgress } from "./build-progress";
import { registerRepository } from "./repository-registration";
import { RepositoryReader, RepositoryError } from "./repository";
import { RepositoryFileSearch } from "./repository-search";
import type { RepositorySearchRequest, RepositorySearchResult } from "../protocol/repository-search";
import { RepositoryRequestSchema, repositoryEntryId, type RepositoryObservation, type RepositoryRequest } from "../protocol/repository";
import { readBoundedRegularFile, readCanonicalWorkspaceBytes, resolveWorkspaceFile } from "./files";
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
const INTERFACE_DECLARATIONS = new Map([
  ["interface:fraud-check.assess", "examples/checkout-world/services/fraudcheck/fraudcheck.proto"],
  ["interface:payments.authorize", "examples/checkout-world/services/payments/payments.proto"],
]);
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_BUILD_EVENT_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;

export interface BazelBuildResult {
  artifactPath: string;
}

export interface ProviderDependencies {
  topologyApplicable?(workspaceRoot: string): Promise<boolean>;
  register?: typeof registerRepository;
  repository?: (root: string, repositoryId: string) => Pick<RepositoryReader, "list" | "markStale" | "dispose">;
  fingerprint(workspaceRoot: string): Promise<string>;
  build(workspaceRoot: string, onProgress?: (message: string) => void): Promise<BazelBuildResult>;
  readArtifact(workspaceRoot: string, build: BazelBuildResult): Promise<{ bytes: Buffer; artifact: ServiceTopologyArtifact }>;
  now(): string;
}

export type ProviderPublish = (
  type: "workspace.changed" | "reconciliation.changed" | "graph.published" | "job.changed",
  snapshot: WorkspaceSnapshot,
) => void;

function bazel(workspaceRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "bazel",
      args,
      { cwd: workspaceRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).trim().slice(-2_000)));
          return;
        }
        resolve(String(_stdout));
      },
    );
  });
}

interface BuildEventFile {
  name?: unknown;
  uri?: unknown;
}

interface BuildEvent {
  id?: { targetCompleted?: { label?: unknown } };
  completed?: { success?: unknown; importantOutput?: unknown };
}

export function topologyArtifactPathFromBuildEvents(bytes: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("the Bazel build-event stream is not valid UTF-8");
  }
  const matchingEvents: BuildEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error("the Bazel build-event stream contains malformed JSON");
    }
    if (typeof parsed !== "object" || parsed === null) throw new Error("the Bazel build-event stream contains a non-object event");
    const event = parsed as BuildEvent;
    if (event.id?.targetCompleted?.label === SERVICE_TOPOLOGY_TARGET) matchingEvents.push(event);
  }
  if (matchingEvents.length !== 1) throw new Error("Bazel did not report exactly one completion for the fixed topology target");
  const completed = matchingEvents[0]!.completed;
  if (completed?.success !== true || !Array.isArray(completed.importantOutput)) throw new Error("the fixed topology target did not report a successful bounded output");
  const relativeArtifact = SERVICE_TOPOLOGY_ARTIFACT.slice("bazel-bin/".length);
  const outputs = completed.importantOutput.filter((output): output is BuildEventFile => (
    typeof output === "object" && output !== null && "name" in output && output.name === relativeArtifact
  ));
  if (outputs.length !== 1 || typeof outputs[0]!.uri !== "string") throw new Error("Bazel did not report exactly one fixed topology artifact");
  let artifactPath: string;
  try {
    const url = new URL(outputs[0]!.uri);
    if (url.protocol !== "file:" || url.hostname) throw new Error("not a local file URL");
    artifactPath = fileURLToPath(url);
  } catch {
    throw new Error("the fixed topology artifact is not a local file URL");
  }
  if (!isAbsolute(artifactPath) || !artifactPath.includes("/bazel-out/") || !artifactPath.endsWith(`/bin/${relativeArtifact}`)) {
    throw new Error("the fixed topology artifact escaped Bazel's declared output tree");
  }
  return artifactPath;
}

async function runBazel(workspaceRoot: string, onProgress?: (message: string) => void): Promise<BazelBuildResult> {
  const eventDirectory = await mkdtemp(join(tmpdir(), "swarm-ide-build-events-"));
  const eventPath = join(eventDirectory, "topology.jsonl");
  const progress = onProgress ? watchBuildProgress(eventPath, onProgress) : undefined;
  try {
    await bazel(workspaceRoot, [
      "build",
      SERVICE_TOPOLOGY_TARGET,
      "--jobs=3",
      "--color=no",
      "--curses=no",
      `--build_event_json_file=${eventPath}`,
    ]);
    await progress?.stop();
    const events = await readBoundedRegularFile(eventPath, MAX_BUILD_EVENT_BYTES, "the Bazel build-event stream");
    // Preserve the exact reported pathname so readBoundedRegularFile can apply
    // O_NOFOLLOW to the declared output itself. Resolving it first would make
    // a symlink output indistinguishable from its target.
    return { artifactPath: topologyArtifactPathFromBuildEvents(events) };
  } finally {
    try { await progress?.stop(); }
    finally { await rm(eventDirectory, { recursive: true, force: true }); }
  }
}

function framed(hash: ReturnType<typeof createHash>, value: string | Buffer): void {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

export async function computeTopologyInputDigest(workspaceRoot: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("swarm-service-topology-input-v3\0");
  framed(hash, await readCanonicalWorkspaceBytes(workspaceRoot, MANIFEST_PATH, MAX_MANIFEST_BYTES));
  for (const path of SOURCE_PATHS) {
    framed(hash, path);
    framed(hash, await readCanonicalWorkspaceBytes(workspaceRoot, path, MAX_SOURCE_BYTES));
  }
  for (const [interfaceId, path] of [...INTERFACE_DECLARATIONS.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    framed(hash, "interface");
    framed(hash, interfaceId);
    framed(hash, path);
    framed(hash, await readCanonicalWorkspaceBytes(workspaceRoot, path, MAX_SOURCE_BYTES));
  }
  return hash.digest("hex");
}

export async function readBuiltTopologyArtifact(workspaceRoot: string, build: BazelBuildResult): Promise<{ bytes: Buffer; artifact: ServiceTopologyArtifact }> {
  const bytes = await readBoundedRegularFile(build.artifactPath, MAX_ARTIFACT_BYTES, "the Bazel topology output");
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("the Bazel topology output is not valid UTF-8 JSON");
  }
  const artifact = ServiceTopologyArtifactSchema.parse(input);
  const expectedInputDigest = await computeTopologyInputDigest(workspaceRoot);
  if (artifact.inputDigest !== expectedInputDigest) throw new Error("the topology artifact input digest does not match the canonical current inputs");
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

/** The example adapter is opt-in, never inferred from an arbitrary Bazel repo. */
export async function hasDeclaredServiceTopology(workspaceRoot: string): Promise<boolean> {
  try {
    const mapping = JSON.parse((await readCanonicalWorkspaceBytes(workspaceRoot, ".swarm/service-topology.json", 4096)).toString("utf8"));
    if (mapping.schemaVersion !== 1 || mapping.target !== SERVICE_TOPOLOGY_TARGET) return false;
    const manifest = JSON.parse((await readCanonicalWorkspaceBytes(workspaceRoot, MANIFEST_PATH, MAX_MANIFEST_BYTES)).toString("utf8"));
    return manifest.schemaVersion === 1 && manifest.service?.id === "service:fraud-check";
  } catch { return false; }
}

const defaultDependencies: ProviderDependencies = {
  topologyApplicable: hasDeclaredServiceTopology,
  fingerprint: computeWorkingWorldFingerprint,
  build: runBazel,
  readArtifact: readBuiltTopologyArtifact,
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

function repositoryGraph(snapshot: WorkspaceSnapshot, directory: RepositoryObservation): GraphSlice {
  const fingerprint = snapshot.revisions.working.id;
  const previous = snapshot.graphs.find((graph) => graph.topologyId === "repo");
  const preservePositions = previous?.directory?.directory === directory.directory && previous.directory.page === directory.page;
  const positions = new Map(preservePositions ? previous.nodes.map((node) => [node.id, node.position]) : []);
  const parentId = repositoryEntryId(snapshot.project.id, "directory", directory.directory);
  const nodes: GraphSlice["nodes"] = [{ id: parentId, label: directory.directory.split("/").at(-1) || snapshot.project.name,
    kind: "directory", status: "gray", position: { x: 0, y: 0 }, focus: focus("repo", `dir:${directory.directory}`, fingerprint, directory.directory || undefined), detail: directory.directory || "repository root" }];
  const used = new Set([...positions.values()].map((position) => `${position.x}:${position.y}`));
  let slot = 0;
  for (const entry of directory.entries) {
    let position = positions.get(entry.id);
    while (!position) {
      const candidate = { x: 270 + (slot % 4) * 240, y: Math.floor(slot / 4) * 108 }; ++slot;
      if (!used.has(`${candidate.x}:${candidate.y}`)) { position = candidate; used.add(`${candidate.x}:${candidate.y}`); }
    }
    nodes.push({ id: entry.id, label: entry.label, kind: entry.kind, status: "gray", position,
      focus: focus("repo", entry.kind === "file" && entry.path ? `file:${entry.path}` : entry.kind === "directory" && entry.path ? `dir:${entry.path}` : `unsupported:${entry.id}`, fingerprint, entry.path ?? undefined),
      detail: entry.reason ?? (entry.kind === "directory" ? "directory" : entry.git) });
  }
  return {
    schemaVersion: PROTOCOL_VERSION,
    topologyId: "repo",
    title: "Repository",
    scope: directory.directory || "/",
    zoomBand: "file",
    epoch: snapshot.reconciliation.epoch,
    reconciliation: "gray",
    inputFingerprint: fingerprint,
    nodes,
    edges: directory.entries.map((entry) => ({ id: `${parentId}:contains:${entry.id}`, source: parentId, target: entry.id, kind: "contains", status: "gray" as const })),
    provenance: [repoProvenance(directory.observationId, directory.capturedAt)],
    directory,
  };
}

function rebindRepositoryMappings(mappings: NavigationMapping[], graph: GraphSlice): NavigationMapping[] {
  return mappings.map((mapping) => mapping.targetTopology !== "repo" ? mapping : { ...mapping,
    candidates: mapping.candidates.map((candidate) => {
      const path = candidate.focus.path;
      if (!path || candidate.focus.domain !== "repo" || candidate.focus.key !== `file:${path}`) return candidate;
      const node = graph.nodes.find((node) => node.kind === "file" && node.focus.path === path);
      const { nodeId: _nodeId, revealPath: _revealPath, ...rest } = candidate;
      return { ...rest, ...(node ? { nodeId: node.id } : { revealPath: path }) };
    }) });
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
  private workingWorldUnknown = false;
  private navigationGeneration = 0;
  private disposed = false;
  private directoryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly repository: Pick<RepositoryReader, "list" | "markStale" | "dispose">;
  private readonly fileSearch: RepositoryFileSearch;

  private constructor(
    private readonly workspaceRoot: string,
    private readonly dependencies: ProviderDependencies,
    repositoryId: string,
  ) {
    this.repository = dependencies.repository?.(workspaceRoot, repositoryId) ?? new RepositoryReader(workspaceRoot, repositoryId);
    this.fileSearch = new RepositoryFileSearch(workspaceRoot, repositoryId);
  }

  searchRepository(request: RepositorySearchRequest): Promise<RepositorySearchResult> { return this.fileSearch.search(request); }

  static async create(workspaceRoot: string, dependencies: ProviderDependencies = defaultDependencies): Promise<RealWorkspaceProvider> {
    const registration = await (dependencies.register ?? registerRepository)(workspaceRoot);
    const provider = new RealWorkspaceProvider(registration.root, dependencies, registration.id);
    const fingerprint = `unobserved:${registration.id.slice("repository:".length)}`;
    const observedAt = dependencies.now();
    const directory: RepositoryObservation = { directory: "", observationId: `registration:${registration.id.slice("repository:".length)}`, capturedAt: observedAt,
      state: "loading", complete: false, capturedCount: 0, filteredCount: 0, page: 0, pageCount: 1, filter: "", entries: [], notice: "Opening the registered root directory" };
    const initial: WorkspaceSnapshot = {
      protocolVersion: PROTOCOL_VERSION,
      project: { id: registration.id, name: registration.name },
      world: { id: "world:working", label: "working tree" },
      revisions: {
        working: { id: fingerprint, fingerprint: "", evidence: "unavailable" },
        built: { id: "", sourceFingerprint: "" },
        deployed: { id: "", buildId: "", environment: "not configured" },
      },
      focus: focus("repo", "dir:", fingerprint),
      graphs: [emptyServiceGraph(fingerprint, 0, "gray", observedAt)],
      mappings: [],
      widgets: initialWidgets(fingerprint, observedAt),
      jobs: [],
      activity: [],
      reconciliation: {
        epoch: 0,
        status: "gray",
        inputFingerprint: fingerprint,
        lastConsistentFingerprint: "unobserved",
        message: "Working evidence unavailable until source observation; directory browsing is independent",
      },
    };
    provider.snapshotValue = WorkspaceSnapshotSchema.parse({ ...initial, graphs: [repositoryGraph(initial, directory), ...initial.graphs] });
    provider.workingWorldUnknown = true;
    return provider;
  }

  async listRepository(input: RepositoryRequest, publish: ProviderPublish): Promise<RepositoryObservation> {
    const request = RepositoryRequestSchema.parse(input);
    if (this.disposed) throw new RepositoryError("REPOSITORY_UNAVAILABLE", "Repository reader was disposed");
    const generation = ++this.navigationGeneration;
    try {
      const directory = await this.repository.list(request);
      if (generation !== this.navigationGeneration || this.disposed) throw new RepositoryError("REPOSITORY_STALE", "A newer navigation superseded this request");
      // Merge with the *latest* service publication, not the pre-await world.
      const graph = repositoryGraph(this.snapshotValue, directory);
      this.snapshotValue = WorkspaceSnapshotSchema.parse({ ...this.snapshotValue,
        graphs: this.snapshotValue.graphs.map((existing) => existing.topologyId === "repo" ? graph : existing),
        mappings: rebindRepositoryMappings(this.snapshotValue.mappings, graph) });
      publish("workspace.changed", this.snapshotValue);
      if (this.directoryTimer) clearTimeout(this.directoryTimer);
      if (directory.state === "observed") {
        this.directoryTimer = setTimeout(() => {
          if (!this.disposed && this.snapshotValue.graphs.find((item) => item.topologyId === "repo")?.directory?.observationId === directory.observationId)
            this.markDirectoryStale(publish);
        }, Math.max(0, Date.parse(directory.capturedAt) + 5_000 - Date.now()));
        this.directoryTimer.unref();
      }
      return directory;
    } catch (error) {
      if (generation === this.navigationGeneration && !this.disposed) {
        const graph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!;
        if (graph.directory?.state === "loading") {
          const failed = repositoryGraph(this.snapshotValue, { ...graph.directory, state: "error", notice: `Could not list ${request.directory || "/"}; use Refresh or Up to retry` });
          this.snapshotValue = WorkspaceSnapshotSchema.parse({ ...this.snapshotValue, graphs: this.snapshotValue.graphs.map((item) => item.topologyId === "repo" ? failed : item) });
          publish("workspace.changed", this.snapshotValue);
        }
      }
      throw error;
    }
  }

  markDirectoryStale(publish?: ProviderPublish): void {
    this.fileSearch.markStale();
    this.repository.markStale();
    const graph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!;
    if (!graph.directory || graph.directory.state !== "observed") return;
    this.snapshotValue = WorkspaceSnapshotSchema.parse({ ...this.snapshotValue, graphs: this.snapshotValue.graphs.map((item) => item === graph ? { ...item, directory: { ...graph.directory!, state: "stale" } } : item) });
    publish?.("workspace.changed", this.snapshotValue);
  }

  dispose(): void { this.disposed = true; ++this.navigationGeneration; ++this.currentAttempt; if (this.directoryTimer) clearTimeout(this.directoryTimer); this.repository.dispose(); this.fileSearch.dispose(); }

  /** Explicit observation seam also used by small provider tests. Registration
   * never awaits this; worker observation is independently scheduled. */
  async observeWorkingWorld(publish: ProviderPublish): Promise<void> {
    try { const fingerprint = await this.dependencies.fingerprint(this.workspaceRoot); if (!this.disposed) this.markWorkingWorldChanged(fingerprint, publish); }
    catch (error) { if (!this.disposed) this.markWorkingWorldUnknown(error instanceof Error ? error.message : "Source observation failed", publish); }
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
      // Legacy widgets have no subject/coverage contract. Files must not inherit
      // the example service's ownership; Context uses the exact publication.
      widgets: selected.domain === "repo" && selected.key.startsWith("file:") ? sourceWidget : [...sourceWidget, ...(this.serviceWidgets.length ? this.serviceWidgets : initialWidgets(this.snapshotValue.revisions.working.id, this.dependencies.now()))],
    });
    return this.snapshotValue;
  }

  markWorkingWorldChanged(fingerprint: string, publish: ProviderPublish): WorkspaceSnapshot {
    if (this.disposed) return this.snapshotValue;
    this.markDirectoryStale();
    const recoveredFromUnknown = this.workingWorldUnknown;
    this.workingWorldUnknown = false;
    if (fingerprint === this.snapshotValue.revisions.working.fingerprint && !recoveredFromUnknown) return this.snapshotValue;
    ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    const observedAt = this.dependencies.now();
    const hadGreen = this.snapshotValue.reconciliation.lastConsistentFingerprint !== "unobserved";
    const previousServiceGraph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "service")!;
    this.snapshotValue = WorkspaceSnapshotSchema.parse(retagSnapshot({
      ...this.snapshotValue,
      revisions: { ...this.snapshotValue.revisions, working: { id: fingerprint, fingerprint, evidence: "observed" } },
      graphs: [
        this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!,
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
    if (this.disposed) return this.snapshotValue;
    this.markDirectoryStale();
    this.workingWorldUnknown = true;
    ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    this.snapshotValue = WorkspaceSnapshotSchema.parse({
      ...this.snapshotValue,
      revisions: { ...this.snapshotValue.revisions, working: { ...this.snapshotValue.revisions.working, evidence: "unavailable" } },
      graphs: this.snapshotValue.graphs.map((graph) => graph.directory ? graph : ({ ...graph, epoch, reconciliation: "red" as const })),
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
    if (this.disposed) return;
    const observedAttempt = this.currentAttempt;
    if (this.dependencies.topologyApplicable && !await this.dependencies.topologyApplicable(this.workspaceRoot)) {
      if (this.disposed || observedAttempt !== this.currentAttempt) return;
      this.snapshotValue = WorkspaceSnapshotSchema.parse({ ...this.snapshotValue,
        reconciliation: { ...this.snapshotValue.reconciliation, message: "No service topology adapter declared for this project. Refresh dependencies, then build a selected target." } });
      publish("reconciliation.changed", this.snapshotValue);
      return;
    }
    if (this.disposed || observedAttempt !== this.currentAttempt) return;
    const attempt = ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    let started = false;
    let fingerprintUnavailable = false;
    try {
      const beforeFingerprint = await this.dependencies.fingerprint(this.workspaceRoot).catch((error) => { fingerprintUnavailable = true; throw error; });
      if (attempt !== this.currentAttempt) return;
      this.workingWorldUnknown = false;
      const observedAt = this.dependencies.now();
      const hadGreen = this.snapshotValue.reconciliation.lastConsistentFingerprint !== "unobserved";
      const previousServiceGraph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "service")!;
      this.snapshotValue = WorkspaceSnapshotSchema.parse(retagSnapshot({
        ...this.snapshotValue,
        revisions: { ...this.snapshotValue.revisions, working: { id: beforeFingerprint, fingerprint: beforeFingerprint, evidence: "observed" } },
        graphs: [
          this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!,
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
          message: "Starting Bazel build",
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

      const build = await this.dependencies.build(this.workspaceRoot, (message) => {
        if (this.disposed || attempt !== this.currentAttempt || this.snapshotValue.reconciliation.epoch !== epoch) return;
        const jobId = `job:service-topology:${epoch}`;
        if (!this.snapshotValue.jobs.some((job) => job.id === jobId && job.status === "running" && job.message !== message)) return;
        this.snapshotValue = WorkspaceSnapshotSchema.parse({ ...this.snapshotValue,
          jobs: this.snapshotValue.jobs.map((job) => job.id === jobId && job.status === "running" ? { ...job, message: message.slice(0, 300) } : job) });
        publish("job.changed", this.snapshotValue);
      });
      if (attempt !== this.currentAttempt) return;
      const { bytes, artifact } = await this.dependencies.readArtifact(this.workspaceRoot, build);
      if (attempt !== this.currentAttempt) return;
      const afterFingerprint = await this.dependencies.fingerprint(this.workspaceRoot).catch((error) => { fingerprintUnavailable = true; throw error; });
      if (attempt !== this.currentAttempt) return;
      if (afterFingerprint !== beforeFingerprint) {
        fingerprintUnavailable = true; // The retained preflight digest is no longer current authority.
        throw new Error("working source changed during the build; refusing stale green publication");
      }
      const buildId = artifactBuildId(bytes);
      const adapted = adaptServiceTopology(artifact, `bazel://${SERVICE_TOPOLOGY_ARTIFACT}`, buildId, beforeFingerprint, epoch, this.dependencies.now(), this.snapshotValue.project.id);
      this.serviceMappings = adapted.mappings;
      this.serviceWidgets = adapted.widgets;
      const repoGraph = this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!;
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue,
        revisions: {
          ...this.snapshotValue.revisions,
          built: { id: buildId, sourceFingerprint: beforeFingerprint },
        },
        graphs: [repoGraph, adapted.graph],
        mappings: rebindRepositoryMappings(adapted.mappings, repoGraph),
        widgets: adapted.widgets,
        serviceContext: adapted.serviceContext,
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
      if (fingerprintUnavailable) this.workingWorldUnknown = true;
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue,
        revisions: { ...this.snapshotValue.revisions, working: { ...this.snapshotValue.revisions.working, ...(fingerprintUnavailable ? { evidence: "unavailable" as const } : {}) } },
        graphs: this.snapshotValue.graphs.map((graph) => graph.directory ? graph : ({ ...graph, epoch, reconciliation: "red" as const })),
        jobs: started
          ? this.snapshotValue.jobs.map((job) => ({ ...job, status: "failed" as const, message: message.slice(0, 300) }))
          : [{ id: `job:service-topology:${epoch}`, label: `bazel build ${SERVICE_TOPOLOGY_TARGET}`, kind: "build", status: "failed", progress: 0, resources: { cpuPercent: 0, memoryMiB: 0 }, message: message.slice(0, 300) }],
        activity: [{ id: `activity:topology:${epoch}:red`, at: observedAt, kind: "build", summary: "Topology build failed; last consistent graph retained", status: "red" }, ...this.snapshotValue.activity].slice(0, 32),
        reconciliation: {
          ...this.snapshotValue.reconciliation,
          epoch,
          status: "red",
          inputFingerprint: currentFingerprint || this.snapshotValue.revisions.working.id,
          message: `Topology build failed: ${message.slice(0, 240)}`,
        },
      });
      publish("reconciliation.changed", this.snapshotValue);
    }
  }
}
