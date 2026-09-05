import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  type CoreRequest,
  type FileEvent,
  type FocusRef,
  type ReconciliationStatus,
} from "../../protocol/schema";
import { applyCoreEvent, emptyWorkspaceState, loadSnapshot, type WorkspaceState } from "./state";
import { EditorPane } from "./EditorPane";
import { GraphPane, type GraphConnectionFocus } from "./GraphPane";
import { sourceFlash, type SourceFlash } from "./source-diff";
import {
  DEFAULT_INTERFACE_ZOOM,
  INTERFACE_ZOOM_LEVELS,
  isInterfaceZoomPercent,
  type InterfaceZoomPercent,
  type ViewShellResult,
} from "../view-shell";
import { discardStoredZoom, persistZoom, readStoredZoom, stepZoom, zoomShortcut } from "./zoom";

const lensTabs = ["System", "Plan", "Performance", "Refactor"] as const;
const FRAUDCHECK_IMPLEMENTATION = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const FRAUDCHECK_CONTRACT = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";

type FileStatus = "loading" | "saved" | "dirty" | "saving" | "conflict" | "error";

interface FileTab {
  path: string;
  content: string;
  savedContent: string;
  revision: string;
  status: FileStatus;
  message: string;
  flash: SourceFlash | null;
}

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
  try { return window.localStorage; } catch { return null; }
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
  const [fileTabs, setFileTabs] = useState<FileTab[]>([]);
  const [activeSurface, setActiveSurface] = useState<string>("graphs");
  const [selectedConnection, setSelectedConnection] = useState<GraphConnectionFocus | null>(null);
  const workspaceRef = useRef<WorkspaceState>(workspace);
  const fileTabsRef = useRef<FileTab[]>([]);
  const activeSurfaceRef = useRef<string>("graphs");
  const fileEventsRef = useRef(new Map<string, FileEvent>());
  const openGenerationsRef = useRef(new Map<string, number>());
  const openingFilesRef = useRef(new Map<string, number>());
  const reloadGenerationsRef = useRef(new Map<string, number>());
  const desiredFilesRef = useRef(new Set<string>());
  const savesInFlightRef = useRef(new Set<string>());
  const flashId = useRef(0);
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

  useEffect(() => { fileTabsRef.current = fileTabs; }, [fileTabs]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

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
          result = { ok: false, message: "The interface zoom bridge failed; the applied zoom level is unknown.", zoomState: "unknown" };
        }
        if (!result.ok) {
          if (result.zoomState === "unknown") { zoomPercentRef.current = null; setZoomPercent(null); }
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
      if (!response.ok) {
        setError(response.error.message);
        return response;
      }
      setError(null);
      return response;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unknown local-core error");
      return null;
    }
  }, []);

  const coordinateFileFocus = useCallback((path: string) => {
    setSelectedConnection(null);
    const currentSnapshot = workspaceRef.current.snapshot;
    if (!currentSnapshot) return;
    void invoke({
      type: "focus.select",
      requestId: requestId(),
      protocolVersion: PROTOCOL_VERSION,
      focus: {
        worldId: currentSnapshot.world.id,
        revisionKind: "working",
        revisionId: currentSnapshot.revisions.working.id,
        domain: "repo",
        key: `file:${path}`,
        path,
      },
    });
  }, [invoke]);

  const showSurface = useCallback((surface: string) => {
    activeSurfaceRef.current = surface;
    setActiveSurface(surface);
  }, []);

  const activateFile = useCallback((path: string) => {
    coordinateFileFocus(path);
    showSurface(path);
  }, [coordinateFileFocus, showSurface]);

  const reloadObservedFile = useCallback(async (event: FileEvent) => {
    const latestEvent = fileEventsRef.current.get(event.path);
    if (latestEvent && event.sequence <= latestEvent.sequence) return;
    fileEventsRef.current.set(event.path, event);
    const before = fileTabsRef.current.find((tab) => tab.path === event.path);
    // Initial open owns reads until its generation explicitly hands off.
    // Recording the newest event is enough; openFile will observe it and retry
    // without relying on React's later ref-synchronization effect.
    if (!before || openingFilesRef.current.has(event.path) || event.revision === before.revision) return;
    if (before.status === "dirty" || before.status === "saving" || before.status === "conflict") {
      setFileTabs((tabs) => tabs.map((tab) => tab.path === event.path ? { ...tab, status: "conflict", message: "The working file changed; your local buffer is preserved." } : tab));
      return;
    }
    if (event.change !== "modified") {
      setFileTabs((tabs) => tabs.map((tab) => tab.path === event.path ? { ...tab, status: "error", message: event.message ?? "The observed file is unavailable." } : tab));
      return;
    }
    const openGeneration = openGenerationsRef.current.get(event.path);
    const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: event.path });
    if (openGenerationsRef.current.get(event.path) !== openGeneration || !desiredFilesRef.current.has(event.path)) return;
    if (!response?.ok || !response.file || response.file.kind !== "read") {
      if (fileEventsRef.current.get(event.path)?.sequence === event.sequence) {
        setFileTabs((tabs) => tabs.map((tab) => tab.path === event.path && tab.revision !== event.revision
          ? { ...tab, status: "error", message: "The newest observed source revision could not be opened." }
          : tab));
      }
      return;
    }
    if (fileEventsRef.current.get(event.path)?.sequence !== event.sequence || response.file.revision !== event.revision) return;
    const incoming = response.file;
    setFileTabs((tabs) => tabs.map((tab) => {
      if (tab.path !== event.path) return tab;
      if (tab.status === "dirty" || tab.status === "saving" || tab.status === "conflict" || tab.revision === incoming.revision) return tab;
      return {
        ...tab,
        content: incoming.content,
        savedContent: incoming.content,
        revision: incoming.revision,
        status: "saved",
        message: "Working file updated externally",
        flash: sourceFlash(tab.content, incoming.content, ++flashId.current),
      };
    }));
  }, [invoke]);

  useEffect(() => {
    const bridge = window.swarm;
    if (!bridge) {
      setError("Open this interface through the swarm-ide Electron shell");
      return;
    }
    const unsubscribe = bridge.onEvent((event) => {
      if (event.type === "file.changed") {
        void reloadObservedFile(event);
      } else {
        setWorkspace((current) => applyCoreEvent(current, event));
      }
    });
    void bridge.request({ type: "workspace.snapshot", requestId: requestId(), protocolVersion: PROTOCOL_VERSION }).then((response) => {
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setWorkspace((current) => {
        if (current.snapshot && response.sequence <= current.lastSequence) return current;
        return loadSnapshot(response.snapshot, response.sequence);
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open the working world"));
    return unsubscribe;
  }, [reloadObservedFile]);

  const openFile = useCallback(async (path: string, coordinateFocus = true) => {
    if (coordinateFocus) activateFile(path);
    else showSurface(path);
    if (fileTabsRef.current.some((tab) => tab.path === path)) return;
    desiredFilesRef.current.add(path);
    const generation = (openGenerationsRef.current.get(path) ?? 0) + 1;
    openGenerationsRef.current.set(path, generation);
    openingFilesRef.current.set(path, generation);
    const loadingTab: FileTab = { path, content: "", savedContent: "", revision: "", status: "loading", message: "Registering source observation…", flash: null };
    fileTabsRef.current = [...fileTabsRef.current, loadingTab];
    setFileTabs((tabs) => tabs.some((tab) => tab.path === path) ? tabs : [...tabs, loadingTab]);
    const settleOpen = (update: (tab: FileTab) => FileTab) => {
      if (openingFilesRef.current.get(path) !== generation) return;
      openingFilesRef.current.delete(path);
      fileTabsRef.current = fileTabsRef.current.map((tab) => tab.path === path ? update(tab) : tab);
      setFileTabs((tabs) => tabs.map((tab) => tab.path === path ? update(tab) : tab));
    };
    const watchResponse = await invoke({ type: "file.watch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
    if (openGenerationsRef.current.get(path) !== generation || !desiredFilesRef.current.has(path)) return;
    if (!watchResponse?.ok) {
      settleOpen((tab) => ({ ...tab, status: "error", message: watchResponse?.ok ? "Source observation was cancelled." : "The source file could not be observed." }));
      return;
    }
    let eventSequenceBeforeRead = fileEventsRef.current.get(path)?.sequence ?? 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
      if (openGenerationsRef.current.get(path) !== generation || !desiredFilesRef.current.has(path)) return;
      const eventAfterRead = fileEventsRef.current.get(path);
      const superseded = eventAfterRead && eventAfterRead.sequence > eventSequenceBeforeRead;
      if (!response?.ok || !response.file || response.file.kind !== "read") {
        if (superseded && attempt < 2) {
          eventSequenceBeforeRead = eventAfterRead.sequence;
          continue;
        }
        settleOpen((tab) => ({ ...tab, status: "error", message: "The source file could not be opened." }));
        return;
      }
      const file = response.file;
      if (superseded && eventAfterRead.revision !== file.revision) {
        eventSequenceBeforeRead = eventAfterRead.sequence;
        continue;
      }
      settleOpen((tab) => ({ ...tab, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Watching the working file", flash: null }));
      return;
    }
    if (openGenerationsRef.current.get(path) === generation && desiredFilesRef.current.has(path)) {
      settleOpen((tab) => ({ ...tab, status: "error", message: "The working file changed too quickly to open a stable revision." }));
    }
  }, [activateFile, invoke, showSurface]);

  const closeFile = useCallback((path: string) => {
    const tab = fileTabsRef.current.find((candidate) => candidate.path === path);
    if (tab && (tab.content !== tab.savedContent || tab.status === "saving" || tab.status === "conflict")) {
      setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, message: "Save or reload this buffer before closing it." } : candidate));
      return;
    }
    desiredFilesRef.current.delete(path);
    openGenerationsRef.current.set(path, (openGenerationsRef.current.get(path) ?? 0) + 1);
    openingFilesRef.current.delete(path);
    void invoke({ type: "file.unwatch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
    const remaining = fileTabsRef.current.filter((candidate) => candidate.path !== path);
    // Keep the lifecycle authority current across multiple close gestures in
    // one React batch, while the functional update composes with any queued
    // watcher/editor state transition.
    fileTabsRef.current = remaining;
    setFileTabs((tabs) => tabs.filter((candidate) => candidate.path !== path));
    if (activeSurfaceRef.current === path) {
      const nextPath = remaining.at(-1)?.path;
      if (nextPath) activateFile(nextPath);
      else showSurface("graphs");
    }
  }, [activateFile, invoke, showSurface]);

  const saveFile = useCallback(async (path: string) => {
    const tab = fileTabsRef.current.find((candidate) => candidate.path === path);
    if (!tab || !tab.revision || tab.status !== "dirty" || savesInFlightRef.current.has(path)) return;
    const savedContent = tab.content;
    const eventSequenceBeforeSave = fileEventsRef.current.get(path)?.sequence ?? 0;
    savesInFlightRef.current.add(path);
    setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, status: "saving", message: "Saving with optimistic revision check…" } : candidate));
    const response = await invoke({ type: "file.write", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path, expectedRevision: tab.revision, content: savedContent });
    savesInFlightRef.current.delete(path);
    if (!response?.ok || !response.file || response.file.kind !== "write") {
      const conflict = response && !response.ok && response.error.code === "REVISION_CONFLICT";
      setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, status: conflict ? "conflict" : candidate.content !== candidate.savedContent ? "dirty" : "error", message: `${response && !response.ok ? response.error.message : "Save failed"}; your buffer is preserved${conflict ? "" : " and can be retried"}.` } : candidate));
      return;
    }
    const write = response.file;
    setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? {
      ...candidate,
      ...(((fileEventsRef.current.get(path)?.sequence ?? 0) > eventSequenceBeforeSave &&
        fileEventsRef.current.get(path)?.revision !== write.revision &&
        fileEventsRef.current.get(path)?.revision !== tab.revision)
        ? { status: "conflict" as const, message: "The working file changed while save completed; your local buffer is preserved." }
        : {
          savedContent,
          revision: write.revision,
          status: candidate.content === savedContent ? "saved" as const : "dirty" as const,
          message: write.workingFingerprint
            ? `Saved · working ${write.workingFingerprint.slice(0, 12)}`
            : write.fingerprintError ?? "Saved; working-world fingerprint refresh failed",
        }),
    } : candidate));
  }, [invoke]);

  const reloadFile = useCallback(async (path: string) => {
    const before = fileTabsRef.current.find((candidate) => candidate.path === path);
    if (!before) return;
    const openGeneration = openGenerationsRef.current.get(path);
    const eventSequence = fileEventsRef.current.get(path)?.sequence ?? 0;
    const reloadGeneration = (reloadGenerationsRef.current.get(path) ?? 0) + 1;
    reloadGenerationsRef.current.set(path, reloadGeneration);
    const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
    if (reloadGenerationsRef.current.get(path) !== reloadGeneration || openGenerationsRef.current.get(path) !== openGeneration || !desiredFilesRef.current.has(path)) return;
    if (!response?.ok || !response.file || response.file.kind !== "read") return;
    const file = response.file;
    const latestEvent = fileEventsRef.current.get(path);
    setFileTabs((tabs) => tabs.map((tab) => {
      if (tab.path !== path) return tab;
      if (tab.content !== before.content || tab.revision !== before.revision) return { ...tab, message: "Reload completed after this buffer changed; the newer buffer was preserved." };
      if (latestEvent && latestEvent.sequence > eventSequence && latestEvent.revision !== file.revision) return tab;
      return { ...tab, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Reloaded the canonical working file", flash: null };
    }));
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((open) => !open); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (activeSurface !== "graphs") closeFile(activeSurface);
        return;
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [activeSurface, closeFile, resetZoom, zoomIn, zoomOut]);

  useEffect(() => {
    if (paletteOpen) { setCommandQuery(""); requestAnimationFrame(() => commandInput.current?.focus()); }
  }, [paletteOpen]);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onHmrStart = (data: { sentAt: number }) => requestAnimationFrame(() => requestAnimationFrame(() => setHmr((value) => ({ generation: value.generation + 1, milliseconds: Date.now() - data.sentAt }))));
    hot.on("swarm:hmr-start", onHmrStart);
    return () => { if (typeof hot.off === "function") hot.off("swarm:hmr-start", onHmrStart); };
  }, []);

  const snapshot = workspace.snapshot;
  const activeFile = fileTabs.find((tab) => tab.path === activeSurface);
  const reconciliationRunning = snapshot?.jobs.some((job) => job.kind === "build" && job.status === "running") ?? false;
  const title = snapshot ? statusLabel(snapshot.reconciliation.status) : "Loading";
  const zoomTitle = zoomPending ? "Zoom applying" : zoomPercent === null ? "Zoom unknown" : `Zoom ${zoomPercent}%${import.meta.env.DEV ? `@${zoomOperation}` : ""}`;
  useEffect(() => {
    if (!selectedConnection || !snapshot) return;
    const stillCurrent = selectedConnection.interfaceFocus.revisionId === snapshot.revisions.working.id &&
      snapshot.graphs.some((graph) => graph.edges.some((edge) => edge.id === selectedConnection.id));
    if (!stillCurrent) setSelectedConnection(null);
  }, [selectedConnection, snapshot]);

  useEffect(() => {
    const focus = snapshot ? ` — ${focusLabel(snapshot.focus)}` : "";
    const revision = snapshot ? ` — ${snapshot.revisions.working.id.slice(0, 12)}` : "";
    const fraudVisible = snapshot?.graphs.some((graph) => graph.nodes.some((node) => node.label === "FraudCheck")) ? " — FraudCheck visible" : "";
    const surface = activeSurface === "graphs" ? " — Graphs" : ` — Source ${activeSurface.split("/").at(-1)}:${activeFile?.status ?? "loading"}`;
    const files = ` — ${fileTabs.length} file tab${fileTabs.length === 1 ? "" : "s"}`;
    const palette = paletteOpen ? " — Palette open" : "";
    const hmrSuffix = hmr.generation ? ` — HMR ${hmr.generation}:${hmr.milliseconds}ms` : "";
    document.title = `swarm-ide — ${title}${focus}${revision}${fraudVisible}${surface}${files}${palette} — ${zoomTitle}${hmrSuffix}`;
  }, [activeFile?.status, activeSurface, fileTabs.length, hmr, paletteOpen, snapshot, title, zoomTitle]);

  const selectFocus = useCallback((focus: FocusRef) => {
    setSelectedConnection(null);
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus });
    if (focus.path) void openFile(focus.path, false);
  }, [invoke, openFile]);
  const selectConnection = useCallback((connection: GraphConnectionFocus) => {
    setSelectedConnection(connection);
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus: connection.interfaceFocus });
  }, [invoke]);
  const reconcile = useCallback(() => {
    setPaletteOpen(false);
    return invoke({ type: "reconciliation.start", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, mode: "success" });
  }, [invoke]);

  const commands = useMemo(() => [
    { label: "Build repository service topology", detail: "exact fingerprint → Bazel artifact → green", run: reconcile },
    { label: "Show system graphs", detail: "return to the coordinated repository and service views", run: () => { setPaletteOpen(false); showSurface("graphs"); } },
    { label: "Open FraudCheck implementation", detail: FRAUDCHECK_IMPLEMENTATION, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_IMPLEMENTATION); } },
    { label: "Open FraudCheck protobuf contract", detail: FRAUDCHECK_CONTRACT, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_CONTRACT); } },
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase())), [commandQuery, openFile, reconcile, showSurface]);

  if (!snapshot) return <main className="loading-screen"><div className="loading-mark hmr-probe" />Opening the working world…{error ? <strong>{error}</strong> : null}</main>;
  return (
    <main className="workbench">
      <header className="topbar">
        <div className="product-mark"><span className="hmr-probe" />swarm</div>
        <nav className="lens-tabs" aria-label="Workspace lenses">{lensTabs.map((lens) => <button key={lens} className={activeLens === lens ? "active" : ""} onClick={() => setActiveLens(lens)}>{lens}</button>)}</nav>
        <button className="command-trigger" onClick={() => setPaletteOpen(true)}><span>Search, navigate, direct…</span><kbd>Ctrl K</kbd></button>
        <div className="zoom-control" role="group" aria-label="Interface zoom" aria-busy={zoomPending}>
          <button aria-label="Zoom out" title="Zoom out (Ctrl+-)" aria-disabled={zoomPercent === INTERFACE_ZOOM_LEVELS[0]} onClick={() => { if (zoomPercent !== INTERFACE_ZOOM_LEVELS[0]) void zoomOut(); }}>−</button>
          <button className="zoom-value" aria-label={zoomPercent === null ? "Reset zoom to 100%. Current zoom unknown" : `Reset zoom to 100%. Current zoom ${zoomPercent}%`} title="Reset zoom (Ctrl+0)" onClick={() => void resetZoom()}>{zoomPercent === null ? "—" : `${zoomPercent}%`}</button>
          <button aria-label="Zoom in" title="Zoom in (Ctrl+=)" aria-disabled={zoomPercent === INTERFACE_ZOOM_LEVELS.at(-1)} onClick={() => { if (zoomPercent !== INTERFACE_ZOOM_LEVELS.at(-1)) void zoomIn(); }}>+</button>
        </div>
        <div className={`global-truth status-${snapshot.reconciliation.status}`}><i />{title}<small>epoch {snapshot.reconciliation.epoch}</small></div>
      </header>

      <aside className="work-rail panel">
        <div className="rail-section"><span className="eyebrow">working world</span><h1>swarm-ide</h1><p className="muted">real local repository</p></div>
        <div className="rail-section"><div className="section-heading"><span>Agent runs</span><b>0</b></div><div className="empty-rail">No agent execution provider is connected.</div></div>
        <div className="rail-section dispatch-list"><div className="section-heading"><span>Dispatch queue</span><b>0</b></div><div className="empty-rail">Task provider is not connected.</div></div>
        <button className="new-run" disabled>＋ agent harness not configured</button>
      </aside>

      <section className={`navigation-field ${activeFile ? "source-open" : ""}`}>
        <div className="field-toolbar">
          <div><span className="eyebrow">central navigation</span><strong>{activeFile?.path ?? focusLabel(snapshot.focus)}</strong><small>{activeFile ? `${activeFile.status} · ${activeFile.message}` : `${snapshot.focus.domain} · ${snapshot.focus.revisionId.slice(0, 12)}`}</small></div>
          <div className="world-chips"><span>working <b>{snapshot.revisions.working.id.slice(0, 8)}</b></span><span>built <b>{snapshot.revisions.built.id.slice(0, 8) || "—"}</b></span><span>deployed <b>{snapshot.revisions.deployed.environment}</b></span></div>
          <button id="reconcile-success" className="build-button" onClick={() => void reconcile()} disabled={reconciliationRunning}>▶ Build topology</button>
        </div>
        <nav className="surface-tabs" aria-label="Central workspace tabs">
          <button className={activeSurface === "graphs" ? "active" : ""} onClick={() => showSurface("graphs")}><span>⌘</span> System graphs</button>
          {fileTabs.map((tab) => <div key={tab.path} className={`surface-tab ${activeSurface === tab.path ? "active" : ""}`}><button className="surface-tab-main" onClick={() => activateFile(tab.path)} title={tab.path}><span className={`tab-state status-${tab.status}`}>{tab.status === "dirty" ? "●" : tab.status === "saving" ? "◌" : tab.status === "conflict" || tab.status === "error" ? "!" : "◇"}</span>{tab.path.split("/").at(-1)}</button><button className="surface-tab-close" aria-label={`Close ${tab.path}`} onClick={() => closeFile(tab.path)}>×</button></div>)}
        </nav>
        <div className={`graphs-grid ${activeFile ? "is-sidebar" : activeSurface === "graphs" ? "is-active" : "is-hidden"}`}>{snapshot.graphs.map((graph) => <GraphPane key={graph.topologyId} graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={zoomPercent} onFocus={selectFocus} onConnectionFocus={selectConnection} onReconcile={() => { void reconcile(); }} reconciliationRunning={reconciliationRunning} />)}</div>
        {activeFile ? <section className={`source-surface ${activeFile.status === "conflict" || activeFile.status === "error" ? "has-banner" : ""}`}>
          <header><div><span className="eyebrow">source observatory</span><strong>{activeFile.path}</strong></div><div className={`file-state file-${activeFile.status}`}><i />{activeFile.status}<button onClick={() => void saveFile(activeFile.path)} disabled={activeFile.status !== "dirty"}>Save <kbd>Ctrl S</kbd></button></div></header>
          {activeFile.status === "loading" ? <div className="source-message">Loading the canonical working file…</div> : <>
            {activeFile.status === "conflict" || activeFile.status === "error" ? <div className="source-message source-error source-banner"><span>{activeFile.message}</span><button onClick={() => void reloadFile(activeFile.path)}>Reload disk</button></div> : null}
            {activeFile.revision ? <EditorPane key={activeFile.path} content={activeFile.content} flash={activeFile.flash} onChange={(content) => setFileTabs((tabs) => tabs.map((tab) => {
              if (tab.path !== activeFile.path) return tab;
              const unresolved = tab.status === "conflict" || tab.status === "error";
              const status = unresolved ? tab.status : tab.status === "saving" ? "saving" : content === tab.savedContent ? "saved" : "dirty";
              return { ...tab, content, status, message: unresolved ? tab.message : content === tab.savedContent ? "Watching the working file" : "Local buffer differs from disk", flash: null };
            }))} onSave={() => void saveFile(activeFile.path)} /> : <div className="source-message source-error">{activeFile.message}</div>}
          </>}
        </section> : null}
      </section>

      <aside className="instrument-panel panel">
        <div className="instrument-heading"><div><span className="eyebrow">contextual instruments</span><h2>{selectedConnection?.label ?? focusLabel(snapshot.focus)}</h2></div><button>•••</button></div>
        <div className="breadcrumbs">world / {selectedConnection ? "connection" : snapshot.focus.domain} / <b>{selectedConnection?.id ?? focusLabel(snapshot.focus)}</b></div>
        <div className="widget-grid">
          {selectedConnection ? <article className="widget widget-list connection-widget"><header><span>{selectedConnection.kind} connection</span><i title={`${selectedConnection.provenance[0]?.sourceKind}: ${selectedConnection.provenance[0]?.uri}`} /></header><div className="connection-flow"><button onClick={() => selectFocus(selectedConnection.source.focus)}>{selectedConnection.source.label}</button><span>→</span><button onClick={() => selectFocus(selectedConnection.target.focus)}>{selectedConnection.target.label}</button></div>{selectedConnection.contract ? <small>{selectedConnection.contract}</small> : null}<code>{selectedConnection.provenance[0]?.uri}</code></article> : null}
          {[...snapshot.widgets].sort((a, b) => a.priority - b.priority).map((widget) => <article className={`widget widget-${widget.kind}`} key={widget.id}><header><span>{widget.title}</span><i title={`${widget.provenance.sourceKind}: ${widget.provenance.uri}`} /></header>{Array.isArray(widget.value) ? <ul>{widget.value.map((item) => <li key={item}>{widget.id === "source-paths" ? <button className="source-link" onClick={() => void openFile(item)}>{item}</button> : item}</li>)}</ul> : <div className="widget-value">{widget.value}</div>}{widget.unit ? <small>{widget.unit}</small> : null}</article>)}
        </div>
        <article className="widget source-widget"><header><span>Truth source</span><i /></header>{snapshot.focus.path ? <button className="source-link" onClick={() => void openFile(snapshot.focus.path!)}>{snapshot.focus.path}</button> : <code>{snapshot.focus.key}</code>}<small>{snapshot.reconciliation.message}</small></article>
      </aside>

      <section className="activity-dock panel">
        <div className="dock-header"><div><span className="eyebrow">activity / jobs</span><strong>Changes entering the world</strong></div><span className="ignored-events">{workspace.ignoredEvents} stale events rejected</span></div>
        <div className="job-strip">{snapshot.jobs.length ? snapshot.jobs.map((job) => <article className={`job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} key={job.id}><header><strong>{job.label}</strong><span>{Math.round(job.progress * 100)}%</span></header><div className="job-progress"><i style={{ width: `${job.progress * 100}%` }} /></div><footer><span>{job.message}</span><b>{job.resources.cpuPercent || job.resources.memoryMiB ? `CPU ${job.resources.cpuPercent}% · ${job.resources.memoryMiB} MiB` : "telemetry unavailable"}</b></footer></article>) : <article className="job idle"><strong>No derived work running</strong><span>Build the repository service topology to observe the current world.</span></article>}<div className="activity-list">{snapshot.activity.slice(0, 4).map((activity) => <div key={activity.id}><i className={`status-${activity.status}`} /><span>{activity.summary}</span><small>{activity.kind}</small></div>)}</div></div>
      </section>

      {paletteOpen ? <div className="palette-scrim" onMouseDown={() => setPaletteOpen(false)}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><span>⌕</span><input ref={commandInput} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commands[0]) void commands[0].run(); }} placeholder="Navigate or apply intelligence…" /><kbd>esc</kbd></header><div className="command-results">{commands.map((command) => <button key={command.label} onClick={() => void command.run()}><span>{command.label}<small>{command.detail}</small></span><kbd>↵</kbd></button>)}</div><footer><span>Current focus: {focusLabel(snapshot.focus)}</span><span>scope · action · artifact</span></footer></section></div> : null}
      {error ? <div className="error-toast">{error}</div> : null}
      {zoomNotice ? <div className="zoom-toast" role="status">{zoomNotice}</div> : null}
    </main>
  );
}
