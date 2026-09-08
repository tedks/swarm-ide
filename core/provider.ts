import { PROTOCOL_VERSION, WorkspaceSnapshotSchema, type FocusRef, type GraphSlice, type NavigationMapping, type Provenance, type Widget, type WorkspaceSnapshot } from "../protocol/schema";
import { computeWorkingWorldFingerprint } from "./fingerprint";
import { registerRepository } from "./repository-registration";
import { RepositoryReader, RepositoryError } from "./repository";
import { RepositoryFileSearch } from "./repository-search";
import type { RepositorySearchRequest, RepositorySearchResult } from "../protocol/repository-search";
import { RepositoryRequestSchema, repositoryEntryId, type RepositoryObservation, type RepositoryRequest } from "../protocol/repository";
import { discoverServices, type ServiceDiscovery } from "./service-discovery";
import { adaptDeclaredServices } from "./service-topology";

export interface ProviderDependencies {
  register?: typeof registerRepository;
  repository?: (root: string, repositoryId: string) => Pick<RepositoryReader, "list" | "markStale" | "dispose">;
  fingerprint(workspaceRoot: string): Promise<string>;
  discover(workspaceRoot: string, signal?: AbortSignal): Promise<ServiceDiscovery>;
  now(): string;
}
export type ProviderPublish = (
  type: "workspace.changed" | "reconciliation.changed" | "graph.published" | "job.changed",
  snapshot: WorkspaceSnapshot,
) => void;
const defaultDependencies: ProviderDependencies = {
  fingerprint: computeWorkingWorldFingerprint, discover: discoverServices, now: () => new Date().toISOString(),
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
    scope: "project declarations",
    zoomBand: "service",
    epoch,
    reconciliation: status,
    inputFingerprint: fingerprint,
    nodes: [],
    edges: [],
    provenance: [{ sourceKind: "repo", uri: "repo://.", version: fingerprint, observedAt }],
  };
}

