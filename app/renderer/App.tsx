import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROTOCOL_VERSION, type CoreRequest, type FocusRef, type ReconciliationStatus } from "../../protocol/schema";
import { applyCoreEvent, emptyWorkspaceState, loadSnapshot, type WorkspaceState } from "./state";
import { GraphPane } from "./GraphPane";
import {
  DEFAULT_INTERFACE_ZOOM,
  INTERFACE_ZOOM_LEVELS,
  isInterfaceZoomPercent,
  type InterfaceZoomPercent,
  type ViewShellResult,
} from "../view-shell";
import {
  discardStoredZoom,
  persistZoom,
  readStoredZoom,
  stepZoom,
  zoomShortcut,
} from "./zoom";

const lensTabs = ["System", "Plan", "Performance", "Refactor"] as const;

function statusLabel(status: ReconciliationStatus): string {
  return { gray: "Unobserved", yellow: "Reconciling", green: "Consistent", red: "Failed" }[status];
}

function focusLabel(focus: FocusRef): string {
  return focus.symbol ?? focus.path?.split("/").at(-1) ?? focus.key.split(":").at(-1) ?? focus.key;
}

function requestId(): string {
  return `renderer:${crypto.randomUUID()}`;
}

function rendererStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface ZoomRequest {
  percent: InterfaceZoomPercent;
  persist: boolean;
  notice: string | null;
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspaceState);
  const [error, setError] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<(typeof lensTabs)[number]>("System");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [hmr, setHmr] = useState({ generation: 0, milliseconds: 0 });
  const [initialZoom] = useState(() => readStoredZoom(rendererStorage()));
  const [zoomPercent, setZoomPercent] = useState<InterfaceZoomPercent | null>(null);
  const [zoomPending, setZoomPending] = useState(true);
  const [zoomOperation, setZoomOperation] = useState(0);
  const [zoomNotice, setZoomNotice] = useState<string | null>(initialZoom.notice);
  const zoomPercentRef = useRef<InterfaceZoomPercent | null>(null);
  const desiredZoomRef = useRef<InterfaceZoomPercent | null>(null);
  const zoomPendingRef = useRef(false);
  const queuedZoomRef = useRef<ZoomRequest | null>(null);
  const zoomInitializedRef = useRef(false);
  const commandInput = useRef<HTMLInputElement>(null);

  const applyZoom = useCallback(async (percent: InterfaceZoomPercent, persist: boolean, notice: string | null = null) => {
    const request: ZoomRequest = { percent, persist, notice };
    const bridge = window.swarmView;
    if (!bridge) {
      zoomPercentRef.current = null;
      setZoomPercent(null);
      setZoomPending(false);
      setZoomNotice("Interface zoom is unavailable outside the swarm-ide Electron shell.");
      return false;
    }
    desiredZoomRef.current = percent;
    if (zoomPendingRef.current) {
      queuedZoomRef.current = request;
      return true;
    }

    zoomPendingRef.current = true;
    setZoomPending(true);
    let activeRequest: ZoomRequest | null = request;
    let firstRequestSucceeded = false;
    try {
      while (activeRequest) {
        let result: ViewShellResult;
        try {
          result = await bridge.setZoomPercent(activeRequest.percent);
        } catch {
          result = {
            ok: false,
            message: "The interface zoom bridge failed; the applied zoom level is unknown.",
            zoomState: "unknown",
          };
        }

        if (!result.ok) {
          if (result.zoomState === "unknown") {
            zoomPercentRef.current = null;
            setZoomPercent(null);
          }
          setZoomNotice(result.message);
        } else if (!isInterfaceZoomPercent(result.percent)) {
          zoomPercentRef.current = null;
          setZoomPercent(null);
          setZoomNotice("The interface zoom bridge returned an invalid zoom level.");
        } else {
          zoomPercentRef.current = result.percent;
          setZoomPercent(result.percent);
          setZoomOperation((operation) => operation + 1);
          setZoomNotice(activeRequest.persist ? persistZoom(rendererStorage(), result.percent) : activeRequest.notice);
          if (activeRequest === request) firstRequestSucceeded = true;
        }

        activeRequest = queuedZoomRef.current;
        queuedZoomRef.current = null;
      }
    } finally {
      // If future loop work throws, prefer dropping the last coalesced request
      // and restoring an operable control over leaving zoom permanently busy.
      queuedZoomRef.current = null;
      desiredZoomRef.current = zoomPercentRef.current;
      zoomPendingRef.current = false;
      setZoomPending(false);
    }
    return firstRequestSucceeded;
  }, []);

  const zoomIn = useCallback(() => applyZoom(stepZoom(desiredZoomRef.current ?? zoomPercentRef.current ?? DEFAULT_INTERFACE_ZOOM, "in"), true), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(stepZoom(desiredZoomRef.current ?? zoomPercentRef.current ?? DEFAULT_INTERFACE_ZOOM, "out"), true), [applyZoom]);
  const resetZoom = useCallback(() => applyZoom(DEFAULT_INTERFACE_ZOOM, true), [applyZoom]);

  useEffect(() => {
    if (zoomInitializedRef.current) return;
    zoomInitializedRef.current = true;
    const discardNotice = initialZoom.discardStoredValue ? discardStoredZoom(rendererStorage()) : null;
    void applyZoom(initialZoom.percent, false, discardNotice ?? initialZoom.notice);
  }, [applyZoom, initialZoom]);

  const invoke = useCallback(async (request: CoreRequest) => {
    try {
      if (!window.swarm) throw new Error("Open this interface through the swarm-ide Electron shell");
      const response = await window.swarm.request(request);
      if (!response.ok) throw new Error(response.error.message);
      setError(null);
      return response;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unknown local-core error");
      return null;
    }
  }, []);

  useEffect(() => {
    const bridge = window.swarm;
    if (!bridge) {
      setError("Open this interface through the swarm-ide Electron shell");
      return;
    }
    void invoke({ type: "workspace.snapshot", requestId: requestId(), protocolVersion: PROTOCOL_VERSION }).then((response) => {
      if (response) setWorkspace(loadSnapshot(response.snapshot, response.sequence));
    });
    return bridge.onEvent((event) => setWorkspace((current) => applyCoreEvent(current, event)));
  }, [invoke]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const zoomAction = zoomShortcut(event);
      if (zoomAction && window.swarmView) {
        event.preventDefault();
        if (zoomAction === "in") void zoomIn();
        if (zoomAction === "out") void zoomOut();
        if (zoomAction === "reset") void resetZoom();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [resetZoom, zoomIn, zoomOut]);

  useEffect(() => {
    if (paletteOpen) {
      setCommandQuery("");
      requestAnimationFrame(() => commandInput.current?.focus());
    }
  }, [paletteOpen]);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onHmrStart = (data: { sentAt: number }) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setHmr((value) => ({ generation: value.generation + 1, milliseconds: Date.now() - data.sentAt }));
      }));
    };
    hot.on("swarm:hmr-start", onHmrStart);
    return () => {
      if (typeof hot.off === "function") hot.off("swarm:hmr-start", onHmrStart);
    };
  }, []);

  const snapshot = workspace.snapshot;
  const title = snapshot ? statusLabel(snapshot.reconciliation.status) : "Loading";
  const zoomTitle = zoomPending
    ? "Zoom applying"
    : zoomPercent === null
      ? "Zoom unknown"
      : `Zoom ${zoomPercent}%${import.meta.env.DEV ? `@${zoomOperation}` : ""}`;
  useEffect(() => {
    const focus = snapshot ? ` — ${focusLabel(snapshot.focus)}` : "";
    const revision = snapshot ? ` — ${snapshot.revisions.working.id}` : "";
    const fraudVisible = snapshot?.graphs.some((graph) => graph.nodes.some((node) => node.label === "FraudCheck"))
      ? " — FraudCheck visible"
      : "";
    const palette = paletteOpen ? " — Palette open" : "";
    const hmrSuffix = hmr.generation ? ` — HMR ${hmr.generation}:${hmr.milliseconds}ms` : "";
    document.title = `swarm-ide — ${title}${focus}${revision}${fraudVisible}${palette} — ${zoomTitle}${hmrSuffix}`;
  }, [hmr, paletteOpen, snapshot, title, zoomTitle]);

  const selectFocus = useCallback((focus: FocusRef) =>
    invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus }), [invoke]);
  const reconcile = useCallback((mode: "success" | "failure" | "stale") => {
    setPaletteOpen(false);
    return invoke({ type: "reconciliation.start", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, mode });
  }, [invoke]);

  const commands = useMemo(() => [
    { label: "Build and reconcile current world", detail: "yellow → green · publishes FraudCheck", run: () => reconcile("success") },
    { label: "Simulate extractor failure", detail: "red · retains last green topology", run: () => reconcile("failure") },
    { label: "Simulate stale result", detail: "reject old epoch, then publish current", run: () => reconcile("stale") },
    { label: "Reset fixture world", detail: "return to work:a1", run: () => { setPaletteOpen(false); return invoke({ type: "fixture.reset", requestId: requestId(), protocolVersion: PROTOCOL_VERSION }); } },
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase())), [commandQuery, invoke, reconcile]);

  if (!snapshot) {
    return <main className="loading-screen"><div className="loading-mark hmr-probe" />Opening the working world…{error ? <strong>{error}</strong> : null}</main>;
  }

  return (
    <main className="workbench">
      <header className="topbar">
        <div className="product-mark"><span className="hmr-probe" />swarm</div>
        <nav className="lens-tabs" aria-label="Workspace lenses">
          {lensTabs.map((lens) => <button key={lens} className={activeLens === lens ? "active" : ""} onClick={() => setActiveLens(lens)}>{lens}</button>)}
        </nav>
        <button className="command-trigger" onClick={() => setPaletteOpen(true)}><span>Search, navigate, direct…</span><kbd>Ctrl K</kbd></button>
        <div className="zoom-control" role="group" aria-label="Interface zoom" aria-busy={zoomPending}>
          <button aria-label="Zoom out" title="Zoom out (Ctrl+-)" aria-disabled={zoomPercent === INTERFACE_ZOOM_LEVELS[0]} onClick={() => { if (zoomPercent !== INTERFACE_ZOOM_LEVELS[0]) void zoomOut(); }}>−</button>
          <button className="zoom-value" aria-label={zoomPercent === null ? "Reset zoom to 100%. Current zoom unknown" : `Reset zoom to 100%. Current zoom ${zoomPercent}%`} title="Reset zoom (Ctrl+0)" onClick={() => void resetZoom()}>{zoomPercent === null ? "—" : `${zoomPercent}%`}</button>
          <button aria-label="Zoom in" title="Zoom in (Ctrl+=)" aria-disabled={zoomPercent === INTERFACE_ZOOM_LEVELS[INTERFACE_ZOOM_LEVELS.length - 1]} onClick={() => { if (zoomPercent !== INTERFACE_ZOOM_LEVELS[INTERFACE_ZOOM_LEVELS.length - 1]) void zoomIn(); }}>+</button>
        </div>
        <div className={`global-truth status-${snapshot.reconciliation.status}`}><i />{title}<small>epoch {snapshot.reconciliation.epoch}</small></div>
      </header>

      <aside className="work-rail panel">
        <div className="rail-section"><span className="eyebrow">work / agents</span><h1>Checkout hardening</h1><p className="muted">Spec 4.2 · working world</p><div className="progress-line"><i style={{ width: "68%" }} /></div></div>
        <div className="rail-section">
          <div className="section-heading"><span>Active runs</span><b>3</b></div>
          <div className="agent-row active"><i className="agent-pulse" /><div><strong>agent-07</strong><small>editing checkout.ts</small></div><span>1m</span></div>
          <div className="agent-row"><i /><div><strong>planner-02</strong><small>checking contracts</small></div><span>3m</span></div>
          <div className="agent-row"><i /><div><strong>test-11</strong><small>awaiting build</small></div><span>·</span></div>
        </div>
        <div className="rail-section dispatch-list">
          <div className="section-heading"><span>Dispatch next</span><b>4</b></div>
          <button><span>01</span>Add retry budget tests</button><button><span>02</span>Wire FraudCheck client</button><button><span>03</span>Publish contract docs</button>
        </div>
        <button className="new-run">＋ split an agent here</button>
      </aside>

      <section className="navigation-field">
        <div className="field-toolbar">
          <div><span className="eyebrow">central navigation</span><strong>{focusLabel(snapshot.focus)}</strong><small>{snapshot.focus.domain} · {snapshot.focus.revisionId}</small></div>
          <div className="world-chips"><span>working <b>{snapshot.revisions.working.id}</b></span><span>built <b>{snapshot.revisions.built.id}</b></span><span>deployed <b>{snapshot.revisions.deployed.id}</b></span></div>
          <button id="reconcile-success" className="build-button" onClick={() => void reconcile("success")} disabled={snapshot.reconciliation.status === "yellow"}>▶ Build world</button>
        </div>
        <div className="graphs-grid">{snapshot.graphs.map((graph) => <GraphPane key={graph.topologyId} graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={zoomPercent} onFocus={(focus) => void selectFocus(focus)} />)}</div>
      </section>

      <aside className="instrument-panel panel">
        <div className="instrument-heading"><div><span className="eyebrow">contextual instruments</span><h2>{focusLabel(snapshot.focus)}</h2></div><button>•••</button></div>
        <div className="breadcrumbs">world / {snapshot.focus.domain} / <b>{focusLabel(snapshot.focus)}</b></div>
        <div className="widget-grid">
          {[...snapshot.widgets].sort((a, b) => a.priority - b.priority).map((widget) => <article className={`widget widget-${widget.kind}`} key={widget.id}><header><span>{widget.title}</span><i title={`${widget.provenance.sourceKind}: ${widget.provenance.uri}`} /></header>{Array.isArray(widget.value) ? <ul>{widget.value.map((item) => <li key={item}>{item}</li>)}</ul> : <div className="widget-value">{widget.value}</div>}{widget.unit ? <small>{widget.unit}</small> : null}</article>)}
        </div>
        <article className="widget source-widget"><header><span>Truth source</span><i /></header><code>{snapshot.focus.path ?? snapshot.focus.key}</code><small>{snapshot.reconciliation.message}</small></article>
      </aside>

      <section className="activity-dock panel">
        <div className="dock-header"><div><span className="eyebrow">activity / jobs</span><strong>Changes entering the world</strong></div><span className="ignored-events">{workspace.ignoredEvents} stale events rejected</span></div>
        <div className="job-strip">
          {snapshot.jobs.length ? snapshot.jobs.map((job) => <article className={`job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} key={job.id}><header><strong>{job.label}</strong><span>{Math.round(job.progress * 100)}%</span></header><div className="job-progress"><i style={{ width: `${job.progress * 100}%` }} /></div><footer><span>{job.message}</span><b>CPU {job.resources.cpuPercent}% · {job.resources.memoryMiB} MiB</b></footer></article>) : <article className="job idle"><strong>No derived work running</strong><span>Build the current world to reconcile every linked view.</span></article>}
          <div className="activity-list">{snapshot.activity.slice(0, 4).map((activity) => <div key={activity.id}><i className={`status-${activity.status}`} /><span>{activity.summary}</span><small>{activity.kind}</small></div>)}</div>
        </div>
      </section>

      {paletteOpen ? <div className="palette-scrim" onMouseDown={() => setPaletteOpen(false)}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><span>⌕</span><input ref={commandInput} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commands[0]) void commands[0].run(); }} placeholder="Navigate or apply intelligence…" /><kbd>esc</kbd></header><div className="command-results">{commands.map((command) => <button key={command.label} onClick={() => void command.run()}><span>{command.label}<small>{command.detail}</small></span><kbd>↵</kbd></button>)}</div><footer><span>Current focus: {focusLabel(snapshot.focus)}</span><span>scope · action · artifact</span></footer></section></div> : null}
      {error ? <div className="error-toast">{error}</div> : null}
      {zoomNotice ? <div className="zoom-toast" role="status">{zoomNotice}</div> : null}
    </main>
  );
}
