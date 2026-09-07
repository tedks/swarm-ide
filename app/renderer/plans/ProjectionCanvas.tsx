import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import { compactTaskPositions, dependencyPositions } from "../tasks/graph";

export interface ProjectionNode { id: string; title: string; subtitle: string; warning?: boolean }
export interface ProjectionEdge { id: string; source: string; target: string; label: string }

/** Each mounted projection owns its own camera. Changing metadata or selection
 * never requests fit; Fit is an explicit control after the initial mount. */
export function ProjectionCanvas({ label, nodes: input, edges: links, selected, onSelect, taskScopeVersion }: {
  label: string; nodes: ProjectionNode[]; edges: ProjectionEdge[]; selected: string | null; onSelect: (id: string) => void; taskScopeVersion?: number;
}) {
  const flow = useRef<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (taskScopeVersion === undefined) return;
    const frame = requestAnimationFrame(() => { void flow.current?.fitView({ padding: .2, maxZoom: 1 }); });
    return () => cancelAnimationFrame(frame);
  }, [taskScopeVersion]);
  const [positions, setPositions] = useState(new Map<string, { x: number; y: number }>());
  const graph = useMemo(() => {
    const layout = (taskScopeVersion === undefined ? dependencyPositions : compactTaskPositions)(input.map((node) => node.id), links);
    const nodes: Node[] = input.map((node) => ({ id: node.id, position: positions.get(node.id) ?? layout.get(node.id)!,
      sourcePosition: Position.Right, targetPosition: Position.Left, selected: selected === node.id,
      data: { label: <><strong>{node.title}</strong><small>{node.subtitle}</small></> },
      className: `planning-node ${node.warning ? "planning-warning" : ""}`, ariaLabel: `${node.title} · ${node.subtitle}` }));
    const edges: Edge[] = links.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#67b6a4" }, labelStyle: { fill: "#bcd9d1", fontSize: 10 }, labelBgStyle: { fill: "#0c1b1e" },
      interactionWidth: 24, focusable: true }));
    return { nodes, edges };
  }, [input, links, selected, positions, taskScopeVersion]);
  return <div className="planning-canvas" aria-label={label} onKeyDownCapture={(event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target instanceof Element ? event.target.closest(".react-flow__node[data-id]") : null;
    const id = target?.getAttribute("data-id");
    if (!id || !event.currentTarget.contains(target) || !input.some((node) => node.id === id)) return;
    event.preventDefault(); event.stopPropagation(); onSelect(id);
  }}>
    <ReactFlow nodes={graph.nodes} edges={graph.edges} onInit={(instance) => { flow.current = instance; }} fitView fitViewOptions={{ padding: .2, maxZoom: 1 }}
      minZoom={.08} maxZoom={2} nodesConnectable={false} nodesDraggable={false} elementsSelectable
      onNodeClick={(_event, node) => onSelect(node.id)}
      onNodeDragStop={(_event, node) => setPositions((prior) => new Map(prior).set(node.id, node.position))}>
      {/* Selection has one authority: explicit click/key/outline gestures. A Flow
          selection observation may still describe the previous controlled nodes. */}
      <Background color="#25413f" gap={22} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
