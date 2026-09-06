import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  PROTOCOL_VERSION,
  type CoreRequest,
  type FileEvent,
  type FocusRef,
  type ReconciliationStatus,
} from "../../protocol/schema";
import { applyCoreEvent, emptyWorkspaceState, loadSnapshot, type WorkspaceState } from "./state";
import { EditorPane, type EditorMemory, type SourceLineNavigation } from "./EditorPane";
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
import type { Lifecycle } from "../lifecycle";
import { NAVIGATION_KEY, readNavigation, protectsBuffer, staleSnapshot, retainDerived } from "./recovery";
import { hotMemory, pendingWrites } from "./hot-memory";
import { RunRail } from "./agents/RunRail";
import { RunPane } from "./agents/RunPane";
import { LaunchDraft } from "./agents/LaunchDraft";
import { canPrepareFixture, emptyAgentWorkbench, fixtureReducer } from "./agents/state";
import { fixturePreviewEnabled } from "./agents/client";
import { useAgentWorkbench } from "./agents/use-agent-workbench";
import { LiveRunRail } from "./agents/LiveRunRail";
import { LiveRunPane } from "./agents/LiveRunPane";
import { PreparedLaunchDraft } from "./agents/PreparedLaunchDraft";
import { AgentReloadGuard } from "./agents/AgentReloadGuard";
import { protectsAgentIntent } from "./agents/live-state";
import "./agents/agents.css";
import { TaskBridgeClient } from "./tasks/client";
import { TaskPanel } from "./tasks/TaskPanel";
import { TaskDetail } from "./tasks/TaskDetail";
import { taskLineTarget, validTaskReference } from "./tasks/reveal";
import type { TaskFileRef } from "../../protocol/tasks";

const lensTabs = ["System", "Plan", "Performance", "Refactor"] as const;
const FRAUDCHECK_IMPLEMENTATION = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const FRAUDCHECK_CONTRACT = "examples/checkout-world/services/fraudcheck/fraudcheck.proto";

type FileStatus = "loading" | "saved" | "dirty" | "saving" | "conflict" | "unknown" | "error";

interface FileTab {
  path: string;
  content: string;
  savedContent: string;
  revision: string;
  status: FileStatus;
  message: string;
  flash: SourceFlash | null;
}

