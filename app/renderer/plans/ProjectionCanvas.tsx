import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Background, BaseEdge, Controls, getBezierPath, MarkerType, Position, ReactFlow, type Edge, type EdgeProps, type Node, type ReactFlowInstance, type Viewport } from "@xyflow/react";
import { compactTaskPositions, dependencyPositions } from "../tasks/graph";

export interface ProjectionNode { id: string; title: string; subtitle: string; warning?: boolean; position?: { x: number; y: number }; port?: Position }
export interface ProjectionEdge { id: string; source: string; target: string; label: string; kind?: "containment" | "interface" }

/** Labels are ordinary SVG text: they never disappear while measuring a box.
 * Reciprocal directed interfaces take opposite lanes, preserving both arrows. */
function DesignEdge(props: EdgeProps) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props;
  let [path, x, y] = getBezierPath(props);
  if (props.data?.reciprocal) {
    const length = Math.hypot(tx - sx, ty - sy) || 1;
    const cx = (sx + tx) / 2 - (ty - sy) / length * 64;
    const cy = (sy + ty) / 2 + (tx - sx) / length * 64;
    path = `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;
    x = (sx + 2 * cx + tx) / 4; y = (sy + 2 * cy + ty) / 4;
  }
  return <g className={`design-edge ${props.data?.kind ?? "interface"}`} data-emphasized={props.data?.emphasized || undefined}>
    <title>{String(props.data?.description ?? props.label)}</title>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} interactionWidth={24} />
    <text x={x} y={y - 8} textAnchor="middle" className="design-edge-label">{props.label}</text>
  </g>;
}
const edgeTypes = { design: DesignEdge };
// Camera coordinates only, scoped by canonical workspace/component identity;
// retained when a temporary unavailable plan unmounts its canvas.
const retainedCameras = new Map<string, Viewport>();
function retainCamera(key: string, viewport: Viewport) {
  retainedCameras.delete(key); retainedCameras.set(key, { ...viewport });
  if (retainedCameras.size > 128) retainedCameras.delete(retainedCameras.keys().next().value!);
}

/** Each mounted projection owns its own camera. Changing metadata or selection
 * never requests fit; Fit is an explicit control after the initial mount. */
export function ProjectionCanvas({ label, nodes: input, edges: links, selected, onSelect, taskScopeVersion, cameraScope }: {
  label: string; nodes: ProjectionNode[]; edges: ProjectionEdge[]; selected: string | null; onSelect: (id: string) => void; taskScopeVersion?: number; cameraScope?: string;
}) {
  const flow = useRef<ReactFlowInstance | null>(null);
  const cameras = useRef(new Map<string, Viewport>());
  const scope = useRef(cameraScope);
  const cameraKey = cameraScope ? `${label}:${cameraScope}` : undefined;
  useLayoutEffect(() => {
    scope.current = cameraScope;
    const saved = cameraScope ? cameras.current.get(cameraScope) ?? retainedCameras.get(`${label}:${cameraScope}`) : undefined;
    if (saved) void flow.current?.setViewport(saved);
    // A first visit keeps the current camera; Fit remains an explicit gesture.
    // Layout cleanup captures the outgoing viewport BEFORE the incoming scope
    // installs its camera. Passive cleanup would save B's viewport under A.
    return () => {
      if (cameraScope && flow.current) {
        const viewport = flow.current.getViewport();
        cameras.current.set(cameraScope, viewport);
        retainCamera(`${label}:${cameraScope}`, viewport);
      }
    };
  }, [cameraScope, label]);
  useEffect(() => {
    if (taskScopeVersion === undefined) return;
    const frame = requestAnimationFrame(() => { void flow.current?.fitView({ padding: .2, maxZoom: 1 }); });
    return () => cancelAnimationFrame(frame);
  }, [taskScopeVersion]);
  const [positions, setPositions] = useState(new Map<string, { x: number; y: number }>());
  const graph = useMemo(() => {
    const layout = (taskScopeVersion === undefined ? dependencyPositions : compactTaskPositions)(input.map((node) => node.id), links);
    const nodes: Node[] = input.map((node) => ({ id: node.id, position: positions.get(node.id) ?? node.position ?? layout.get(node.id)!,
      sourcePosition: node.port ?? (taskScopeVersion === undefined ? Position.Right : Position.Bottom),
      targetPosition: node.port ?? (taskScopeVersion === undefined ? Position.Left : Position.Top), selected: selected === node.id,
      data: { label: <><strong>{node.title}</strong><small>{node.subtitle}</small></> },
      className: `planning-node ${node.warning ? "planning-warning" : ""}`, ariaLabel: `${node.title} · ${node.subtitle}` }));
    const edges: Edge[] = links.map((edge) => ({ ...edge, ...(edge.kind ? { type: "design", data: {
      kind: edge.kind, emphasized: edge.kind === "interface" && (edge.source === selected || edge.target === selected),
      reciprocal: edge.kind === "interface" && links.some((other) => other.kind === "interface" && other.source === edge.target && other.target === edge.source),
      description: `${edge.source} → ${edge.target}: ${edge.label}`,
    }, ariaLabel: `${edge.source} → ${edge.target}: ${edge.label}` } : {}),
      markerEnd: edge.kind === "containment" ? undefined : { type: MarkerType.ArrowClosed },
      style: { stroke: edge.kind === "containment" ? "#426960" : "#67b6a4", ...(edge.kind === "containment" ? { strokeDasharray: "4 5", opacity: .5 } : {}) }, labelStyle: { fill: "#bcd9d1", fontSize: 10 }, labelBgStyle: { fill: "#0c1b1e" },
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
    <ReactFlow nodes={graph.nodes} edges={graph.edges} edgeTypes={edgeTypes} onInit={(instance) => { flow.current = instance; const saved = cameraKey ? retainedCameras.get(cameraKey) : undefined; if (saved) requestAnimationFrame(() => requestAnimationFrame(() => { if (flow.current === instance && scope.current === cameraScope) void instance.setViewport(saved); })); }} onMoveEnd={(_event, viewport) => { if (cameraKey) retainCamera(cameraKey, viewport); }} fitView fitViewOptions={{ padding: cameraScope ? .07 : .2, maxZoom: 1 }}
      minZoom={.08} maxZoom={2} nodesConnectable={false} nodesDraggable={false} elementsSelectable
      onNodeClick={(_event, node) => onSelect(node.id)}
      onNodeDragStop={(_event, node) => setPositions((prior) => new Map(prior).set(node.id, node.position))}>
      {/* Selection has one authority: explicit click/key/outline gestures. A Flow
          selection observation may still describe the previous controlled nodes. */}
      <Background color="#25413f" gap={22} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
