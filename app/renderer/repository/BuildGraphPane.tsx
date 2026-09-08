import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { AgentSprites } from "./AgentSprites";
import type { BuildGraphObservation } from "../../../protocol/build-graph";
import { SelectedBuildTargetSchema } from "../../../protocol/build-jobs";
import type { BuildLinkSnapshot } from "./layers";
import { BUILD_PATTERN_LIMIT, BUILD_VIEW_LIMIT, buildTargets, layoutBuildTargets, matchBuildTargets, selectBuildView, selectFileBuildView } from "./build-view";
import { useGraphReframe } from "./reframe";
import type { GraphCamera } from "./camera";
import "./build-view.css";

function BuildNode({ data }: NodeProps) {
  return <div className={`build-target-node${data.ownsFile ? " build-target-file-owner" : ""}`}><Handle type="target" position={Position.Left} /><small>{data.unresolved ? "UNRESOLVED DEPENDENCY" : data.ownsFile ? "REFERENCES FILE" : "BAZEL RULE"}</small><strong>{String(data.label)}</strong><Handle type="source" position={Position.Right} />{data.mock ? <AgentSprites count={1} /> : null}</div>;
}
const nodeTypes = { buildTarget: BuildNode };

/** A deliberate click, pinned to the observation that supplied its label. */
export interface BuildTargetSelection { id: string; repositoryId: string; revision: string; nonce: number }
export function matchesTargetSelection(capture: BuildLinkSnapshot | undefined, selection: BuildTargetSelection | null | undefined): boolean {
  return Boolean(capture && selection && selection.repositoryId === capture.repositoryId && selection.revision === capture.revision && buildTargets(capture).includes(selection.id));
}

export function TopologyViews({ service, capture, mockAgents, mockVersion, onOpenBuild, reframeVersion = 0, showBuildVersion = 0, focusedFile = null, observation, onRefresh, onCancel, onVisibility, targetSelection, onBuild, buildBusy }: { onBuild?: (target: string) => void; buildBusy?: boolean; targetSelection?: BuildTargetSelection | null; observation?: BuildGraphObservation; onRefresh?: () => void; onCancel?: () => void; onVisibility?: (visible: boolean) => void; service: ReactNode; capture?: BuildLinkSnapshot; mockAgents: boolean; mockVersion: number; onOpenBuild: (path: string) => void; reframeVersion?: number; showBuildVersion?: number; focusedFile?: string | null }) {
  const [view, setView] = useState<"service" | "build">("service"), [opened, setOpened] = useState(false);
  useEffect(() => { if (showBuildVersion) { setOpened(true); setView("build"); } }, [showBuildVersion]);
  useEffect(() => { if (matchesTargetSelection(capture, targetSelection)) { setOpened(true); setView("build"); } }, [targetSelection]);
  useEffect(() => { onVisibility?.(view === "build"); return () => onVisibility?.(false); }, [view, onVisibility]);
  return <section className="topology-views"><nav aria-label="Component graph lenses"><button aria-pressed={view === "service"} onClick={() => setView("service")}>Service</button><button aria-pressed={view === "build"} onClick={() => { setOpened(true); setView("build"); }}>Build graph</button></nav>
    <div className="topology-view" hidden={view !== "service"}>{service}</div>
    {opened ? <div className="topology-view" hidden={view !== "build"}><BuildGraphPane onBuild={onBuild} buildBusy={buildBusy} targetSelection={targetSelection} observation={observation} onRefresh={onRefresh} onCancel={onCancel} focusedFile={focusedFile} visible={view === "build"} capture={capture} mockAgents={mockAgents} mockVersion={mockVersion} onOpenBuild={onOpenBuild} reframeVersion={view === "build" ? reframeVersion : 0} /></div> : null}
  </section>;
}

