import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Position } from "@xyflow/react";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import type { PlanIndex, PlanNode } from "../../../protocol/plans";
import { ProjectionCanvas, type ProjectionEdge, type ProjectionNode } from "./ProjectionCanvas";
import { usePlanNavigation, type PlanNavigation } from "./navigation";
import "./design.css";

export interface DesignWorkspaceParts { components: ReactNode; document: ReactNode; tasks: ReactNode }

export interface DesignWorkspaceProps {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean;
  onOpenFile: (path: string) => void;
  onOpenTask?: (id: string) => void;
  onOpenBuild?: (label: string) => void;
  navigation?: PlanNavigation;
  taskPane?: ReactNode;
  taskOnly?: boolean;
  documentVisible?: boolean;
  onOpenDesign?: () => void;
  renderWorkspace?: (parts: DesignWorkspaceParts) => ReactNode;
}

export function designProjection(index: PlanIndex, selected: PlanNode) {
  const children = index.nodes.filter((node) => node.parentId === selected.id);
  const primary = new Set([selected.id, ...children.map((node) => node.id)]);
  const connected = new Set<string>();
  for (const node of index.nodes) for (const link of node.design?.connections ?? []) {
    if (primary.has(node.id) || primary.has(link.targetId)) { connected.add(node.id); connected.add(link.targetId); }
  }
  const shown = [selected, ...children, ...index.nodes.filter((node) => connected.has(node.id) && !primary.has(node.id))];
  const ids = new Set(shown.map((node) => node.id));
  const nodes: ProjectionNode[] = shown.map((node, i) => {
    const angle = (i - 1) * Math.PI * 2 / Math.max(1, shown.length - 1) - Math.PI / 2;
    // A shallow ellipse uses the wide graph card without forcing a distant
    // circular fit. More neighbours still grow the layout, never lose links.
    const radius = Math.max(220, shown.length * 32), vertical = Math.max(80, shown.length * 12);
    return { id: node.id, title: node.title,
    subtitle: node.design?.state === "planned" ? "Planned component" : node.id === selected.id ? "Current component" : primary.has(node.id) ? "Open component" : "Connected component",
    position: i === 0 ? { x: radius, y: vertical } : { x: radius + Math.cos(angle) * radius, y: vertical + Math.sin(angle) * vertical },
    port: i === 0 ? Position.Bottom : Math.abs(Math.cos(angle)) > .6 ? Math.cos(angle) > 0 ? Position.Left : Position.Right : Math.sin(angle) > 0 ? Position.Top : Position.Bottom,
  }; });
  const edges: ProjectionEdge[] = children.map((node) => ({ id: `contains:${node.id}`, source: selected.id, target: node.id, label: "contains", kind: "containment" }));
  const occurrences = new Map<string, number>();
  for (const node of shown) for (const link of node.design?.connections ?? []) {
    // Neighbour-to-neighbour relationships are available when that component is
    // selected, not presented as dependencies of the currently inspected node.
    if (!ids.has(link.targetId) || (!primary.has(node.id) && !primary.has(link.targetId))) continue;
    const identity = JSON.stringify([node.id, link.targetId, link.label]);
    const occurrence = occurrences.get(identity) ?? 0; occurrences.set(identity, occurrence + 1);
    edges.push({ id: `connection:${identity}:${occurrence}`, source: node.id, target: link.targetId, label: link.label, kind: "interface" });
  }
  return { nodes, edges };
}

/** Build mappings are their own projection; they never stand in for component
 * interfaces. Opening one still requires the cockpit's observed-label resolver. */
export function implementationProjection(selected: PlanNode) {
  const nodes: ProjectionNode[] = [], edges: ProjectionEdge[] = [];
  for (const target of selected.design?.buildTargets ?? []) {
    const add = (label: string, subtitle: string) => {
      if (!nodes.some((node) => node.id === label)) nodes.push({ id: label, title: label, subtitle });
    };
    add(target.label, target.role);
    for (const [i, dependency] of target.dependencies.entries()) {
      add(dependency.label, "Bazel input");
      edges.push({ id: `input:${target.label}:${i}`, source: target.label, target: dependency.label, label: dependency.relation });
    }
  }
  return { nodes, edges };
}

