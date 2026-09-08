// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, WorkspaceSnapshotSchema, type CoreEvent, type CoreRequest, type CoreResponse, type FocusRef, type GraphSlice, type WorkspaceSnapshot } from "../protocol/schema";
import type { RepositoryObservation } from "../protocol/repository";
import { contextArtifact } from "./context-fixture";
import { adaptServiceTopology } from "../core/service-topology";
import { openContextPath } from "./context-navigation";
import { fixtureBuildObservation } from "./support/build-graph-fixture";
import uiBuildLinks from "../fixtures/ui-build-links.snapshot.json";
import { NAVIGATION_KEY } from "../app/renderer/recovery";
type EditorProps = import("react").ComponentProps<typeof import("../app/renderer/EditorPane").EditorPane>;
type TraceFields = { path?: string; nonce?: number; held?: boolean; applied?: boolean; request?: string };
const handoff = vi.hoisted(() => ({
  hold: false,
  trace: null as null | ((event: string, fields?: TraceFields) => void),
  offered: null as null | { owner: symbol; navigation: NonNullable<EditorProps["navigation"]>; release: () => void; acknowledge: (applied: boolean) => void },
}));
vi.mock("../app/renderer/EditorPane", async () => {
  const actual = await vi.importActual<typeof import("../app/renderer/EditorPane")>("../app/renderer/EditorPane");
  const React = await import("react");
  return { ...actual, EditorPane: function ObservedEditor(props: EditorProps) {
    const owner = React.useRef(Symbol("mounted-editor"));
    const [released, setReleased] = React.useState<EditorProps["navigation"]>(null);
    const navigation = props.navigation;
    // Delay only the currently offered object. Withdrawal/replacement/remount
    // cannot replay an earlier command, even if its nonce happens to repeat.
    const held = Boolean(handoff.hold && navigation && released !== navigation);
    React.useLayoutEffect(() => {
      if (released && released !== navigation) setReleased(null);
      const offer = navigation ? { owner: owner.current, navigation, release: () => setReleased(navigation),
        // Fault-injection handle for a delayed acknowledgement only. It never
        // delivers an old navigation or fabricates a real EditorPane focus.
        acknowledge: (applied: boolean) => {
          handoff.trace?.("injected-delayed-ack", { nonce: navigation.nonce, applied });
          props.onNavigation?.(navigation.nonce, applied);
        } } : null;
      handoff.offered = offer;
      const path = navigation && "path" in navigation && typeof navigation.path === "string" ? navigation.path : undefined;
      handoff.trace?.("navigation-offered", { path, nonce: navigation?.nonce, held });
      return () => { if (handoff.offered === offer) handoff.offered = null; };
    }, [navigation, held, released]);
    return <actual.EditorPane {...props} navigation={held ? null : navigation}
      onNavigation={handoff.trace ? (nonce, applied) => {
        handoff.trace?.("navigation-ack", { nonce, applied });
        props.onNavigation?.(nonce, applied);
      } : props.onNavigation} />;
  } };
});
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return { Background: () => null, Controls: () => null, Handle: () => null, Position: { Left: "left", Right: "right" }, MarkerType: { ArrowClosed: "arrowclosed" },
    ReactFlow: ({ onInit }: { onInit?: (instance: { fitView: () => Promise<boolean> }) => void }) => {
      const [camera, setCamera] = React.useState("initial"), [instance] = React.useState(() => ({ fitView: async () => { setCamera("fit"); return true; } }));
      React.useEffect(() => { onInit?.(instance); }, [instance]);
      return <div data-testid="captured-build-camera" data-camera={camera}><button onClick={() => setCamera("deliberate")}>Pan captured build</button></div>;
    } };
});
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph, onFocus, onActivate }: { graph: GraphSlice; onFocus: (focus: FocusRef) => void; onActivate?: (focus: FocusRef) => void }) => <section data-testid={`graph-${graph.topologyId}`}>
  {graph.nodes.map((node) => <span key={node.id}><button onClick={() => onFocus(node.focus)}>Inspect {node.id}</button><button onClick={() => (onActivate ?? onFocus)(node.focus)}>Activate {node.id}</button></span>)}
  <input aria-label={`Camera ${graph.topologyId}`} defaultValue="unchanged" />
