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
  ignored?: boolean;
  unavailable?: boolean;
  directoryEntry?: boolean;
}

export interface GraphConnectionFocus {
  id: string;
  kind: string;
  label: string;
  source: { label: string; focus: FocusRef };
  target: { label: string; focus: FocusRef };
  interfaceFocus: FocusRef;
  contract?: string;
  provenance: GraphSlice["provenance"];
}

export function describeGraphConnection(graph: GraphSlice, edgeId: string): GraphConnectionFocus | null {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);
  const source = edge && graph.nodes.find((candidate) => candidate.id === edge.source);
  const target = edge && graph.nodes.find((candidate) => candidate.id === edge.target);
  if (!edge || !source || !target) return null;
  const interfaceNode = source.focus.domain === "interface" ? source : target.focus.domain === "interface" ? target : target;
  return {
    id: edge.id,
    kind: edge.kind,
    label: edge.label ?? edge.kind,
    source: { label: source.label, focus: source.focus },
    target: { label: target.label, focus: target.focus },
    interfaceFocus: interfaceNode.focus,
    ...(interfaceNode.detail ? { contract: interfaceNode.detail } : {}),
    provenance: graph.provenance,
  };
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
        // Off-slice recipes count toward ambiguity but are not loaded nodes.
        if (!candidate.nodeId) continue;
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
  const entries = new Map(graph.directory?.entries.map((entry) => [entry.id, entry]) ?? []);
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
        ignored: entries.get(node.id)?.git === "ignored",
        unavailable: entries.get(node.id)?.actionable === false,
        directoryEntry: Boolean(graph.directory),
      },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: graph.directory ? undefined : edge.label,
      type: graph.directory ? "smoothstep" : "default",
      animated: edge.status === "yellow",
      focusable: true,
      interactionWidth: 28,
      markerEnd: graph.directory ? undefined : { type: MarkerType.ArrowClosed, color: edge.status === "red" ? "#d76161" : edge.status === "yellow" ? "#e8b55b" : "#477d77" },
      style: {
        stroke: edge.status === "red" ? "#d76161" : edge.status === "yellow" ? "#e8b55b" : "#477d77",
        strokeWidth: 1.7,
        cursor: "pointer",
      },
      labelStyle: { fill: "#8da4a1", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#0d1718", fillOpacity: 0.92 },
    })),
  };
}