/** Collapse presentation, not source truth. Every entry remains reachable. */
export function PlanLinkList({ label, items, limit = 6 }: { label: string; items: ReactNode[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  return <div className="design-link-list" role="group" aria-label={label}>
    {(expanded ? items : items.slice(0, limit))}
    {items.length > limit ? <button className="design-expand" aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer" : `Show all ${items.length}`} {label.toLowerCase()}</button> : null}
  </div>;
}

export function designLinkPath(documentPath: string, href: string): string | null {
  if (!href || /^[a-z]+:/i.test(href) || href.startsWith("/") || /[\\\u0000-\u001f]/.test(href)) return null;
  const pieces = documentPath.split("/").slice(0, -1);
  for (const part of href.split("#")[0]!.split("/")) {
    if (part === "..") { if (!pieces.length) return null; pieces.pop(); }
    else if (part !== "." && part !== "") pieces.push(part);
  }
  return pieces.join("/") || null;
}

/** Small safe Markdown subset for repo prose, lists and mapping tables. */
function DesignText({ content, onLink }: { content: string; onLink: (path: string) => void }) {
  const inline = (text: string) => text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g).map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return <button className="design-text-link" key={i} onClick={() => onLink(link[2]!)}>{link[1]}</button>;
    return part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part;
  });
  return <div className="design-prose">{content.split(/\n\s*\n/).map((block, i) => {
    const heading = /^(#{1,4})\s+([^\n]+)$/.exec(block.trim());
    if (heading) return <h3 key={i}>{heading[2]}</h3>;
    const lines = block.trim().split("\n");
    if (lines.length > 1 && lines.every((line) => line.startsWith("|"))) {
      const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      return <table key={i}><thead><tr>{cells(lines[0]!).map((cell, j) => <th key={j}>{inline(cell)}</th>)}</tr></thead>
        <tbody>{lines.slice(1).filter((line) => !/^\|[\s|:-]+\|$/.test(line)).map((line, row) => <tr key={row}>{cells(line).map((cell, j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table>;
    }
    if (lines.every((line) => /^[-*] /.test(line))) return <ul key={i}>{lines.map((line, j) => <li key={j}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={i}>{inline(block)}</p>;
  })}</div>;
}

/** Self-contained main-pane mount. File/task/build gestures go back to the
 * cockpit; read-only document reads never change the editor's selection. */
export function DesignWorkspace(props: DesignWorkspaceProps) {
  const { visible, worldId, repositoryId, generation, connected, onOpenFile, onOpenTask, onOpenBuild } = props;
  const localNavigation = usePlanNavigation({ ...props, visible: visible && !props.navigation });
  const navigation = props.navigation ?? localNavigation;
  const { index, node, selected, select, current, loading, notice, breadcrumbs } = navigation;
  const [document, setDocument] = useState<{ path: string; content: string } | null>(null);
  const [docNotice, setDocNotice] = useState("");
  const [refresh, setRefresh] = useState(0), [linkNotice, setLinkNotice] = useState("");
  const lifetime = `${worldId}\0${repositoryId}\0${generation}\0${connected}`;
  const live = useRef(lifetime); live.current = lifetime;
  const docPath = node?.docs[0];
  useEffect(() => {
    setDocument(null); setDocNotice("");
    if (!visible || props.taskOnly || props.documentVisible === false || !current || !docPath || !window.swarm) return;
    let cancelled = false;
    const origin = lifetime;
    const request = { protocolVersion: PROTOCOL_VERSION, type: "file.read" as const, requestId: `design-doc:${crypto.randomUUID()}`, path: docPath };
    setDocNotice("Loading document…");
    void window.swarm.request(request).then((reply) => {
      if (cancelled || live.current !== origin) return;
      const result = parseCoreResponseForRequest(reply, request);
      if (!result.ok || result.file?.kind !== "read" || result.file.path !== docPath ||
        result.snapshot.world.id !== worldId || result.snapshot.project.id !== repositoryId) throw new Error("Unavailable");
      setDocument({ path: docPath, content: result.file.content }); setDocNotice("");
    }).catch(() => { if (!cancelled && live.current === origin) setDocNotice("Document unavailable. Refresh or open its source."); });
    return () => { cancelled = true; };
  }, [visible, props.taskOnly, props.documentVisible, current, docPath, lifetime, refresh, repositoryId, worldId]);
  const graph = useMemo(() => index && node ? designProjection(index, node) : null, [index, node]);
  const implementation = useMemo(() => node ? implementationProjection(node) : null, [node]);
  const interfaces = useMemo(() => index && node ? index.nodes.flatMap((source) => (source.design?.connections ?? [])
    .filter((link) => source.id === node.id || link.targetId === node.id)
    .map((link) => ({ source, link, target: index.nodes.find((item) => item.id === link.targetId)! }))) : [], [index, node]);
  const openBuild = (label: string) => {
    if (!current) return;
    if (onOpenBuild) onOpenBuild(label);
    else setLinkNotice("Open the Build view to inspect this target when its graph is available.");
  };

  const documentPane = node && graph ? (<article className="design-document" aria-label="Design document"><h2>{node.title}</h2>{node.design?.state === "planned" ? <span className="design-planned">Planned</span> : null}
          <p>{node.design?.summary}</p>
          {node.design?.constraints?.length ? <div className="design-constraints"><h3>Design constraints</h3><PlanLinkList key={`${node.id}:constraints`} label="Constraints" limit={3} items={node.design.constraints.map((constraint, i) => <p key={i}>{constraint}</p>)} /></div> : null}
          <p role="status">{!current ? "Reconnect or refresh to navigate this design." : docNotice}</p>
          {document ? <DesignText content={document.content} onLink={(href) => {
            if (!current) return;
            const path = designLinkPath(document.path, href); if (!path) return;
            const component = index!.nodes.find((item) => item.docs.includes(path));
            if (component) select(component.id); else onOpenFile(path);
          }} /> : null}
        </article>) : null;
  const componentPane = node && graph ? (<section className="design-components" aria-label="Component connections"><h3>Components & connections</h3>
          <p className="design-legend">Dashed: contains · arrows: interfaces. Focus a component or edge to inspect its connections.</p>
          <div className="design-graph"><ProjectionCanvas key={`${worldId}:${repositoryId}`} cameraScope={node.id} label="Component design canvas" {...graph} selected={selected} onSelect={select} /></div>
          <details className="design-details" open={!props.renderWorkspace}><summary>Connections & constraints</summary><aside aria-label="Design links">
            {props.renderWorkspace && node.design?.constraints?.map((constraint, i) => <p key={i}>{constraint}</p>)}
            <PlanLinkList key={`${node.id}:components`} label="Components" items={index!.nodes.filter((item) => item.parentId === node.id).map((item) => <button key={item.id} disabled={!current} onClick={() => select(item.id)}>{item.title}</button>)} />
            {node.parentId && <button disabled={!current} onClick={() => select(node.parentId!)}>Up one level</button>}
            <PlanLinkList key={`${node.id}:connections`} label="Connections" items={interfaces.map(({ source, link, target }, i) => <button key={`${source.id}:${target.id}:${link.label}:${i}`} disabled={!current} onClick={() => select(source.id === node.id ? target.id : source.id)}>{source.title} → {target.title}: {link.label}</button>)} />
          </aside></details>
        </section>) : <div className="design-empty">
    <p>{notice || (loading ? "Loading components…" : "Add .swarm/plans.json to describe this project's components.")}</p>
    <button onClick={() => onOpenFile(".swarm/plans.json")}>Open plan index</button>
  </div>;
  const implementationPane = node && graph ? (<section className="design-implementation" aria-label="Design implementation"><h3>Implementation</h3>
          {!props.renderWorkspace && (implementation?.nodes.length ? <div className="design-implementation-graph"><ProjectionCanvas key={`${worldId}:${repositoryId}`} cameraScope={node.id} label="Component build mappings" {...implementation} selected={null} onSelect={openBuild} /></div> : <p className="design-empty">Select a component to explore its build connections.</p>)}
          {linkNotice ? <p role="status">{linkNotice}</p> : null}
          <PlanLinkList key={`${node.id}:source`} label="Source files" items={node.sourcePaths.map((path) => <button key={path} disabled={!current} onClick={() => onOpenFile(path)}>{path}</button>)} />
          <PlanLinkList key={`${node.id}:build`} label="Build targets" items={(node.design?.buildTargets ?? []).map((target) => <button key={target.label} disabled={!current} title={target.role} onClick={() => openBuild(target.label)}>{target.label}</button>)} />
          <PlanLinkList key={`${node.id}:docs`} label="Documents" items={node.docs.map((path) => <button key={path} disabled={!current} onClick={() => onOpenFile(path)}>Edit {path}</button>)} />
        </section>) : null;
  const guidancePane = <section className="design-work" aria-label="Design tasks and guidance"><h3>Tasks & guidance</h3>
    {onOpenTask && node?.taskIds.length ? <PlanLinkList key={`${node.id}:tasks`} label="Tasks" items={node.taskIds.map((id) => <button key={id} disabled={!current} onClick={() => onOpenTask(id)}>Task · {id}</button>)} /> : <p className="design-empty">No tasks linked to this component.</p>}
    {node ? <PlanLinkList key={`${node.id}:context`} label="Guidance" items={node.contextRefs.map((ref, i) => <button key={i} disabled={!current} title={ref.note ?? undefined} onClick={() => onOpenFile(ref.path)}>{ref.kind} · {ref.path}</button>)} /> : null}
    {!props.renderWorkspace && props.taskPane}
  </section>;
  if (props.renderWorkspace) return <>{props.renderWorkspace({
    components: <section className="component-graph-card design-workspace" aria-label="Component design">
      <header><strong>Components</strong><button disabled={!node || !current} onClick={props.onOpenDesign}>Read design</button>
        <button aria-label="Refresh design" disabled={!connected || loading} onClick={() => { void navigation.read(); }}>↻</button></header>
      <nav aria-label="Design breadcrumb">{breadcrumbs.map((item) => <button key={item.id} disabled={!current} aria-current={item.id === selected ? "page" : undefined} onClick={() => select(item.id)}>{item.title}</button>)}</nav>
      {componentPane}
    </section>,
    document: <div className="design-document-body design-workspace">{documentPane}{implementationPane}{guidancePane}</div>,
    tasks: props.taskPane,
  })}</>;
  return <section className="design-workspace" data-task-only={props.taskOnly || undefined} aria-label="System design workspace" hidden={!visible}>
    <header><strong>System design</strong><button disabled={!connected || loading} onClick={() => { setRefresh((value) => value + 1); void navigation.read(); }}>Refresh design</button></header>
    <nav aria-label="Design breadcrumb">{breadcrumbs.map((item) => <button key={item.id} disabled={!current} aria-current={item.id === selected ? "page" : undefined} onClick={() => select(item.id)}>{item.title}</button>)}</nav>
    {notice ? <div className="design-empty"><p role="status">{notice}</p><button onClick={() => onOpenFile(".swarm/plans.json")}>Open plan index</button></div> : null}
    <div className="design-quadrants">
      {node && graph ? <>
        {documentPane}
        {componentPane}
        {implementationPane}
      </> : <div className="design-empty">{!notice ? <p>{loading ? "Loading system design…" : index ? "This plan has no components yet. Add a top-level design and its component links in .swarm/plans.json." : "Open the plan to browse the repository's architecture."}</p> : null}</div>}
        {guidancePane}
      </div>
  </section>;
}
