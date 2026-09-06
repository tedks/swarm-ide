import { memo, useMemo, useState, type ReactNode } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import type { FocusRef, GraphSlice, NavigationMapping } from "../../protocol/schema";
import { adaptGraph, describeGraphConnection, type GraphConnectionFocus, type TopologyNodeData } from "./graph-adapter";
import { useDirectoryCamera } from "./repository/camera";
import type { RepositoryCameraIntent } from "./repository/navigation";
import { useFramePresentation } from "./repository/presentation";
export type { GraphConnectionFocus } from "./graph-adapter";

function TopologyNode({ data }: NodeProps) {
  const node = data as TopologyNodeData;
  return (
    <div className={`topology-node ${node.directoryEntry ? "directory-map-node" : ""} status-${node.status} ${node.focused ? "is-focused" : ""} ${node.ambiguous ? "is-ambiguous" : ""} ${node.ignored ? "is-ignored" : ""} ${node.unavailable ? "is-unavailable" : ""}`} title={node.mappingReason ?? node.detail}>
      <Handle type="target" position={Position.Left} />
      {!node.directoryEntry ? <span className="node-kind">{node.kind}</span> : <span className="directory-map-icon" aria-hidden="true">{node.kind === "directory" ? "▱" : "·"}</span>}
      <strong>{node.label}</strong>
      {node.detail && !node.directoryEntry ? <small>{node.detail}</small> : null}
      {node.ambiguous && node.mappingConfidence !== undefined ? <span className="mapping-badge">candidate {Math.round(node.mappingConfidence * 100)}%</span> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { topology: TopologyNode };

interface GraphPaneProps {
  graph: GraphSlice;
  focus: FocusRef;
  mappings: NavigationMapping[];
  onFocus: (focus: FocusRef) => void;
  onConnectionFocus: (connection: GraphConnectionFocus) => void;
  onReconcile: () => void;
  reconciliationRunning: boolean;
  interfaceZoom: number | null;
  repositoryNavigation?: ReactNode;
  repositoryCameraIntent?: RepositoryCameraIntent | null;
}

export function GraphPane(props: GraphPaneProps) {
  return props.graph.topologyId === "repo" ? <RepositoryGraphPane {...props} /> : <GraphPaneContent {...props} />;
}

function RepositoryGraphPane(props: GraphPaneProps) {
  const presented = useFramePresentation(props);
  return <GraphPaneContent {...presented} />;
}

const GraphPaneContent = memo(function GraphPaneContent({ graph, focus, mappings, onFocus, onConnectionFocus, onReconcile, reconciliationRunning, repositoryNavigation, repositoryCameraIntent }: GraphPaneProps) {
  const adapted = useMemo(() => adaptGraph(graph, focus, mappings), [graph, focus, mappings]);
  const [repositoryView, setRepositoryView] = useState<"tree" | "map">("tree");
  const explorer = Boolean(graph.directory && repositoryNavigation);
  const camera = useDirectoryCamera(graph.directory, repositoryCameraIntent);
  // Interface zoom resizes CSS presentation, not the user's graph camera.
  // Let each mounted ReactFlow retain its own viewport through zoom/resize;
  // only initial fit and the explicit Fit control should frame the graph.

  return (
    <section className={`graph-pane ${graph.directory ? "has-directory" : ""} ${explorer ? `repository-view-${repositoryView}` : ""}`} data-topology={graph.topologyId} data-directory={graph.directory?.directory} data-observation-state={graph.directory?.state}>
      <header className="graph-header">
        <div><span className="eyebrow">{explorer ? "repository" : `${graph.topologyId} lens`}</span>{!explorer ? <h2>{graph.title}</h2> : null}</div>
        {explorer ? <div className="repository-view-switch" aria-label="Repository presentation"><button aria-pressed={repositoryView === "tree"} onClick={() => setRepositoryView("tree")}>Explorer</button><button aria-pressed={repositoryView === "map"} onClick={() => setRepositoryView("map")}>Map</button></div> : null}
        <div className="graph-meta"><span>{graph.scope}</span><span>{graph.zoomBand}</span>{graph.directory ? <span aria-label="Directory observation, not build evidence">◷</span> : graph.reconciliation === "yellow"
          ? <button className="truth-dot status-yellow" aria-label={reconciliationRunning ? "Topology build in progress" : "Build repository service topology"} title={reconciliationRunning ? "Topology build in progress" : "Working world changed — build topology"} disabled={reconciliationRunning} onClick={onReconcile} />
          : <span className={`truth-dot status-${graph.reconciliation}`} role="status" aria-label={`Topology ${graph.reconciliation === "green" ? "consistent" : graph.reconciliation === "gray" ? "unobserved" : "failed"}`} title={graph.reconciliation === "green" ? "Topology consistent" : graph.reconciliation === "gray" ? "Topology unobserved" : "Topology build failed"} />}</div>
      </header>
      {repositoryNavigation ? <div className="repository-browser-surface" hidden={explorer && repositoryView !== "tree"}>{repositoryNavigation}</div> : null}
      <div className="graph-canvas">
        <ReactFlow
          nodes={adapted.nodes}
          edges={adapted.edges}
          onInit={camera.onInit}
          onMoveStart={camera.onMoveStart}
          onMoveEnd={camera.onMoveEnd}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.35 }}
          minZoom={0.25}
          maxZoom={2.2}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_event, node) => onFocus((node.data as TopologyNodeData).focus)}
          onSelectionChange={({ edges }) => {
            if (edges.length !== 1) return;
            const connection = describeGraphConnection(graph, edges[0]!.id);
            if (connection) onConnectionFocus(connection);
          }}
          edgesFocusable
          elevateEdgesOnSelect
        >
          <Background color="#173031" gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
});
