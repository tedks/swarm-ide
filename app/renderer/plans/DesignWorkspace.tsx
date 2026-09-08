import { useEffect, useRef, useState } from "react";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import type { PlanIndex, PlanNode } from "../../../protocol/plans";
import { ProjectionCanvas, type ProjectionEdge, type ProjectionNode } from "./ProjectionCanvas";
import "./design.css";

export interface DesignWorkspaceProps {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean;
  onOpenFile: (path: string) => void;
  onOpenTask?: (id: string) => void;
  onOpenBuild?: (label: string) => void;
}

export function designProjection(index: PlanIndex, selected: PlanNode) {
  const children = index.nodes.filter((node) => node.parentId === selected.id);
  const shown = [selected, ...children];
  const ids = new Set(shown.map((node) => node.id));
  const nodes: ProjectionNode[] = shown.map((node) => ({ id: node.id, title: node.title,
    subtitle: node.design?.state === "planned" ? "Planned component" : node.id === selected.id ? "Current component" : "Open component" }));
  const edges: ProjectionEdge[] = children.map((node) => ({ id: `contains:${node.id}`, source: selected.id, target: node.id, label: "contains" }));
  for (const node of shown) for (const [i, link] of (node.design?.connections ?? []).entries()) {
    if (ids.has(link.targetId)) edges.push({ id: `connection:${node.id}:${i}`, source: node.id, target: link.targetId, label: link.label });
  }
  // A leaf names the real build rule and its declared inputs, not fictional per-function targets.
  if (!children.length) for (const target of selected.design?.buildTargets ?? []) {
    const add = (label: string, subtitle: string) => {
      if (!nodes.some((node) => node.id === label)) nodes.push({ id: label, title: label, subtitle });
    };
    add(target.label, target.role);
    edges.push({ id: `built:${target.label}`, source: selected.id, target: target.label, label: "implemented through" });
    for (const [i, dependency] of target.dependencies.entries()) {
      add(dependency.label, "Bazel input");
      edges.push({ id: `input:${target.label}:${i}`, source: target.label, target: dependency.label, label: dependency.relation });
    }
  }
  return { nodes, edges };
}

