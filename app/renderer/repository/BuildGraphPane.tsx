import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { AgentSprites } from "./AgentSprites";
import type { BuildLinkSnapshot } from "./layers";
import { BUILD_PATTERN_LIMIT, BUILD_VIEW_LIMIT, buildTargets, layoutBuildTargets, matchBuildTargets, selectBuildView } from "./build-view";
import { useGraphReframe } from "./reframe";
import type { GraphCamera } from "./camera";
import "./build-view.css";

function BuildNode({ data }: NodeProps) {
  return <div className="build-target-node"><Handle type="target" position={Position.Left} /><small>BAZEL TARGET · SNAPSHOT</small><strong>{String(data.label)}</strong><Handle type="source" position={Position.Right} />{data.mock ? <AgentSprites count={1} /> : null}</div>;
}
const nodeTypes = { buildTarget: BuildNode };

export function TopologyViews({ service, capture, mockAgents, mockVersion, onOpenBuild, reframeVersion = 0, showBuildVersion = 0 }: { service: ReactNode; capture?: BuildLinkSnapshot; mockAgents: boolean; mockVersion: number; onOpenBuild: (path: string) => void; reframeVersion?: number; showBuildVersion?: number }) {
  const [view, setView] = useState<"service" | "build">("service"), [opened, setOpened] = useState(false);
  useEffect(() => { if (showBuildVersion) { setOpened(true); setView("build"); } }, [showBuildVersion]);
  return <section className="topology-views"><nav aria-label="Component graph lenses"><button aria-pressed={view === "service"} onClick={() => setView("service")}>Service</button><button aria-pressed={view === "build"} onClick={() => { setOpened(true); setView("build"); }}>Build graph</button></nav>
    <div className="topology-view" hidden={view !== "service"}>{service}</div>
    {opened ? <div className="topology-view" hidden={view !== "build"}><BuildGraphPane capture={capture} mockAgents={mockAgents} mockVersion={mockVersion} onOpenBuild={onOpenBuild} reframeVersion={view === "build" ? reframeVersion : 0} /></div> : null}
  </section>;
}

export function BuildGraphPane({ capture, mockAgents, mockVersion, onOpenBuild, reframeVersion = 0 }: { capture?: BuildLinkSnapshot; mockAgents: boolean; mockVersion: number; onOpenBuild: (path: string) => void; reframeVersion?: number }) {
  const targets = useMemo(() => capture ? buildTargets(capture) : [], [capture]);
  const [roots, setRoots] = useState<string[]>(["//:desktop-bundle"]), [target, setTarget] = useState("//:desktop-bundle");
  const [transitive, setTransitive] = useState(false), [sprites, setSprites] = useState(mockAgents);
  const [selected, setSelected] = useState<string | null>(null);
  const flow = useRef<GraphCamera | null>(null), [fitVersion, setFitVersion] = useState(0);
  const cancelReframe = useGraphReframe(flow, reframeVersion + fitVersion);
  useEffect(() => { setSprites(mockAgents); }, [mockAgents, mockVersion]);
  const slice = useMemo(() => capture ? selectBuildView(capture, roots, transitive) : null, [capture, roots, transitive]);
  const pattern = target.trim();
  const matches = useMemo(() => matchBuildTargets(pattern, targets), [pattern, targets]);
  const canAdd = matches.length > 0 && roots.length < BUILD_PATTERN_LIMIT && !roots.includes(pattern);
  const nodes = useMemo(() => {
    return [...layoutBuildTargets(slice?.depths ?? new Map())].map(([label, position]): Node =>
      ({ id: label, type: "buildTarget", position, draggable: false, data: { label, mock: sprites } }));
  }, [slice, sprites]);
  const edges = useMemo(() => slice?.links.map((link) => ({ id: `${link.from}->${link.to}`, source: link.from, target: link.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#b7a078" }, style: { stroke: "#b7a078" } })) ?? [], [slice]);
  if (!capture) return <div className="build-view-empty">No Bazel dependency capture is available for this workspace. Live dependency extraction is not connected yet.</div>;
  return <section className="build-graph-view" aria-label="Bazel build graph"><div className="build-target-controls"><form onSubmit={(event) => { event.preventDefault(); if (canAdd) { setRoots((before) => [...new Set([...before, pattern])].slice(0, BUILD_PATTERN_LIMIT)); setFitVersion((n) => n + 1); } }}>
    <input aria-label="Bazel target" aria-describedby="build-pattern-feedback" list="captured-bazel-targets" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="//... or //package:target" /><datalist id="captured-bazel-targets"><option value="//..." /><option value="//:all" />{targets.map((label) => <option key={label} value={label} />)}</datalist><button disabled={!canAdd}>Add target</button></form>
    <label><input type="checkbox" checked={transitive} onChange={(event) => setTransitive(event.target.checked)} />Transitive deps</label><label><input type="checkbox" checked={sprites} onChange={(event) => setSprites(event.target.checked)} />Mock agents</label></div>
    <div id="build-pattern-feedback" className="build-capture-caption" role="status">{!matches.length ? "No captured rule targets match. Use //..., //path/..., //path:all, //path:* or an exact label." : roots.includes(pattern) ? "Already in this view." : roots.length >= BUILD_PATTERN_LIMIT ? `Remove a pattern to add another (${BUILD_PATTERN_LIMIT} max).` : `${matches.length} captured rule target${matches.length === 1 ? "" : "s"} match${matches.length === 1 ? "es" : ""}.`}{matches.length > BUILD_VIEW_LIMIT ? ` Showing at most ${BUILD_VIEW_LIMIT}; narrow the package to see the rest.` : ""}</div>
    <div className="build-root-chips">{roots.map((root) => <button key={root} onClick={() => setRoots((before) => before.filter((label) => label !== root))} title="Remove target from this view">{root} ×</button>)}</div>
    <div className="build-capture-caption">Captured {capture.revision} · consumer → dependency · not live · {nodes.length} rule targets (files omitted){slice?.truncated ? ` · ${BUILD_VIEW_LIMIT}-target display limit reached; narrow the package` : ""}{sprites ? " · MOCK AGENTS" : ""}</div>
    <div className="build-canvas"><ReactFlow onInit={(instance) => { flow.current = instance; }} onMoveStart={(event) => { if (event) cancelReframe(); }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .2, maxZoom: 1.2 }} minZoom={.05} nodesConnectable={false} onNodeClick={(_event, node) => setSelected(node.id)}><Background gap={22} color="#20352c" /><Controls showInteractive={false} /></ReactFlow>
      {nodes.length === 0 ? <p className="build-empty-hint">Add a captured target to explore its dependencies. No build is started.</p> : null}
      {selected ? <div className="build-selection"><strong>{selected}</strong><button onClick={() => onOpenBuild(`${selected.slice(2).split(":")[0] ? `${selected.slice(2).split(":")[0]}/` : ""}BUILD.bazel`)}>Open BUILD.bazel</button><button aria-label="Close target details" onClick={() => setSelected(null)}>×</button></div> : null}
    </div>
  </section>;
}
