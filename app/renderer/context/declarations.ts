import type { FocusRef, WorkspaceSnapshot } from "../../../protocol/schema";
import { isRepositoryPath } from "../../../protocol/repository";

export interface DeclarationCandidate {
  path: string;
  relations: Array<{ role: "provided" | "required"; interfaceId: string; name: string; serviceId: string }>;
}
export interface DeclarationResolution {
  candidates: DeclarationCandidate[];
  notice: string;
  publication: string;
}

/** Only evidence changes invalidate a choice; ordinary focus publications do not. */
export function declarationPublication(snapshot: WorkspaceSnapshot | null): string {
  const graph = snapshot?.graphs.find((item) => item.topologyId === "service");
  return JSON.stringify([snapshot?.project.id, snapshot?.world.id, snapshot?.serviceContext,
    snapshot?.revisions.built, snapshot?.revisions.working, snapshot?.reconciliation.epoch,
    graph?.reconciliation, graph?.inputFingerprint]);
}

/** Consume a validated bounded Q1 publication. Labels/paths on FocusRef are not authority. */
export function resolveDeclarations(snapshot: WorkspaceSnapshot, focus: FocusRef): DeclarationResolution {
  const publication = declarationPublication(snapshot);
  const unavailable = (notice: string): DeclarationResolution => ({ candidates: [], notice, publication });
  const p = snapshot.serviceContext;
  const graph = snapshot.graphs.find((item) => item.topologyId === "service");
  if (focus.worldId !== snapshot.world.id || !["service", "interface"].includes(focus.domain) ||
      !graph?.nodes.some((node) => node.focus.domain === focus.domain && node.focus.key === focus.key && node.focus.worldId === focus.worldId))
    return unavailable("Definition unavailable: no exact service graph identity. Inspection remains available.");
  if (p?.status !== "observed" || p.repositoryId !== snapshot.project.id || p.worldId !== snapshot.world.id ||
      p.buildId !== snapshot.revisions.built.id || p.sourceFingerprint !== snapshot.revisions.built.sourceFingerprint)
    return unavailable("Definition unavailable: no matching built service evidence. Other service coverage is unknown.");
  const service = p.service;
  const contracts = [
    ...service.providedInterfaces.map((item) => ({ ...item, role: "provided" as const, serviceId: service.id })),
    ...service.requiredInterfaces.map((item) => ({ ...item, role: "required" as const })),
  ].filter((item) => focus.domain === "interface" ? item.id === focus.key
    : focus.key === service.id ? item.role === "provided" : item.role === "required" && item.serviceId === focus.key);
  const paths = new Map<string, DeclarationCandidate>();
  for (const item of contracts) {
    const path = service.interfaceDeclarationPaths.find((entry) => entry.interfaceId === item.id)?.path;
    if (!path || !isRepositoryPath(path)) return unavailable("Definition unavailable: unsupported declaration association; no fallback source inferred.");
    const candidate = paths.get(path) ?? { path, relations: [] };
    candidate.relations.push({ role: item.role, interfaceId: item.id, name: item.name, serviceId: item.serviceId });
    paths.set(path, candidate);
  }
  if (!paths.size) return unavailable("Definition unavailable: no recorded declaration for this identity; other service coverage is unknown.");
  const current = snapshot.revisions.working.evidence === "observed" && p.sourceFingerprint === snapshot.revisions.working.fingerprint &&
    snapshot.reconciliation.status === "green" && graph.reconciliation === "green" && graph.inputFingerprint === p.sourceFingerprint;
  return { publication, candidates: [...paths.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    notice: `${contracts.some((item) => item.role === "required") ? "Required interface declarations; external implementation unavailable." : "Provided interface declarations; not implementation or callsite evidence."} ${current ? "Current built artifact" : "Retained built artifact, not current source authority"} ${p.buildId}; source ${p.sourceFingerprint}. Complete example artifact only; other service coverage unknown. Opening revalidates the current working file; unsaved text is not described by this artifact.` };
}
