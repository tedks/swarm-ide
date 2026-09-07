import { useEffect, useMemo, useRef, useState } from "react";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { PLAN_INDEX_PATH, type PlanReadResult } from "../../../protocol/plans";
import type { TaskClientState } from "../tasks/client";
import type { TaskSnapshot } from "../../../protocol/tasks";
import { ProjectionCanvas } from "./ProjectionCanvas";
import { displayTaskText } from "../tasks/display";

export function PlanHierarchy({ visible, worldId, repositoryId, generation, connected, tasks, onOpenFile, onOpenTask }: {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean; tasks: TaskClientState;
  onOpenFile: (path: string) => void; onOpenTask: (snapshot: TaskSnapshot, id: string) => Promise<boolean>;
}) {
  const [observation, setObservation] = useState<{ result: PlanReadResult; generation: number; serial: number } | null>(null);
  const [loading, setLoading] = useState(false), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const contextGuidance = useRef<HTMLDetailsElement>(null);
  const supportingMaterial = useRef<HTMLDivElement>(null);
  const lifetime = useRef({ generation, connected, worldId, repositoryId });
  lifetime.current = { generation, connected, worldId, repositoryId };
  const serial = useRef(0);
  useEffect(() => () => { ++serial.current; }, []);
  useEffect(() => { ++serial.current; setLoading(false); }, [generation, connected, worldId, repositoryId]);
  const read = async () => {
    if (!window.swarm || !connected) return;
    const ticket = ++serial.current;
    const origin = { generation, connected, worldId, repositoryId };
    const valid = () => ticket === serial.current && Object.entries(origin).every(([key, value]) => lifetime.current[key as keyof typeof origin] === value);
    setLoading(true); setNotice("");
    const request = { protocolVersion: PROTOCOL_VERSION, type: "plans.read" as const, requestId: `plans:${crypto.randomUUID()}`, worldId, repositoryId };
    try {
      const result = parseCoreResponseForRequest(await window.swarm.request(request), request);
      if (!valid()) return;
      if (!result.ok || !result.plans) { setNotice("Plan read unavailable in this core lifetime. Load again explicitly."); setObservation(null); return; }
      setObservation({ result: result.plans, generation, serial: ticket });
      setSelected((prior) => result.plans?.status === "observed" && result.plans.index.nodes.some((node) => node.id === prior) ? prior : null);
    } catch { if (valid()) { setObservation(null); setNotice("Plan reply could not be validated; no index was adopted."); } }
    finally { if (valid()) setLoading(false); }
  };
  const result = observation?.result;
  const index = result?.status === "observed" ? result.index : null;
  const current = Boolean(observation && observation.generation === generation && observation.serial === serial.current && connected && !loading);
  const nodes = useMemo(() => index?.nodes.map((node) => ({ id: node.id, title: node.title, subtitle: `${node.kind} · authored` })) ?? [], [index]);
  const edges = useMemo(() => index?.nodes.filter((node) => node.parentId !== null).map((node) => ({ id: node.id,
    source: node.parentId!, target: node.id, label: "contains · authored" })) ?? [], [index]);
  const node = index?.nodes.find((entry) => entry.id === selected);
  const depth = (id: string) => {
    let entry = index?.nodes.find((item) => item.id === id), count = 0;
    while (entry?.parentId && count < 128) { count++; entry = index?.nodes.find((item) => item.id === entry!.parentId); }
    return count;
  };
  const openTask = async (id: string) => {
    const snapshot = tasks.observation?.snapshot;
    if (!current || !snapshot || !await onOpenTask(snapshot, id)) setNotice("Authored task link is unavailable in the current metadata. Refresh tasks and inspect again.");
  };
  return <section className="planning-projection" aria-label="Authored plan hierarchy" hidden={!visible}>
    <header className="planning-heading"><div><strong>Plans & components</strong><small>Explicit containment · not inferred architecture</small></div>
      <button disabled={!connected || loading} onClick={() => { void read(); }}>{loading ? "Reading plan index…" : "Load plan index"}</button>
      <button onClick={() => onOpenFile(PLAN_INDEX_PATH)}>Open index source</button>
    </header>
    <div className="planning-status" role="status"><p>{result?.status === "observed"
      ? `Working index ${result.revision.slice(0, 12)} · read ${result.observedAt} · ${index!.nodes.length} authored nodes${current ? "" : " · RETAINED — load again"}`
      : result?.status === "unavailable" ? `${result.code}: ${result.message}` : `Load ${PLAN_INDEX_PATH} from this repository. No mock fallback.`}</p>
      <p>{notice || "Links open working files; the index hash does not attest linked documents, implementation, or all effective agent context."}</p>
    </div>
    {index ? <>
      <ProjectionCanvas label="Plan containment canvas" nodes={nodes} edges={edges} selected={selected} onSelect={setSelected} />
      <div className="planning-inspector plan-selection-inspector">
        {node ? <div className="plan-selection-primary">
          <div className="plan-selection-title"><strong title={node.title} tabIndex={0}>{node.title}</strong>
            <button onClick={() => {
              if (!contextGuidance.current) return;
              contextGuidance.current.open = true;
              if (supportingMaterial.current) supportingMaterial.current.scrollTop = 0;
              contextGuidance.current.querySelector("summary")?.focus({ preventScroll: true });
            }}>Why this context?</button>
          </div>
          <code title={`${node.id} · ${node.kind}`} tabIndex={0}>{node.id} · {node.kind}</code>
          <div className="planning-links">
            {node.docs.length ? <div role="group" aria-label="Document actions">{node.docs.map((path, i) => <button key={`doc:${i}`} title={`Read doc · ${path}`} disabled={!current} onClick={() => onOpenFile(path)}>Read doc · {path}</button>)}</div> : null}
            {node.sourcePaths.length ? <div role="group" aria-label="Source actions">{node.sourcePaths.map((path, i) => <button key={`source:${i}`} title={`Open source · ${path}`} disabled={!current} onClick={() => onOpenFile(path)}>Open source · {path}</button>)}</div> : null}
            {node.taskIds.length ? <div role="group" aria-label="Task actions">{node.taskIds.map((id, i) => <button key={`task:${i}`} title={`Inspect task · ${id}`} disabled={!current || !tasks.connected} onClick={() => { void openTask(id); }}>Inspect task · {id}</button>)}</div> : null}
          </div>
        </div> : <p className="plan-selection-prompt">Select a plan or component to inspect its explicit document, source, task and context links.</p>}
        <div className="plan-selection-support" ref={supportingMaterial}>
          {node ? <details className="plan-context-guidance" key={node.id} ref={contextGuidance} open>
          <summary>Context guidance · {node.contextRefs.length} references</summary>
          <p>Repo-authored guidance; selected briefing, not an inventory of effective permissions.</p>
          {node.contextRefs.length ? <ul>{node.contextRefs.map((ref, i) => <li key={i}><button disabled={!current} onClick={() => onOpenFile(ref.path)}>{ref.kind} · {ref.path}</button><span>{ref.note === null ? null : displayTaskText(ref.note)}</span></li>)}</ul> : <p>No context references authored for this node.</p>}
          </details> : null}
        <details open><summary>Keyboard plan outline · {nodes.length} nodes</summary><ul>{index.nodes.map((item) => <li key={item.id} style={{ paddingLeft: `${Math.min(depth(item.id), 12) * 10}px` }}>
          <button aria-label={`Inspect plan ${item.id}`} onClick={() => setSelected(item.id)}>{item.title}</button><span>{item.kind} · depth {depth(item.id)}</span>
        </li>)}</ul></details>
        </div>
      </div>
    </> : <div className="planning-empty">Keep a versioned plan index beside the code. Agents can maintain it through ordinary reviewed repository edits.</div>}
  </section>;
}