/** Repo text only: React escapes content; Markdown HTML is never executed. */
function DesignText({ content }: { content: string }) {
  return <div className="design-prose">{content.split(/\n\s*\n/).map((block, i) => {
    const heading = /^(#{1,4})\s+([^\n]+)$/.exec(block.trim());
    if (heading) return <h3 key={i}>{heading[2]}</h3>;
    return <p key={i}>{block}</p>;
  })}</div>;
}

/** Self-contained main-pane mount. File/task/build gestures go back to the
 * cockpit; read-only document reads never change the editor's selection. */
export function DesignWorkspace(props: DesignWorkspaceProps) {
  const { visible, worldId, repositoryId, generation, connected, onOpenFile, onOpenTask, onOpenBuild } = props;
  const [index, setIndex] = useState<PlanIndex | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState(""), [loading, setLoading] = useState(false);
  const [document, setDocument] = useState<{ path: string; content: string } | null>(null);
  const [docNotice, setDocNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const lifetime = `${worldId}\0${repositoryId}\0${generation}\0${connected}`;
  const live = useRef(lifetime); live.current = lifetime;
  const observed = useRef<string | null>(null);
  const current = connected && observed.current === lifetime && !loading;
  useEffect(() => {
    if (!visible || !connected || !window.swarm) return;
    let cancelled = false;
    const origin = lifetime;
    setLoading(true); setNotice("");
    const request = { protocolVersion: PROTOCOL_VERSION, type: "plans.read" as const, requestId: `design:${crypto.randomUUID()}`, worldId, repositoryId };
    void window.swarm.request(request).then((reply) => {
      if (cancelled || live.current !== origin) return;
      const result = parseCoreResponseForRequest(reply, request);
      if (!result.ok || result.plans?.status !== "observed") throw new Error("Unavailable");
      const next = result.plans.index;
      observed.current = origin; setIndex(next);
      setSelected((prior) => next.nodes.some((node) => node.id === prior) ? prior : next.nodes.find((node) => node.parentId === null)?.id ?? null);
    }).catch(() => { if (!cancelled && live.current === origin) { observed.current = null; setIndex(null); setNotice("No system design. Add .swarm/plans.json to this repository."); } })
      .finally(() => { if (!cancelled && live.current === origin) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, connected, lifetime, worldId, repositoryId, refresh]);
  const node = index?.nodes.find((item) => item.id === selected);
  const docPath = node?.docs[0];
  useEffect(() => {
    setDocument(null); setDocNotice("");
    if (!visible || !current || !docPath || !window.swarm) return;
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
  }, [visible, current, docPath, lifetime, refresh, repositoryId, worldId]);
  const graph = index && node ? designProjection(index, node) : null;
  const breadcrumbs: PlanNode[] = [];
  for (let item = node; item && breadcrumbs.length < 128; item = index?.nodes.find((entry) => entry.id === item!.parentId)) breadcrumbs.unshift(item);
  const openBuild = (label: string) => {
    if (!current) return;
    if (onOpenBuild) onOpenBuild(label);
    else onOpenFile(`${label.slice(2, label.indexOf(":"))}${label.indexOf(":") === 2 ? "" : "/"}BUILD.bazel`);
  };
  return <section className="design-workspace" aria-label="System design workspace" hidden={!visible}>
    <header><strong>System design</strong><button disabled={!connected || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh design</button></header>
    <nav aria-label="Design breadcrumb">{breadcrumbs.map((item) => <button key={item.id} disabled={!current} aria-current={item.id === selected ? "page" : undefined} onClick={() => setSelected(item.id)}>{item.title}</button>)}</nav>
    {notice ? <p role="status">{notice}</p> : null}
    {node && graph ? <>
      <div className="design-graph"><ProjectionCanvas key={`${repositoryId}:${node.id}`} label="Component design canvas" {...graph} selected={selected}
        onSelect={(id) => { if (!current) return; if (id.startsWith("//")) openBuild(id); else setSelected(id); }} /></div>
      <div className="design-details">
        <article aria-label="Design document"><h2>{node.title}</h2>{node.design?.state === "planned" ? <span className="design-planned">Planned</span> : null}
          <p>{node.design?.summary}</p><p role="status">{!current ? "Reconnect or refresh to navigate this design." : docNotice}</p>
          {document ? <DesignText content={document.content} /> : null}
        </article>
        <aside aria-label="Design links">
          <h3>Components</h3>{index!.nodes.filter((item) => item.parentId === node.id).map((item) => <button key={item.id} disabled={!current} onClick={() => setSelected(item.id)}>{item.title}</button>)}
          {node.parentId && <button disabled={!current} onClick={() => setSelected(node.parentId)}>Up one level</button>}
          {node.design?.connections.length ? <><h3>Connected components</h3>{node.design.connections.map((link) => <button key={`${link.targetId}:${link.label}`} disabled={!current} onClick={() => setSelected(link.targetId)}>{link.label} → {index!.nodes.find((item) => item.id === link.targetId)?.title}</button>)}</> : null}
          <h3>Implementation</h3>{node.sourcePaths.map((path) => <button key={path} disabled={!current} onClick={() => onOpenFile(path)}>{path}</button>)}
          {node.design?.buildTargets.map((target) => <button key={target.label} disabled={!current} title={target.role} onClick={() => openBuild(target.label)}>{target.label}</button>)}
          {node.docs.map((path) => <button key={path} disabled={!current} onClick={() => onOpenFile(path)}>Edit {path}</button>)}
          {onOpenTask && node.taskIds.map((id) => <button key={id} disabled={!current} onClick={() => onOpenTask(id)}>Task · {id}</button>)}
        </aside>
      </div>
    </> : !notice ? <p>{loading ? "Loading system design…" : "Choose System design to browse the repository's architecture."}</p> : null}
  </section>;
}