export function BuildGraphPane({ capture, mockAgents, mockVersion, onOpenBuild, reframeVersion = 0, focusedFile = null, visible = true, observation, onRefresh, onCancel, targetSelection, onBuild, buildBusy }: { onBuild?: (target: string) => void; buildBusy?: boolean; targetSelection?: BuildTargetSelection | null; observation?: BuildGraphObservation; onRefresh?: () => void; onCancel?: () => void; capture?: BuildLinkSnapshot; mockAgents: boolean; mockVersion: number; onOpenBuild: (path: string) => void; reframeVersion?: number; focusedFile?: string | null; visible?: boolean }) {
  const targets = useMemo(() => capture ? buildTargets(capture) : [], [capture]);
  const [roots, setRoots] = useState<string[]>(["//..."]), [target, setTarget] = useState("//...");
  const [followFile, setFollowFile] = useState(true);
  const followingFile = followFile && focusedFile !== null;
  const [transitive, setTransitive] = useState(false), [sprites, setSprites] = useState(mockAgents);
  const [selected, setSelected] = useState<string | null>(null);
  const flow = useRef<GraphCamera | null>(null), [fitVersion, setFitVersion] = useState(0);
  const cancelReframe = useGraphReframe(flow, visible ? reframeVersion + fitVersion : 0);
  useEffect(() => { setSprites(mockAgents); }, [mockAgents, mockVersion]);
  const fileSlice = useMemo(() => capture && followingFile ? selectFileBuildView(capture, focusedFile!, transitive) : null, [capture, followingFile, focusedFile, transitive]);
  const slice = useMemo(() => fileSlice ?? (capture ? selectBuildView(capture, roots, transitive) : null), [fileSlice, capture, roots, transitive]);
  const scope = JSON.stringify([followingFile ? focusedFile : roots, transitive]);
  const framedScope = useRef<string | null>(null);
  useEffect(() => { if (selected && !slice?.depths.has(selected)) setSelected(null); }, [slice, selected]);
  useEffect(() => {
    if (!matchesTargetSelection(capture, targetSelection)) return;
    setFollowFile(false); setRoots([targetSelection!.id]); setTarget(targetSelection!.id); setSelected(targetSelection!.id);
    setFitVersion((n) => n + 1);
  }, [targetSelection]);
  useEffect(() => {
    if (!visible || framedScope.current === scope) return;
    framedScope.current = scope; setFitVersion((n) => n + 1);
  }, [scope, visible]);
  const pattern = target.trim();
  const matches = useMemo(() => matchBuildTargets(pattern, targets), [pattern, targets]);
  const canAdd = matches.length > 0 && (roots.includes(pattern) ? followingFile : roots.length < BUILD_PATTERN_LIMIT);
  const nodes = useMemo(() => {
    return [...layoutBuildTargets(slice?.depths ?? new Map())].map(([label, position]): Node =>
      ({ id: label, type: "buildTarget", position, selected: label === selected, draggable: false, data: { label, unresolved: capture?.targets?.find((target) => target.label === label)?.kind === "unresolved", mock: sprites, ownsFile: fileSlice?.owners.includes(label) ?? false } }));
  }, [slice, sprites, fileSlice, selected, capture]);
  const edges = useMemo(() => slice?.links.map((link) => ({ id: `${link.from}->${link.to}`, source: link.from, target: link.to, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#b7a078" }, style: { stroke: "#b7a078" } })) ?? [], [slice]);
  const buildable = selected && SelectedBuildTargetSchema.safeParse(selected).success && capture?.targets?.some((item) => item.label === selected && item.kind === "rule");
  const status = <div className={`build-observation status-${observation?.status === "current" ? "green" : observation?.status === "error" ? "red" : "yellow"}`} data-build-status={observation?.status ?? "unavailable"} role="status"><strong>{observation?.status ?? "unavailable"}</strong> · {observation?.message ?? "No build-graph observation requested."} {onRefresh ? <button onClick={onRefresh} disabled={observation?.status === "refreshing"} title="Refresh declarations; may download declared dependencies. Does not build targets.">Refresh dependencies</button> : null} {observation?.status === "refreshing" && onCancel ? <button onClick={onCancel}>Cancel refresh</button> : null}{observation?.loadingDependencies ? <small> Declared dependency downloads allowed · no compilation</small> : null}</div>;
  if (!capture) return <div className="build-view-empty">{status}</div>;
  return <section className="build-graph-view" aria-label="Bazel build graph" data-file-focus={followingFile ? focusedFile : undefined}>{status}<div className="build-target-controls"><form onSubmit={(event) => { event.preventDefault(); if (canAdd) { setFollowFile(false); setRoots((before) => [...new Set([...before, pattern])].slice(0, BUILD_PATTERN_LIMIT)); } }}>
    <input aria-label="Bazel target" aria-describedby="build-pattern-feedback" list="captured-bazel-targets" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="//... or //package:target" /><datalist id="captured-bazel-targets"><option value="//..." /><option value="//:all" />{targets.map((label) => <option key={label} value={label} />)}</datalist><button disabled={!canAdd}>Add target</button></form>
    {onBuild ? <button type="button" disabled={!buildable || buildBusy || observation?.status !== "current"} title={selected ?? "Select a rule in the graph"} onClick={() => { if (buildable && !buildBusy && observation?.status === "current") onBuild(selected!); }}>Build selected target</button> : null}
    <label><input type="checkbox" checked={followFile} onChange={(event) => setFollowFile(event.target.checked)} />Follow file</label>
    <label><input type="checkbox" checked={transitive} onChange={(event) => setTransitive(event.target.checked)} />{followingFile ? "Transitive links" : "Transitive deps"}</label><label><input type="checkbox" checked={sprites} onChange={(event) => setSprites(event.target.checked)} />Mock agents</label></div>
    <div id="build-pattern-feedback" className="build-capture-caption" role="status">{!matches.length ? "No observed rule targets match. Use //..., //path/..., //path:all, //path:* or an exact label." : roots.includes(pattern) ? followingFile ? "Add target returns to your saved manual selection." : "Already in this view." : roots.length >= BUILD_PATTERN_LIMIT ? `Remove a pattern to add another (${BUILD_PATTERN_LIMIT} max).` : `${matches.length} observed rule target${matches.length === 1 ? "" : "s"} match${matches.length === 1 ? "es" : ""}.`}{matches.length > BUILD_VIEW_LIMIT ? ` Showing at most ${BUILD_VIEW_LIMIT}; narrow the package to see the rest.` : ""}</div>
    {followingFile ? <div className="build-file-focus"><strong>{focusedFile}</strong><span>{fileSlice?.owners.length ? `${fileSlice.owners.length} observed direct file target${fileSlice.owners.length === 1 ? "" : "s"} · dependents → file targets → dependencies` : "No observed target references this file. Ownership is unavailable—not inferred from its directory."}</span></div> : <div className="build-root-chips">{roots.map((root) => <button key={root} onClick={() => setRoots((before) => before.filter((label) => label !== root))} title="Remove target from this view">{root} ×</button>)}</div>}
    <div className="build-capture-caption">{capture.observation ? `Observed ${capture.capturedAt} · ${capture.observation.status} · ${capture.observation.complete ? "complete returned query" : "partial"}` : `CAPTURE ${capture.revision} · not live`} · consumer → dependency · {nodes.length} rule / unresolved targets (files omitted){slice?.truncated ? ` · ${BUILD_VIEW_LIMIT}-target display limit reached; narrow the package` : ""}{sprites ? " · MOCK AGENTS" : ""}</div>
    {capture.observation ? <details className="build-capture-caption"><summary>Observation scope and limits</summary>{capture.observation.coverage} Symlinked build definitions are unsupported.</details> : null}
    <div className="build-canvas"><ReactFlow onInit={(instance) => { flow.current = instance; }} onMoveStart={(event) => { if (event) cancelReframe(); }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .2, maxZoom: 1.2 }} minZoom={.05} nodesConnectable={false} onNodeClick={(_event, node) => setSelected(node.id)}><Background gap={22} color="#20352c" /><Controls showInteractive={false} /></ReactFlow>
      {nodes.length === 0 ? <p className="build-empty-hint">{followingFile ? "No observed build links for this file. Uncheck Follow file to explore targets manually." : "Add an observed target to explore its dependencies. No build is started."}</p> : null}
      {selected ? <div className="build-selection"><strong>{selected}</strong>{capture.targets?.find((target) => target.label === selected)?.buildFile ? <button onClick={() => onOpenBuild(capture.targets!.find((target) => target.label === selected)!.buildFile!)}>Open build definition</button> : <span>Declaration path unavailable.</span>}<button aria-label="Close target details" onClick={() => setSelected(null)}>×</button></div> : null}
    </div>
  </section>;
}
