import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import type { FocusRef, GraphSlice, NavigationMapping } from "../../protocol/schema";
import { adaptGraph, describeGraphConnection, type GraphConnectionFocus, type TopologyNodeData } from "./graph-adapter";
import { useDirectoryCamera, type GraphCamera } from "./repository/camera";
import type { RepositoryCameraIntent } from "./repository/navigation";
import { useFramePresentation } from "./repository/presentation";
import { directoryZoomDestination } from "./repository/map";
import { parentDirectory } from "./repository/navigation";
import { useGraphReframe } from "./repository/reframe";
import { AgentSprites } from "./repository/AgentSprites";
import { directoryBuildLinks, withMockDirectoryAgents, type BuildLinkSnapshot } from "./repository/layers";
import "./service-graph-status.css";
export type { GraphConnectionFocus } from "./graph-adapter";

function EmptyServiceGraph({ graph, running }: { graph: GraphSlice; running: boolean }) {
  if (graph.topologyId !== "service" || graph.nodes.length) return null;
  const message = graph.reconciliation === "gray"
    ? ["Service topology not observed", "No service observation is available for this scope. Browse the repository, or use Build when service topology is configured."]
    : graph.reconciliation === "yellow"
      ? running
        ? ["Building service topology", "A topology build is in progress. Results will appear here when an observation is available."]
        : ["Service topology needs a build", "The working state has changed. Use the existing Build control to request a fresh topology observation."]
      : graph.reconciliation === "red"
        ? ["Service topology build failed", "Check Build output for details. No usable graph is available here; this is not an observed empty result."]
        : graph.provenance.some((item) => item.sourceKind === "build")
          ? ["No services in this observation", "The recorded build contains no service nodes for this scope, not the entire repository or its deployments."]
          : ["Service topology unavailable", "No build-backed service observation is available for this scope. An empty canvas does not establish that no services exist."];
  return <div className={`service-graph-status service-graph-status-${graph.reconciliation}`} role="status" aria-label="Service graph availability">
    <span className="service-graph-status-label">Service observation</span>
    <strong>{message[0]}</strong>
    <p>{message[1]}</p>
  </div>;
}

function TopologyNode({ data }: NodeProps) {
  const node = data as TopologyNodeData;
  const buildHandles = <><Handle id="build-in" type="target" position={Position.Left} className="directory-build-handle" /><Handle id="build-out" type="source" position={Position.Right} className="directory-build-handle" /></>;
  if (node.directoryContainer) return <div className={`directory-map-frame ${node.focused ? "is-focused" : ""}`}><header>▱ {node.focus.path || node.label}<span>directory</span></header>{buildHandles}{node.mockAgents ? <AgentSprites count={node.mockAgents} /> : null}</div>;
  return (
    <div className={`topology-node ${node.directoryEntry ? "directory-map-node" : ""} status-${node.status} ${node.focused ? "is-focused" : ""} ${node.ambiguous ? "is-ambiguous" : ""} ${node.ignored ? "is-ignored" : ""} ${node.unavailable ? "is-unavailable" : ""}`} title={node.mappingReason ?? node.detail}>
      {!node.directoryEntry ? <Handle type="target" position={Position.Left} /> : null}
      {node.directoryEntry ? buildHandles : null}
      {!node.directoryEntry ? <span className="node-kind">{node.kind}</span> : <span className="directory-map-icon" aria-hidden="true">{node.kind === "directory" ? "▱" : "·"}</span>}
      <strong>{node.label}</strong>
      {node.detail && !node.directoryEntry ? <small>{node.detail}</small> : null}
      {node.ambiguous && node.mappingConfidence !== undefined ? <span className="mapping-badge">candidate {Math.round(node.mappingConfidence * 100)}%</span> : null}
      {!node.directoryEntry ? <Handle type="source" position={Position.Right} /> : null}
      {node.mockAgents ? <AgentSprites count={node.mockAgents} /> : null}
    </div>
  );
}

