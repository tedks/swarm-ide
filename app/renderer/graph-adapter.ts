import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { FocusRef, GraphSlice, NavigationMapping } from "../../protocol/schema";

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  detail?: string;
  status: GraphSlice["reconciliation"];
  focused: boolean;
  focus: FocusRef;
}

function mappedNodeIds(focus: FocusRef, topologyId: string, mappings: NavigationMapping[]): Set<string> {
  const ids = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.from.key === focus.key && mapping.targetTopology === topologyId) {
      for (const candidate of mapping.candidates) ids.add(candidate.nodeId);
    }
  }
  return ids;
}

export function adaptGraph(
  graph: GraphSlice,
  focus: FocusRef,
  mappings: NavigationMapping[],
): { nodes: Array<Node<TopologyNodeData>>; edges: Edge[] } {
  const mapped = mappedNodeIds(focus, graph.topologyId, mappings);
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
        focused: node.focus.key === focus.key || mapped.has(node.id),
        focus: node.focus,
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.status === "yellow",
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.status === "yellow" ? "#e8b55b" : "#477d77" },
      style: {
        stroke: edge.status === "red" ? "#d76161" : edge.status === "yellow" ? "#e8b55b" : "#477d77",
        strokeWidth: 1.5,
      },
      labelStyle: { fill: "#8da4a1", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#0d1718", fillOpacity: 0.92 },
    })),
  };
}
