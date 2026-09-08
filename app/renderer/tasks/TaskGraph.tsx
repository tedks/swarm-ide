import { useEffect, useMemo, useRef, useState } from "react";
import { sameGitObject, type TaskDetail, type TaskSnapshot } from "../../../protocol/tasks";
import { TaskBridgeClient, type TaskClientState } from "./client";
import { loadTaskGraphDetails, projectTaskGraph, scopeTaskGraph } from "./graph";
import { ProjectionCanvas } from "../plans/ProjectionCanvas";
import { displayTaskText } from "./display";

export function TaskGraph({ client, state, visible, onOpen }: {
  client: TaskBridgeClient; state: TaskClientState; visible: boolean;
  onOpen: (snapshot: TaskSnapshot, id: string) => Promise<boolean>;
}) {
  const [loaded, setLoaded] = useState<{ snapshot: TaskSnapshot; owner: TaskBridgeClient; lifetime: number; details: ReadonlyMap<string, TaskDetail>; attempted: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [localSelection, setLocalSelection] = useState<{ id: string; owner: TaskBridgeClient; scope: string; external: string | null; nonce: number } | null>(null);
  const localSerial = useRef(0);
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState<{ anchor: string | null; whole: boolean; version: number }>({ anchor: null, whole: false, version: 0 });
  const current = useRef<AbortController | null>(null);
  const canvasWasShown = useRef(false);
  // First fit must see the completed projection, not the transient
  // isolated-node stack while details arrive. Later reads preserve the camera.
  if (loaded && !loading) canvasWasShown.current = true;
  const snapshot = state.observation?.snapshot ?? null;
  const fresh = loaded && loaded.owner === client && client.graphCurrent(loaded.snapshot, loaded.lifetime);
  const cameraScope = JSON.stringify([loaded?.snapshot.worldId, loaded?.snapshot.repositoryId]);
  const revealIdentity = JSON.stringify([loaded?.lifetime, loaded?.snapshot.metadataCommit, Boolean(fresh)]);
  // An outline may select a missing relation with no TaskClient detail. Keep
  // that local choice until the operator chooses another task in the sidebar.
  // Never apply a new client's selection to a retained old graph.
  const localMatches = localSelection?.owner === client && localSelection.scope === cameraScope &&
    (localSelection.external === state.selectedTaskId || localSelection.id === state.selectedTaskId);
  const selected = localMatches ? localSelection.id : fresh ? state.selectedTaskId : null;
  // Read availability is not a gesture. Keep this token stable through a
  // temporary stale/current cycle so recovery cannot undo a manual pan.
  const selectionIntent = JSON.stringify(localMatches ? ["outline", localSelection.nonce] : ["sidebar", state.selectedTaskId]);
  useEffect(() => {
    setLocalSelection((old) => {
      if (!old || old.owner !== client || old.scope !== cameraScope) return null;
      // A held detail read acknowledging this local click is not a new gesture.
      if (old.id === state.selectedTaskId && old.external !== state.selectedTaskId) return { ...old, external: state.selectedTaskId };
      return old.external === state.selectedTaskId ? old : null;
    });
  }, [client, cameraScope, state.selectedTaskId]);
  const select = (id: string) => setLocalSelection({ id, owner: client, scope: cameraScope, external: state.selectedTaskId, nonce: ++localSerial.current });
  const read = async () => {
    if (!snapshot || !client.graphCurrent(snapshot)) return;
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    const lifetime = client.graphLifetime();
    setLoading(true); setNotice("");
    setLoaded({ snapshot, owner: client, lifetime, details: new Map(), attempted: 0 });
    await loadTaskGraphDetails(snapshot, async (id, signal) => {
      const detail = await client.readGraphDetail(snapshot, id, signal);
      if (!client.graphCurrent(snapshot, lifetime)) controller.abort();
      return detail;
    }, controller.signal, (details, attempted) => {
      if (current.current === controller && !controller.signal.aborted && client.graphCurrent(snapshot, lifetime))
        setLoaded({ snapshot, owner: client, lifetime, details, attempted });
    });
    if (current.current === controller) { setLoading(false); current.current = null; }
  };
  useEffect(() => {
    if (!visible || !state.connected || !snapshot || loaded && (!fresh || loaded.owner !== client ||
      snapshot.worldId !== loaded.snapshot.worldId || snapshot.repositoryId !== loaded.snapshot.repositoryId ||
      !sameGitObject(snapshot.metadataCommit, loaded.snapshot.metadataCommit))) {
      current.current?.abort(); current.current = null; setLoading(false);
    }
  }, [client, visible, state.connected, snapshot, loaded?.snapshot, loaded?.owner, fresh]);
  useEffect(() => () => { current.current?.abort(); current.current = null; }, []);
  const projection = useMemo(() => loaded ? projectTaskGraph(loaded.snapshot, loaded.details, loaded.attempted) : null, [loaded]);
  const availableTaskIds = useMemo(() => new Set(loaded?.snapshot.summaries.map((row) => row.id)), [loaded?.snapshot]);
  const scoped = useMemo(() => projection ? scopeTaskGraph(projection, scope.anchor, scope.whole) : null, [projection, scope]);
  const nodes = useMemo(() => scoped?.nodes.map((row) => ({ id: row.id, title: displayTaskText(row.title),
    subtitle: `${row.status} · ${row.missing ? "missing" : row.detailLoaded ? "relations read" : "relations unread"}`, warning: row.missing })) ?? [], [scoped]);
  const edges = useMemo(() => scoped?.edges.map((edge) => ({ ...edge,
    label: `blocks${edge.diagnostics.length ? ` · ${edge.diagnostics.join(", ")}` : ""}` })) ?? [], [scoped]);
  const picked = projection?.nodes.find((node) => node.id === selected);
  const open = async (id: string) => {
    if (!loaded || loaded.owner !== client || !client.graphCurrent(loaded.snapshot, loaded.lifetime)) return;
    if (!await onOpen(loaded.snapshot, id)) setNotice("Task link is unavailable at this revision. Refresh tasks and load the graph again.");
  };
  return <section className="planning-projection task-projection" aria-label="Task dependency graph" hidden={!visible}>
    <header className="planning-heading"><div><strong>Task blockage</strong><small>Blocker → blocked · Ditz metadata, not dispatch readiness</small></div>
      <button disabled={!snapshot || !client.graphCurrent(snapshot) || loading} onClick={() => { void read(); }}>{loading ? "Loading dependencies…" : "Load dependency graph"}</button>
      <button disabled={!state.connected || state.refreshing} onClick={() => { void client.refresh(); }}>Refresh task metadata</button>
    </header>
    <div className="planning-status" role="status">
      {!loaded ? <p>Load all task relationships from this metadata revision, four reads at a time. Open tasks come first.</p> : <p>
        Metadata <code>{loaded.snapshot.metadataCommit.hex.slice(0, 12)}</code> · {projection!.loaded}/{projection!.total} details read · {projection!.unread} unread
        {projection!.attempted > projection!.loaded ? ` · ${projection!.attempted - projection!.loaded} reads unavailable` : ""}
        {projection!.attempted < projection!.total ? ` · ${projection!.total - projection!.attempted} ${loading ? "pending" : "not attempted"}` : ""}
        {!fresh ? " · RETAINED / NOT CURRENT — Refresh tasks and load again" : " · revision checked"}
      </p>}
      {notice || state.notice || state.observation?.reason?.message ? <p>{notice || state.notice || state.observation?.reason?.message}</p> : null}
    </div>
    {projection ? <>
      <nav className="task-graph-scope" aria-label="Task graph scope">
        <button aria-pressed={!scope.whole && scope.anchor === null} onClick={() => setScope((old) => ({ anchor: null, whole: false, version: old.version + 1 }))}>Overview · all tasks</button>
        <button disabled={!state.selectedTaskId} aria-pressed={!scope.whole && scope.anchor !== null} onClick={() => setScope((old) => ({ anchor: state.selectedTaskId, whole: false, version: old.version + 1 }))}>Focus selected task</button>
        <button aria-pressed={scope.whole} onClick={() => setScope((old) => ({ anchor: null, whole: true, version: old.version + 1 }))}>Whole projection</button>
        <span>{scoped!.nodes.length} visible · {scoped!.hidden} outside this view{scope.anchor ? ` · direct neighbors of ${scope.anchor}` : ""}</span>
      </nav>
      {canvasWasShown.current ? <ProjectionCanvas label="Task blockage canvas" nodes={nodes} edges={edges} selected={selected} taskScopeVersion={scope.version} cameraScope={cameraScope} revealIdentity={revealIdentity} revealSelection selectionIntent={selectionIntent} visible={visible} onSelect={(id) => { select(id); void open(id); }} />
        : <div className="planning-empty">Reading relationships before framing the graph…</div>}
      <div className="planning-inspector">
        {picked ? <><strong>{displayTaskText(picked.title)}</strong><code>{picked.id}</code><button disabled={!fresh || picked.missing} onClick={() => { void open(picked.id); }}>Open task details</button></> : <p>Select a task, then explicitly open its pinned detail.</p>}
        <details><summary>Keyboard task outline · {projection.nodes.length} shown</summary><ul>{projection.nodes.map((node) => <li key={node.id}>
          <button aria-label={`Inspect graph task ${node.id}`} onClick={() => { select(node.id); void open(node.id); }}>{displayTaskText(node.title)}</button>
          <span>{node.status}{!node.detailLoaded ? " · relations unread" : ""}</span>
          <button disabled={!fresh || node.missing} aria-label={`Open graph task ${node.id}`} onClick={() => { void open(node.id); }}>Open task</button>
        </li>)}</ul></details>
        <details><summary>Recorded edges · {projection.edges.length}</summary><ul>{projection.edges.map((edge) => <li key={edge.id}>
          <button disabled={!fresh || !availableTaskIds.has(edge.source)} onClick={() => { void open(edge.source); }}>{edge.source}</button>
          <span>blocks → {edge.diagnostics.join(", ")}</span>
          <button disabled={!fresh || !availableTaskIds.has(edge.target)} onClick={() => { void open(edge.target); }}>{edge.target}</button>
        </li>)}</ul></details>
      </div>
    </> : <div className="planning-empty">A task graph appears here after explicit loading. Isolated tasks remain visible.</div>}
  </section>;
}
