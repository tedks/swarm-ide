import { z } from "zod";
import { FocusRefSchema, WorkspaceSnapshotSchema, type FocusRef, type WorkspaceSnapshot } from "../../protocol/schema";

export const NavigationSchema = z.object({
  paths: z.array(z.string().min(1).max(4096)).max(128),
  activeSurface: z.string().max(4096),
  lens: z.enum(["System", "Plan", "Performance", "Refactor"]),
  focus: FocusRefSchema.nullable(),
  snapshot: WorkspaceSnapshotSchema.optional(),
});
export const NAVIGATION_KEY = "swarm:document-navigation:v1";
export function readNavigation() {
  try { return NavigationSchema.parse(JSON.parse(window.sessionStorage.getItem(NAVIGATION_KEY) ?? "null")); }
  catch { return null; }
}
export function protectsBuffer(tab: { content: string; savedContent: string; status: string }) {
  return tab.content !== tab.savedContent || ["saving", "conflict", "unknown"].includes(tab.status);
}
export function staleSnapshot(snapshot: WorkspaceSnapshot, message: string): WorkspaceSnapshot {
  return {
    ...snapshot,
    reconciliation: { ...snapshot.reconciliation, status: "yellow", message },
    graphs: snapshot.graphs.map((graph) => ({ ...graph, reconciliation: "yellow", nodes: graph.nodes.map((node) => ({ ...node, status: "yellow" })), edges: graph.edges.map((edge) => ({ ...edge, status: "yellow" })) })),
    jobs: snapshot.jobs.map((job) => job.status === "running" ? { ...job, status: "failed", message: "Core disconnected; outcome unknown" } : job),
  };
}
// A restarted provider has not observed the old derived topology yet. Keep the
// coherent old slice explicitly stale until the new core actually builds one.
export function retainDerived(previous: WorkspaceSnapshot | null, incoming: WorkspaceSnapshot): WorkspaceSnapshot {
  if (!previous || incoming.reconciliation.lastConsistentFingerprint !== "unobserved" || previous.reconciliation.lastConsistentFingerprint === "unobserved") return incoming;
  const old = staleSnapshot(previous, "Core replaced; last observed topology retained as stale. Build to reconcile.");
  const retag = (focus: FocusRef): FocusRef => focus.revisionKind === "working" ? { ...focus, revisionId: incoming.revisions.working.id } : focus;
  return {
    ...incoming,
    revisions: { ...incoming.revisions, built: old.revisions.built },
    graphs: old.graphs.map((graph) => ({ ...graph, nodes: graph.nodes.map((node) => ({ ...node, focus: retag(node.focus) })) })),
    mappings: old.mappings.map((mapping) => ({ ...mapping, from: retag(mapping.from), candidates: mapping.candidates.map((candidate) => ({ ...candidate, focus: retag(candidate.focus) })) })),
    reconciliation: { ...incoming.reconciliation, status: incoming.reconciliation.status === "red" ? "red" : "yellow", lastConsistentFingerprint: old.reconciliation.lastConsistentFingerprint, message: old.reconciliation.message },
  };
}
