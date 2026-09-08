import { z } from "zod";
import { FocusRefSchema, WorkspaceSnapshotSchema, type FocusRef, type WorkspaceSnapshot } from "../../protocol/schema";
import { WorkspaceSelectionSchema } from "../../protocol/workspace";

export function navigationLens(_lens: string | undefined, _hasDocuments = false): "Workspace" {
  return "Workspace";
}

export const NavigationSchema = z.object({
  paths: z.array(z.string().min(1).max(4096)).max(128),
  activeSurface: z.string().max(4096),
  lens: z.enum(["Workspace", "Code", "System", "Plan", "Performance", "Refactor"]),
  focus: FocusRefSchema.nullable(),
  snapshot: WorkspaceSnapshotSchema.optional(),
  selectedWorktree: WorkspaceSelectionSchema.optional(),
}).transform((saved) => ({ ...saved, lens: navigationLens(saved.lens, saved.paths.length > 0) }));
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
    revisions: { ...snapshot.revisions, working: { ...snapshot.revisions.working, evidence: "unavailable" } },
    graphs: snapshot.graphs.map((graph) => graph.directory ? { ...graph, directory: { ...graph.directory, state: "stale" } } : ({ ...graph, reconciliation: "yellow", nodes: graph.nodes.map((node) => ({ ...node, status: "yellow" })), edges: graph.edges.map((edge) => ({ ...edge, status: "yellow" })) })),
    jobs: snapshot.jobs.map((job) => job.status === "running" ? { ...job, status: "failed", message: "Core disconnected; outcome unknown" } : job),
  };
}
// A restarted provider has not observed the old derived topology yet. Keep the
// coherent old slice explicitly stale until the new core actually builds one.
export function retainDerived(previous: WorkspaceSnapshot | null, incoming: WorkspaceSnapshot): WorkspaceSnapshot {
  if (!previous || previous.project.id !== incoming.project.id || previous.world.id !== incoming.world.id || incoming.serviceDeclarations || incoming.reconciliation.lastConsistentFingerprint !== "unobserved" ||
      (previous.reconciliation.lastConsistentFingerprint === "unobserved" && !previous.revisions.built.id && !previous.serviceDeclarations)) return incoming;
  const old = staleSnapshot(previous, "Reconnecting; showing the last service graph.");
  const retag = (focus: FocusRef): FocusRef => focus.revisionKind === "working" ? { ...focus, revisionId: incoming.revisions.working.id } : focus;
  return {
    ...incoming,
    revisions: { ...incoming.revisions, built: old.revisions.built },
    serviceContext: old.serviceContext,
    serviceDeclarations: old.serviceDeclarations,
    graphs: incoming.graphs.map((graph) => graph.directory ? graph : {
      ...(old.graphs.find((previousGraph) => previousGraph.topologyId === graph.topologyId) ?? graph),
      nodes: (old.graphs.find((previousGraph) => previousGraph.topologyId === graph.topologyId) ?? graph).nodes.map((node) => ({ ...node, focus: retag(node.focus) })),
    }),
    mappings: old.mappings.map((mapping) => ({ ...mapping, from: retag(mapping.from), candidates: mapping.candidates.map((candidate) => {
      const { nodeId, revealPath, ...rest } = candidate;
      if (mapping.targetTopology === "repo" && candidate.focus.domain === "repo" && candidate.focus.path && candidate.focus.key === `file:${candidate.focus.path}`) {
        const loaded = incoming.graphs.find((graph) => graph.topologyId === "repo")?.nodes.find((node) => node.kind === "file" && node.focus.path === candidate.focus.path);
        return { ...rest, focus: retag(candidate.focus), ...(loaded ? { nodeId: loaded.id } : { revealPath: candidate.focus.path }) };
      }
      return { ...candidate, focus: retag(candidate.focus) };
    }) })),
    reconciliation: { ...incoming.reconciliation, status: incoming.reconciliation.status === "red" ? "red" : "yellow", lastConsistentFingerprint: incoming.revisions.working.id.startsWith("unobserved:") ? "unobserved" : old.revisions.built.sourceFingerprint || old.reconciliation.lastConsistentFingerprint, message: old.reconciliation.message },
  };
}
