import { CONTEXT_ROWS, type ContextEvidenceRef, type ContextSection, type ContextSubject, type ObservedServiceContext, type ServiceContextObservation } from "../../../protocol/context";
import type { WorkspaceSnapshot } from "../../../protocol/schema";
import type { TaskClientState } from "../tasks/client";
import { taskBacklinkSection } from "./task-backlinks";
import { indexCapture } from "./build-targets";
import { illustrativeLatency, type LatencyProfile } from "./latency";
export { indexCapture } from "./build-targets";
export interface ContextInstrument extends ContextSection { empty?: string; latency?: LatencyProfile }

export interface SourceReceipt { revision: string; receivedAt: string; realm: string; session: string }
export interface ContextFile {
  path: string; content: string; savedContent: string; revision: string; status: string; message: string;
  contextRead?: SourceReceipt; bufferGeneration?: number; bufferChangedAt?: string;
}
export function indexService(publication: ServiceContextObservation | undefined) {
  if (publication?.status !== "observed") return { publication, paths: new Map<string, { implementation: boolean; interfaces: string[] }>() };
  const paths = new Map<string, { implementation: boolean; interfaces: string[] }>();
  for (const path of publication.service.implementationPaths) paths.set(path, { implementation: true, interfaces: [] });
  for (const item of publication.service.interfaceDeclarationPaths) {
    const entry = paths.get(item.path) ?? { implementation: false, interfaces: [] };
    entry.interfaces.push(item.interfaceId); paths.set(item.path, entry);
  }
  return { publication, paths };
}
export interface ContextObservations {
  snapshot: WorkspaceSnapshot; files: readonly ContextFile[]; service: ReturnType<typeof indexService>;
  capture: ReturnType<typeof indexCapture>; realm: string; session: string; ready: boolean;
  tasks?: TaskClientState;
}
const bounded = (value: string) => value.length > 512 ? `${value.slice(0, 511)}…` : value;
export function contextLabel(subject: ContextSubject | null): string { return subject ? "path" in subject ? subject.path || "/" : subject.id ?? "No task selected" : "Nothing selected"; }
function buildEvidence(p: ObservedServiceContext, current: boolean): ContextEvidenceRef {
  return { provider: "Bazel service artifact", repositoryId: p.repositoryId, worldId: p.worldId, origin: p.artifactUri,
    revisionKind: "built", revision: `${p.buildId} · source ${p.sourceFingerprint} · inputs ${p.inputDigest}`, observedAt: p.observedAt,
    timeBasis: "producer", freshness: current ? "current" : "retained", coverage: "Complete retained example artifact only; other repository services unavailable" };
}
export function composeContext(subject: ContextSubject | null, input: ContextObservations): ContextInstrument[] {
  const { snapshot, service, capture } = input;
  if (!subject) return [];
  if (subject.repositoryId !== snapshot.project.id || subject.worldId !== snapshot.world.id) return [{ id: "unavailable", title: "Evidence unavailable", notice: "The inspected artifact belongs to a different repository or world.", rows: [] }];
  const sections: ContextInstrument[] = [];
  const file = subject.kind === "file" ? input.files.find((item) => item.path === subject.path) : undefined;
  const read = file?.contextRead;
  const readCurrent = Boolean(input.ready && read?.realm === input.realm && read.session === input.session && file?.revision === read.revision && !["error", "conflict", "unknown", "loading"].includes(file?.status ?? "error"));
  const dirty = Boolean(file && file.content !== file.savedContent);
  if (subject.kind === "file") {
    sections.push({ id: "source", title: "Working source", rows: [{ label: "Path", value: subject.path }, { label: "Editor", value: dirty ? `${file?.status} · unsaved changes` : file?.status ?? "Not open" }],
      notice: [file && ["error", "conflict", "unknown", "loading"].includes(file.status) ? bounded(file.message) : "",
        dirty ? "Unsaved buffer is not represented by this build." : ""].filter(Boolean).join(" ") || undefined,
      evidence: read ? {
      provider: "Source broker", repositoryId: subject.repositoryId, worldId: subject.worldId, origin: `repo://${subject.path}`, revisionKind: "source-read", revision: read.revision,
      observedAt: read.receivedAt, timeBasis: "client receipt", freshness: readCurrent ? "current" : "retained", coverage: "One broker-validated working file read; not a continuous disk assertion",
    } : undefined });
  }
  if (subject.kind === "directory") {
    const directory = snapshot.graphs.find((graph) => graph.topologyId === "repo")?.directory;
    sections.push(directory?.directory === subject.path ? { id: "directory", title: "Directory observation", evidence: {
      provider: "Repository reader", repositoryId: subject.repositoryId, worldId: subject.worldId, origin: `repo://${subject.path || "/"}`, revisionKind: "directory", revision: directory.observationId,
      observedAt: directory.capturedAt, timeBasis: "producer", freshness: input.ready && directory.state === "observed" ? "current" : "retained", coverage: `${directory.complete ? "Complete" : "Partial"} bounded capture; page ${directory.page + 1}/${directory.pageCount}; filter ${directory.filter || "none"}`,
    }, rows: [{ label: "Captured entries", value: String(directory.capturedCount) }, { label: "Filtered entries", value: String(directory.filteredCount) }, { label: "Page entries", value: String(directory.entries.length) }], notice: bounded(directory.notice ?? "Immediate children only; no recursive coverage claim") } : { id: "directory", title: "Directory observation", notice: "This directory has no matching current page observation.", rows: [] });
  }
  if (["file", "service", "interface", "edge"].includes(subject.kind)) {
    const declarations = snapshot.serviceDeclarations;
    if (declarations && declarations.repositoryId === subject.repositoryId && declarations.worldId === subject.worldId) {
      const graph = snapshot.graphs.find((entry) => entry.topologyId === "service");
      const edge = subject.kind === "edge" && subject.topologyId === "service" ? graph?.edges.find((entry) => entry.id === subject.id) : undefined;
      const records = declarations.services.filter((entry) => subject.kind === "file"
        ? entry.declarationPath === subject.path || entry.implementationPaths.includes(subject.path) || entry.interfaces.some((item) => item.path === subject.path)
        : subject.kind === "service" ? entry.id === subject.id
        : subject.kind === "interface" ? entry.interfaces.some((item) => item.id === subject.id)
        : Boolean(edge && [edge.source, edge.target].includes(entry.id)));
      const rows: ContextSection["rows"] = [];
      if (edge) rows.push({ label: "Relationship", value: edge.kind === "starts-after" ? "Declared startup dependency" : edge.label ?? edge.kind });
      for (const record of records) {
        rows.push({ label: "Service", value: record.displayName },
          { label: "Declaration", value: record.declarationPath, link: { kind: "source", path: record.declarationPath } });
        if (record.owningTarget) rows.push({ label: "Declared target", value: record.owningTarget, link: { kind: "graph", topologyId: "build", id: record.owningTarget } });
        for (const path of record.implementationPaths) rows.push({ label: "Implementation", value: path, link: { kind: "source", path } });
        for (const item of record.interfaces) rows.push({ label: item.role === "provided" ? "Provides" : "Requires", value: item.name, link: { kind: "source", path: item.path } });
      }
      const current = input.ready && snapshot.revisions.working.evidence === "observed" && declarations.sourceFingerprint === snapshot.revisions.working.fingerprint && graph?.reconciliation === "green";
      sections.push({ id: "services", title: "Declared services", rows, empty: rows.length ? undefined : "No services",
        notice: declarations.issues.length ? declarations.issues.join(" ") : !current ? "Showing the last service declarations." : undefined,
        evidence: { provider: "Service declarations", repositoryId: subject.repositoryId, worldId: subject.worldId,
          origin: records[0] ? `repo://${records[0].declarationPath}` : "repo://service-declarations", revisionKind: "source-read",
          revision: declarations.sourceFingerprint, observedAt: declarations.observedAt, timeBasis: "producer", freshness: current ? "current" : "retained",
          coverage: `${declarations.paths.length} declaration files; ${declarations.status === "partial" ? "partial discovery" : "tracked and nonignored files"}` } });
    } else {
    const p = service.publication;
    const matching = p?.status === "observed" && p.repositoryId === subject.repositoryId && p.worldId === subject.worldId && p.buildId === snapshot.revisions.built.id && p.sourceFingerprint === snapshot.revisions.built.sourceFingerprint;
    if (!matching) sections.push({ id: "services", title: "Declared services", empty: "No services", notice: "No matching service observation.", rows: [] });
    else {
      const record = p.service;
      const pathMatch = subject.kind === "file" ? service.paths.get(subject.path) : undefined;
      const graph = snapshot.graphs.find((item) => item.topologyId === "service");
      const edge = subject.kind === "edge" && subject.topologyId === "service" ? graph?.edges.find((item) => item.id === subject.id) : undefined;
      const allInterfaces = [...record.providedInterfaces, ...record.requiredInterfaces];
      const interfaceIds = subject.kind === "file" ? pathMatch?.interfaces ?? [] : subject.kind === "interface" ? [subject.id] : edge ? [edge.source, edge.target] : subject.kind === "service" && subject.id === record.id ? allInterfaces.map((item) => item.id) : [];
      const own = Boolean(pathMatch?.implementation || subject.kind === "service" && subject.id === record.id);
      const rows: ContextSection["rows"] = [];
      if (own) rows.push({ label: "Implementation member of", value: record.displayName }, { label: "Declared owning target", value: record.owningTarget });
      for (const item of allInterfaces.filter((item) => interfaceIds.includes(item.id))) {
        const required = record.requiredInterfaces.find((candidate) => candidate.id === item.id);
        rows.push({ label: required ? "Declares required interface" : "Declares provided interface", value: `${item.name} · ${item.requestType} → ${item.responseType}`,
          link: { kind: "source", path: record.interfaceDeclarationPaths.find((entry) => entry.interfaceId === item.id)!.path } });
        if (required) rows.push({ label: "Related service", value: required.serviceId });
      }
      if (own) for (const path of record.implementationPaths) rows.push({ label: "Implementation source", value: path, link: { kind: "source", path } });
      if (own || interfaceIds.some((id) => allInterfaces.some((item) => item.id === id))) rows.push({ label: "Service configuration", value: record.manifestPath, link: { kind: "source", path: record.manifestPath } });
      const current = input.ready && snapshot.revisions.working.evidence === "observed" && p.sourceFingerprint === snapshot.revisions.working.fingerprint && snapshot.reconciliation.status === "green" && graph?.reconciliation === "green" && graph.inputFingerprint === p.sourceFingerprint && (subject.kind !== "file" || readCurrent);
      sections.push({ id: "services", title: "Declared services", evidence: buildEvidence(p, current), rows, empty: !rows.length ? "No services" : undefined,
        notice: !rows.length ? "No association in this service artifact; other service coverage unavailable." : edge ? "Declared relationship, not an observed callsite." : !current ? "Retained build facts; not verified against the current inspected source." : undefined });
    }
  }
    }
  if (subject.kind === "file") {
    const c = capture.capture;
    const membership = c?.repositoryId === subject.repositoryId && (!capture.worldId || capture.worldId === subject.worldId) ? capture.forFile(subject.path) : undefined;
    const evidence: ContextEvidenceRef | undefined = membership && c ? {
      provider: c.observation ? "Repository Bazel query" : "Captured Bazel query", repositoryId: c.repositoryId, worldId: subject.worldId, origin: c.command, revisionKind: c.observation ? "build-query" : "capture", revision: c.revision,
      observedAt: c.capturedAt, timeBasis: "producer", freshness: c.observation ? input.ready && c.observation.status === "current" ? "current" : "retained" : "CAPTURE", coverage: c.observation?.coverage ?? "Recorded entries only; unknown outside this dated capture",
    } : undefined;
    const scope = !membership ? "No build observation yet." : c?.observation ? `${c.observation.complete ? "Returned query scope" : "Partial query scope"} · declarations, not compiled binaries.` : "Recorded capture only; not current ownership.";
    sections.push({ id: "capture", title: "Direct build targets", rows: (membership?.direct ?? []).map((label) => ({ label: "Direct reference", value: label, link: { kind: "graph", topologyId: "build", id: label } })), evidence,
      empty: !membership?.direct.length ? "No targets" : undefined, notice: scope });
    sections.push({ id: "indirect-targets", title: "Indirect build targets", rows: (membership?.indirect ?? []).map((label) => ({ label: "Transitive dependent", value: label, link: { kind: "graph", topologyId: "build", id: label } })), evidence,
      empty: !membership?.indirect.length ? "No targets" : undefined, notice: membership?.indirect.length ? "Includes this file through dependency paths; direct targets excluded." : scope });
    const latency = illustrativeLatency(subject, file, membership?.direct ?? []);
    sections.push({ id: "latency", title: "Latency", rows: [], latency, empty: latency ? undefined : "No latency profile", notice: latency ? undefined : "No declared demo tag or target profile for this file." });
    // Global deployment metadata has no file/service membership. Do not turn a
    // matching build ID or a service declaration into a deployment assertion.
    sections.push({ id: "deployments", title: "Deployed services", rows: [], empty: "No services", notice: "No file-to-deployment association observed." });
  }
  if (subject.kind === "file") sections.push(taskBacklinkSection(subject, input.tasks));
  return sections.map((section) => ({ ...section, total: section.rows.length, rows: section.rows.slice(0, CONTEXT_ROWS).map((row) => ({ ...row, label: bounded(row.label), value: row.link?.kind === "source" || section.id === "source" ? row.value : bounded(row.value) })) }));
}
