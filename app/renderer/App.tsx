import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
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
import { AgentDock } from "./agents/AgentDock";
import { buildGraphLinks, useBuildGraph } from "./repository/use-build-graph";
import { useUiDemo, MockRunRail, MockConversation, MockContext, MOCK_AGENTS, type DemoCommand } from "./agents/ui-demo";
import { protectsAgentIntent } from "./agents/live-state";
import "./agents/agents.css";
import { TaskBridgeClient } from "./tasks/client";
import { PlanWorkspace } from "./plans/PlanWorkspace";
import { TaskPanel } from "./tasks/TaskPanel";
import { TaskDetail } from "./tasks/TaskDetail";
import { TaskContext } from "./tasks/TaskContext";
import { taskLineTarget, validTaskReference } from "./tasks/reveal";
import type { TaskFileRef, TaskBacklinkTarget, TaskSnapshot } from "../../protocol/tasks";
import { isRepositoryPath, type RepositoryEntry, type RepositoryRequest } from "../../protocol/repository";
import { useRepositoryNavigation } from "./repository/navigation";
import { RepositoryNavigation } from "./repository/RepositoryNavigation";
import { FileSearchPalette } from "./repository/FileSearchPalette";
import { useFileSearch } from "./repository/file-search";
import type { RepositorySearchRequest } from "../../protocol/repository-search";
import { useStartupTopology } from "./startup-topology";
import { WorkbenchSidebar } from "./WorkbenchSidebar";
import { TopologyViews } from "./repository/BuildGraphPane";
import { ResizeDivider } from "./ResizeDivider";
import type { ContextSubject } from "../../protocol/context";
import { emptyContextAttention, permitsContextActivation, reduceContextAttention, subjectFromFocus, type AttentionEvent } from "./context/attention";
import { composeContext, indexCapture, indexService, type SourceReceipt } from "./context/compose";
import { ContextPane } from "./context/ContextPane";
import { declarationPublication, resolveDeclarations, type DeclarationResolution } from "./context/declarations";
import { DeclarationChooser } from "./context/DeclarationChooser";
import { sameAgentTaskReference } from "../../protocol/agent-task";
import { JournalActivity, JournalPanel, useJournal } from "./changelog/JournalPanel";
import { useExternalAgents } from "./external-agents/client";
import { ExternalAgentRail, ExternalAgentInformation } from "./external-agents/ExternalAgents";

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
  contextRead?: SourceReceipt;
  bufferGeneration?: number;
  bufferChangedAt?: string;
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
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalVisible, setJournalVisible] = useState(false);
  const [journalEntry, setJournalEntry] = useState<string | null>(null);
  const [journalSelection, setJournalSelection] = useState(0);
  const demo = useUiDemo();
  const [contextWidth, setContextWidth] = useState(30), [graphShare, setGraphShare] = useState(43);
  const [graphReframe, setGraphReframe] = useState(0);
  const [showBuildVersion, setShowBuildVersion] = useState(0);
  const textWasOpen = useRef(false);
  const { client: agentClient, state: liveAgents } = useAgentWorkbench();
  const agentIntentProtected = protectsAgentIntent(liveAgents);
  const [agents, setAgents] = useState(emptyAgentWorkbench);
  const [agentPaneHeight, setAgentPaneHeight] = useState(290);
  const [agentDockSelection, setAgentDockSelection] = useState(0);
  const [fixtureDockSelection, setFixtureDockSelection] = useState(0);
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
  const [externalInformation, setExternalInformation] = useState(false);
  const externalAgents = useExternalAgents(window.swarm, Boolean(workspace.snapshot) && (!window.swarmLifecycle || lifecycle?.core.phase === "ready"), lifecycle?.core.generation ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<(typeof lensTabs)[number]>(hotCheckpoint?.lens ?? restoredNavigation?.lens ?? "System");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePathMode, setPalettePathMode] = useState(false);
  const [compactPanel, setCompactPanel] = useState<"work" | "info" | null>(null);
  const taskClient = useMemo(() => new TaskBridgeClient(), [TaskBridgeClient]);
  const tasks = useSyncExternalStore(taskClient.subscribe, taskClient.getSnapshot);
  const [taskAttachmentNotice, setTaskAttachmentNotice] = useState<{ taskId: string | null; text: string } | null>(null);
  const [informationFocusRequest, setInformationFocusRequest] = useState(0);
  const taskReturnButton = useRef<HTMLButtonElement>(null);
  const sourceInformationHeading = useRef<HTMLHeadingElement>(null);
  const revealNoticeElement = useRef<HTMLParagraphElement>(null);
  const [sourceInfoFocusRequest, setSourceInfoFocusRequest] = useState(0);
  const [noticeFocusRequest, setNoticeFocusRequest] = useState(0);
  const [revealNotice, setRevealNotice] = useState("");
  const [sourceNavigation, setSourceNavigation] = useState<(SourceLineNavigation & { path: string }) | null>(null);
  const sourceNavigationRef = useRef<typeof sourceNavigation>(null);
  const editorMemories = useRef(new Map<string, EditorMemory>());
  const navigationIntent = useRef(0);
  const pendingRevealIntent = useRef<number | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sourceNavigationRef.current = null; ++navigationIntent.current; }; }, []);
  const [commandQuery, setCommandQuery] = useState("");
  const [hmr, setHmr] = useState({ generation: 0, milliseconds: 0 });
  const [fileTabs, setFileTabs] = useState<FileTab[]>(hotCheckpoint?.files ?? []);
  const [activeSurface, setActiveSurface] = useState<string>(hotCheckpoint?.activeSurface ?? "graphs");
  const [taskDocumentOpen, setTaskDocumentOpen] = useState(false);
  const [taskDocumentVisible, setTaskDocumentVisible] = useState(false);
  const [taskSidebarVisible, setTaskSidebarVisible] = useState(true);
  const journal = useJournal(workspace.snapshot?.project.id ?? null, lifecycle?.core.phase === "ready" ? lifecycle.core.generation : null);
  const showJournal = (entry?: string) => { setJournalOpen(true); setJournalVisible(true); setTaskDocumentVisible(false); setJournalEntry(entry ?? null); setJournalSelection((value) => value + 1); };
  useEffect(() => { if (taskDocumentVisible) setJournalVisible(false); }, [taskDocumentVisible]);
  const pendingBacklinkIntent = useRef<number | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<GraphConnectionFocus | null>(null);
  const workspaceRef = useRef<WorkspaceState>(workspace);
  // Attention's layout-phase realm reset must see this render's accepted world,
  // before passive effects or a user activation can capture an older realm.
  workspaceRef.current = workspace;
  const fileTabsRef = useRef<FileTab[]>(fileTabs);
  const activeSurfaceRef = useRef<string>(activeSurface);
  const [attention, setAttention] = useState(emptyContextAttention);
  const attentionRef = useRef(attention);
  type DefinitionIntent = { resolution: DeclarationResolution; realm: string; generation: number; intent: number; choosing: boolean; origin?: HTMLElement };
  const [definition, setDefinition] = useState<DefinitionIntent | null>(null);
  const definitionRef = useRef<DefinitionIntent | null>(null);
  const lastGraphSubject = useRef<ContextSubject | null>(null);
  const [contextSession] = useState(() => crypto.randomUUID());
  const contextRealm = useCallback(() => {
    const current = workspaceRef.current.snapshot;
    return JSON.stringify([current?.project.id, current?.world.id, coreGenerationRef.current]);
  }, []);
  const contextEvent = useCallback((event: AttentionEvent) => {
    setExternalInformation(false);
    attentionRef.current = reduceContextAttention(reduceContextAttention(attentionRef.current, { type: "realm", realm: contextRealm() }), event);
    setAttention(attentionRef.current);
  }, [contextRealm]);
  const inspect = useCallback((subject: ContextSubject | null) => contextEvent({ type: "inspect", subject }), [contextEvent]);
  const inspectFile = useCallback((path: string) => {
    const current = workspaceRef.current.snapshot;
    if (current && isRepositoryPath(path)) inspect({ repositoryId: current.project.id, worldId: current.world.id, kind: "file", path });
  }, [inspect]);
  const inspectGraph = useCallback((focus?: FocusRef) => {
    const current = workspaceRef.current.snapshot;
    const subject = current && focus ? subjectFromFocus(current.project.id, current.world.id, focus) : lastGraphSubject.current;
    lastGraphSubject.current = subject; inspect(subject);
  }, [inspect]);
  const inspectTask = useCallback((id: string | null) => {
    const current = workspaceRef.current.snapshot;
    if (current) inspect({ repositoryId: current.project.id, worldId: current.world.id, kind: "task", id });
  }, [inspect]);
  const inspectedTaskId = attention.subject?.kind === "task" ? attention.subject.id : null;
  useLayoutEffect(() => {
    // A successfully inspected pin starts at its heading. Do not focus it, move
    // source, or reset scrolling on passive refresh or repeated same-task clicks.
    if (tasks.pin && tasks.pin.taskId === inspectedTaskId) {
      const panel = document.getElementById("information-panel");
      if (panel) panel.scrollTop = 0;
    }
  }, [tasks.pin, inspectedTaskId]);
  const sourceReceipt = useCallback((revision: string): SourceReceipt => ({ revision, receivedAt: new Date().toISOString(), realm: contextRealm(), session: contextSession }), [contextRealm, contextSession]);
  useLayoutEffect(() => {
    const realm = contextRealm();
    if (attentionRef.current.realm !== realm) { lastGraphSubject.current = null; contextEvent({ type: "realm", realm }); }
  }, [workspace.snapshot?.project.id, workspace.snapshot?.world.id, lifecycle?.core.generation, contextRealm, contextEvent]);
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
  const paletteOrigin = useRef<HTMLElement | null>(null);
  const openPalette = useCallback(() => {
    paletteOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPalettePathMode(false); setCommandQuery("");
    setPaletteOpen(true);
  }, []);
  const cancelPalette = useCallback(() => {
    setPaletteOpen(false);
    const origin = paletteOrigin.current;
    requestAnimationFrame(() => { if (origin?.isConnected) origin.focus({ preventScroll: true }); });
  }, []);
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
  const taskDocumentConsumer = taskDocumentOpen && (taskDocumentVisible || !fileTabs.some((tab) => tab.path === activeSurface));
  const taskContextConsumer = ["file", "task"].includes(attention.subject?.kind ?? "");
  useEffect(() => {
    // Mirrors the existing compact breakpoint, including Electron's CSS zoom.
    // Checking panel visibility does not make source/build changes scan tasks.
    const media = window.matchMedia?.("(max-width: 1100px)");
    const update = () => taskClient.setVisible(Boolean(workspace.snapshot) && (
      taskSidebarVisible && (!media?.matches || compactPanel === "work") ||
      activeLens === "Plan" || taskDocumentConsumer || taskContextConsumer && (!media?.matches || compactPanel === "info")));
    update();
    media?.addEventListener("change", update);
    return () => { media?.removeEventListener("change", update); };
  }, [taskClient, compactPanel, Boolean(workspace.snapshot), taskSidebarVisible, taskDocumentConsumer, taskContextConsumer, activeLens]);

  const selectTask = useCallback((id: string) => {
    ++navigationIntent.current;
    setRevealNotice("");
    taskClient.select(id);
    inspectTask(id);
  }, [taskClient, inspectTask]);
  const openPlanningTask = useCallback(async (snapshot: TaskSnapshot, id: string): Promise<boolean> => {
    const intent = ++navigationIntent.current;
    pendingBacklinkIntent.current = intent;
    try {
      const opened = await taskClient.inspectGraphTask(snapshot, id, () => navigationIntent.current === intent && mounted.current);
      if (!opened || navigationIntent.current !== intent || !mounted.current) return false;
      setRevealNotice(""); inspectTask(id); setCompactPanel(null);
      setJournalVisible(false); setTaskDocumentOpen(true); setTaskDocumentVisible(true);
      return true;
    } finally { if (pendingBacklinkIntent.current === intent) pendingBacklinkIntent.current = null; }
  }, [taskClient, inspectTask]);
  const sourceInformation = useCallback(() => {
    ++navigationIntent.current;
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by source navigation; previous source retained." : notice);
    if (fileTabsRef.current.some((tab) => tab.path === activeSurfaceRef.current)) inspectFile(activeSurfaceRef.current);
    else inspectGraph();
  }, [inspectFile, inspectGraph]);
  const showTaskDetails = useCallback(() => {
    setInformationFocusRequest(++navigationIntent.current);
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by task inspection; previous source retained." : notice);
    setCompactPanel("info");
    inspectTask(taskClient.getSnapshot().selectedTaskId);
  }, [inspectTask, taskClient]);
  const returnToSourceInformation = useCallback(() => {
    sourceInformation();
    setSourceInfoFocusRequest(navigationIntent.current);
  }, [sourceInformation]);
  const closeTaskDocument = useCallback(() => {
    ++navigationIntent.current;
    setTaskDocumentOpen(false); setTaskDocumentVisible(false);
    if (attentionRef.current.subject?.kind === "task") sourceInformation();
  }, [sourceInformation]);
  const reportRevealFailure = useCallback((message: string) => {
    setRevealNotice(message);
    setNoticeFocusRequest(navigationIntent.current);
  }, []);
  const retireSourceNavigation = useCallback((command: NonNullable<typeof sourceNavigation>) => {
    if (sourceNavigationRef.current !== command) return;
    sourceNavigationRef.current = null;
    setSourceNavigation((current) => current === command ? null : current);
  }, []);
  const acknowledgeSourceNavigation = useCallback((nonce: number, applied: boolean) => {
    const command = sourceNavigationRef.current;
    if (!command || command.nonce !== nonce) return;
    const reportInvalid = !applied && command.authorization?.isCurrent();
    // Successful focus synchronously advances intent/attention itself. Identity
    // still owns retirement; those self-advances do not turn success into error.
    retireSourceNavigation(command);
    if (reportInvalid) reportRevealFailure("Working buffer changed before Reveal navigation; cursor retained. Reveal again after reconciling source.");
  }, [retireSourceNavigation, reportRevealFailure]);
  const interruptPendingReveal = useCallback((event?: { type: string; target: EventTarget | null }) => {
    // A completed read may still own an undelivered editor command. Generic
    // interaction revokes it even after pendingRevealIntent has been cleared.
    // Source focus already advances authority in sourceInformation; leaving
    // retirement to the delivery/ack path also preserves legitimate self-focus.
    const sourceFocus = event?.type === "focus" && event.target instanceof Element && event.target.closest(".source-surface");
    const command = sourceNavigationRef.current;
    if (command && !sourceFocus) retireSourceNavigation(command);
    if (pendingBacklinkIntent.current !== null) { pendingBacklinkIntent.current = null; ++navigationIntent.current; }
    if (pendingRevealIntent.current === null) return;
    pendingRevealIntent.current = null;
    definitionRef.current = null; setDefinition(null);
    ++navigationIntent.current;
    setRevealNotice((notice) => notice.startsWith("Opening working file")
      ? "Reveal superseded by a newer interaction; previous source retained." : notice);
  }, [retireSourceNavigation]);
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
    const realm = contextRealm();
    try {
      if (!window.swarm) throw new Error("Open this interface through the swarm-ide Electron shell");
      const response = await window.swarm.request(request);
      if (request.type !== "file.write" && (generation !== coreGenerationRef.current || realm !== contextRealm() || (window.swarmLifecycle && lifecycleRef.current?.core.phase !== "ready"))) return null;
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
  }, [contextRealm]);

  const pendingBackContext = useRef<{ intent: number; realm: string; generation: number; destination?: string } | null>(null);
  const requestDirectory = useCallback(async (request: RepositoryRequest) => {
    // Capture the actual navigation intent synchronously, not the separately
    // published graph which may still describe the previous directory at ack.
    const back = pendingBackContext.current;
    if (back && back.destination === undefined) back.destination = request.directory;
    const generation = coreGenerationRef.current;
    if (!window.swarm) return null;
    const response = await window.swarm.request(request);
    // Directory failures belong to this navigation intent, not the global
    // invoke toast: an obsolete request cannot overwrite a newer notice.
    return generation === coreGenerationRef.current && (!window.swarmLifecycle || lifecycleRef.current?.core.phase === "ready") ? response : null;
  }, []);
  const repositoryObservation = workspace.snapshot?.graphs.find((graph) => graph.topologyId === "repo")?.directory;
  const repository = useRepositoryNavigation(repositoryObservation, coreGenerationRef.current,
    Boolean(window.swarm && (!window.swarmLifecycle || lifecycle?.core.phase === "ready")), requestDirectory);
  const inspectDirectory = useCallback((path: string) => {
    ++navigationIntent.current;
    const current = workspaceRef.current.snapshot;
    if (current && isRepositoryPath(path, true)) inspectGraph({ ...current.focus, domain: "repo", key: `dir:${path}`, path });
  }, [inspectGraph]);
  const enterDirectory = useCallback((path: string) => { inspectDirectory(path); return repository.enter(path); }, [inspectDirectory, repository.enter]);
  const upDirectory = useCallback(() => { inspectDirectory((workspaceRef.current.snapshot?.graphs.find((graph) => graph.directory)?.directory?.directory ?? "").split("/").slice(0, -1).join("/")); return repository.up(); }, [inspectDirectory, repository.up]);
  const backDirectory = useCallback(async () => {
    const token = { intent: ++navigationIntent.current, realm: contextRealm(), generation: attentionRef.current.generation, destination: undefined as string | undefined };
    pendingBackContext.current = token;
    try {
      if (!await repository.back() || !mounted.current || token.intent !== navigationIntent.current || token.realm !== contextRealm() || token.generation !== attentionRef.current.generation || token.destination === undefined) return false;
      inspectDirectory(token.destination);
      return true;
    } finally { if (pendingBackContext.current === token) pendingBackContext.current = null; }
  }, [repository.back, inspectDirectory, contextRealm]);
  const deliberateRepository = { ...repository, enter: enterDirectory, up: upDirectory, back: backDirectory };
  const requestFileSearch = useCallback(async (input: RepositorySearchRequest) => {
    const generation = coreGenerationRef.current;
    if (!window.swarm || window.swarmLifecycle && lifecycleRef.current?.core.phase !== "ready") return null;
    const response = await window.swarm.request(input);
    return generation === coreGenerationRef.current && (!window.swarmLifecycle || lifecycleRef.current?.core.phase === "ready") ? response : null;
  }, []);
  const fileSearch = useFileSearch(workspace.snapshot?.project.id, commandQuery,
    paletteOpen && !palettePathMode && Boolean(window.swarm && (!window.swarmLifecycle || lifecycle?.core.phase === "ready")), coreGenerationRef.current, requestFileSearch);

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
    setJournalVisible(false);
    setTaskDocumentVisible(false);
    ++navigationIntent.current;
    setRevealNotice((notice) => notice.startsWith("Opening working file") ? "Reveal superseded by source navigation; previous source retained." : notice);
    activeSurfaceRef.current = surface;
    setActiveSurface(surface);
    if (surface === "graphs") inspectGraph();
  }, [inspectGraph]);

  const openTaskDocument = useCallback((id: string) => {
    setJournalVisible(false);
    selectTask(id);
    setTaskDocumentOpen(true);
    setTaskDocumentVisible(true);
    setCompactPanel(null);
  }, [selectTask]);

  const activateFile = useCallback((path: string) => {
    coordinateFileFocus(path);
    showSurface(path);
    inspectFile(path);
  }, [coordinateFileFocus, showSurface, inspectFile]);

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
        contextRead: sourceReceipt(incoming.revision),
        status: "saved",
        message: "Working file updated externally",
        flash: sourceFlash(tab.content, incoming.content, ++flashId.current),
      };
    }));
  }, [invoke, sourceReceipt]);

  useEffect(() => {
    const shell = window.swarmLifecycle;
    if (!shell) return;
    let live = true;
    const receive = (status: Lifecycle) => {
      if (!live || status.revision <= (lifecycleRef.current?.revision ?? -1)) return;
      lifecycleRef.current = status;
      if (coreGenerationRef.current !== status.core.generation) {
        ++navigationIntent.current;
        sourceNavigationRef.current = null;
        setSourceNavigation(null);
        setRevealNotice((notice) => notice.startsWith("Opening working file") ? "CORE_GENERATION_CHANGED: Reveal interrupted; previous source retained." : notice);
        coreGenerationRef.current = status.core.generation;
        contextEvent({ type: "realm", realm: contextRealm() });
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
  }, [contextEvent, contextRealm]);

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
              if (protectsBuffer(tab)) return { ...tab, contextRead: sourceReceipt(file.revision), status: tab.status === "unknown" ? "unknown" : tab.revision === file.revision ? "dirty" : "conflict", message: "Core recovered; local buffer preserved. Reconcile an uncertain save before retrying." };
              return { ...tab, contextRead: sourceReceipt(file.revision), content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Source observation restored", flash: null };
            }));
          })();
        }
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open the working world"));
    return () => { live = false; };
  }, [lifecycle?.core.generation, lifecycle?.core.phase, invoke, hotCheckpoint, sourceReceipt]);

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
      settleOpen((tab) => ({ ...tab, contextRead: sourceReceipt(file.revision), content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Watching the working file", flash: null }));
      return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
    }
    if (openGenerationsRef.current.get(path) === generation && desiredFilesRef.current.has(path)) {
      settleOpen((tab) => ({ ...tab, status: "error", message: "The working file changed too quickly to open a stable revision." }));
    }
    return fileTabsRef.current.find((tab) => tab.path === path) ?? null;
  }, [activateFile, invoke, showSurface, sourceReceipt]);

  const revealTaskReference = useCallback(async (ref: TaskFileRef, origin: "task" | "repository" = "task", declaration?: { valid: () => boolean; started: (intent: number) => void; notice: string }) => {
    // Task metadata has a deliberately narrower display/link policy. An exact
    // repository path is not metadata or a URL; the file broker owns access.
    if (origin === "repository" ? !isRepositoryPath(ref.path) : !validTaskReference(ref)) { reportRevealFailure("Unsupported reference: only canonical relative working-file paths can be revealed."); return; }
    const intent = ++navigationIntent.current;
    declaration?.started(intent);
    const activation = { realm: contextRealm(), generation: attentionRef.current.generation, intent, path: ref.path };
    pendingRevealIntent.current = intent;
    try {
      const coreGeneration = coreGenerationRef.current;
      const prior = fileTabsRef.current.find((tab) => tab.path === ref.path);
      setRevealNotice(`Opening working file ${ref.path}…`);
      let tab = prior;
      if (prior) {
        if (prior.status === "loading") { reportRevealFailure("Source observation is already in progress; Reveal again when it settles."); return; }
        const openGeneration = openGenerationsRef.current.get(ref.path);
        const eventSequenceBeforeRead = fileEventsRef.current.get(ref.path)?.sequence ?? 0;
        if (prior.status === "error") {
          const watch = await invoke({ type: "file.watch", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: ref.path });
          if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current || declaration && !declaration.valid()) return;
          if (!watch?.ok) { reportRevealFailure(watch && !watch.ok ? `${watch.error.code}: ${watch.error.message}` : "CORE_UNAVAILABLE: source observation interrupted."); return; }
        }
        const response = await invoke({ type: "file.read", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, path: ref.path });
        if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current || declaration && !declaration.valid() ||
            openGenerationsRef.current.get(ref.path) !== openGeneration || !desiredFilesRef.current.has(ref.path)) return;
        if (!response?.ok || response.file?.kind !== "read") {
          reportRevealFailure(response && !response.ok ? `${response.error.code}: ${response.error.message}` : "CORE_UNAVAILABLE: source read was interrupted."); return;
        }
        const file = response.file;
        const current = fileTabsRef.current.find((item) => item.path === ref.path);
        if (!current) return;
        if (protectsBuffer(current)) {
          tab = { ...current, contextRead: sourceReceipt(file.revision),
            ...(current.revision !== file.revision ? { status: current.status === "unknown" ? "unknown" : "conflict", message: "Reveal observed a changed working file; local buffer and cursor retained." } : {}) };
          const retained = tab;
          fileTabsRef.current = fileTabsRef.current.map((item) => item.path === ref.path ? retained : item);
          setFileTabs((tabs) => tabs.map((item) => item.path === ref.path ? retained : item));
        }
        else {
          const latest = fileEventsRef.current.get(ref.path);
          if (latest && latest.sequence > eventSequenceBeforeRead && latest.revision !== file.revision) { reportRevealFailure("Working file changed during Reveal; existing source and cursor retained. Try again after observation settles."); return; }
          tab = { ...current, contextRead: sourceReceipt(file.revision), content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Watching the working file", flash: null };
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
      if (intent !== navigationIntent.current || coreGeneration !== coreGenerationRef.current || declaration && !declaration.valid()) return;
      if (!tab || !tab.revision || tab.status === "error" && !protectsBuffer(tab)) {
        reportRevealFailure(tab?.message ?? "CORE_UNAVAILABLE: source opening was interrupted; previous source retained."); return;
      }
      const target = taskLineTarget(tab, ref.line);
      if (!mounted.current || !permitsContextActivation(attentionRef.current, activation, navigationIntent.current, contextRealm(), ref.path)) return;
      // A definition gesture deliberately moves the repo view, not the service
      // camera. Do not trigger the generic first-document graph reframe.
      if (declaration) textWasOpen.current = true;
      activateFile(ref.path);
      setRevealNotice(declaration ? `${declaration.notice} ${target.notice}` : target.notice);
      // The command nonce predates activateFile's legitimate intent/attention
      // advances. Capture delivery authority only after that activation.
      const deliveryIntent = navigationIntent.current, deliveryAttention = attentionRef.current.generation;
      const deliveryRealm = contextRealm(), openGeneration = openGenerationsRef.current.get(ref.path);
      const command: NonNullable<typeof sourceNavigation> = {
        path: ref.path, content: tab.content, line: target.line, nonce: intent, focus: true,
        authorization: {
          isCurrent: () => sourceNavigationRef.current === command && mounted.current &&
            activeSurfaceRef.current === ref.path && desiredFilesRef.current.has(ref.path) &&
            openGenerationsRef.current.get(ref.path) === openGeneration && contextRealm() === deliveryRealm &&
            navigationIntent.current === deliveryIntent && attentionRef.current.generation === deliveryAttention &&
            (!window.swarmLifecycle || lifecycleRef.current?.core.phase === "ready"),
          retire: () => retireSourceNavigation(command),
        },
      };
      sourceNavigationRef.current = command;
      setSourceNavigation(command);
      // Explicit Reveal alone navigates the repository projection. The file
      // opener remains authoritative; failed/partial listing cannot hide it.
      if (workspaceRef.current.snapshot?.graphs.some((graph) => graph.directory)) void repository.reveal(ref.path);
    } finally {
      // An explicit handoff after completion is not a competing interaction.
      // Never clear a newer Reveal's token when an older read finally settles.
      if (pendingRevealIntent.current === intent) pendingRevealIntent.current = null;
    }
  }, [activateFile, invoke, openFile, reportRevealFailure, repository.reveal, contextRealm, sourceReceipt, retireSourceNavigation]);

  const openLinkedFile = useCallback((path: string) => {
    if (!isRepositoryPath(path)) { reportRevealFailure("Use an exact canonical repository-relative file path, without .git or parent segments."); return; }
    void revealTaskReference({ path, line: null, note: null, navigation: "candidate" }, "repository");
  }, [revealTaskReference, reportRevealFailure]);

  const activateRepositoryEntry = useCallback((entry: RepositoryEntry) => {
    if (!entry.actionable || !entry.path) return;
    if (entry.kind === "directory") void enterDirectory(entry.path);
    else if (entry.kind === "file") openLinkedFile(entry.path);
  }, [enterDirectory, openLinkedFile]);

  const closeFile = useCallback((path: string) => {
    ++navigationIntent.current;
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
      const subject = attentionRef.current.subject;
      if (!taskDocumentVisible && subject?.kind === "file" && subject.path === path) {
        if (nextPath) activateFile(nextPath);
        else showSurface("graphs");
      } else {
        // Closing a background document is not a new inspection of whatever
        // source happens to remain behind the graph/task being inspected.
        ++navigationIntent.current;
        activeSurfaceRef.current = nextPath ?? "graphs"; setActiveSurface(nextPath ?? "graphs");
      }
    }
  }, [activateFile, invoke, showSurface, taskDocumentVisible]);

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
    const receipt = sourceReceipt(file.revision);
    const latestEvent = fileEventsRef.current.get(path);
    setFileTabs((tabs) => tabs.map((tab) => {
      if (tab.path !== path) return tab;
      if (tab.content !== before.content || tab.revision !== before.revision) return { ...tab, message: "Reload completed after this buffer changed; the newer buffer was preserved." };
      if (latestEvent && latestEvent.sequence > eventSequence && latestEvent.revision !== file.revision) return tab;
      if (tab.status === "unknown") {
        if (file.content === tab.content) return { ...tab, contextRead: receipt, savedContent: file.content, revision: file.revision, status: "saved", message: "Disk confirms the buffer was saved; no write replayed", flash: null };
        if (file.content === tab.savedContent) return { ...tab, contextRead: receipt, revision: file.revision, status: "dirty", message: "Disk still has the previous content; buffer preserved and explicit retry is now safe", flash: null };
        return { ...tab, contextRead: receipt, status: "conflict", message: "Disk differs from both the saved content and this buffer. Buffer preserved; resolve the conflict explicitly." };
      }
      return { ...tab, contextRead: receipt, content: file.content, savedContent: file.content, revision: file.revision, status: "saved", message: "Reloaded the canonical working file", flash: null };
    }));
  }, [invoke, sourceReceipt]);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); interruptPendingReveal(); if (paletteOpen) cancelPalette(); else openPalette(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (journalVisible) { setJournalOpen(false); setJournalVisible(false); return; }
        if (taskDocumentVisible || (taskDocumentOpen && !fileTabsRef.current.some((tab) => tab.path === activeSurface))) { closeTaskDocument(); return; }
        const path = activeSurface === "graphs" ? null : activeSurface;
        if (path) closeFile(path);
        return;
      }
      if (event.key === "Escape" && paletteOpen) cancelPalette();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [activeSurface, closeFile, interruptPendingReveal, resetZoom, zoomIn, zoomOut, taskDocumentVisible, taskDocumentOpen, paletteOpen, cancelPalette, openPalette, closeTaskDocument, journalVisible]);

  useEffect(() => {
    if (paletteOpen) requestAnimationFrame(() => commandInput.current?.focus());
  }, [paletteOpen]);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onHmrStart = (data: { sentAt: number }) => requestAnimationFrame(() => requestAnimationFrame(() => setHmr((value) => ({ generation: value.generation + 1, milliseconds: Date.now() - data.sentAt }))));
    hot.on("swarm:hmr-start", onHmrStart);
    return () => { if (typeof hot.off === "function") hot.off("swarm:hmr-start", onHmrStart); };
  }, []);

  const snapshot = workspace.snapshot;
  const publication = snapshot?.serviceContext;
  const serviceIdentity = JSON.stringify([snapshot?.project.id, snapshot?.world.id, coreGenerationRef.current, publication?.status,
    publication?.status === "observed" ? [publication.buildId, publication.sourceFingerprint, publication.inputDigest, publication.artifactUri, publication.observedAt] : publication?.reason]);
  const serviceIndex = useMemo(() => indexService(publication), [serviceIdentity]);
  const [buildGraphVisible, setBuildGraphVisible] = useState(false), [directoryBuildVisible, setDirectoryBuildVisible] = useState(false);
  const buildGraph = useBuildGraph(snapshot?.project.id, snapshot?.world.id, contextRealm(),
    activeLens !== "Plan" && (buildGraphVisible || directoryBuildVisible) && (!window.swarmLifecycle || lifecycle?.core.phase === "ready"));
  const buildLinks = useMemo(() => buildGraphLinks(buildGraph.observation), [buildGraph.observation]);
  const captureIndex = useMemo(() => indexCapture(buildLinks), [buildLinks]);
  const contextSubject = attention.realm === contextRealm() ? attention.subject : null;
  const contextSections = snapshot ? composeContext(contextSubject, { snapshot, files: fileTabs, service: serviceIndex, capture: captureIndex,
    realm: contextRealm(), session: contextSession, tasks, ready: observedCoreGeneration === coreGenerationRef.current && (!window.swarmLifecycle || lifecycle?.core.phase === "ready") }) : [];
  const inspectBacklink = async (target: TaskBacklinkTarget) => {
    const subject = contextSubject, index = tasks.backlinks;
    if (subject?.kind !== "file" || !index || subject !== attentionRef.current.subject) return;
    const token = { realm: contextRealm(), generation: attentionRef.current.generation, intent: ++navigationIntent.current, path: subject.path };
    pendingBacklinkIntent.current = token.intent;
    const valid = () => mounted.current && attentionRef.current.subject === subject &&
      permitsContextActivation(attentionRef.current, token, navigationIntent.current, contextRealm(), subject.path);
    try {
      if (await taskClient.inspectPinned(target, { path: subject.path, index }, valid) && valid()) inspectTask(target.taskId);
    } finally { if (pendingBacklinkIntent.current === token.intent) pendingBacklinkIntent.current = null; }
  };
  const showPinnedTaskDocument = () => {
    if (!tasks.detail || !tasks.detailRevision) return;
    ++navigationIntent.current;
    setTaskDocumentOpen(true); setTaskDocumentVisible(true); setCompactPanel(null);
    inspectTask(tasks.selectedTaskId);
  };
  const activeFile = fileTabs.find((tab) => tab.path === activeSurface);
  const attachInspectedTask = useCallback((taskId: string | null, origin: HTMLButtonElement) => {
    const candidate = taskClient.getAttachmentCandidate(taskId);
    if (!candidate) { setTaskAttachmentNotice({ taskId, text: "Task detail changed; Refresh tasks and inspect it again." }); return; }
    const current = workspaceRef.current.snapshot, path = activeSurfaceRef.current;
    const file = fileTabsRef.current.find((tab) => tab.path === path);
    const generation = coreGenerationRef.current, sourceIntent = navigationIntent.current;
    const openGeneration = openGenerationsRef.current.get(path);
    // The selected, already-open working file is independent of task attention.
    // This is the same registered file FocusRef used by coordinateFileFocus;
    // no task link is consulted and no source/graph command is dispatched.
    const sourceChoice = current && file?.revision && isRepositoryPath(path) && !["loading", "error"].includes(file.status) ? {
      focus: { worldId: current.world.id, revisionKind: "working" as const, revisionId: current.revisions.working.id,
        domain: "repo" as const, key: `file:${path}`, path },
      isCurrent: () => mounted.current && coreGenerationRef.current === generation && navigationIntent.current === sourceIntent &&
        workspaceRef.current.snapshot?.project.id === current.project.id && workspaceRef.current.snapshot?.world.id === current.world.id &&
        activeSurfaceRef.current === path && openGenerationsRef.current.get(path) === openGeneration &&
        fileTabsRef.current.some((tab) => tab.path === path && Boolean(tab.revision) && !["loading", "error"].includes(tab.status)),
    } : null;
    const result = agentClient.proposeTaskAttachment(candidate, sourceChoice, origin);
    setTaskAttachmentNotice(result === "unavailable" ? { taskId, text: agentClient.getSnapshot().notice } : null);
  }, [agentClient, taskClient]);
  const taskAttachment = (id: string | null) => {
    const candidate = taskClient.getAttachmentCandidate(id);
    return { eligible: Boolean(candidate && liveAgents.connected), alreadyAttached: Boolean(candidate && sameAgentTaskReference(liveAgents.draft?.taskReference, candidate.reference)),
      notice: taskAttachmentNotice?.taskId === id ? taskAttachmentNotice.text : null,
      onAttach: (origin: HTMLButtonElement) => attachInspectedTask(id, origin) };
  };
  const textDocumentVisible = !journalVisible && (taskDocumentVisible || (taskDocumentOpen && !activeFile));
  const textOpen = Boolean(activeFile || textDocumentVisible || journalVisible);
  useEffect(() => { if (textOpen && !textWasOpen.current) setGraphReframe((n) => n + 1); textWasOpen.current = textOpen; }, [textOpen]);
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
    const palette = paletteOpen ? ` — Palette open${palettePathMode ? " · exact path" : ""}` : "";
    const hmrSuffix = hmr.generation ? ` — HMR ${hmr.generation}:${hmr.milliseconds}ms` : "";
    const fixtureTitle = agentFixtureEnabled ? agents.draftOpen ? " — Agent fixture draft" : agents.run ? ` — Agent fixture ${agents.run.state} step ${agents.step}` : " — Agent fixture enabled" : "";
    const agentTitle = import.meta.env.DEV ? liveAgents.draft ? " — Agent live draft" : liveAgents.paneOpen ? ` — Agent live ${liveAgents.run?.state ?? "unobserved"}` : "" : "";
    const topologyTitle = snapshot ? ` — Topology ${snapshot.reconciliation.epoch}:${snapshot.reconciliation.status}` : "";
    document.title = `swarm-ide — ${title}${focus}${revision}${fraudVisible}${surface}${files}${palette} — ${zoomTitle}${hmrSuffix}${lifecycleTitle}${fixtureTitle}${agentTitle}${topologyTitle}`;
  }, [activeFile?.status, activeSurface, fileTabs.length, hmr, paletteOpen, palettePathMode, snapshot, title, zoomTitle, lifecycleTitle, agentFixtureEnabled, agents.draftOpen, agents.run, agents.step, liveAgents.draft, liveAgents.paneOpen, liveAgents.run?.state]);

  const selectFocus = useCallback((focus: FocusRef) => {
    ++navigationIntent.current;
    if (focus.domain !== "repo" || !focus.key.startsWith("file:")) inspectGraph(focus);
    setSelectedConnection(null);
    const repoGraph = workspaceRef.current.snapshot?.graphs.find((graph) => graph.topologyId === "repo");
    const entry = repoGraph?.directory?.entries.find((item) => item.path === focus.path);
    if (repoGraph?.directory && focus.domain === "repo") {
      if (entry) { activateRepositoryEntry(entry); return; }
      if (focus.key === `dir:${repoGraph.directory.directory}`) { void enterDirectory(repoGraph.directory.directory); return; }
      // A recipe is explicit current-working path navigation, not an invented
      // loaded node and not permission to open a directory as text.
      if (focus.path && focus.key === `file:${focus.path}`) { openLinkedFile(focus.path); return; }
      return;
    }
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus });
    const loaded = repoGraph?.nodes.find((node) => node.focus.key === focus.key && node.focus.path === focus.path);
    if (focus.path && focus.domain === "repo" && loaded?.kind === "file") openLinkedFile(focus.path);
  }, [invoke, openFile, inspectGraph, activateRepositoryEntry, enterDirectory, openLinkedFile]);
  const definitionValid = useCallback((token: DefinitionIntent) => definitionRef.current === token && mounted.current &&
    token.realm === contextRealm() && token.generation === attentionRef.current.generation &&
    token.resolution.publication === declarationPublication(workspaceRef.current.snapshot) &&
    token.intent === navigationIntent.current, [contextRealm]);
  const cancelDefinition = useCallback(() => {
    const previous = definitionRef.current;
    definitionRef.current = null; setDefinition(null);
    ++navigationIntent.current; pendingRevealIntent.current = null;
    setRevealNotice("Definition navigation cancelled; previous source retained.");
    if (previous?.origin?.isConnected) previous.origin.focus({ preventScroll: true });
  }, []);
  const chooseDefinition = useCallback((token: DefinitionIntent, path: string) => {
    if (!definitionValid(token) || !token.resolution.candidates.some((candidate) => candidate.path === path)) return;
    token.choosing = false; setDefinition(null);
    void revealTaskReference({ path, line: null, note: null, navigation: "candidate" }, "repository", {
      valid: () => definitionValid(token), started: (intent) => { token.intent = intent; }, notice: token.resolution.notice,
    }).finally(() => { if (definitionRef.current === token) definitionRef.current = null; });
  }, [definitionValid, revealTaskReference]);
  const activateDefinition = useCallback((focus: FocusRef, origin?: HTMLElement) => {
    ++navigationIntent.current;
    setSelectedConnection(null);
    const current = workspaceRef.current.snapshot;
    if (!current) return;
    const resolution = resolveDeclarations(current, focus);
    const token: DefinitionIntent = { resolution, realm: contextRealm(), generation: attentionRef.current.generation, intent: navigationIntent.current, choosing: true, origin };
    definitionRef.current = token; setDefinition(null);
    if (!resolution.candidates.length) { definitionRef.current = null; inspectGraph(focus); reportRevealFailure(resolution.notice); return; }
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus });
    if (resolution.candidates.length === 1) chooseDefinition(token, resolution.candidates[0]!.path);
    else setDefinition(token);
  }, [invoke, inspectGraph, contextRealm, chooseDefinition, reportRevealFailure]);
  useEffect(() => {
    const token = definitionRef.current;
    if (token && !definitionValid(token)) {
      const ownedFocus = token.choosing && document.activeElement?.closest('[aria-label="Choose interface declaration"]');
      definitionRef.current = null; setDefinition(null);
      setRevealNotice((notice) => notice.startsWith("Opening working file") || token.choosing ? "Definition navigation superseded; activate again using the current evidence." : notice);
      if (ownedFocus) {
        const destination = token.origin?.isConnected ? token.origin : document.querySelector<HTMLElement>(".graphs-grid");
        destination?.focus({ preventScroll: true });
      }
    }
  }, [workspace.snapshot, attention.generation, definitionValid]);
  const selectConnection = useCallback((connection: GraphConnectionFocus, topologyId: string) => {
    ++navigationIntent.current;
    const current = workspaceRef.current.snapshot;
    if (current) { const subject: ContextSubject = { repositoryId: current.project.id, worldId: current.world.id, kind: "edge", topologyId, id: connection.id }; lastGraphSubject.current = subject; inspect(subject); }
    setSelectedConnection(connection);
    void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus: connection.interfaceFocus });
  }, [invoke, inspect]);
  const reconcile = useCallback(() => {
    setPaletteOpen(false);
    return invoke({ type: "reconciliation.start", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, mode: "success" });
  }, [invoke]);

  const startupReconcile = useCallback(() => { void invoke({ type: "reconciliation.start", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, mode: "success" }); }, [invoke]);
  useStartupTopology({ snapshot, coreGeneration: coreGenerationRef.current, observedCoreGeneration,
    ready: Boolean(window.swarm) && !coreUnavailable, restoredDocument: Boolean(restoredNavigation),
    automatic: import.meta.env.SWARM_AUTOMATIC_TOPOLOGY !== false }, startupReconcile);

  const commands = useMemo(() => palettePathMode ? [
    { label: "Open path", detail: "Exact repository-relative file path · not filename search", run: () => { setPaletteOpen(false); openLinkedFile(commandQuery); } },
  ] : [
    ...([
      ["runs", "Demo: populate agent runs"], ["conversation", "Demo: show mock agent conversation"],
      ["graphs", "Demo: add mock agents to graphs"], ["context", "Demo: populate context"],
      ["all", "Demo: populate everything"], ["clear", "Demo: clear mock data"],
    ] as Array<[DemoCommand, string]>).map(([action, label]) => ({ label, detail: "UI mock only · no model, build, deployment or network requests", run: () => { setPaletteOpen(false); demo.command(action); if (["runs", "conversation", "all"].includes(action)) setCompactPanel("work"); if (action === "context") setCompactPanel("info"); } })),
    ...(repositoryObservation ? [
      { label: "Repository root", detail: "Browse actual root entries", run: () => { setPaletteOpen(false); void enterDirectory(""); } },
      { label: "Repository Up", detail: "Browse the parent directory", run: () => { setPaletteOpen(false); void upDirectory(); } },
      { label: "Refresh directory", detail: "Observe current entries without a build", run: () => { setPaletteOpen(false); void repository.refresh(); } },
    ] : []),
    { label: "Open repository path", detail: "Exact relative path fallback, independent of captured search coverage", run: () => { setPalettePathMode(true); setCommandQuery(""); requestAnimationFrame(() => commandInput.current?.focus()); } },
    { label: "Show repository Tasks", detail: "inspect planning metadata without moving source", run: () => { setPaletteOpen(false); setCompactPanel("work"); } },
    { label: "Show planning graphs", detail: "Real Ditz blockage and repo-authored plans · selection does not execute", run: () => { setPaletteOpen(false); setActiveLens("Plan"); } },
    { label: "Refresh tasks", detail: "observe local metadata; no fetch, task mutation or dispatch", run: () => { setPaletteOpen(false); setCompactPanel("work"); void taskClient.refresh(); } },
    { label: "Show task details", detail: "retained task selection in Information", run: () => { setPaletteOpen(false); showTaskDetails(); } },
    { label: "Ask an agent about this focus", detail: "inspect disk context before explicit read-only launch", run: () => { setPaletteOpen(false); setCompactPanel("work"); if (workspaceRef.current.snapshot) agentClient.openDraft(workspaceRef.current.snapshot.focus); } },
    { label: "Build repository service topology", detail: "exact fingerprint → Bazel artifact → green", run: reconcile },
    { label: "Show system graphs", detail: "focus the coordinated graphs without changing the open document", run: () => { setPaletteOpen(false); setCompactPanel("work"); inspectGraph(); requestAnimationFrame(() => document.querySelector<HTMLElement>(".graphs-grid")?.focus()); } },
    { label: "Show build graph", detail: "Explore captured Bazel targets and dependencies · does not run a build", run: () => { setPaletteOpen(false); setShowBuildVersion((n) => n + 1); } },
    ...(!repositoryObservation ? [
      { label: "Open FraudCheck implementation", detail: FRAUDCHECK_IMPLEMENTATION, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_IMPLEMENTATION); } },
      { label: "Open FraudCheck protobuf contract", detail: FRAUDCHECK_CONTRACT, run: () => { setPaletteOpen(false); void openFile(FRAUDCHECK_CONTRACT); } },
    ] : []),
    ...(agentFixtureEnabled ? [{ label: "Preview agent fixture", detail: "DEMO only · no provider or file bytes · explicit launch", run: () => { setPaletteOpen(false); setCompactPanel("work"); openAgentDraft(); } }] : []),
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase())), [agentClient, taskClient, agentFixtureEnabled, openAgentDraft, commandQuery, openFile, reconcile, showSurface, showTaskDetails, palettePathMode, openLinkedFile, repositoryObservation, enterDirectory, upDirectory, repository.refresh, inspectGraph]);

  if (!snapshot) return <main className="loading-screen"><div className="loading-mark hmr-probe" />Opening the working world…{error ? <strong>{error}</strong> : null}<small>{lifecycleNotice}</small><AgentReloadGuard state={liveAgents} client={agentClient} /></main>;
  return (
    <main className="workbench" onPointerDownCapture={interruptPendingReveal} onFocusCapture={interruptPendingReveal} onKeyDownCapture={(event) => { if (event.key === "Escape" && definitionRef.current) { event.preventDefault(); event.stopPropagation(); cancelDefinition(); } }} data-compact-panel={compactPanel ?? "none"} style={{ "--context-width": `${contextWidth}%`, ...(agents.selected || liveAgents.paneOpen ? { gridTemplateRows: `var(--topbar-height) minmax(0, 1fr) calc(160px + (clamp(180px, 40vh, 448px) - 160px) * ${Math.min(1, Math.max(0, ((liveAgents.paneOpen ? liveAgents.height : agentPaneHeight) - 230) / 190))})` } : {}) } as CSSProperties}>
      <header className="topbar">
        <div className="product-mark"><span className="hmr-probe" />swarm</div>
        <nav className="lens-tabs" aria-label="Workspace lenses">{lensTabs.map((lens) => <button key={lens} className={activeLens === lens ? "active" : ""} onClick={() => setActiveLens(lens)}>{lens}</button>)}</nav>
        <button className="command-trigger" onClick={openPalette}><span>Search, navigate, direct…</span><kbd>Ctrl K</kbd></button>
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

      <WorkbenchSidebar
        onTasksVisibility={setTaskSidebarVisible}
        repositoryName={snapshot.project.name}
        directory={repositoryObservation ? <RepositoryNavigation key={snapshot.project.id} rootLabel={snapshot.project.name} focusedPath={snapshot.focus.path} observation={repositoryObservation} actions={deliberateRepository} onActivate={activateRepositoryEntry} onOpenPath={openLinkedFile} /> : <p className="muted">Observing repository…</p>}
        agents={<>
        <ExternalAgentRail client={externalAgents} onSelect={() => { ++navigationIntent.current; inspect(null); setExternalInformation(true); setCompactPanel("info"); }} />
        {demo.runs ? <MockRunRail selected={demo.selected} onSelect={demo.select} /> : null}
        <LiveRunRail state={liveAgents} client={agentClient} onSelect={(runId) => { agentClient.select(runId); setAgentDockSelection((value) => value + 1); }} onDraft={() => { setCompactPanel("work"); agentClient.openDraft(snapshot.focus); }} />
        <AgentReloadGuard state={liveAgents} client={agentClient} />
        {agentFixtureEnabled ? <RunRail state={agents} fixtureEnabled={agentFixtureEnabled} onDraft={() => { setCompactPanel("work"); openAgentDraft(); }} onSelect={() => { agentClient.closePane(); setAgents((state) => ({ ...state, selected: true })); setFixtureDockSelection((value) => value + 1); }} /> : null}
        {agents.draftOpen && agentFixtureEnabled ? <LaunchDraft focus={snapshot.focus} onClose={() => setAgents((state) => ({ ...state, draftOpen: false }))} onLaunch={(context) => { agentClient.closePane(); setAgents((state) => fixtureReducer(state, { type: "launch", context })); }} /> : null}
        </>}
        tasks={<TaskPanel observation={tasks.observation} refreshing={tasks.refreshing} connected={tasks.connected} notice={tasks.notice} selectedTaskId={tasks.selectedTaskId} onSelect={selectTask} onOpen={openTaskDocument} onRefresh={() => { void taskClient.refresh(); }} onShowDetails={showTaskDetails} />}
      />

      <section className={`navigation-field ${textOpen ? "source-open" : ""}`} style={{ "--graph-share": `${graphShare}%` } as CSSProperties}>
        <div className="field-toolbar">
          <div><span className="eyebrow">central navigation</span><strong>{journalVisible ? "Logical changes" : textDocumentVisible ? tasks.detail?.title ?? "Task document" : activeFile?.path ?? focusLabel(snapshot.focus)}</strong><small tabIndex={0}>{activeFile ? `${activeFile.status} · ${activeFile.message}` : `${snapshot.focus.domain} · ${snapshot.focus.revisionId.slice(0, 12)}`}</small></div>
          <div className="world-chips"><span>working <b>{snapshot.revisions.working.id.slice(0, 8)}</b></span><span>built <b>{snapshot.revisions.built.id.slice(0, 8) || "—"}</b></span><span>deployed <b>{snapshot.revisions.deployed.environment}</b></span></div>
          <button id="reconcile-success" className="build-button" onClick={() => void reconcile()} disabled={reconciliationRunning || coreUnavailable}>▶ Build topology</button>
        </div>
        {textOpen ? <nav className="surface-tabs" aria-label="Document tabs">
          {journalOpen ? <div className={`surface-tab ${journalVisible ? "active" : ""}`}><button className="surface-tab-main" onClick={() => showJournal()}>Logical changes</button><button className="surface-tab-close" aria-label="Close activity document" onClick={() => { setJournalOpen(false); setJournalVisible(false); }}>×</button></div> : null}
          {fileTabs.map((tab) => <div key={tab.path} className={`surface-tab ${activeFile?.path === tab.path && !textDocumentVisible && !journalVisible ? "active" : ""}`}><button className="surface-tab-main" onClick={() => activateFile(tab.path)} title={tab.path}><span className={`tab-state status-${tab.status}`}>{tab.status === "dirty" ? "●" : tab.status === "saving" ? "◌" : tab.status === "conflict" || tab.status === "error" ? "!" : "◇"}</span>{tab.path.split("/").at(-1)}</button><button className="surface-tab-close" aria-label={`Close ${tab.path}`} onClick={() => closeFile(tab.path)}>×</button></div>)}
          {taskDocumentOpen ? <div className={`surface-tab ${textDocumentVisible ? "active" : ""}`}><button className="surface-tab-main" onClick={() => { setTaskDocumentVisible(true); inspectTask(tasks.selectedTaskId); }} title={tasks.selectedTaskId ?? "Task"}>▤ {tasks.detail?.title ?? "Task document"}</button><button className="surface-tab-close" aria-label="Close task document" onClick={closeTaskDocument}>×</button></div> : null}
        </nav> : null}
        <div hidden={activeLens === "Plan"} inert={activeLens === "Plan"} tabIndex={-1} className={`graphs-grid ${textOpen ? "is-sidebar" : "is-active"}`}>{snapshot.graphs.map((graph) => {
          const pane = <GraphPane key={graph.topologyId} graph={graph} mockAgents={demo.graphs} mockGraphVersion={demo.graphVersion} buildLinkSnapshot={graph.directory ? buildLinks : undefined} onBuildLinksVisibility={graph.directory ? setDirectoryBuildVisible : undefined} buildGraphStatus={buildGraph.observation?.status} focus={snapshot.focus} mappings={snapshot.mappings} reframeVersion={graphReframe} interfaceZoom={zoomPercent} onFocus={selectFocus} onActivate={graph.topologyId === "service" ? activateDefinition : undefined} onInspectFocus={(focus) => { ++navigationIntent.current; inspectGraph(focus); setSelectedConnection(null); void invoke({ type: "focus.select", requestId: requestId(), protocolVersion: PROTOCOL_VERSION, focus }); }} onNavigateDirectory={graph.directory ? enterDirectory : undefined} onConnectionFocus={(connection) => selectConnection(connection, graph.topologyId)} onReconcile={() => { void reconcile(); }} reconciliationRunning={reconciliationRunning} repositoryCameraIntent={graph.directory ? repository.cameraIntent : undefined} />;
          return graph.topologyId === "service" ? <TopologyViews key={graph.topologyId} service={pane} focusedFile={snapshot.focus.domain === "repo" && snapshot.focus.path && snapshot.focus.key === `file:${snapshot.focus.path}` ? snapshot.focus.path : activeFile?.path ?? null} showBuildVersion={showBuildVersion} capture={buildLinks} observation={buildGraph.observation} onRefresh={() => { void buildGraph.refresh(); }} onVisibility={setBuildGraphVisible} mockAgents={demo.graphs} mockVersion={demo.graphVersion} onOpenBuild={openLinkedFile} reframeVersion={graphReframe} /> : pane;
        })}</div>
        <PlanWorkspace key={`${snapshot.project.id}:${snapshot.world.id}`} visible={activeLens === "Plan"} worldId={snapshot.world.id} repositoryId={snapshot.project.id}
          generation={coreGenerationRef.current} connected={!coreUnavailable && Boolean(window.swarm)} tasks={tasks} client={taskClient}
          onOpenFile={openLinkedFile} onOpenTask={openPlanningTask} />
        {textOpen ? <ResizeDivider label="Resize graphs and text" className="text-divider" container=".navigation-field" value={graphShare} minimum={25} maximum={70} initial={43} onChange={setGraphShare} /> : null}
        {activeFile ? <section hidden={textDocumentVisible || journalVisible} onPointerDown={sourceInformation} onFocusCapture={sourceInformation} className={`source-surface ${["conflict", "unknown", "error"].includes(activeFile.status) ? "has-banner" : ""}`}>
          <header><div><span className="eyebrow">source observatory</span><strong>{activeFile.path}</strong></div><div className={`file-state file-${activeFile.status}`}><i />{activeFile.status}<button onClick={() => void saveFile(activeFile.path)} disabled={activeFile.status !== "dirty" || coreUnavailable}>Save <kbd>Ctrl S</kbd></button></div></header>
          {activeFile.status === "loading" ? <div className="source-message">Loading the canonical working file…</div> : <>
            {["conflict", "unknown", "error"].includes(activeFile.status) ? <div className="source-message source-error source-banner"><span>{activeFile.message}</span><button disabled={coreUnavailable || savesInFlightRef.current.has(activeFile.path)} onClick={() => void reloadFile(activeFile.path)}>{activeFile.status === "unknown" ? "Check disk" : "Reload disk"}</button></div> : null}
            {activeFile.revision ? <EditorPane key={activeFile.path} content={activeFile.content} flash={activeFile.flash}
              memory={(() => { let memory = editorMemories.current.get(activeFile.path); if (!memory) { memory = { state: null }; editorMemories.current.set(activeFile.path, memory); } return memory; })()}
              navigation={sourceNavigation?.path === activeFile.path ? sourceNavigation : null}
              onNavigation={acknowledgeSourceNavigation} onChange={(content) => {
              const update = (tab: FileTab): FileTab => {
              if (tab.path !== activeFile.path) return tab;
              const unresolved = ["conflict", "unknown", "error"].includes(tab.status);
              const status = unresolved ? tab.status : tab.status === "saving" ? "saving" : content === tab.savedContent ? "saved" : "dirty";
              return { ...tab, content, status, bufferGeneration: (tab.bufferGeneration ?? 0) + 1, bufferChangedAt: new Date().toISOString(), message: unresolved ? tab.message : content === tab.savedContent ? "Watching the working file" : "Local buffer differs from disk", flash: null };
              };
              fileTabsRef.current = fileTabsRef.current.map(update);
              setFileTabs((tabs) => tabs.map(update));
            }} onSave={() => void saveFile(activeFile.path)} /> : <div className="source-message source-error">{activeFile.message}</div>}
          </>}
        </section> : null}
        <JournalPanel key={snapshot.project.id} open={journalVisible} state={journal} selectedEntry={journalEntry} selectionVersion={journalSelection}
          onClose={() => setJournalVisible(false)} onOpenSource={openLinkedFile} />
        {taskDocumentOpen ? <div className="task-editor-surface" hidden={!textDocumentVisible} onPointerDownCapture={(event) => { if (!(event.target as Element).closest(".task-attach")) inspectTask(tasks.selectedTaskId); }} onFocusCapture={(event) => { if (!(event.target as Element).closest(".task-attach")) inspectTask(tasks.selectedTaskId); }}><TaskDetail surface="editor" selectedTaskId={tasks.selectedTaskId} snapshot={tasks.observation?.snapshot ?? null} detail={tasks.detail} detailRevision={tasks.detailRevision} detailStale={tasks.detailStale || tasks.observation?.status !== "observed" || Boolean(tasks.notice)} reading={tasks.reading} notice={tasks.detailNotice} attachment={taskAttachment(tasks.selectedTaskId)} onRefresh={() => { void taskClient.refresh(); }} onSelect={(id) => openTaskDocument(id)} onReveal={(ref) => { void revealTaskReference(ref); }} onReturnToSource={() => { setTaskDocumentVisible(false); if (!activeFile) setTaskDocumentOpen(false); returnToSourceInformation(); }} /></div> : null}
      </section>

      <ResizeDivider label="Resize Context" className="context-divider" container=".workbench" value={contextWidth} minimum={23} maximum={44} initial={30} reverse onChange={setContextWidth} />
      <aside id="information-panel" aria-label="Information panel" className="instrument-panel panel">
        {externalInformation ? <ExternalAgentInformation client={externalAgents} onReturn={() => { setExternalInformation(false); returnToSourceInformation(); }} onOpen={(path) => { setExternalInformation(false); openLinkedFile(path); }} /> : <>
        {revealNotice ? <p ref={revealNoticeElement} className="tasks-reveal-notice" role="status" tabIndex={0}>{revealNotice}</p> : null}
        {contextSubject?.kind === "task" ? <div className="artifact-context" data-context-kind="task" data-context-subject={contextSubject.id}><TaskContext returnButtonRef={taskReturnButton} selectedTaskId={contextSubject.id} snapshot={tasks.observation?.snapshot ?? null} detail={tasks.detail?.id === contextSubject.id ? tasks.detail : null} detailRevision={tasks.detailRevision} detailStale={tasks.detailStale || tasks.refreshing || tasks.observation?.status !== "observed" || Boolean(tasks.notice)} reading={tasks.reading} notice={tasks.detailNotice} attachment={taskAttachment(contextSubject.id)} onSelect={openTaskDocument} onReveal={(ref) => { void revealTaskReference(ref); }} onReturnToSource={returnToSourceInformation} onShowDocument={showPinnedTaskDocument} onRefresh={() => { void taskClient.refresh(); }} connected={tasks.connected} generation={coreGenerationRef.current} journal={journal.observation} journalRetained={Boolean(journal.notice) || journal.busy} run={liveAgents.run} onJournal={showJournal} /></div> : <>
        {tasks.selectedTaskId ? <button className="tasks-show-details" onClick={showTaskDetails}>Show task details</button> : null}
        <ContextPane subject={contextSubject} sections={contextSections} onOpen={openLinkedFile} onTask={(target) => { void inspectBacklink(target); }} onRefreshTasks={() => { void taskClient.refresh(); }} headingRef={sourceInformationHeading} />
        </>}
        {demo.context ? <MockContext focus={contextSubject && "path" in contextSubject ? contextSubject.path : contextSubject && "id" in contextSubject ? contextSubject.id ?? "No task selected" : "Nothing selected"} /> : null}
        </>}
      </aside>

      <section className="activity-dock panel">
        <div className="dock-header"><div><span className="eyebrow">activity / jobs</span><strong>Changes entering the world</strong></div><span className="ignored-events">{workspace.ignoredEvents} stale events rejected</span></div>
        <AgentDock state={liveAgents} client={agentClient} selectionVersion={agentDockSelection} fixtureSelectionVersion={fixtureDockSelection}
          mockConversation={demo.conversation ? { tabs: MOCK_AGENTS, selected: demo.selected, onSelect: demo.select, selectionVersion: demo.selectionVersion, content: <MockConversation selected={demo.selected} /> } : undefined}
          onDraft={() => agentClient.openDraft(snapshot.focus)}
          draftContent={<PreparedLaunchDraft state={liveAgents} client={agentClient} previewCurrent={taskAttachment(tasks.selectedTaskId).alreadyAttached} dirtyPaths={fileTabs.filter((tab) => protectsBuffer(tab)).map((tab) => tab.path)} />}
          runContent={<LiveRunPane state={liveAgents} onInstruction={(text) => agentClient.instruction(text)} onSteer={() => { void agentClient.steer(); }}
          onStop={() => { void agentClient.stop(); }} onRead={(fromStart) => { void agentClient.read(fromStart); }} onFollow={() => agentClient.follow()} onClose={() => agentClient.closePane()}
          onHeight={(height) => agentClient.resize(height)} currentWorldId={snapshot.world.id} currentFingerprint={snapshot.revisions.working.fingerprint}
          onReveal={(focus) => {
            if (focus.worldId === snapshot.world.id && focus.revisionKind === "working") selectFocus({ ...focus, revisionId: snapshot.revisions.working.id });
            else setError("Launch focus cannot be mapped to this working world.");
          }} />}
          fixtureContent={agents.selected ? <RunPane key={agents.run?.runId} state={agents} dispatch={(action) => { if (agentFixtureEnabled) setAgents((state) => fixtureReducer(state, action)); }} onReveal={(focus) => {
          if (focus.worldId === snapshot.world.id && focus.revisionKind === "working") selectFocus({ ...focus, revisionId: snapshot.revisions.working.id });
          else setError("Launch focus cannot be mapped to this working world.");
        }} onClose={() => setAgents((state) => ({ ...state, selected: false }))} height={agentPaneHeight} onHeight={setAgentPaneHeight} /> : undefined}
          jobsContent={<>{snapshot.jobs.length ? snapshot.jobs.map((job) => <article className={`job status-${job.status === "failed" ? "red" : job.status === "succeeded" ? "green" : "yellow"}`} key={job.id}><header><strong>{job.label}</strong><span>{Math.round(job.progress * 100)}%</span></header><div className="job-progress"><i style={{ width: `${job.progress * 100}%` }} /></div><footer><span>{job.message}</span><b>{job.resources.cpuPercent || job.resources.memoryMiB ? `CPU ${job.resources.cpuPercent}% · ${job.resources.memoryMiB} MiB` : "telemetry unavailable"}</b></footer></article>) : <article className="job idle"><strong>No derived work running</strong><span>Build the repository service topology to observe the current world.</span></article>}</>}
          activityContent={<><JournalActivity state={journal} onOpen={showJournal} /><div className="activity-list">{snapshot.activity.slice(0, 4).map((activity) => <div key={activity.id}><i className={`status-${activity.status}`} /><span>{activity.summary}</span><small>{activity.kind}</small></div>)}</div></>}
        />
      </section>

      {paletteOpen ? <FileSearchPalette query={commandQuery} onQuery={setCommandQuery} exact={palettePathMode} commands={commands}
        inputRef={commandInput} focusLabel={focusLabel(snapshot.focus)} onCancel={cancelPalette} search={fileSearch}
        onOpen={(path) => { setPaletteOpen(false); openLinkedFile(path); }} /> : null}
      {definition ? <DeclarationChooser resolution={definition.resolution} onChoose={(path) => chooseDefinition(definition, path)} onCancel={cancelDefinition} /> : null}
      {reloadNotice || lifecycleNotice ? <div className="lifecycle-notice" role="status" tabIndex={0} aria-label="Development status">{reloadNotice || lifecycleNotice}</div> : null}
      {error ? <div className="error-toast">{error}</div> : null}
      {zoomNotice ? <div className="zoom-toast" role="status">{zoomNotice}</div> : null}
    </main>
  );
}
