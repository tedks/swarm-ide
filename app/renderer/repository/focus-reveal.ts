import type { FocusRef, GraphSlice, NavigationMapping } from "../../../protocol/schema";
import type { ServiceDeclarations } from "../../../protocol/service-declarations";
import { adaptGraph } from "../graph-adapter";

export interface GraphFocusNavigation { scope: string; nonce: number; focus: FocusRef }

/** Use directed navigation and authored exact file membership, never guess an
 * inverse ownership edge. A shared source may legitimately reveal several nodes. */
export function focusRevealNodes(graph: GraphSlice, focus: FocusRef, mappings: NavigationMapping[], repositoryId?: string, declarations?: ServiceDeclarations): string[] {
  const found = new Set(adaptGraph(graph, focus, mappings).nodes.filter((node) => node.data.focused).map((node) => node.id));
  if (graph.topologyId !== "service" || focus.domain !== "repo" || !focus.path || focus.key !== `file:${focus.path}` ||
    !declarations || declarations.repositoryId !== repositoryId || declarations.worldId !== focus.worldId ||
    focus.revisionKind !== "working" || declarations.sourceFingerprint !== graph.inputFingerprint) return [...found];
  for (const service of declarations.services) {
    if (service.declarationPath === focus.path || service.implementationPaths.includes(focus.path)) found.add(service.id);
    for (const entry of service.interfaces) if (entry.path === focus.path) found.add(entry.id);
  }
  return graph.nodes.filter((node) => found.has(node.id) && node.focus.worldId === focus.worldId).map((node) => node.id);
}