const nodeTypes = { topology: TopologyNode };

interface GraphPaneProps {
  graph: GraphSlice;
  focus: FocusRef;
  mappings: NavigationMapping[];
  onFocus: (focus: FocusRef) => void;
  onActivate?: (focus: FocusRef, origin?: HTMLElement) => void;
  onConnectionFocus: (connection: GraphConnectionFocus) => void;
  onReconcile: () => void;
  reconciliationRunning: boolean;
  interfaceZoom: number | null;
  repositoryNavigation?: ReactNode;
  repositoryCameraIntent?: RepositoryCameraIntent | null;
  onNavigateDirectory?: (directory: string) => Promise<boolean>;
  onInspectFocus?: (focus: FocusRef) => void;
  buildLinkSnapshot?: BuildLinkSnapshot;
  onBuildLinksVisibility?: (visible: boolean) => void;
  buildGraphStatus?: string;
  mockAgents?: boolean;
  mockGraphVersion?: number;
  reframeVersion?: number;
}

export function GraphPane(props: GraphPaneProps) {
  return props.graph.topologyId === "repo" ? <RepositoryGraphPane {...props} /> : <GraphPaneContent {...props} />;
}

function RepositoryGraphPane(props: GraphPaneProps) {
  const presented = useFramePresentation(props);
  return <GraphPaneContent {...presented} />;
}