</section> }));
import { App } from "../app/renderer/App";
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
let finishOrderTrace: (() => void) | null = null;
afterEach(() => { finishOrderTrace?.(); cleanup(); handoff.hold = false; handoff.offered = null; vi.restoreAllMocks(); window.sessionStorage.clear(); window.localStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
const subject = () => document.querySelector(".artifact-context")?.getAttribute("data-context-subject");
const serviceText = () => document.querySelector("[data-context-section='services']")?.textContent ?? "";
function beginOrderTrace(label: string) {
  const rows: Array<TraceFields & { order: number; event: string; subject: string | null; notice: string; focus: string }> = [];
  let overflow = 0;
  const mark = (event: string, fields: TraceFields = {}) => {
    if (rows.length >= 128) { overflow++; return; }
    const active = document.activeElement;
    rows.push({ order: rows.length, event, ...fields, subject: subject() ?? null,
      notice: (document.querySelector(".tasks-reveal-notice")?.textContent ?? "").slice(0, 240),
      focus: active?.closest(".cm-editor") ? "source-editor" : active?.tagName ?? "none" });
  };
  handoff.trace = mark;
  const originalFocus = EditorView.prototype.focus;
  vi.spyOn(EditorView.prototype, "focus").mockImplementation(function (this: EditorView) {
    mark("editor-focus-before"); originalFocus.call(this); mark("editor-focus-after");
  });
  const onFocus = () => mark("focusin"); document.addEventListener("focusin", onFocus);
  let prior = "";
  const observer = new MutationObserver(() => {
    const current = JSON.stringify([subject(), document.querySelector(".tasks-reveal-notice")?.textContent]);
    if (current !== prior) { prior = current; mark("visible-state"); }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  finishOrderTrace = () => {
    mark("final"); observer.disconnect(); document.removeEventListener("focusin", onFocus);
    handoff.trace = null; finishOrderTrace = null;
    console.log("Q4_CONTEXT_ORDER " + JSON.stringify({ label, overflow, rows }));
  };
  return { rows, mark };
}
function releaseCurrentHandoff() {
  const offered = handoff.offered;
  if (!offered) throw new Error("No currently offered editor navigation");
  // Read path from the current mounted source; never save a source component or
  // a command for later replay. The wrapper also checks identity on re-render.
  const path = document.querySelector(".source-surface header strong")?.textContent ?? "no-source";
  act(() => {
    if (handoff.offered !== offered) throw new Error("Navigation offer changed before release");
    handoff.trace?.("gate-release-current", { path, nonce: offered.navigation.nonce });
    offered.release();
  });
  return offered.navigation.nonce;
}
function setup(artifact = contextArtifact) {
  const snapshot = initialSnapshot(); snapshot.revisions.working = { id: "a".repeat(64), fingerprint: "a".repeat(64), evidence: "observed" };
  snapshot.revisions.built = { id: "b".repeat(64), sourceFingerprint: "a".repeat(64) };
  snapshot.focus = { ...snapshot.focus, revisionId: snapshot.revisions.working.id };
  snapshot.reconciliation = { ...snapshot.reconciliation, status: "green", inputFingerprint: snapshot.revisions.working.id, lastConsistentFingerprint: snapshot.revisions.working.id };
  const adapted = adaptServiceTopology(artifact, "bazel://test-artifact", snapshot.revisions.built.id, snapshot.revisions.working.id, snapshot.reconciliation.epoch, "2026-09-07T03:00:00.000Z", snapshot.project.id);
  const repo = snapshot.graphs[0]!;
  snapshot.graphs = [{ ...repo, inputFingerprint: snapshot.revisions.working.id, provenance: repo.provenance.map((item) => ({ ...item, version: snapshot.revisions.working.id })), nodes: repo.nodes.map((node) => ({ ...node, focus: { ...node.focus, revisionId: snapshot.revisions.working.id } })) }, adapted.graph];
  snapshot.serviceContext = adapted.serviceContext; snapshot.mappings = []; snapshot.widgets = [];
  let delayed: { path: string; resolve: (response: CoreResponse) => void; request: CoreRequest } | undefined;
  let delayPath = "", failPath = "";
  let enterRead!: () => void;
  const readEntered = new Promise<void>((resolve) => { enterRead = resolve; });
  const response = (input: CoreRequest): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot,
    ...(input.type === "buildGraph.observe" ? { buildGraph: fixtureBuildObservation(snapshot) } : {}),
    ...(input.type === "file.read" ? { file: { kind: "read", path: input.path, content: `source ${input.path}\n`, revision: "c".repeat(64), size: 10 } } : {}) });
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    handoff.trace?.("request", { request: input.type, ...("path" in input ? { path: input.path } : {}) });
    if (input.type === "file.read" && input.path === delayPath) return new Promise((resolve) => {
      delayed = { path: input.path, resolve, request: input };
      handoff.trace?.("held-read-enter", { path: input.path }); enterRead();
    });
    if ((input.type === "file.read" || input.type === "file.watch") && input.path === failPath) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "FILE_NOT_FOUND", message: "No file" } };
    return response(input);
  });
  const listeners = new Set<(event: CoreEvent) => void>(); let sequence = 0;
  const emit = (value: WorkspaceSnapshot) => act(() => { const valid = WorkspaceSnapshotSchema.parse(value); for (const listener of listeners) listener({ protocolVersion: PROTOCOL_VERSION, sequence: ++sequence, type: "workspace.changed", epoch: valid.reconciliation.epoch, emittedAt: "2026-09-07T03:00:00.000Z", snapshot: valid }); });
  window.swarm = { request, onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } }; window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { snapshot, emit, request, readEntered, delay: (path: string) => { delayPath = path; }, fail: (path: string) => { failPath = path; }, finish: async () => { if (!delayed) throw new Error("No delayed read"); const held = delayed; handoff.trace?.("held-read-release", { path: held.path }); await act(async () => held.resolve(response(held.request))); } };
}
describe("truthful Context in the mounted workbench", () => {
  it("keeps restored Global evidence retained until this core generation actually supplies its snapshot", async () => {
    const test = setup();
    sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify({ paths: [], activeSurface: "", lens: "System", focus: null, snapshot: test.snapshot }));
    test.request.mockImplementation(() => new Promise(() => {}));
    window.swarmLifecycle = { status: async () => ({ revision: 1, core: { generation: 2, phase: "ready", message: "Ready" }, reload: "idle", notice: "" }),
      onStatus: () => () => {}, reload: async () => { throw new Error("No reload in this test"); } };
    render(<App />);
    await waitFor(() => expect(document.title).toContain("Core 2:ready"));
    expect(document.querySelector(".context-global")?.textContent).toContain("Retained source");
    expect(document.querySelector(".context-global")?.textContent).toContain("Retained build");
    expect(document.querySelector(".context-global")?.textContent).not.toContain("Matches working source");
  });

  it("loads exact build references for file Context without opening either build graph", async () => {
    const test = setup(); render(<App />); await openContextPath("core/files.ts");
    await waitFor(() => expect(test.request.mock.calls.some(([request]) => request.type === "buildGraph.observe")).toBe(true));
    expect(test.request.mock.calls.filter(([request]) => request.type === "buildGraph.observe").every(([request]) => request.type === "buildGraph.observe" && request.refresh === false)).toBe(true);
    expect(screen.queryByTestId("captured-build-camera")).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-context-section='capture']")?.textContent).toContain("//:quality_sources"));
    expect(test.request.mock.calls.some(([request]) => request.type === "reconciliation.start")).toBe(false);
  });
  it("definition activation preserves a mounted captured Build camera and its manually selected view", async () => {
    const test = setup(); test.snapshot.project.id = uiBuildLinks.repositoryId;
    if (test.snapshot.serviceContext?.status !== "observed") throw new Error("fixture");
    test.snapshot.serviceContext.repositoryId = uiBuildLinks.repositoryId;
    render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    fireEvent.click(screen.getByRole("button", { name: "Build graph" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Follow file" }));
    const camera = await screen.findByTestId("captured-build-camera");
    await waitFor(() => expect(camera.dataset.camera).toBe("fit"));
    fireEvent.click(screen.getByRole("button", { name: "Pan captured build" }));
    fireEvent.click(screen.getByRole("button", { name: "Service" }));
    fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await waitFor(() => expect(subject()).toBe("example/fraudcheck.proto"));
    expect(screen.getByTestId("captured-build-camera")).toBe(camera); expect(camera.dataset.camera).toBe("deliberate");
    expect((screen.getByRole("checkbox", { name: "Follow file", hidden: true }) as HTMLInputElement).checked).toBe(false);
  });
  it("holds prior file through a pending definition and Escape rejects its late activation", async () => {
    const test = setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await screen.findByText("Opening working file example/fraudcheck.proto…"); expect(subject()).toBe("core/files.ts");
    fireEvent.keyDown(document.querySelector(".workbench")!, { key: "Escape" }); await test.finish();
    expect(subject()).toBe("core/files.ts"); expect(document.querySelector(".source-surface header strong")?.textContent).toBe("core/files.ts");
  });
  it("a changed service publication invalidates an in-flight definition even with the same path", async () => {
    const test = setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await waitFor(() => expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe("Opening working file example/fraudcheck.proto…"));
    const next = structuredClone(test.snapshot); if (next.serviceContext?.status !== "observed") throw new Error("fixture");
    next.serviceContext.observedAt = "2026-09-07T04:00:00.000Z"; test.emit(next); await test.finish();
    expect(subject()).toBe("core/files.ts");
  });
  it("schema-valid removal of an interface invalidates its delayed declaration activation", async () => {
    const test = setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/payments.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate interface:payments.authorize" }));
    await screen.findByText("Opening working file example/payments.proto…");
    const next = structuredClone(test.snapshot), graph = next.graphs[1]!;
    graph.nodes = graph.nodes.filter((node) => node.id !== "interface:payments.authorize");
    graph.edges = graph.edges.filter((edge) => ![edge.source, edge.target].includes("interface:payments.authorize"));
    test.emit(next); await test.finish(); expect(subject()).toBe("core/files.ts");
  });
  it("newer inspection supersedes definition completion without stealing the current source", async () => {
    const trace = beginOrderTrace("original-ungated");
    const test = setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    trace.mark("activate-B");
    test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await screen.findByText("Opening working file example/fraudcheck.proto…");
    await test.readEntered; trace.mark("inspect-newer");
    fireEvent.click(screen.getByRole("button", { name: "Inspect interface:payments.authorize" })); await test.finish();
    expect(subject()).toBe("interface:payments.authorize"); expect(document.querySelector(".source-surface header strong")?.textContent).toBe("core/files.ts");
  });
  for (const order of ["early", "late", "deliberate-source"] as const) {
    it(`controlled ${order} current source handoff retains newer definition authority`, async () => {
      const trace = beginOrderTrace(order); handoff.hold = true;
      const test = setup(); render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: "Ask an agent about this focus" }));
      const draft = screen.getByRole("textbox", { name: "Task" }) as HTMLTextAreaElement;
      fireEvent.change(draft, { target: { value: "Preserve this local draft" } });
      await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
      await waitFor(() => expect(handoff.offered?.navigation).toBeDefined());
      await waitFor(() => expect(EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor") ?? document.body)).toBeInstanceOf(EditorView));
      const editorElement = document.querySelector<HTMLElement>(".cm-editor")!;
      const editor = EditorView.findFromDOM(editorElement)!;
      act(() => editor.dispatch({ selection: { anchor: 3 } }));
      const source = editor.state.doc.toString(), graph = screen.getByTestId("graph-service");
      const repoGraph = screen.getByTestId("graph-repo");
      const cameras = ["Camera repo", "Camera service"].map((name) => screen.getByRole("textbox", { name }) as HTMLInputElement);
      cameras.forEach((camera) => fireEvent.change(camera, { target: { value: "retained-camera" } }));
      const nonce = handoff.offered!.navigation.nonce;
      expect(trace.rows.some((row) => row.event === "navigation-ack")).toBe(false);
      if (order !== "late") {
        expect(releaseCurrentHandoff()).toBe(nonce);
        expect(trace.rows.some((row) => row.event === "navigation-ack" && row.nonce === nonce && row.applied)).toBe(true);
        expect(handoff.offered).toBeNull();
        expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe("Opened current working file; no line was recorded.");
      }
      trace.mark("activate-B");
      test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
      await screen.findByText("Opening working file example/fraudcheck.proto…");
      await test.readEntered;
      expect(subject()).toBe("core/files.ts");
      if (order === "late") {
        const entered = trace.rows.find((row) => row.event === "held-read-enter")!.order;
        // Withdrawal is valid. Otherwise deliver only the still-offered object:
        // the REAL effect must reject its obsolete authority before focus/ack.
        if (handoff.offered) {
          expect(handoff.offered.navigation.nonce).toBe(nonce);
          expect(releaseCurrentHandoff()).toBe(nonce);
          expect(entered).toBeLessThan(trace.rows.find((row) => row.event === "gate-release-current")!.order);
        }
        expect(handoff.offered).toBeNull();
        expect(trace.rows.some((row) => row.event === "navigation-ack" && row.nonce === nonce)).toBe(false);
        expect(trace.rows.some((row) => ["editor-focus-before", "focusin"].includes(row.event) && row.order > entered)).toBe(false);
        trace.mark("obsolete-handoff-retired", { nonce });
        expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe("Opening working file example/fraudcheck.proto…");
      } else if (order === "deliberate-source") {
        trace.mark("deliberate-source-pointer"); fireEvent.pointerDown(editor.contentDOM);
        expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain("superseded");
      } else {
        expect(trace.rows.find((row) => row.event === "navigation-ack")!.order).toBeLessThan(trace.rows.find((row) => row.event === "held-read-enter")!.order);
        expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe("Opening working file example/fraudcheck.proto…");
      }
      trace.mark("inspect-newer"); fireEvent.click(screen.getByRole("button", { name: "Inspect interface:payments.authorize" }));
      await test.finish();
      expect(subject()).toBe("interface:payments.authorize");
      expect(document.querySelector(".source-surface header strong")?.textContent).toBe("core/files.ts");
      expect(document.querySelector(".cm-editor")).toBe(editorElement);
      expect(editor.state.doc.toString()).toBe(source); expect(editor.state.selection.main.anchor).toBe(3);
      expect(screen.getByTestId("graph-service")).toBe(graph);
      expect(screen.getByTestId("graph-repo")).toBe(repoGraph);
      cameras.forEach((camera) => { expect(camera.isConnected).toBe(true); expect(camera.value).toBe("retained-camera"); });
      expect((screen.getByRole("textbox", { name: "Task" }) as HTMLTextAreaElement).value).toBe("Preserve this local draft");
    });
  }
  it("an obsolete negative source acknowledgement cannot replace a newer pending notice", async () => {
    const trace = beginOrderTrace("stale-negative-pending"); handoff.hold = true;
    const test = setup(); render(<App />); await openContextPath("core/files.ts");
    await waitFor(() => expect(handoff.offered?.navigation).toBeDefined());
    const old = handoff.offered!;
    test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await screen.findByText("Opening working file example/fraudcheck.proto…"); await test.readEntered;
    const focus = document.activeElement;
    act(() => old.acknowledge(false));
    expect(handoff.offered).toBeNull(); expect(document.activeElement).toBe(focus);
    expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe("Opening working file example/fraudcheck.proto…");
    expect(trace.rows.some((row) => row.event === "editor-focus-before")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Inspect interface:payments.authorize" })); await test.finish();
    expect(subject()).toBe("interface:payments.authorize");
    expect(document.querySelector(".source-surface header strong")?.textContent).toBe("core/files.ts");
  });
  for (const destination of ["draft", "palette"] as const) {
    it(`an offered source command cannot steal focus after the user enters the ${destination}`, async () => {
      const trace = beginOrderTrace(`offered-then-${destination}`); handoff.hold = true;
      setup(); render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: "Ask an agent about this focus" }));
      const draft = screen.getByRole("textbox", { name: "Task" }) as HTMLTextAreaElement;
      fireEvent.change(draft, { target: { value: "Keep this draft" } });
      await openContextPath("core/files.ts");
      await waitFor(() => expect(handoff.offered?.navigation).toBeDefined());
      const nonce = handoff.offered!.navigation.nonce;
      if (destination === "draft") act(() => draft.focus());
      else {
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        const input = await screen.findByRole("textbox", { name: "Workspace command" });
        await waitFor(() => expect(document.activeElement).toBe(input));
      }
      const destinationElement = document.activeElement;
      trace.mark("user-destination-focused");
      // Correct cancellation may withdraw the prop. Do not resurrect it; if it
      // remains offered, only that current object may reach actual delivery.
      if (handoff.offered) {
        expect(handoff.offered.navigation.nonce).toBe(nonce); releaseCurrentHandoff();
      }
      expect.soft(document.activeElement).toBe(destinationElement);
      expect.soft(trace.rows.some((row) => row.event === "navigation-ack" && row.nonce === nonce)).toBe(false);
      expect.soft(trace.rows.some((row) => row.event === "editor-focus-before")).toBe(false);
      expect(handoff.offered).toBeNull(); expect(draft.value).toBe("Keep this draft");
      expect(document.querySelector(".source-surface header strong")?.textContent).toBe("core/files.ts");
    });
  }
  for (const applied of [false, true]) {
    it(`an old ${applied ? "positive" : "negative"} acknowledgement cannot clear a newer source command`, async () => {
      beginOrderTrace(`stale-${applied ? "positive" : "negative"}-new-command`); handoff.hold = true;
      setup(); render(<App />); await openContextPath("core/files.ts");
      await waitFor(() => expect(handoff.offered?.navigation).toBeDefined());
      const old = handoff.offered!;
      fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
      await waitFor(() => expect(subject()).toBe("example/fraudcheck.proto"));
      await waitFor(() => { expect(handoff.offered).not.toBeNull(); expect(handoff.offered?.navigation.nonce).not.toBe(old.navigation.nonce); });
      const next = handoff.offered!;
      expect(next.navigation.nonce).not.toBe(old.navigation.nonce);
      const notice = document.querySelector(".tasks-reveal-notice")?.textContent;
      act(() => old.acknowledge(applied));
      expect(handoff.offered).toBe(next);
      expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe(notice);
      expect(releaseCurrentHandoff()).toBe(next.navigation.nonce);
      expect(handoff.offered).toBeNull();
      expect(document.querySelector(".tasks-reveal-notice")?.textContent).toBe(notice);
      expect(document.activeElement?.closest(".cm-editor")).not.toBeNull();
    });
  }
  it("superseding an in-flight definition with the palette gives Escape to the palette", async () => {
    const test = setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/fraudcheck.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    await screen.findByText("Opening working file example/fraudcheck.proto…");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const palette = await screen.findByRole("textbox", { name: "Workspace command" });
    fireEvent.focus(palette); fireEvent.keyDown(palette, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Workspace command" })).toBeNull();
    await test.finish(); expect(subject()).toBe("core/files.ts");
  });
  it("mounted external service activation opens only its required declaration", async () => {
    const test = setup(), graph = test.snapshot.graphs[1]!;
    graph.nodes.push({ ...graph.nodes[0]!, id: "service:payments", focus: { ...graph.nodes[0]!.focus, key: "service:payments" } });
    render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Activate service:payments" }));
    await waitFor(() => expect(subject()).toBe("example/payments.proto"));
    expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain("external implementation unavailable");
    expect(serviceText()).not.toContain("Implementation member of");
  });
  it("unknown service activation exposes unavailability rather than opening its preferred path", async () => {
    const test = setup(), graph = test.snapshot.graphs[1]!;
    graph.nodes.push({ ...graph.nodes[0]!, id: "service:unknown", focus: { ...graph.nodes[0]!.focus, key: "service:unknown", path: "example/fraudcheck.ts" } });
    render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Activate service:unknown" }));
    expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain("no recorded declaration");
    expect(test.request.mock.calls.some(([r]) => r.type === "file.read")).toBe(false);
    expect(subject()).toBe("service:unknown");
  });
  it("a new publication closes an ambiguity choice and old detached controls cannot open", async () => {
    const artifact = structuredClone(contextArtifact);
    artifact.providedInterfaces.push({ ...artifact.providedInterfaces[0]!, id: "interface:fraud-check.second", name: "Second" });
    artifact.interfaceDeclarationPaths.push({ interfaceId: "interface:fraud-check.second", path: "example/second.proto" });
    const test = setup(artifact); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate service:fraud-check" }));
    const oldChoice = await screen.findByRole("button", { name: /example\/second.proto/ });
    const next = structuredClone(test.snapshot); if (next.serviceContext?.status !== "observed") throw new Error("fixture");
    next.serviceContext.observedAt = "2026-09-07T04:00:00.000Z"; test.emit(next);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(document.querySelector(".graphs-grid")); fireEvent.click(oldChoice);
    expect(test.request.mock.calls.some(([r]) => r.type === "file.read")).toBe(false);
  });
  it("requires an explicit ambiguity choice, never consumes initiating Enter, and cancels deterministically", async () => {
    const artifact = structuredClone(contextArtifact);
    artifact.providedInterfaces.push({ ...artifact.providedInterfaces[0]!, id: "interface:fraud-check.second", name: "Second" });
    artifact.interfaceDeclarationPaths.push({ interfaceId: "interface:fraud-check.second", path: "example/second.proto" });
    const test = setup(artifact); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    const readCount = () => test.request.mock.calls.filter(([r]) => r.type === "file.read").length;
    const prior = readCount(); fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    const chooser = await screen.findByRole("dialog", { name: "Choose interface declaration" });
    fireEvent.keyDown(chooser, { key: "k", ctrlKey: true }); expect(screen.queryByRole("textbox", { name: "Workspace command" })).toBeNull();
    fireEvent.keyDown(chooser, { key: "Enter" }); expect(readCount()).toBe(prior); expect(subject()).toBe("core/files.ts");
    fireEvent.keyDown(chooser, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(readCount()).toBe(prior);
    fireEvent.click(screen.getByRole("button", { name: "Activate service:fraud-check" }));
    fireEvent.click(await screen.findByRole("button", { name: /example\/second.proto/ }));
    await waitFor(() => expect(subject()).toBe("example/second.proto")); expect(readCount()).toBe(prior + 1);
  });
  it("repeated interface activation revalidates without overwriting dirty bytes or logical cursor", async () => {
    const test = setup(); render(<App />); await openContextPath("example/payments.proto"); await waitFor(() => expect(subject()).toBe("example/payments.proto"));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
    act(() => editor.dispatch({ changes: { from: 0, insert: "unsaved " }, selection: { anchor: 3 } }));
    const graph = screen.getByTestId("graph-service"), text = editor.state.doc.toString();
    for (let n = 0; n < 2; n++) {
      fireEvent.click(screen.getByRole("button", { name: "Activate interface:payments.authorize" }));
      await waitFor(() => expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain("Required interface declarations"));
      expect(editor.state.doc.toString()).toBe(text); expect(editor.state.selection.main.anchor).toBe(3);
      expect(screen.getByTestId("graph-service")).toBe(graph);
    }
    test.fail("example/payments.proto"); fireEvent.click(screen.getByRole("button", { name: "Activate interface:payments.authorize" }));
    await screen.findByText("FILE_NOT_FOUND: No file"); expect(editor.state.doc.toString()).toBe(text); expect(editor.state.selection.main.anchor).toBe(3);
  });
  it("deliberate service activation opens its declaration, not implementation", async () => {
    const test = setup(); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate service:fraud-check" }));
    await waitFor(() => expect(subject()).toBe("example/fraudcheck.proto"));
    expect(test.request.mock.calls.filter(([r]) => r.type === "file.read").map(([r]) => "path" in r ? r.path : null)).toEqual(["example/fraudcheck.proto"]);
  });
  it("accepts unchanged artifact bytes with a newly built repository fingerprint", async () => {
    const test = setup(); render(<App />); await openContextPath("example/fraudcheck.ts"); await waitFor(() => expect(subject()).toBe("example/fraudcheck.ts"));
    expect(serviceText()).toContain("Implementation member of");
    const next = structuredClone(test.snapshot); const fp = "f".repeat(64);
    next.revisions.working = { id: fp, fingerprint: fp, evidence: "observed" }; next.revisions.built.sourceFingerprint = fp;
    next.focus.revisionId = fp; next.reconciliation.inputFingerprint = fp; next.reconciliation.lastConsistentFingerprint = fp;
    next.reconciliation.epoch += 1;
    next.graphs = next.graphs.map((graph) => ({ ...graph, inputFingerprint: fp, nodes: graph.nodes.map((node) => ({ ...node, focus: { ...node.focus, revisionId: fp } })), provenance: graph.provenance.map((p) => ({ ...p, version: p.sourceKind === "build" ? next.revisions.built.id : fp })) }));
    if (next.serviceContext?.status !== "observed") throw new Error("Missing fixture publication");
    next.serviceContext.sourceFingerprint = fp; next.serviceContext.observedAt = "2026-09-07T03:02:00.000Z";
    test.emit(next);
    expect(serviceText()).toContain("Implementation member of"); expect(serviceText()).toContain(fp);
    expect(document.querySelector("[data-context-section='services'] [data-context-freshness]")?.textContent).toBe("current");
  });
  it("Back uses its validated destination when acknowledgement precedes the graph event", async () => {
    const test = setup();
    const directoryGraph = (directory: string): GraphSlice => {
      const entries: RepositoryObservation["entries"] = directory ? [] : [{ id: "directory:core", path: "core", label: "core", kind: "directory", git: "tracked", actionable: true }];
      const observation: RepositoryObservation = { directory, observationId: `page:${directory}`, capturedAt: "2026-09-07T03:00:00.000Z", state: "observed", complete: true, capturedCount: entries.length, filteredCount: entries.length, page: 0, pageCount: 1, filter: "", entries };
      return { ...test.snapshot.graphs[0]!, directory: observation, reconciliation: "gray", edges: [],
        nodes: [{ id: `directory:${directory}`, label: directory || "/", kind: "directory", status: "gray", position: { x: 0, y: 0 }, focus: { ...test.snapshot.focus, domain: "repo", key: `dir:${directory}`, path: directory || undefined } },
          ...entries.map((entry) => ({ id: entry.id, label: entry.label, kind: entry.kind, status: "gray" as const, position: { x: 0, y: 0 }, focus: { ...test.snapshot.focus, domain: "repo" as const, key: `dir:${entry.path}`, path: entry.path! } }))],
        provenance: [{ sourceKind: "repo", version: observation.observationId, uri: "repo://directory", observedAt: observation.capturedAt }] };
    };
    test.snapshot.graphs[0] = directoryGraph("");
    const original = test.request.getMockImplementation()!; let held: WorkspaceSnapshot | undefined;
    test.request.mockImplementation(async (input) => {
      if (input.type !== "repo.list") return original(input);
      const next = { ...test.snapshot, graphs: [directoryGraph(input.directory), test.snapshot.graphs[1]!] };
      if (input.directory === "") held = next; else test.emit(next);
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: next, repo: { kind: "list", observation: next.graphs[0]!.directory! } };
    });
    render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Enter directory core" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Repository Back" }).getAttribute("disabled")).toBeNull());
    expect(subject()).toBe("core");
    fireEvent.click(screen.getByRole("button", { name: "Repository Back" }));
    await waitFor(() => expect(subject()).toBe("/"));
    expect(document.querySelector("[data-context-section='directory']")?.textContent).toContain("no matching current page");
    if (!held) throw new Error("Back publication not held"); test.emit(held);
    expect(subject()).toBe("/");
    expect(document.querySelector("[data-context-section='directory']")?.textContent).toContain("Captured entries1");
    expect(document.querySelector("[data-context-section='directory'] [data-context-freshness]")?.textContent).toBe("current");
    expect(held.graphs[0]!.directory!.observationId).toBe("page:");
  });
  it("distinguishes files, lets graph inspection win without closing source, and returns to the dirty editor without extra reads", async () => {
    const test = setup(); render(<App />);
    await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    expect(serviceText()).not.toContain("Implementation member of");
    await openContextPath("example/fraudcheck.ts"); await waitFor(() => expect(subject()).toBe("example/fraudcheck.ts"));
    expect(serviceText()).toContain("Implementation member ofFraudCheck");
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
    act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 2 } }));
    const graph = screen.getByTestId("graph-service"), before = test.request.mock.calls.filter(([r]) => r.type === "file.read").length;
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    expect(subject()).toBe("service:fraud-check"); expect(document.querySelector(".cm-editor")).toBe(editor.dom);
    fireEvent.pointerDown(editor.contentDOM);
    expect(subject()).toBe("example/fraudcheck.ts"); expect(editor.state.selection.main.anchor).toBe(2);
    expect(screen.getByTestId("graph-service")).toBe(graph);
    expect(test.request.mock.calls.filter(([r]) => r.type === "file.read")).toHaveLength(before);
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    test.fail("example/fraudcheck.ts"); await openContextPath("example/fraudcheck.ts"); await screen.findByText("FILE_NOT_FOUND: No file");
    expect(subject()).toBe("service:fraud-check"); expect(editor.state.doc.toString()).toMatch(/^dirty /); expect(editor.state.selection.main.anchor).toBe(2);
    test.fail("");
    await openContextPath("example/payments.proto"); await waitFor(() => expect(subject()).toBe("example/payments.proto"));
    expect(serviceText()).toContain("Declares required interface"); expect(serviceText()).not.toContain("Implementation member of");
  });
  it("keeps A on pending/failed B, rejects superseded B and does not promote palette preview", async () => {
    const test = setup(); render(<App />);
    await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/fraudcheck.ts"); await openContextPath("example/fraudcheck.ts");
    await screen.findByText("Opening working file example/fraudcheck.ts…"); expect(subject()).toBe("core/files.ts");
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    await test.finish(); expect(subject()).toBe("service:fraud-check");
    fireEvent.pointerDown(document.querySelector(".cm-content")!); expect(subject()).toBe("core/files.ts");
    test.fail("deleted.ts"); await openContextPath("deleted.ts"); await screen.findByText("FILE_NOT_FOUND: No file"); expect(subject()).toBe("core/files.ts");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); fireEvent.change(screen.getByRole("textbox", { name: "Workspace command" }), { target: { value: "preview" } });
    expect(subject()).toBe("core/files.ts"); fireEvent.keyDown(screen.getByRole("textbox", { name: "Workspace command" }), { key: "Escape" });
    expect(subject()).toBe("core/files.ts");
  });
  it("closing a non-inspected source tab preserves explicit graph attention", async () => {
    setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    fireEvent.click(screen.getByRole("button", { name: "Close core/files.ts" }));
    expect(subject()).toBe("service:fraud-check"); expect(document.querySelector(".cm-content")).toBeNull();
  });
});
