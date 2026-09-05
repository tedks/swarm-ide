import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { FocusRef, GraphSlice, NavigationMapping } from "../../protocol/schema";

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  detail?: string;
  status: GraphSlice["reconciliation"];
  focused: boolean;
  ambiguous: boolean;
  mappingConfidence?: number;
  mappingReason?: string;
  focus: FocusRef;
}

function sameFocus(left: FocusRef, right: FocusRef): boolean {
  return (
    left.worldId === right.worldId &&
    left.revisionKind === right.revisionKind &&
    left.revisionId === right.revisionId &&
    left.domain === right.domain &&
    left.key === right.key &&
    left.path === right.path &&
    left.symbol === right.symbol &&
    left.range?.startLine === right.range?.startLine &&
    left.range?.endLine === right.range?.endLine
  );
}

function mappedCandidates(
  focus: FocusRef,
  topologyId: string,
  mappings: NavigationMapping[],
): Map<string, { confidence: number; reason: string; ambiguous: boolean }> {
  const candidates = new Map<string, { confidence: number; reason: string; ambiguous: boolean }>();
  for (const mapping of mappings) {
    if (sameFocus(mapping.from, focus) && mapping.targetTopology === topologyId) {
      for (const candidate of mapping.candidates) {
        candidates.set(candidate.nodeId, {
          confidence: candidate.confidence,
          reason: candidate.reason,
          ambiguous: mapping.ambiguous,
        });
      }
    }
  }
  return candidates;
}

export function adaptGraph(
  graph: GraphSlice,
  focus: FocusRef,
  mappings: NavigationMapping[],
): { nodes: Array<Node<TopologyNodeData>>; edges: Edge[] } {
  const mapped = mappedCandidates(focus, graph.topologyId, mappings);
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: "topology",
      position: node.position,
      draggable: false,
      selectable: true,
      data: {
        label: node.label,
        kind: node.kind,
        detail: node.detail,
        status: node.status,
        focused: sameFocus(node.focus, focus) || mapped.has(node.id),
        ambiguous: mapped.get(node.id)?.ambiguous ?? false,
        mappingConfidence: mapped.get(node.id)?.confidence,
        mappingReason: mapped.get(node.id)?.reason,
        focus: node.focus,
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.status === "yellow",
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.status === "red" ? "#d76161" : edge.status === "yellow" ? "#e8b55b" : "#477d77" },
      style: {
        stroke: edge.status === "red" ? "#d76161" : edge.status === "yellow" ? "#e8b55b" : "#477d77",
        strokeWidth: 1.5,
      },
      labelStyle: { fill: "#8da4a1", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#0d1718", fillOpacity: 0.92 },
    })),
  };
}