interface HotWorkbench {
  workspace: WorkspaceState;
  files: FileTab[];
  activeSurface: string;
  lens: (typeof lensTabs)[number];
}
// Fast Refresh can remount a component (for example after a hook is added)
// without beforeunload. Its module data survives that replacement, unlike hooks.

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
  const { client: agentClient, state: liveAgents } = useAgentWorkbench();
  const agentIntentProtected = protectsAgentIntent(liveAgents);
  const [agents, setAgents] = useState(emptyAgentWorkbench);
  const [agentPaneHeight, setAgentPaneHeight] = useState(290);
  const agentFixtureEnabled = fixturePreviewEnabled(import.meta.env.DEV, import.meta.env.VITE_SWARM_AGENT_DEMO);
  const openAgentDraft = useCallback(() => {
    if (agentFixtureEnabled) setAgents((state) => canPrepareFixture(state) ? { ...state, draftOpen: true } : state);
  }, [agentFixtureEnabled]);
  const [hotCheckpoint] = useState(() => hotMemory?.workbench as HotWorkbench | undefined);
  const [restoredNavigation] = useState(readNavigation);
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [observedCoreGeneration, setObservedCoreGeneration] = useState<number | null>(null);
  const lifecycleRef = useRef<Lifecycle | null>(null);
  const coreGenerationRef = useRef(0);
  const lastRecoveryRef = useRef(-1);
  const [reloadNotice, setReloadNotice] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => hotCheckpoint?.workspace ?? (restoredNavigation?.snapshot ? loadSnapshot(restoredNavigation.snapshot, -1) : emptyWorkspaceState));
  const [error, setError] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<(typeof lensTabs)[number]>(hotCheckpoint?.lens ?? restoredNavigation?.lens ?? "System");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compactPanel, setCompactPanel] = useState<"work" | "info" | null>(null);
  const taskClient = useMemo(() => new TaskBridgeClient(), [TaskBridgeClient]);
  const tasks = useSyncExternalStore(taskClient.subscribe, taskClient.getSnapshot);
  const [informationView, setInformationView] = useState<"source" | "task">("source");
  const [informationFocusRequest, setInformationFocusRequest] = useState(0);
  const taskReturnButton = useRef<HTMLButtonElement>(null);
  const sourceInformationHeading = useRef<HTMLHeadingElement>(null);
  const revealNoticeElement = useRef<HTMLParagraphElement>(null);
  const [sourceInfoFocusRequest, setSourceInfoFocusRequest] = useState(0);
  const [noticeFocusRequest, setNoticeFocusRequest] = useState(0);
  const [revealNotice, setRevealNotice] = useState("");
  const [sourceNavigation, setSourceNavigation] = useState<(SourceLineNavigation & { path: string }) | null>(null);
  const editorMemories = useRef(new Map<string, EditorMemory>());
  const navigationIntent = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++navigationIntent.current; }; }, []);
  const [commandQuery, setCommandQuery] = useState("");
  const [hmr, setHmr] = useState({ generation: 0, milliseconds: 0 });
  const [fileTabs, setFileTabs] = useState<FileTab[]>(hotCheckpoint?.files ?? []);
  const [activeSurface, setActiveSurface] = useState<string>(hotCheckpoint?.activeSurface ?? "graphs");
  const [selectedConnection, setSelectedConnection] = useState<GraphConnectionFocus | null>(null);
  const workspaceRef = useRef<WorkspaceState>(workspace);
  const fileTabsRef = useRef<FileTab[]>(fileTabs);
  const activeSurfaceRef = useRef<string>(activeSurface);
  const fileEventsRef = useRef(new Map<string, FileEvent>());
  const openGenerationsRef = useRef(new Map<string, number>());
  const openingFilesRef = useRef(new Map<string, number>());
  const reloadGenerationsRef = useRef(new Map<string, number>());
  const desiredFilesRef = useRef(new Set<string>(fileTabs.map((tab) => tab.path)));
  const savesInFlightRef = useRef(pendingWrites.paths);
  const pendingWriteRevision = useSyncExternalStore(pendingWrites.subscribe, pendingWrites.snapshot);
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
  if (hotMemory) hotMemory.workbench = {
    workspace, activeSurface, lens: activeLens,
    files: fileTabs.map((tab) => savesInFlightRef.current.has(tab.path) || tab.status === "saving" ? { ...tab, status: "unknown", message: "Renderer replaced during save; check disk before retrying. Buffer preserved." } : tab),
  };

  useEffect(() => { fileTabsRef.current = fileTabs; }, [fileTabs]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);
  useEffect(() => taskClient.connect(window.swarm, window.swarmLifecycle), [taskClient]);
  useEffect(() => {
    if (workspace.snapshot) taskClient.setContext(workspace.snapshot.world.id, workspace.snapshot.project.id);
  }, [taskClient, workspace.snapshot?.world.id, workspace.snapshot?.project.id]);
  useEffect(() => {
    // Mirrors the existing compact breakpoint, including Electron's CSS zoom.
    // Checking panel visibility does not make source/build changes scan tasks.
    const media = window.matchMedia?.("(max-width: 1100px)");
    const update = () => taskClient.setVisible(Boolean(workspace.snapshot) && (!media?.matches || compactPanel === "work"));
    update();
    media?.addEventListener("change", update);
    return () => { media?.removeEventListener("change", update); };
  }, [taskClient, compactPanel, Boolean(workspace.snapshot)]);

  const selectTask = useCallback((id: string) => {
    ++navigationIntent.current;
    setInformationView("task");
    setRevealNotice("");
    taskClient.select(id);
  }, [taskClient]);
  const sourceInformation = useCallback(() => {
    ++navigationIntent.current;
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by source navigation; previous source retained." : notice);
    setInformationView("source");
  }, []);
  const showTaskDetails = useCallback(() => {
    setInformationFocusRequest(++navigationIntent.current);
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by task inspection; previous source retained." : notice);
    setInformationView("task");
    setCompactPanel("info");
  }, []);
  const returnToSourceInformation = useCallback(() => {
    sourceInformation();
    setSourceInfoFocusRequest(navigationIntent.current);
  }, [sourceInformation]);
  const reportRevealFailure = useCallback((message: string) => {
    setRevealNotice(message);
    setNoticeFocusRequest(navigationIntent.current);
  }, []);
  useLayoutEffect(() => {
    if (sourceInfoFocusRequest && sourceInfoFocusRequest === navigationIntent.current) sourceInformationHeading.current?.focus();
  }, [sourceInfoFocusRequest]);
  useLayoutEffect(() => {
    if (noticeFocusRequest && noticeFocusRequest === navigationIntent.current) revealNoticeElement.current?.focus();
  }, [noticeFocusRequest]);
  useLayoutEffect(() => {
    if (!informationFocusRequest) return;
    // Only an explicit Show gesture requests a keyboard destination. Ordinary
    // task selection never opens a hidden pane or takes the user's focus.
    if (informationFocusRequest === navigationIntent.current) taskReturnButton.current?.focus();
  }, [informationFocusRequest]);

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
    const generation = coreGenerationRef.current;
    try {
      if (!window.swarm) throw new Error("Open this interface through the swarm-ide Electron shell");
      const response = await window.swarm.request(request);
      if (request.type !== "file.write" && (generation !== coreGenerationRef.current || (window.swarmLifecycle && lifecycleRef.current?.core.phase !== "ready"))) return null;
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
    ++navigationIntent.current;
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by source navigation; previous source retained." : notice);
    activeSurfaceRef.current = surface;
    setActiveSurface(surface);
  }, []);

  const activateFile = useCallback((path: string) => {
    setInformationView("source");
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
    if (protectsBuffer(before)) {
      setFileTabs((tabs) => tabs.map((tab) => tab.path === event.path ? { ...tab, status: tab.status === "unknown" ? "unknown" : "conflict", message: "The working file changed; your local buffer is preserved." } : tab));
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
      if (protectsBuffer(tab) || tab.revision === incoming.revision) return tab;
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
    const shell = window.swarmLifecycle;
    if (!shell) return;
    let live = true;
    const receive = (status: Lifecycle) => {
      if (!live || status.revision <= (lifecycleRef.current?.revision ?? -1)) return;
      lifecycleRef.current = status;
      if (coreGenerationRef.current !== status.core.generation) {
        ++navigationIntent.current;
        setSourceNavigation(null);
        setRevealNotice((notice) => notice.startsWith("Opening working file") ? "CORE_GENERATION_CHANGED: Reveal interrupted; previous source retained." : notice);
        coreGenerationRef.current = status.core.generation;
        fileEventsRef.current.clear();
        setWorkspace((current) => ({ ...current, lastSequence: -1 }));
      }
      if (status.core.phase !== "ready") {
        setWorkspace((current) => current.snapshot ? { ...current, snapshot: staleSnapshot(current.snapshot, status.core.message) } : current);
      }
      setLifecycle(status);
    };
    const unsubscribe = shell.onStatus(receive);
    void shell.status().then(receive).catch(() => setReloadNotice("Lifecycle bridge unavailable; automatic document refresh disabled."));
    return () => { live = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const bridge = window.swarm;
    if (!bridge) {
      setError("Open this interface through the swarm-ide Electron shell");
      return;
    }
    const unsubscribe = bridge.onEvent((event) => {
      if (event.type === "agent.changed") return;
      if (window.swarmLifecycle && lifecycleRef.current?.core.phase !== "ready") return;
      if (event.type === "file.changed") {
        void reloadObservedFile(event);
      } else {
        setWorkspace((current) => {
          const next = applyCoreEvent(current, event);
          return next.snapshot ? { ...next, snapshot: retainDerived(current.snapshot, next.snapshot) } : next;
        });
      }
    });
    return unsubscribe;
  }, [reloadObservedFile]);

  useEffect(() => {
    if (window.swarmLifecycle && lifecycle?.core.phase !== "ready") return;
    const bridge = window.swarm;
    if (!bridge) return;
    let live = true;
    const generation = coreGenerationRef.current;
    const recovered = lastRecoveryRef.current >= 0 ? lastRecoveryRef.current !== generation : Boolean(hotCheckpoint);
    lastRecoveryRef.current = generation;
    if (recovered) {
      fileEventsRef.current.clear();
      openingFilesRef.current.clear();
      for (const path of desiredFilesRef.current) openGenerationsRef.current.set(path, (openGenerationsRef.current.get(path) ?? 0) + 1);
    }
    void bridge.request({ type: "workspace.snapshot", requestId: requestId(), protocolVersion: PROTOCOL_VERSION }).then((response) => {
      if (!live || coreGenerationRef.current !== generation) return;
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setWorkspace((current) => {
        if (current.snapshot && response.sequence <= current.lastSequence) return current;
        return loadSnapshot(retainDerived(current.snapshot, response.snapshot), response.sequence);
      });
      setObservedCoreGeneration(generation);
      if (recovered) {
        const oldFocus = workspaceRef.current.snapshot?.focus;
        if (oldFocus) void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus: { ...oldFocus, revisionId: response.snapshot.revisions.working.id } });
        for (const path of desiredFilesRef.current) {
          void (async () => {
            const watch = await invoke({ type: "file.watch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
            if (!live || coreGenerationRef.current !== generation || !desiredFilesRef.current.has(path)) return;
            const fileResponse = watch?.ok ? await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path }) : null;
            if (!live || coreGenerationRef.current !== generation || !desiredFilesRef.current.has(path)) return;
            setFileTabs((tabs) => tabs.map((tab) => {
              if (tab.path !== path) return tab;
              if (!fileResponse?.ok || fileResponse.file?.kind !== "read") return { ...tab, status: protectsBuffer(tab) ? "conflict" : "error", message: "Core recovered, but source could not be reconciled; buffer preserved." };
              const file = fileResponse.file;
              const latest = fileEventsRef.current.get(path);
              if (latest && latest.revision !== file.revision) return tab;
              if (protectsBuffer(tab)) return { ...tab, status: tab.status === "unknown" ? "unknown" : tab.revision === file.revision ? "dirty" : "conflict", message: "Core recovered; local buffer preserved. Reconcile an uncertain save before retrying." };
              return { ...tab, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Source observation restored", flash: null };
            }));
          })();
        }
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open the working world"));
    return () => { live = false; };
  }, [lifecycle?.core.generation, lifecycle?.core.phase, invoke, hotCheckpoint]);

  const openFile = useCallback(async (path: string, coordinateFocus = true, background = false): Promise<FileTab | null> => {
    if (!background) {
      if (coordinateFocus) activateFile(path);
      else showSurface(path);
    }
    const existing = fileTabsRef.current.find((tab) => tab.path === path);
    if (existing) return existing;
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
    if (openGenerationsRef.current.get(path) !== generation || !desiredFilesRef.current.has(path)) return null;
    if (!watchResponse?.ok) {
      settleOpen((tab) => ({ ...tab, status: "error", message: watchResponse && !watchResponse.ok
        ? `${watchResponse.error.code}: ${watchResponse.error.message}` : "CORE_UNAVAILABLE: source observation was interrupted." }));
      return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
    }
    let eventSequenceBeforeRead = fileEventsRef.current.get(path)?.sequence ?? 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path });
      if (openGenerationsRef.current.get(path) !== generation || !desiredFilesRef.current.has(path)) return null;
      const eventAfterRead = fileEventsRef.current.get(path);
      const superseded = eventAfterRead && eventAfterRead.sequence > eventSequenceBeforeRead;
      if (!response?.ok || !response.file || response.file.kind !== "read") {
        if (superseded && attempt < 2) {
          eventSequenceBeforeRead = eventAfterRead.sequence;
          continue;
        }
        settleOpen((tab) => ({ ...tab, status: "error", message: response && !response.ok
          ? `${response.error.code}: ${response.error.message}` : "CORE_UNAVAILABLE: source read was interrupted." }));
        return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
      }
      const file = response.file;
      if (superseded && eventAfterRead.revision !== file.revision) {
        eventSequenceBeforeRead = eventAfterRead.sequence;
        continue;
      }
      settleOpen((tab) => ({ ...tab, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Watching the working file", flash: null }));
      return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
    }
    if (openGenerationsRef.current.get(path) === generation && desiredFilesRef.current.has(path)) {
      settleOpen((tab) => ({ ...tab, status: "error", message: "The working file changed too quickly to open a stable revision." }));
    }
    return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
  }, [activateFile, invoke, showSurface]);

  const revealTaskReference = useCallback(async (ref: TaskFileRef) => {
    if (!validTaskReference(ref)) { reportRevealFailure("Unsupported reference: only canonical relative working-file paths can be revealed."); return; }
    const intent = ++navigationIntent.current;
    const coreGeneration = coreGenerationRef.current;
    const prior = fileTabsRef.current.find((tab) => tab.path === ref.path);
    setRevealNotice(`Opening working file ${ref.path}…`);
    let tab = prior;
    if (prior && !protectsBuffer(prior)) {
      if (prior.status === "loading") { reportRevealFailure("Source observation is already in progress; Reveal again when it settles."); return; }
      const openGeneration = openGenerationsRef.current.get(ref.path);
      const eventSequenceBeforeRead = fileEventsRef.current.get(ref.path)?.sequence ?? 0;
      if (prior.status === "error") {
        const watch = await invoke({ type: "file.watch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: ref.path });
        if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current) return;
        if (!watch?.ok) { reportRevealFailure(watch && !watch.ok ? `${watch.error.code}: ${watch.error.message}` : "CORE_UNAVAILABLE: source observation interrupted."); return; }
      }
      const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: ref.path });
      if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current ||
          openGenerationsRef.current.get(ref.path) !== openGeneration || !desiredFilesRef.current.has(ref.path)) return;
      if (!response?.ok || response.file?.kind !== "read") {
        reportRevealFailure(response && !response.ok ? `${response.error.code}: ${response.error.message}` : "CORE_UNAVAILABLE: source read was interrupted."); return;
      }
      const file = response.file;
      const current = fileTabsRef.current.find((item) => item.path === ref.path);
      if (!current) return;
      if (protectsBuffer(current)) tab = current;
      else {
        const latest = fileEventsRef.current.get(ref.path);
        if (latest && latest.sequence > eventSequenceBeforeRead && latest.revision !== file.revision) { reportRevealFailure("Working file changed during Reveal; existing source and cursor retained. Try again after observation settles."); return; }
        tab = { ...current, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Watching the working file", flash: null };
        const updated = tab;
        fileTabsRef.current = fileTabsRef.current.map((item) => item.path === ref.path ? updated : item);
        setFileTabs((tabs) => tabs.map((item) => item.path === ref.path ? updated : item));
      }
    } else if (!prior) tab = await openFile(ref.path, false, true) ?? undefined;
    // A rejected candidate is not an opened source tab. Drop only this new,
    // still-empty background failure, never an existing or activated buffer.
    const failedBackground = fileTabsRef.current.find((item) => item.path === ref.path);
    if (mounted.current && coreGeneration === coreGenerationRef.current && !prior && tab?.status === "error" && !tab.revision && failedBackground?.status === "error" &&
        !failedBackground.revision && !protectsBuffer(failedBackground) && activeSurfaceRef.current !== ref.path) {
      desiredFilesRef.current.delete(ref.path);
      openGenerationsRef.current.set(ref.path, (openGenerationsRef.current.get(ref.path) ?? 0) + 1);
      openingFilesRef.current.delete(ref.path);
      fileTabsRef.current = fileTabsRef.current.filter((item) => item.path !== ref.path);
      setFileTabs((tabs) => tabs.filter((item) => item.path !== ref.path));
      void invoke({ type: "file.unwatch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: ref.path });
    }
    if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current) return;
    if (!tab || !tab.revision || tab.status === "error" && !protectsBuffer(tab)) {
      reportRevealFailure(tab?.message ?? "CORE_UNAVAILABLE: source opening was interrupted; previous source retained."); return;
    }
    const target = taskLineTarget(tab, ref.line);
    activateFile(ref.path);
    setRevealNotice(target.notice);
    setSourceNavigation({ path: ref.path, content: tab.content, line: target.line, nonce: intent, focus: true });
  }, [activateFile, invoke, openFile, reportRevealFailure]);

  const closeFile = useCallback((path: string) => {
    const tab = fileTabsRef.current.find((candidate) => candidate.path === path);
    if (tab && protectsBuffer(tab)) {
      setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, message: "Save or reload this buffer before closing it." } : candidate));
      return;
    }
    desiredFilesRef.current.delete(path);
    editorMemories.current.delete(path);
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
    if (window.swarmLifecycle && lifecycleRef.current?.core.phase !== "ready") return;
    const tab = fileTabsRef.current.find((candidate) => candidate.path === path);
    if (!tab || !tab.revision || tab.status !== "dirty" || savesInFlightRef.current.has(path)) return;
    const savedContent = tab.content;
    const eventSequenceBeforeSave = fileEventsRef.current.get(path)?.sequence ?? 0;
    pendingWrites.start(path);
    setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, status: "saving", message: "Saving with optimistic revision check…" } : candidate));
    const response = await invoke({ type: "file.write", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path, expectedRevision: tab.revision, content: savedContent });
    pendingWrites.finish(path);
    if (!response?.ok || !response.file || response.file.kind !== "write") {
      const conflict = response && !response.ok && response.error.code === "REVISION_CONFLICT";
      const unknown = !response || (!response.ok && response.error.code === "WRITE_OUTCOME_UNKNOWN");
      setFileTabs((tabs) => tabs.map((candidate) => candidate.path === path ? { ...candidate, status: unknown ? "unknown" : conflict ? "conflict" : candidate.content !== candidate.savedContent ? "dirty" : "error", message: unknown ? "Save outcome unknown; buffer preserved. Check disk before retrying; no write will be replayed." : `${response && !response.ok ? response.error.message : "Save failed"}; your buffer is preserved${conflict ? "" : " and can be retried"}.` } : candidate));
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
    if (!before || savesInFlightRef.current.has(path)) return;
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
      if (tab.status === "unknown") {
        if (file.content === tab.content) return { ...tab, savedContent: file.content, revision: file.revision, status: "saved", message: "Disk confirms the buffer was saved; no write replayed", flash: null };
        if (file.content === tab.savedContent) return { ...tab, revision: file.revision, status: "dirty", message: "Disk still has the previous content; buffer preserved and explicit retry is now safe", flash: null };
        return { ...tab, status: "conflict", message: "Disk differs from both the saved content and this buffer. Buffer preserved; resolve the conflict explicitly." };
      }
      return { ...tab, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Reloaded the canonical working file", flash: null };
    }));
  }, [invoke]);

  const navigationRestoredRef = useRef(false);
  useEffect(() => {
    if (window.swarmLifecycle && lifecycle?.core.phase !== "ready") return;
    if (window.swarmLifecycle && observedCoreGeneration !== lifecycle?.core.generation) return;
    if (!workspace.snapshot || navigationRestoredRef.current) return;
    navigationRestoredRef.current = true;
    if (!restoredNavigation || hotCheckpoint) return;
    for (const path of restoredNavigation.paths) void openFile(path, false);
    showSurface(restoredNavigation.activeSurface);
    if (restoredNavigation.focus) void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus: { ...restoredNavigation.focus, revisionId: workspace.snapshot.revisions.working.id } });
  }, [workspace.snapshot, restoredNavigation, openFile, showSurface, invoke, hotCheckpoint, lifecycle?.core.phase, lifecycle?.core.generation, observedCoreGeneration]);

  const checkpointDocument = useCallback(() => {
    // Read the controller at the actual attempt, including intent entered
    // after preload preflight but before beforeunload. Never store agent text.
    if (protectsAgentIntent(agentClient.getSnapshot())) throw new Error("Local agent intent requires a decision before refresh.");
    if (fileTabsRef.current.some(protectsBuffer) || savesInFlightRef.current.size) throw new Error("Save or reconcile buffers before reloading.");
    window.sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify({ paths: [...desiredFilesRef.current], activeSurface: activeSurfaceRef.current, lens: activeLens, focus: workspaceRef.current.snapshot?.focus ?? null, snapshot: workspaceRef.current.snapshot ?? undefined }));
  }, [activeLens, agentClient]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      try { checkpointDocument(); } catch {
        event.preventDefault();
        event.returnValue = "";
        setReloadNotice(protectsAgentIntent(agentClient.getSnapshot())
          ? "Reload deferred: inspect local agent intent in the work rail. Nothing was discarded or resent."
          : "Reload deferred: preserve or reconcile your buffers first (navigation storage must also be available).");
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [checkpointDocument, agentClient]);

  useEffect(() => {
    if (!agentIntentProtected) setReloadNotice((notice) => notice.includes("inspect local agent intent") ? "Local agent intent resolved. File buffers and navigation storage must still be safe; retry manual refresh if needed." : notice);
  }, [agentIntentProtected]);

  useEffect(() => {
    if (lifecycle?.reload !== "pending" || lifecycle.core.phase !== "ready") return;
    if (protectsAgentIntent(agentClient.getSnapshot())) {
      setReloadNotice("Preload refresh deferred: inspect local agent intent in the work rail. Nothing was discarded or resent.");
      return;
    }
    if (fileTabs.some(protectsBuffer) || savesInFlightRef.current.size) {
      setReloadNotice("Preload refresh deferred: save or reconcile file buffers first.");
      return;
    }
    // Preflight storage before acknowledging. Otherwise a quota failure in
    // beforeunload would repeatedly veto and re-trigger automatic reload.
    try { checkpointDocument(); } catch {
      setReloadNotice("Preload refresh deferred: the document checkpoint could not be stored. Current state is retained.");
      return;
    }
    setReloadNotice("");
    void window.swarmLifecycle?.reload(lifecycle.revision).catch(() => setReloadNotice("Preload refresh could not be applied; current document retained."));
  }, [lifecycle, fileTabs, checkpointDocument, pendingWriteRevision, agentIntentProtected, agentClient]);

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
  const coreUnavailable = Boolean(window.swarmLifecycle && lifecycle?.core.phase !== "ready");
  const lifecycleNotice = lifecycle?.reload === "pending" ? "Preload refresh pending — resolve protected file buffers and local agent intent to apply it." : lifecycle?.core.phase !== "ready" ? lifecycle?.core.message : lifecycle?.notice;
  const lifecycleTitle = import.meta.env.DEV && lifecycle ? ` — Core ${lifecycle.core.generation}:${lifecycle.core.phase} — Doc ${Math.round(performance.timeOrigin)} — Reload ${lifecycle.reload}${lifecycle.notice.includes("Build failed") ? " — Build failed" : ""}${lifecycle.notice.includes("restart required") ? " — Restart required" : ""}` : "";
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
    const fixtureTitle = agentFixtureEnabled ? agents.draftOpen ? " — Agent fixture draft" : agents.run ? ` — Agent fixture ${agents.run.state} step ${agents.step}` : " — Agent fixture enabled" : "";
    const agentTitle = import.meta.env.DEV ? liveAgents.draft ? " — Agent live draft" : liveAgents.paneOpen ? ` — Agent live ${liveAgents.run?.state ?? "unobserved"}` : "" : "";
    const topologyTitle = snapshot ? ` — Topology ${snapshot.reconciliation.epoch}:${snapshot.reconciliation.status}` : "";
    document.title = `swarm-ide — ${title}${focus}${revision}${fraudVisible}${surface}${files}${palette} — ${zoomTitle}${hmrSuffix}${lifecycleTitle}${fixtureTitle}${agentTitle}${topologyTitle}`;
  }, [activeFile?.status, activeSurface, fileTabs.length, hmr, paletteOpen, snapshot, title, zoomTitle, lifecycleTitle, agentFixtureEnabled, agents.draftOpen, agents.run, agents.step, liveAgents.draft, liveAgents.paneOpen, liveAgents.run?.state]);

  const selectFocus = useCallback((focus: FocusRef) => {
    sourceInformation();
    setSelectedConnection(null);
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus });
    if (focus.path) void openFile(focus.path, false);
  }, [invoke, openFile, sourceInformation]);
  const selectConnection = useCallback((connection: GraphConnectionFocus) => {
    sourceInformation();
    setSelectedConnection(connection);
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus: connection.interfaceFocus });
  }, [invoke, sourceInformation]);
  const reconcile = useCallback(() => {
    setPaletteOpen(false);
    return invoke({ type: "reconciliation.start", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, mode: "success" });
  }, [invoke]);

  const commands = useMemo(() => [
    { label: "Show repository Tasks", detail: "inspect planning metadata without moving source", run: () => { setPaletteOpen(false); setCompactPanel("work"); } },
    { label: "Refresh tasks", detail: "observe local metadata; no fetch, task mutation or dispatch", run: () => { setPaletteOpen(false); setCompactPanel("work"); void taskClient.refresh(); } },
    { label: "Show task details", detail: "retained task selection in Information", run: () => { setPaletteOpen(false); showTaskDetails(); } },
    { label: "Ask an agent about this focus", detail: "inspect disk context before explicit read-only launch", run: () => { setPaletteOpen(false); setCompactPanel("work"); if (workspaceRef.current.snapshot) agentClient.openDraft(workspaceRef.current.snapshot.focus); } },
    { label: "Build repository service topology", detail: "exact fingerprint → Bazel artifact → green", run: reconcile },
    { label: "Show system graphs", detail: "return to the coordinated repository and service views", run: () => { setPaletteOpen(false); showSurface("graphs"); } },
    { label: "Open FraudCheck implementation", detail: FRAUDCHECK_IMPLEMENTATION, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_IMPLEMENTATION); } },
    { label: "Open FraudCheck protobuf contract", detail: FRAUDCHECK_CONTRACT, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_CONTRACT); } },
    ...(agentFixtureEnabled ? [{ label: "Preview agent fixture", detail: "DEMO only · no provider or file bytes · explicit launch", run: () => { setPaletteOpen(false); setCompactPanel("work"); openAgentDraft(); } }] : []),
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase())), [agentClient, taskClient, agentFixtureEnabled, openAgentDraft, commandQuery, openFile, reconcile, showSurface, showTaskDetails]);

  if (!snapshot) return <main className="loading-screen"><div className="loading-mark hmr-probe" />Opening the working world…{error ? <strong>{error}</strong> : null}<small>{lifecycleNotice}</small><AgentReloadGuard state={liveAgents} client={agentClient} /></main>;
  return (
    <main className="workbench" data-compact-panel={compactPanel ?? "none"} style={agents.selected || liveAgents.paneOpen ? { gridTemplateRows: `var(--topbar-height) minmax(0, 1fr) calc(160px + (clamp(180px, 40vh, 448px) - 160px) * ${Math.min(1, Math.max(0, ((liveAgents.paneOpen ? liveAgents.height : agentPaneHeight) - 230) / 190))})` } : undefined}>
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
        <div className="compact-panel-controls" aria-label="Compact cockpit panels">
          <button aria-label="Toggle work panel" aria-controls="work-panel" aria-expanded={compactPanel === "work"} onClick={() => setCompactPanel((panel) => panel === "work" ? null : "work")}>Work{agentIntentProtected ? " · local intent" : ""}</button>
          <button aria-label="Toggle information panel" aria-controls="information-panel" aria-expanded={compactPanel === "info"} onClick={() => setCompactPanel((panel) => panel === "info" ? null : "info")}>Information</button>
        </div>
      </header>

      <aside id="work-panel" aria-label="Work panel" className="work-rail panel">
        <div className="rail-section"><span className="eyebrow">working world</span><h1>swarm-ide</h1><p className="muted">real local repository</p></div>
        <LiveRunRail state={liveAgents} client={agentClient} onDraft={() => { setCompactPanel("work"); agentClient.openDraft(snapshot.focus); }} />
        <AgentReloadGuard state={liveAgents} client={agentClient} />
        <PreparedLaunchDraft state={liveAgents} client={agentClient} dirtyPaths={fileTabs.filter((tab) => protectsBuffer(tab)).map((tab) => tab.path)} />
        {agentFixtureEnabled ? <RunRail state={agents} fixtureEnabled={agentFixtureEnabled} onDraft={() => { setCompactPanel("work"); openAgentDraft(); }} onSelect={() => { agentClient.closePane(); setAgents((state) => ({ ...state, selected: true })); }} /> : null}
        {agents.draftOpen && agentFixtureEnabled ? <LaunchDraft focus={snapshot.focus} onClose={() => setAgents((state) => ({ ...state, draftOpen: false }))} onLaunch={(context) => { agentClient.closePane(); setAgents((state) => fixtureReducer(state, { type: "launch", context })); }} /> : null}
        <TaskPanel observation={tasks.observation} refreshing={tasks.refreshing} connected={tasks.connected} notice={tasks.notice} selectedTaskId={tasks.selectedTaskId} onSelect={selectTask} onRefresh={() => { void taskClient.refresh(); }} onShowDetails={showTaskDetails} />
      </aside>

      <section className={`navigation-field ${activeFile ? "source-open" : ""}`}>
        <div className="field-toolbar">
          <div><span className="eyebrow">central navigation</span><strong>{activeFile?.path ?? focusLabel(snapshot.focus)}</strong><small tabIndex={0}>{activeFile ? `${activeFile.status} · ${activeFile.message}` : `${snapshot.focus.domain} · ${snapshot.focus.revisionId.slice(0, 12)}`}</small></div>
          <div className="world-chips"><span>working <b>{snapshot.revisions.working.id.slice(0, 8)}</b></span><span>built <b>{snapshot.revisions.built.id.slice(0, 8) || "—"}</b></span><span>deployed <b>{snapshot.revisions.deployed.environment}</b></span></div>
          <button id="reconcile-success" className="build-button" onClick={() => void reconcile()} disabled={reconciliationRunning || coreUnavailable}>▶ Build topology</button>
        </div>
        <nav className="surface-tabs" aria-label="Central workspace tabs">
          <button className={activeSurface === "graphs" ? "active" : ""} onClick={() => showSurface("graphs")}><span>⌘</span> System graphs</button>
          {fileTabs.map((tab) => <div key={tab.path} className={`surface-tab ${activeSurface === tab.path ? "active" : ""}`}><button className="surface-tab-main" onClick={() => activateFile(tab.path)} title={tab.path}><span className={`tab-state status-${tab.status}`}>{tab.status === "dirty" ? "●" : tab.status === "saving" ? "◌" : tab.status === "conflict" || tab.status === "error" ? "!" : "◇"}</span>{tab.path.split("/").at(-1)}</button><button className="surface-tab-close" aria-label={`Close ${tab.path}`} onClick={() => closeFile(tab.path)}>×</button></div>)}
        </nav>
        <div className={`graphs-grid ${activeFile ? "is-sidebar" : activeSurface === "graphs" ? "is-active" : "is-hidden"}`}>{snapshot.graphs.map((graph) => <GraphPane key={graph.topologyId} graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={zoomPercent} onFocus={selectFocus} onConnectionFocus={selectConnection} onReconcile={() => { void reconcile(); }} reconciliationRunning={reconciliationRunning} />)}</div>
        {activeFile ? <section onPointerDown={sourceInformation} onFocusCapture={sourceInformation} className={`source-surface ${["conflict", "unknown", "error"].includes(activeFile.status) ? "has-banner" : ""}`}>
          <header><div><span className="eyebrow">source observatory</span><strong>{activeFile.path}</strong></div><div className={`file-state file-${activeFile.status}`}><i />{activeFile.status}<button onClick={() => void saveFile(activeFile.path)} disabled={activeFile.status !== "dirty" || coreUnavailable}>Save <kbd>Ctrl S</kbd></button></div></header>
          {activeFile.status === "loading" ? <div className="source-message">Loading the canonical working file…</div> : <>
            {["conflict", "unknown", "error"].includes(activeFile.status) ? <div className="source-message source-error source-banner"><span>{activeFile.message}</span><button disabled={coreUnavailable || savesInFlightRef.current.has(activeFile.path)} onClick={() => void reloadFile(activeFile.path)}>{activeFile.status === "unknown" ? "Check disk" : "Reload disk"}</button></div> : null}
            {activeFile.revision ? <EditorPane key={activeFile.path} content={activeFile.content} flash={activeFile.flash}
              memory={(() => { let memory = editorMemories.current.get(activeFile.path); if (!memory) { memory = { state: null }; editorMemories.current.set(activeFile.path, memory); } return memory; })()}
              navigation={sourceNavigation?.path === activeFile.path ? sourceNavigation : null}
              onNavigation={(nonce, applied) => { setSourceNavigation((current) => current?.nonce === nonce ? null : current); if (!applied) reportRevealFailure("Working buffer changed before line navigation; cursor retained. Reveal again after reconciling source."); }} onChange={(content) => {
              const update = (tab: FileTab): FileTab => {
              if (tab.path !== activeFile.path) return tab;
              const unresolved = ["conflict", "unknown", "error"].includes(tab.status);
              const status = unresolved ? tab.status : tab.status === "saving" ? "saving" : content === tab.savedContent ? "saved" : "dirty";
              return { ...tab, content, status, message: unresolved ? tab.message : content === tab.savedContent ? "Watching the working file" : "Local buffer differs from disk", flash: null };
              };
              fileTabsRef.current = fileTabsRef.current.map(update);
              setFileTabs((tabs) => tabs.map(update));
            }} onSave={() => void saveFile(activeFile.path)} /> : <div className="source-message source-error">{activeFile.message}</div>}
          </>}
        </section> : null}
      </section>

      <aside id="information-panel" aria-label="Information panel" className="instrument-panel panel">
        {revealNotice ? <p ref={revealNoticeElement} className="tasks-reveal-notice" role="status" tabIndex={0}>{revealNotice}</p> : null}
        {informationView === "task" ? <TaskDetail returnButtonRef={taskReturnButton} selectedTaskId={tasks.selectedTaskId} snapshot={tasks.observation?.snapshot ?? null} detail={tasks.detail} detailRevision={tasks.detailRevision} detailStale={tasks.detailStale || tasks.observation?.status !== "observed" || Boolean(tasks.notice)} reading={tasks.reading} notice={tasks.detailNotice} onSelect={selectTask} onReveal={(ref) => { void revealTaskReference(ref); }} onReturnToSource={returnToSourceInformation} /> : <>
        {tasks.selectedTaskId ? <button className="tasks-show-details" onClick={showTaskDetails}>Show task details</button> : null}
        <div className="instrument-heading"><div><span className="eyebrow">contextual instruments</span><h2 ref={sourceInformationHeading} tabIndex={-1}>{selectedConnection?.label ?? focusLabel(snapshot.focus)}</h2></div><button>•••</button></div>
        <div className="breadcrumbs">world / {selectedConnection ? "connection" : snapshot.focus.domain} / <b>{selectedConnection?.id ?? focusLabel(snapshot.focus)}</b></div>
        <div className="widget-grid">
          {selectedConnection ? <article className="widget widget-list connection-widget"><header><span>{selectedConnection.kind} connection</span><i title={`${selectedConnection.provenance[0]?.sourceKind}: ${selectedConnection.provenance[0]?.uri}`} /></header><div className="connection-flow"><button onClick={() => selectFocus(selectedConnection.source.focus)}>{selectedConnection.source.label}</button><span>→</span><button onClick={() => selectFocus(selectedConnection.target.focus)}>{selectedConnection.target.label}</button></div>{selectedConnection.contract ? <small>{selectedConnection.contract}</small> : null}<code>{selectedConnection.provenance[0]?.uri}</code></article> : null}
          {[...snapshot.widgets].sort((a, b) => a.priority - b.priority).map((widget) => <article className={`widget widget-${widget.kind}`} key={widget.id}><header><span>{widget.title}</span><i title={`${widget.provenance.sourceKind}: ${widget.provenance.uri}`} /></header>{Array.isArray(widget.value) ? <ul>{widget.value.map((item) => <li key={item}>{widget.id === "source-paths" ? <button className="source-link" onClick={() => void openFile(item)}>{item}</button> : item}</li>)}</ul> : <div className="widget-value">{widget.value}</div>}{widget.unit ? <small>{widget.unit}</small> : null}</article>)}
        </div>
        <article className="widget source-widget"><header><span>Truth source</span><i /></header>{snapshot.focus.path ? <button className="source-link" onClick={() => void openFile(snapshot.focus.path!)}>{snapshot.focus.path}</button> : <code>{snapshot.focus.key}</code>}<small>{snapshot.reconciliation.message}</small></article>
        </>}
      </aside>

      <section className={`activity-dock panel ${agents.selected || liveAgents.paneOpen ? "agent-dock-open" : ""}`}>
        {liveAgents.paneOpen ? <LiveRunPane state={liveAgents} onInstruction={(text) => agentClient.instruction(text)} onSteer={() => { void agentClient.steer(); }}
          onStop={() => { void agentClient.stop(); }} onRead={(fromStart) => { void agentClient.read(fromStart); }} onFollow={() => agentClient.follow()} onClose={() => agentClient.closePane()}
          onHeight={(height) => agentClient.resize(height)} currentWorldId={snapshot.world.id} currentFingerprint={snapshot.revisions.working.fingerprint}
          onReveal={(focus) => {
            if (focus.worldId === snapshot.world.id && focus.revisionKind === "working") selectFocus({ ...focus, revisionId: snapshot.revisions.working.id });
            else setError("Launch focus cannot be mapped to this working world.");
          }} /> : agents.selected ? <RunPane key={agents.run?.runId} state={agents} dispatch={(action) => { if (agentFixtureEnabled) setAgents((state) => fixtureReducer(state, action)); }} onReveal={(focus) => {
          if (focus.worldId === snapshot.world.id && focus.revisionKind === "working") selectFocus({ ...focus, revisionId: snapshot.revisions.working.id });
          else setError("Launch focus cannot be mapped to this working world.");
        }} onClose={() => setAgents((state) => ({ ...state, selected: false }))} height={agentPaneHeight} onHeight={setAgentPaneHeight} /> : null}
        <div className="dock-header"><div><span className="eyebrow">activity / jobs</span><strong>Changes entering the world</strong></div><span className="ignored-events">{workspace.ignoredEvents} stale events rejected</span></div>
        <div className="job-strip" tabIndex={0} aria-label="Build jobs and recent activity">{snapshot.jobs.length ? snapshot.jobs.map((job) => <article className={`job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} key={job.id}><header><strong>{job.label}</strong><span>{Math.round(job.progress * 100)}%</span></header><div className="job-progress"><i style={{ width: `${job.progress * 100}%` }} /></div><footer><span>{job.message}</span><b>{job.resources.cpuPercent || job.resources.memoryMiB ? `CPU ${job.resources.cpuPercent}% · ${job.resources.memoryMiB} MiB` : "telemetry unavailable"}</b></footer></article>) : <article className="job idle"><strong>No derived work running</strong><span>Build the repository service topology to observe the current world.</span></article>}<div className="activity-list">{snapshot.activity.slice(0, 4).map((activity) => <div key={activity.id}><i className={`status-${activity.status}`} /><span>{activity.summary}</span><small>{activity.kind}</small></div>)}</div></div>
        {agents.selected || liveAgents.paneOpen ? <div className="agent-job-summary" tabIndex={0} aria-label="Build and activity summary">Build / activity · {snapshot.jobs.length ? snapshot.jobs.map((job) => `${job.label}: ${job.status} · ${job.resources.cpuPercent || job.resources.memoryMiB ? `${job.resources.cpuPercent}% CPU / ${job.resources.memoryMiB} MiB` : "telemetry unavailable"}`).join(" · ") : "no derived work running"} · {snapshot.activity[0]?.summary ?? "no recent events"}</div> : null}
      </section>

      {paletteOpen ? <div className="palette-scrim" onMouseDown={() => setPaletteOpen(false)}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><span>⌕</span><input ref={commandInput} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commands[0]) void commands[0].run(); }} placeholder="Navigate or apply intelligence…" /><kbd>esc</kbd></header><div className="command-results">{commands.map((command) => <button key={command.label} onClick={() => void command.run()}><span>{command.label}<small>{command.detail}</small></span><kbd>↵</kbd></button>)}</div><footer><span>Current focus: {focusLabel(snapshot.focus)}</span><span>scope · action · artifact</span></footer></section></div> : null}
      {reloadNotice || lifecycleNotice ? <div className="lifecycle-notice" role="status" tabIndex={0} aria-label="Development status">{reloadNotice || lifecycleNotice}</div> : null}
      {error ? <div className="error-toast">{error}</div> : null}
      {zoomNotice ? <div className="zoom-toast" role="status">{zoomNotice}</div> : null}
    </main>
  );
}
