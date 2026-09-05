import { useMemo } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import type { FocusRef, GraphSlice, NavigationMapping } from "../../protocol/schema";
import { adaptGraph, type TopologyNodeData } from "./graph-adapter";

function TopologyNode({ data }: NodeProps) {
  const node = data as TopologyNodeData;
  return (
    <div className={`topology-node status-${node.status} ${node.focused ? "is-focused" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="node-kind">{node.kind}</span>
      <strong>{node.label}</strong>
      {node.detail ? <small>{node.detail}</small> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { topology: TopologyNode };

export function GraphPane({ graph, focus, mappings, onFocus }: {
  graph: GraphSlice;
  focus: FocusRef;
  mappings: NavigationMapping[];
  onFocus: (focus: FocusRef) => void;
}) {
  const adapted = useMemo(() => adaptGraph(graph, focus, mappings), [graph, focus, mappings]);
  return (
    <section className="graph-pane" data-topology={graph.topologyId}>
      <header className="graph-header">
        <div><span className="eyebrow">{graph.topologyId} lens</span><h2>{graph.title}</h2></div>
        <div className="graph-meta"><span>{graph.scope}</span><span>{graph.zoomBand}</span><span className={`truth-dot status-${graph.reconciliation}`}>{graph.reconciliation}</span></div>
      </header>
      <div className="graph-canvas">
        <ReactFlow
          nodes={adapted.nodes}
          edges={adapted.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.35 }}
          minZoom={0.25}
          maxZoom={2.2}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_event, node) => onFocus((node.data as TopologyNodeData).focus)}
        >
          <Background color="#173031" gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