const GraphPaneContent = memo(function GraphPaneContent({ graph, focus, mappings, onFocus, onActivate, onConnectionFocus, onReconcile, reconciliationRunning, repositoryNavigation, repositoryCameraIntent, onNavigateDirectory, onInspectFocus, buildLinkSnapshot, onBuildLinksVisibility, buildGraphStatus, mockAgents = false, mockGraphVersion = 0, reframeVersion = 0 }: GraphPaneProps) {
  const adapted = useMemo(() => adaptGraph(graph, focus, mappings), [graph, focus, mappings]);
  const [buildLinksVisible, setBuildLinksVisible] = useState(false);
  useEffect(() => { onBuildLinksVisibility?.(buildLinksVisible); return () => onBuildLinksVisibility?.(false); }, [buildLinksVisible, onBuildLinksVisibility]);
  const [mockAgentsVisible, setMockAgentsVisible] = useState(false);
  useEffect(() => { setMockAgentsVisible(mockAgents); }, [mockAgents, mockGraphVersion]);
  const [selectedBuildLink, setSelectedBuildLink] = useState<string | null>(null);
  const buildEdges = useMemo(() => graph.directory && buildLinksVisible && buildLinkSnapshot ? directoryBuildLinks(adapted.nodes, buildLinkSnapshot) : [], [graph.directory, adapted.nodes, buildLinksVisible, buildLinkSnapshot]);
  const displayNodes = useMemo(() => mockAgentsVisible ? withMockDirectoryAgents(adapted.nodes) : adapted.nodes, [mockAgentsVisible, adapted.nodes]);
  const selectedBuild = buildEdges.find((edge) => edge.id === selectedBuildLink);
  const [repositoryView, setRepositoryView] = useState<"tree" | "map">("tree");
  const explorer = Boolean(graph.directory && repositoryNavigation);
  const camera = useDirectoryCamera(graph.directory, repositoryCameraIntent);
  const flow = useRef<GraphCamera | null>(null);
  const cancelReframe = useGraphReframe(flow, reframeVersion);
  const canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ startZoom: number; baselineZoom: number; directory: string } | null>(null);
  const baseline = useRef<{ directory: string; zoom: number } | null>(null);
  const navigating = useRef(false);
  const navigate = (directory: string) => {
    if (!onNavigateDirectory || navigating.current) return;
    navigating.current = true;
    void onNavigateDirectory(directory).finally(() => { navigating.current = false; });
  };
  // Interface zoom resizes CSS presentation, not the user's graph camera.
  // Let each mounted ReactFlow retain its own viewport through zoom/resize;
  // only initial fit and the explicit Fit control should frame the graph.

  return (
    <section className={`graph-pane ${graph.directory ? "has-directory" : ""} ${explorer ? `repository-view-${repositoryView}` : ""}`} data-topology={graph.topologyId} data-directory={graph.directory?.directory} data-observation-state={graph.directory?.state}
      onKeyDownCapture={(event) => {
        if (!onActivate || event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
        const element = event.target instanceof HTMLElement ? event.target : null;
        if (!element?.classList.contains("react-flow__node")) return;
        const node = graph.nodes.find((item) => item.id === element.dataset.id);
        if (!node || !["service", "interface"].includes(node.focus.domain)) return;
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) { if (event.shiftKey) onFocus(node.focus); else onActivate(node.focus, element); }
      }}>
      <header className="graph-header">
        <div tabIndex={onActivate ? 0 : undefined} role={onActivate ? "note" : undefined} aria-label={onActivate ? "Click or Enter opens a recorded declaration. Alt-click or Shift+Enter inspects without opening. Declarations are not callsites." : undefined}><span className="eyebrow">{explorer ? "repository" : `${graph.topologyId} lens`}{onActivate ? " · ↵ open · ⇧↵ inspect" : ""}</span>{!explorer ? <h2>{graph.title}</h2> : null}</div>
        {explorer ? <div className="repository-view-switch" aria-label="Repository presentation"><button aria-pressed={repositoryView === "tree"} onClick={() => setRepositoryView("tree")}>Explorer</button><button aria-pressed={repositoryView === "map"} onClick={() => setRepositoryView("map")}>Map</button></div> : null}
        {graph.directory && onNavigateDirectory ? <div className="directory-map-controls"><button disabled={!graph.directory.directory} aria-label="Map parent directory" onClick={() => navigate(parentDirectory(graph.directory!.directory))}>↑</button><button aria-label="Map repository root" onClick={() => navigate("")}>/</button><span title={graph.directory.directory || "/"}>{graph.directory.directory || "/"}</span></div> : null}
        <div className="graph-meta"><span>{graph.scope}</span><span>{graph.zoomBand}</span>{graph.directory ? <span aria-label="Directory observation, not build evidence">◷</span> : graph.reconciliation === "yellow"
          ? <button className="truth-dot status-yellow" aria-label={reconciliationRunning ? "Topology build in progress" : "Build repository service topology"} title={reconciliationRunning ? "Topology build in progress" : "Working world changed — build topology"} disabled={reconciliationRunning} onClick={onReconcile} />
          : <span className={`truth-dot status-${graph.reconciliation}`} role="status" aria-label={`Topology ${graph.reconciliation === "green" ? "consistent" : graph.reconciliation === "gray" ? "unobserved" : "failed"}`} title={graph.reconciliation === "green" ? "Topology consistent" : graph.reconciliation === "gray" ? "Topology unobserved" : "Topology build failed"} />}</div>
      </header>
      {graph.directory ? <div className="directory-layers" aria-label="Directory map layers">
        <button aria-pressed={buildLinksVisible} disabled={!buildLinkSnapshot && !onBuildLinksVisibility} title={buildLinkSnapshot?.observation ? `Bazel observation ${buildGraphStatus}; not a binary build` : "Show repository-scoped Bazel dependency observations"} onClick={() => { setBuildLinksVisible((shown) => !shown); setSelectedBuildLink(null); }}>{buildLinksVisible ? "☑" : "☐"} Build links</button>
        <button aria-pressed={mockAgentsVisible} onClick={() => setMockAgentsVisible((shown) => !shown)}>♧ Mock agents</button>
        <span>{!buildLinkSnapshot ? `Build graph ${buildGraphStatus ?? "not requested"}` : buildLinksVisible ? `${buildLinkSnapshot.observation ? `Observation ${buildGraphStatus}` : "CAPTURE"} · ${buildEdges.length} visible links · not binary build truth` : "Build links off · click to show dependencies"}</span>
      </div> : null}
      {repositoryNavigation ? <div className="repository-browser-surface" hidden={explorer && repositoryView !== "tree"}>{repositoryNavigation}</div> : null}
      <div className="graph-canvas" ref={canvas}>
        <ReactFlow
          nodes={displayNodes}
          edges={buildEdges.length ? buildEdges : adapted.edges}
          onInit={(instance) => { flow.current = instance; camera.onInit(instance); }}
          onMoveStart={(event) => {
            if (event) cancelReframe();
            camera.onMoveStart(event);
            if (!event || !graph.directory || !flow.current || !onNavigateDirectory) return;
            const zoom = flow.current.getViewport().zoom;
            if (baseline.current?.directory !== graph.directory.directory) baseline.current = { directory: graph.directory.directory, zoom };
            gesture.current = { directory: graph.directory.directory, startZoom: zoom, baselineZoom: baseline.current.zoom };
          }}
          onMoveEnd={(event, viewport) => {
            camera.onMoveEnd(event, viewport);
            const started = gesture.current; gesture.current = null;
            if (!event || !started || !graph.directory || started.directory !== graph.directory.directory || !canvas.current) return;
            const rect = canvas.current.getBoundingClientRect();
            const pointer = "clientX" in event ? event : "changedTouches" in event ? event.changedTouches[0] : null;
            const point = { x: ((pointer?.clientX ?? rect.left + rect.width / 2) - rect.left - viewport.x) / viewport.zoom, y: ((pointer?.clientY ?? rect.top + rect.height / 2) - rect.top - viewport.y) / viewport.zoom };
            const destination = directoryZoomDestination({ nodes: adapted.nodes, viewport, ...started, point });
            if (destination !== null) navigate(destination);
          }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.35 }}
          minZoom={graph.directory ? 0.03 : 0.25}
          maxZoom={graph.directory ? 4 : 2.2}
          zoomOnDoubleClick={!graph.directory}
          nodesConnectable={false}
          elementsSelectable
          autoPanOnNodeFocus={onActivate ? false : undefined}
          onNodeClick={(event, node) => { const data = node.data as TopologyNodeData; if (onActivate && !event.altKey && ["service", "interface"].includes(data.focus.domain)) onActivate(data.focus, event.currentTarget as HTMLElement); else if (graph.directory && data.kind === "directory" && onInspectFocus) onInspectFocus(data.focus); else onFocus(data.focus); }}
          onNodeDoubleClick={(_event, node) => { const data = node.data as TopologyNodeData; if (graph.directory && data.kind === "directory" && !data.directoryContainer && !data.unavailable && data.focus.path) navigate(data.focus.path); }}
          onSelectionChange={({ edges }) => {
            if (edges.length !== 1) return;
            if (buildEdges.some((edge) => edge.id === edges[0]!.id)) { setSelectedBuildLink(edges[0]!.id); return; }
            const connection = describeGraphConnection(graph, edges[0]!.id);
            if (connection) onConnectionFocus(connection);
          }}
          edgesFocusable
          elevateEdgesOnSelect
        >
          <Background color="#173031" gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <EmptyServiceGraph graph={graph} running={reconciliationRunning} />
        {mockAgentsVisible ? <div className="directory-layer-note">MOCK ACTIVITY · visual only · no agents launched</div> : null}
        {selectedBuild?.data ? <aside className="directory-build-detail" aria-label="Captured Bazel link"><button aria-label="Close captured link" onClick={() => setSelectedBuildLink(null)}>×</button><strong>Bazel snapshot · {buildLinkSnapshot?.revision}</strong><small>Consumer → dependency · not live evidence</small><ul>{selectedBuild.data.labels.map((label) => <li key={label}>{label}</li>)}</ul></aside> : null}
      </div>
    </section>
  );
});