function initialWidgets(fingerprint: string, observedAt: string): Widget[] {
  return [{ id: "service-declarations", title: "Services", kind: "status", priority: 1,
    value: "Looking for service declarations", provenance: repoProvenance(fingerprint, observedAt) }];
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
  private discoveryPending: Promise<void> | undefined;
  private discoveryAbort: AbortController | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshRequested = false;
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

  dispose(): void { this.disposed = true; this.discoveryAbort?.abort(); if (this.refreshTimer) clearTimeout(this.refreshTimer); ++this.navigationGeneration; ++this.currentAttempt; if (this.directoryTimer) clearTimeout(this.directoryTimer); this.repository.dispose(); this.fileSearch.dispose(); }

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
      // another service's ownership; Context uses the exact publication.
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
    this.discoveryAbort?.abort();
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    const observedAt = this.dependencies.now();
    const hadGreen = this.snapshotValue.reconciliation.lastConsistentFingerprint !== "unobserved" || Boolean(this.snapshotValue.serviceDeclarations);
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
        message: hadGreen ? "Service declarations are updating" : "Reading service declarations",
      },
    }, fingerprint));
    publish("workspace.changed", this.snapshotValue);
    this.scheduleDiscovery(publish);
    return this.snapshotValue;
  }

  markWorkingWorldUnknown(message: string, publish: ProviderPublish): WorkspaceSnapshot {
    if (this.disposed) return this.snapshotValue;
    this.markDirectoryStale();
    this.workingWorldUnknown = true;
    ++this.currentAttempt;
    this.discoveryAbort?.abort();
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

  private scheduleDiscovery(publish: ProviderPublish): void {
    if (this.disposed) return;
    this.refreshRequested = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.startReconciliation(publish);
    }, 100);
    this.refreshTimer.unref();
  }

  startReconciliation(publish: ProviderPublish): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.discoveryPending) { this.refreshRequested = true; return this.discoveryPending; }
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = undefined; }
    this.refreshRequested = false;
    this.discoveryPending = this.readDeclarations(publish).finally(() => {
      this.discoveryPending = undefined;
      if (this.refreshRequested && !this.disposed) this.scheduleDiscovery(publish);
    });
    return this.discoveryPending;
  }

  private async readDeclarations(publish: ProviderPublish): Promise<void> {
    const attempt = ++this.currentAttempt;
    const epoch = this.snapshotValue.reconciliation.epoch + 1;
    const abort = new AbortController();
    this.discoveryAbort = abort;
    let fingerprintUnavailable = false;
    try {
      const before = await this.dependencies.fingerprint(this.workspaceRoot).catch((error) => { fingerprintUnavailable = true; throw error; });
      if (this.disposed || attempt !== this.currentAttempt) return;
      this.workingWorldUnknown = false;
      const previous = this.snapshotValue.graphs.find((graph) => graph.topologyId === "service")!;
      this.snapshotValue = WorkspaceSnapshotSchema.parse(retagSnapshot({
        ...this.snapshotValue,
        revisions: { ...this.snapshotValue.revisions, working: { id: before, fingerprint: before, evidence: "observed" } },
        graphs: this.snapshotValue.graphs.map((graph) => graph === previous ? { ...graph, epoch, reconciliation: "yellow" } : graph),
        reconciliation: { ...this.snapshotValue.reconciliation, epoch, status: "yellow", inputFingerprint: before, message: "Reading service declarations" },
      }, before));
      publish("reconciliation.changed", this.snapshotValue);
      const declaration = await this.dependencies.discover(this.workspaceRoot, abort.signal);
      if (this.disposed || attempt !== this.currentAttempt) return;
      const after = await this.dependencies.fingerprint(this.workspaceRoot).catch((error) => { fingerprintUnavailable = true; throw error; });
      if (this.disposed || attempt !== this.currentAttempt) return;
      if (after !== before) { this.markWorkingWorldChanged(after, publish); return; }
      if (declaration.invalid && (!declaration.services.length || previous.nodes.length)) throw new Error(declaration.issues.join(" ").slice(0, 460));
      const adapted = adaptDeclaredServices(declaration, before, epoch, this.dependencies.now(), this.snapshotValue.project.id);
      this.serviceMappings = adapted.mappings;
      this.serviceWidgets = adapted.widgets;
      const repo = this.snapshotValue.graphs.find((graph) => graph.topologyId === "repo")!;
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue, graphs: [repo, adapted.graph],
        mappings: rebindRepositoryMappings(adapted.mappings, repo), widgets: adapted.widgets,
        serviceDeclarations: adapted.declarations, serviceContext: undefined,
        reconciliation: { epoch, status: declaration.issues.length ? "yellow" : "green", inputFingerprint: before,
          lastConsistentFingerprint: declaration.issues.length ? this.snapshotValue.reconciliation.lastConsistentFingerprint : before,
          message: declaration.issues.length ? declaration.issues.join(" ").slice(0, 460)
            : declaration.services.length ? `${declaration.services.length} declared services` : "No service declarations found" },
      });
      publish("graph.published", this.snapshotValue);
    } catch (error) {
      if (this.disposed || attempt !== this.currentAttempt) return;
      if (fingerprintUnavailable) this.workingWorldUnknown = true;
      const message = error instanceof Error ? error.message.slice(0, 460) : "Could not read service declarations.";
      this.snapshotValue = WorkspaceSnapshotSchema.parse({
        ...this.snapshotValue,
        revisions: { ...this.snapshotValue.revisions, working: { ...this.snapshotValue.revisions.working,
          ...(fingerprintUnavailable ? { evidence: "unavailable" as const } : {}) } },
        graphs: this.snapshotValue.graphs.map((graph) => graph.topologyId === "service" ? { ...graph, epoch, reconciliation: "red" } : graph),
        reconciliation: { ...this.snapshotValue.reconciliation, epoch, status: "red", message },
      });
      publish("reconciliation.changed", this.snapshotValue);
    } finally { if (this.discoveryAbort === abort) this.discoveryAbort = undefined; }
  }
}
