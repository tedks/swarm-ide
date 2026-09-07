import { CONTEXT_ROWS, type ContextEvidenceRef, type ContextSection, type ContextSubject, type ObservedServiceContext, type ServiceContextObservation } from "../../../protocol/context";
import type { WorkspaceSnapshot } from "../../../protocol/schema";
import { isRepositoryPath } from "../../../protocol/repository";
import type { BuildLinkSnapshot } from "../repository/layers";
import { buildTargets } from "../repository/build-view";

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
export function indexCapture(capture: BuildLinkSnapshot | undefined) {
  const paths = new Map<string, string[]>();
  if (!capture || capture.links.length > 4096 || new TextEncoder().encode(JSON.stringify(capture)).byteLength > 1024 * 1024 ||
      [capture.repositoryId, capture.revision, capture.command].some((item) => !item || item.length > 512) || !Number.isFinite(Date.parse(capture.capturedAt))) return { capture: undefined, paths };
  const targets = new Set(buildTargets(capture));
  // Same exact-reference relation as fileBuildTargets; invert it once for all
  // paths instead of scanning the capture on every inspection/cursor movement.
  for (const link of capture.links) {
    if ([link.from, link.to].some((label) => label.length > 512) || !isRepositoryPath(link.toPath, true) || !isRepositoryPath(link.fromPath, true)) return { capture: undefined, paths: new Map<string, string[]>() };
    if (!targets.has(link.from) || targets.has(link.to) || !isRepositoryPath(link.toPath)) continue;
    const labels = paths.get(link.toPath) ?? [];
    if (!labels.includes(link.from)) labels.push(link.from);
    paths.set(link.toPath, labels);
  }
  for (const labels of paths.values()) labels.sort();
  return { capture, paths };
}
export interface ContextObservations {
  snapshot: WorkspaceSnapshot; files: readonly ContextFile[]; service: ReturnType<typeof indexService>;
  capture: ReturnType<typeof indexCapture>; realm: string; session: string; ready: boolean;
}
const bounded = (value: string) => value.length > 512 ? `${value.slice(0, 511)}…` : value;
export function contextLabel(subject: ContextSubject | null): string { return subject ? "path" in subject ? subject.path || "/" : subject.id : "Nothing selected"; }
function buildEvidence(p: ObservedServiceContext, current: boolean): ContextEvidenceRef {
  return { provider: "Bazel service artifact", repositoryId: p.repositoryId, worldId: p.worldId, origin: p.artifactUri,
    revisionKind: "built", revision: `${p.buildId} · source ${p.sourceFingerprint} · inputs ${p.inputDigest}`, observedAt: p.observedAt,
    timeBasis: "producer", freshness: current ? "current" : "retained", coverage: "Complete retained example artifact only; other repository services unavailable" };
}
export function composeContext(subject: ContextSubject | null, input: ContextObservations): ContextSection[] {
  const { snapshot, service, capture } = input;
  if (!subject) return [];
  if (subject.repositoryId !== snapshot.project.id || subject.worldId !== snapshot.world.id) return [{ id: "unavailable", title: "Evidence unavailable", notice: "The inspected artifact belongs to a different repository or world.", rows: [] }];
  const sections: ContextSection[] = [];
  const file = subject.kind === "file" ? input.files.find((item) => item.path === subject.path) : undefined;
  const read = file?.contextRead;
  const readCurrent = Boolean(input.ready && read?.realm === input.realm && read.session === input.session && file?.revision === read.revision && !["error", "conflict", "unknown", "loading"].includes(file?.status ?? "error"));
  const dirty = Boolean(file && file.content !== file.savedContent);
  if (subject.kind === "file") {
    sections.push({ id: "source", title: "Working source", rows: [{ label: "Path", value: subject.path }, { label: "Editor", value: file?.status ?? "Not open" }], notice: bounded(file?.message ?? "Inspect or explicitly open this file to observe source; Context does not read files.") });
    if (read) sections.push({ id: "source-read", title: "Last read from working file", rows: [{ label: "SHA-256", value: read.revision }], evidence: {
      provider: "Source broker", repositoryId: subject.repositoryId, worldId: subject.worldId, origin: `repo://${subject.path}`, revisionKind: "source-read", revision: read.revision,
      observedAt: read.receivedAt, timeBasis: "client receipt", freshness: readCurrent ? "current" : "retained", coverage: "One broker-validated working file read; not a continuous disk assertion",
    } });
    sections.push({ id: "buffer", title: "Local editor buffer", rows: [{ label: "State", value: dirty ? "Unsaved buffer" : "No unsaved text difference" }], evidence: {
      provider: "Local editor", repositoryId: subject.repositoryId, worldId: subject.worldId, origin: `buffer:${subject.path}`, revisionKind: "buffer", revision: String(file?.bufferGeneration ?? 0),
      observedAt: file?.bufferChangedAt ?? null, timeBasis: file?.bufferChangedAt ? "local edit" : "unavailable", freshness: "current", coverage: "Local buffer generation only; not a Git, build or deployment revision",
    }, notice: dirty ? "Unsaved buffer is not represented by this build." : undefined });
  }
  if (subject.kind === "directory") {
    const directory = snapshot.graphs.find((graph) => graph.topologyId === "repo")?.directory;
    sections.push(directory?.directory === subject.path ? { id: "directory", title: "Directory observation", evidence: {
      provider: "Repository reader", repositoryId: subject.repositoryId, worldId: subject.worldId, origin: `repo://${subject.path || "/"}`, revisionKind: "directory", revision: directory.observationId,
      observedAt: directory.capturedAt, timeBasis: "producer", freshness: input.ready && directory.state === "observed" ? "current" : "retained", coverage: `${directory.complete ? "Complete" : "Partial"} bounded capture; page ${directory.page + 1}/${directory.pageCount}; filter ${directory.filter || "none"}`,
    }, rows: [{ label: "Captured entries", value: String(directory.capturedCount) }, { label: "Filtered entries", value: String(directory.filteredCount) }, { label: "Page entries", value: String(directory.entries.length) }], notice: bounded(directory.notice ?? "Immediate children only; no recursive coverage claim") } : { id: "directory", title: "Directory observation", notice: "This directory has no matching current page observation.", rows: [] });
  }
  if (["file", "service", "interface", "edge"].includes(subject.kind)) {
    const p = service.publication;
    const matching = p?.status === "observed" && p.repositoryId === subject.repositoryId && p.worldId === subject.worldId && p.buildId === snapshot.revisions.built.id && p.sourceFingerprint === snapshot.revisions.built.sourceFingerprint;
    if (!matching) sections.push({ id: "services", title: "Service relationships", notice: p?.status === "unavailable" ? p.reason : "Service artifact unavailable; no repository-wide service coverage.", rows: [] });
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
      sections.push({ id: "services", title: "Service relationships", evidence: buildEvidence(p, current), rows, notice: !rows.length ? "No association in the retained example artifact; other service coverage unavailable." : edge ? "Declared relationship, not an observed callsite." : !current ? "Retained build facts; not verified against the current inspected source." : undefined });
    }
  }
  if (subject.kind === "file") {
    const c = capture.capture;
    const labels = c?.repositoryId === subject.repositoryId ? capture.paths.get(subject.path) ?? [] : undefined;
    sections.push(labels && c ? { id: "capture", title: "Direct references in CAPTURE", rows: labels.map((label) => ({ label: "Captured target", value: label })), evidence: {
      provider: "Captured Bazel query", repositoryId: c.repositoryId, worldId: subject.worldId, origin: c.command, revisionKind: "capture", revision: c.revision,
      observedAt: c.capturedAt, timeBasis: "producer", freshness: "CAPTURE", coverage: "Recorded entries only; unknown outside this dated capture",
    }, notice: labels.length ? "Captured references are not current ownership." : "No direct references in this capture; current target ownership unavailable." } : { id: "capture", title: "Captured build references", notice: "No bounded registered capture for this repository.", rows: [] });
  }
  sections.push({ id: "unsupported", title: "Providers not available", rows: [], notice: "Reverse task, bug, design and lesson links; deployment, runtime and function metrics are unavailable. Missing evidence is not zero." });
  return sections.map((section) => ({ ...section, total: section.rows.length, rows: section.rows.slice(0, CONTEXT_ROWS).map((row) => ({ ...row, label: bounded(row.label), value: row.link?.kind === "source" || section.id === "source" ? row.value : bounded(row.value) })) }));
}
