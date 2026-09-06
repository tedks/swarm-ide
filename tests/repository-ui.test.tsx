// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import type { ReactNode } from "react";
import { PROTOCOL_VERSION, WorkspaceSnapshotSchema, type CoreEvent, type CoreRequest, type CoreResponse, type FileEvent, type FocusRef, type GraphSlice, type WorkspaceSnapshot } from "../protocol/schema";
import { type RepositoryObservation, type RepositoryRequest } from "../protocol/repository";
import { initialSnapshot } from "../fixtures/world";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { directoryCameraKey, parentDirectory, repositoryBreadcrumbs, useRepositoryNavigation } from "../app/renderer/repository/navigation";
import { RepositoryNavigation } from "../app/renderer/repository/RepositoryNavigation";
import { adaptGraph } from "../app/renderer/graph-adapter";
import { validTaskReference } from "../app/renderer/tasks/reveal";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => null, Controls: () => null, Handle: () => null,
    Position: { Left: "left", Right: "right" }, MarkerType: { ArrowClosed: "arrow" },
    ReactFlow: ({ nodes, onInit, onNodeClick, onMoveStart, onMoveEnd, children }: {
      nodes: Array<{ id: string; data: { label: string; focus: FocusRef } }>;
      onInit: (value: unknown) => void; onNodeClick: (event: unknown, node: unknown) => void;
      onMoveStart: (event: unknown) => void; onMoveEnd: (event: unknown, camera: unknown) => void; children: ReactNode;
    }) => {
      const viewport = React.useRef({ x: 0, y: 0, zoom: 1 });
      const [camera, setCamera] = React.useState(viewport.current);
      const [fits, setFits] = React.useState(0);
      const [instance] = React.useState(() => ({
        getViewport: () => viewport.current,
        fitView: async () => { viewport.current = { x: 0, y: 0, zoom: 1 }; setCamera(viewport.current); setFits((n) => n + 1); return true; },
        setViewport: async (value: typeof viewport.current) => { viewport.current = value; setCamera(value); return true; },
      }));
      React.useEffect(() => { onInit(instance); }, [instance]);
      return <div data-testid="repository-flow" data-camera={JSON.stringify(camera)} data-fits={fits}>
        <button aria-label="Pan graph" onClick={() => { onMoveStart({}); viewport.current = { x: 73, y: -29, zoom: 1.7 }; setCamera(viewport.current); onMoveEnd({}, viewport.current); }}>Pan</button>
        {nodes.map((node) => <button key={node.id} aria-label={`Graph node ${node.data.label}`} onClick={() => onNodeClick({}, node)}>{node.data.label}</button>)}{children}
      </div>;
    },
  };
});
import { GraphPane } from "../app/renderer/GraphPane";
import { App } from "../app/renderer/App";
import { BuildGraphPane } from "../app/renderer/repository/BuildGraphPane";
import { buildTargets } from "../app/renderer/repository/build-view";
import buildCapture from "../fixtures/ui-build-links.snapshot.json";

const date = "2026-09-06T12:00:00.000Z";
it("adds and removes //... as one build-view pattern without invoking a source action", () => {
  const open = vi.fn();
  render(<BuildGraphPane capture={buildCapture} mockAgents={true} mockVersion={1} onOpenBuild={open} />);
  const input = screen.getByRole("combobox", { name: "Bazel target" });
  const add = screen.getByRole("button", { name: "Add target" });
  const before = screen.getAllByRole("button", { name: /^Graph node / }).length;
  fireEvent.change(input, { target: { value: "//..." } });
  expect((add as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(add);
  expect(screen.getAllByRole("button", { name: /^Graph node / })).toHaveLength(buildTargets(buildCapture).length);
  expect((add as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "//... ×" }));
  expect(screen.getAllByRole("button", { name: /^Graph node / })).toHaveLength(before);
  fireEvent.change(input, { target: { value: "//missing/..." } });
  expect((add as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("No captured rule targets match");
  expect(open).not.toHaveBeenCalled();
});
function observation(directory = "", patch: Partial<RepositoryObservation> = {}): RepositoryObservation {
  return { directory, observationId: `capture:${directory}`, capturedAt: date, state: "observed", complete: true,
    capturedCount: 2, filteredCount: 2, page: 0, pageCount: 1, filter: "",
    entries: directory ? [{ id: `file:${directory}/files.ts`, path: `${directory}/files.ts`, label: "files.ts", kind: "file", git: "tracked", actionable: true },
      { id: `file:${directory}/other.ts`, path: `${directory}/other.ts`, label: "other.ts", kind: "file", git: "untracked", actionable: true }]
      : [{ id: "directory:core", path: "core", label: "core", kind: "directory", git: "unknown", actionable: true },
        { id: "directory:docs", path: "docs", label: "docs", kind: "directory", git: "unknown", actionable: true }], ...patch };
}
function result(input: RepositoryRequest, value = observation(input.directory, { page: input.page, filter: input.filter })) : Extract<CoreResponse, { ok: true }> {
  return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(), repo: { kind: "list", observation: value } };
}
function graph(value: RepositoryObservation, snapshot = initialSnapshot()): GraphSlice {
  const fileFocus = (path: string, kind: string): FocusRef => ({ ...snapshot.focus, domain: "repo", key: `${kind === "directory" ? "dir" : "file"}:${path}`, path });
  return { ...snapshot.graphs[0]!, topologyId: "repo", title: "Repository", reconciliation: "gray", directory: value,
    nodes: [...value.entries.filter((entry) => entry.path).map((entry, index) => ({ id: entry.id, label: entry.label, kind: entry.kind, status: "gray" as const, position: { x: index * 100, y: 0 }, focus: fileFocus(entry.path!, entry.kind) })),
      { id: `directory:${value.directory}`, label: value.directory || "/", kind: "directory", status: "gray", position: { x: -100, y: 0 },
        focus: { ...snapshot.focus, domain: "repo", key: `dir:${value.directory}`, path: value.directory || undefined } }],
    edges: [], provenance: [{ sourceKind: "repo", version: value.observationId, uri: "repo://test/", observedAt: date }] };
}
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
  delete window.swarm; delete window.swarmView; delete window.swarmLifecycle;
});

describe("bounded repository navigation intent controller", () => {
  it("acknowledges without replacing the event-owned observation and preserves current page on Refresh", async () => {
    const observed = observation("core", { capturedCount: 201, filteredCount: 201, page: 1, pageCount: 2, entries: observation("core").entries.slice(0, 1) });
    const request = vi.fn(async (input: RepositoryRequest) => result(input, { ...observed, observationId: "refresh", page: input.page }));
    const view = renderHook(() => useRepositoryNavigation(observed, 1, true, request));
    await act(() => view.result.current.refresh());
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ directory: "core", page: 1, refresh: true }));
    expect(observed.observationId).toBe("capture:core");
    expect(view.result.current.notice).toBe("");
    expect(view.result.current.backEnabled).toBe(false);
  });
  it("retains only 32 Back locations and reuses the capture for page/filter", async () => {
    const request = vi.fn(async (input: RepositoryRequest) => result(input));
    const view = renderHook(({ value }) => useRepositoryNavigation(value, 1, true, request), { initialProps: { value: observation() } });
    for (let i = 0; i < 35; i++) { await act(() => view.result.current.enter(`dir${i}`)); view.rerender({ value: observation(`dir${i}`) }); }
    for (let i = 0; i < 32; i++) { await act(() => view.result.current.back()); view.rerender({ value: observation(`dir${33 - i}`) }); }
    expect(view.result.current.backEnabled).toBe(false);
    expect(request.mock.calls.at(-1)![0].directory).toBe("dir2");
    await act(() => view.result.current.filter("files"));
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ observationId: "capture:dir2", page: 0, filter: "files", refresh: false });
  });
  it("ignores late failures and core-replacement completions, without losing the newer notice/history", async () => {
    const pending: Array<{ input: RepositoryRequest; resolve: (value: CoreResponse) => void }> = [];
    const request = vi.fn((input: RepositoryRequest) => new Promise<CoreResponse>((resolve) => pending.push({ input, resolve })));
    const view = renderHook(({ generation }) => useRepositoryNavigation(observation(), generation, true, request), { initialProps: { generation: 1 } });
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => { first = view.result.current.enter("a"); second = view.result.current.enter("b"); });
    await act(async () => { pending[1]!.resolve(result(pending[1]!.input)); await second; });
    await act(async () => { pending[0]!.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: pending[0]!.input.requestId, ok: false, error: { code: "MISSING", message: "Old failed A" } }); await first; });
    expect(view.result.current.notice).toBe(""); expect(view.result.current.backEnabled).toBe(true);
    act(() => { first = view.result.current.enter("c"); }); view.rerender({ generation: 2 });
    await act(async () => { pending[2]!.resolve(result(pending[2]!.input)); await first; });
    expect(view.result.current.pending).toBe(false); expect(view.result.current.cameraIntent).toBeNull();
  });
  it("rejects mismatched results, keeps the old observation, and offers an explicit Retry", async () => {
    const observed = observation();
    const request = vi.fn(async (input: RepositoryRequest) => result(input, observation("wrong")));
    const view = renderHook(() => useRepositoryNavigation(observed, 1, true, request));
    await act(() => view.result.current.enter("core"));
    expect(view.result.current.notice).toContain("Previous directory retained"); expect(view.result.current.retryEnabled).toBe(true);
    expect(view.result.current.backEnabled).toBe(false); expect(observed.directory).toBe("");
    request.mockImplementation(async (input) => result(input)); await act(() => view.result.current.retry());
    expect(view.result.current.notice).toBe(""); expect(view.result.current.backEnabled).toBe(true);
  });
  it("uses explicit parent recipes and never treats absent captured nodes as file permission", async () => {
    const request = vi.fn(async (input: RepositoryRequest) => result(input, observation(input.directory, { complete: false, reveal: { path: input.revealPath!, status: "outside-capture" } })));
    const view = renderHook(() => useRepositoryNavigation(observation("core"), 1, true, request));
    await act(() => view.result.current.reveal("core/outside.ts"));
    expect(request.mock.calls[0]![0]).toMatchObject({ directory: "core", refresh: false, observationId: "capture:core", revealPath: "core/outside.ts", filter: "" });
    await act(() => view.result.current.reveal("docs/readme.md"));
    expect(request.mock.calls[1]![0]).toMatchObject({ directory: "docs", refresh: true });
    await act(() => view.result.current.reveal("core/.git/config")); expect(request).toHaveBeenCalledTimes(2);
    expect(parentDirectory("core/files.ts")).toBe("core"); expect(repositoryBreadcrumbs("a/b")).toEqual([{ label: "/", path: "" }, { label: "a", path: "a" }, { label: "b", path: "a/b" }]);
    expect(directoryCameraKey(observation("core"))).toBe(directoryCameraKey(observation("core", { observationId: "new", filter: "f" })));
  });
});

describe("repository controls and coordinated cameras", () => {
  it("scopes entry arrow and ancestor keyboard actions, shows unsupported reasons and partial coverage", () => {
    const observed = observation("core", { complete: false, entries: [...observation("core").entries,
      { id: "link", path: "core/link", label: "link", kind: "symlink", git: "unknown", actionable: false, reason: "Symlink not followed" }],
      capturedCount: 3, filteredCount: 3, reveal: { path: "core/outside.ts", status: "outside-capture" } });
    const hook = renderHook(() => useRepositoryNavigation(observed, 1, true, async (input) => result(input)));
    const actions = { ...hook.result.current, up: vi.fn(), back: vi.fn(), backEnabled: true };
    const activate = vi.fn();
    render(<><textarea aria-label="Independent editor" /><RepositoryNavigation observation={observed} actions={actions} onActivate={activate} onOpenPath={vi.fn()} /></>);
    const first = screen.getByRole("button", { name: "Open file core/files.ts" }); first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" }); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open file core/other.ts" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp", altKey: true }); expect(actions.up).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft", altKey: true }); expect(actions.back).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByLabelText("Independent editor"), { key: "ArrowUp", altKey: true }); expect(actions.up).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Unavailable link: Symlink not followed" })); expect(activate).not.toHaveBeenCalled();
    fireEvent.click(first); expect(activate).toHaveBeenCalledWith(observed.entries[0]);
    expect(screen.getByText(/outside this partial directory capture/)).toBeTruthy();
  });
  it("frames deliberate directory/page transitions once, restores Back, and never refits Refresh/zoom or a newer pan", () => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const frame = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); });
    const settle = () => { frame(); frame(); frame(); };
    const snapshot = initialSnapshot();
    const props = { focus: snapshot.focus, mappings: [], onFocus: vi.fn(), onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false, interfaceZoom: 100 };
    const view = render(<GraphPane {...props} graph={graph(observation())} />); settle();
    const flow = screen.getByTestId("repository-flow"); fireEvent.click(screen.getByRole("button", { name: "Pan graph" }));
    const deliberate = flow.getAttribute("data-camera");
    view.rerender(<GraphPane {...props} graph={graph(observation("core"))} repositoryCameraIntent={{ directory: "core", page: 0, restore: false, serial: 1 }} />); settle();
    expect(flow.getAttribute("data-fits")).toBe("1");
    view.rerender(<GraphPane {...props} graph={graph(observation())} repositoryCameraIntent={null} />); settle();
    view.rerender(<GraphPane {...props} graph={graph(observation())} repositoryCameraIntent={{ directory: "", page: 0, restore: true, serial: 2 }} />); settle();
    expect(flow.getAttribute("data-camera")).toBe(deliberate);
    view.rerender(<GraphPane {...props} interfaceZoom={150} graph={graph(observation("", { observationId: "refresh", state: "stale" }))} />); settle();
    expect(flow.getAttribute("data-camera")).toBe(deliberate); expect(flow.getAttribute("data-fits")).toBe("1");
    view.rerender(<GraphPane {...props} graph={graph(observation("docs"))} repositoryCameraIntent={{ directory: "docs", page: 0, restore: false, serial: 3 }} />); frame();
    fireEvent.click(screen.getByRole("button", { name: "Pan graph" })); frame();
    expect(flow.getAttribute("data-camera")).toBe(deliberate); expect(flow.getAttribute("data-fits")).toBe("1");
  });
  it("retains the camera across automatic core replacement and refuses reused navigation intent", () => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const frame = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); });
    const settle = () => { frame(); frame(); frame(); };
    const snapshot = initialSnapshot();
    const props = { focus: snapshot.focus, mappings: [], onFocus: vi.fn(), onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false, interfaceZoom: 100 };
    const view = render(<GraphPane {...props} graph={graph(observation())} />); settle();
    const oldIntent = { directory: "core", page: 0, restore: false, serial: 1 };
    view.rerender(<GraphPane {...props} graph={graph(observation("core"))} repositoryCameraIntent={oldIntent} />); settle();
    const flow = screen.getByTestId("repository-flow"); expect(flow.getAttribute("data-fits")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pan graph" }));
    const deliberate = flow.getAttribute("data-camera");
    for (const state of ["loading", "observed"] as const) {
      view.rerender(<GraphPane {...props} graph={graph(observation("", { observationId: "replacement-root", state }))} repositoryCameraIntent={null} />); settle();
      expect(flow.getAttribute("data-camera")).toBe(deliberate); expect(flow.getAttribute("data-fits")).toBe("1");
    }
    view.rerender(<GraphPane {...props} graph={graph(observation("core"))} repositoryCameraIntent={oldIntent} />); settle();
    expect(flow.getAttribute("data-camera")).toBe(deliberate); expect(flow.getAttribute("data-fits")).toBe("1");
    view.rerender(<GraphPane {...props} graph={graph(observation("docs"))} repositoryCameraIntent={{ directory: "docs", page: 0, restore: false, serial: 2 }} />); settle();
    expect(flow.getAttribute("data-fits")).toBe("2"); expect(screen.getByTestId("repository-flow")).toBe(flow);
  });
  it("frames the validated off-page result after a late acknowledgement, but never same-page Refresh", async () => {
    const frames = new Map<number, FrameRequestCallback>(); let next = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++next, callback); return next; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const frame = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); });
    const settle = () => { frame(); frame(); frame(); };
    const entries = Array.from({ length: 201 }, (_, index) => ({ ...observation("core").entries[0]!, id: `file:core/f${index}.ts`, path: `core/f${index}.ts`, label: `f${index}.ts` }));
    const first = observation("core", { capturedCount: 201, filteredCount: 201, pageCount: 2, entries: entries.slice(0, 200) });
    const selected = { ...first, page: 1, entries: entries.slice(200), reveal: { path: "core/f200.ts", status: "selected" as const } };
    let resolve!: (response: CoreResponse) => void;
    const request = vi.fn((_input: RepositoryRequest) => new Promise<CoreResponse>((done) => { resolve = done; }));
    const hook = renderHook(({ value }) => useRepositoryNavigation(value, 1, true, request), { initialProps: { value: first } });
    const snapshot = initialSnapshot();
    const props = { focus: snapshot.focus, mappings: [], onFocus: vi.fn(), onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false, interfaceZoom: 100 };
    const view = render(<GraphPane {...props} graph={graph(first)} repositoryCameraIntent={hook.result.current.cameraIntent} />); settle();
    const flow = screen.getByTestId("repository-flow");
    fireEvent.click(screen.getByRole("button", { name: "Pan graph" })); const deliberate = flow.getAttribute("data-camera");
    let pending!: Promise<boolean>;
    act(() => { pending = hook.result.current.reveal("core/f200.ts"); });
    expect(hook.result.current.cameraIntent).toBeNull(); expect(request.mock.calls[0]![0].page).toBe(0);
    hook.rerender({ value: selected });
    view.rerender(<GraphPane {...props} graph={graph(selected)} repositoryCameraIntent={hook.result.current.cameraIntent} />); settle();
    expect(flow.getAttribute("data-fits")).toBe("0"); expect(flow.getAttribute("data-camera")).toBe(deliberate);
    await act(async () => { resolve(result(request.mock.calls[0]![0], selected)); await pending; });
    expect(hook.result.current.cameraIntent).toMatchObject({ directory: "core", page: 1, restore: false });
    view.rerender(<GraphPane {...props} graph={graph(selected)} repositoryCameraIntent={hook.result.current.cameraIntent} />); settle();
    expect(flow.getAttribute("data-fits")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pan graph" }));
    act(() => { pending = hook.result.current.refresh(); }); expect(hook.result.current.cameraIntent).toBeNull();
    const refreshed = { ...selected, observationId: "refreshed", reveal: undefined };
    hook.rerender({ value: refreshed });
    await act(async () => { resolve(result(request.mock.calls[1]![0], refreshed)); await pending; });
    expect(hook.result.current.cameraIntent).toBeNull();
    view.rerender(<GraphPane {...props} graph={graph(refreshed)} repositoryCameraIntent={hook.result.current.cameraIntent} />); settle();
    expect(flow.getAttribute("data-fits")).toBe("1"); expect(flow.getAttribute("data-camera")).toBe(deliberate);
  });
  it("toggles display layers without replacing the graph, moving its camera, navigating or claiming live build evidence", () => {
    const snapshot = initialSnapshot(), repo = graph(observation());
    const onFocus = vi.fn(), onReconcile = vi.fn(), onNavigateDirectory = vi.fn();
    const props = { graph: repo, focus: snapshot.focus, mappings: [], onFocus, onConnectionFocus: vi.fn(), onReconcile, onNavigateDirectory, reconciliationRunning: false, interfaceZoom: 100 };
    const view = render(<GraphPane {...props} />);
    const build = screen.getByRole("button", { name: /Build links/ });
    expect((build as HTMLButtonElement).disabled).toBe(true);
    const flow = screen.getByTestId("repository-flow");
    fireEvent.click(screen.getByRole("button", { name: "Pan graph" }));
    const camera = flow.getAttribute("data-camera"), fits = flow.getAttribute("data-fits");
    view.rerender(<GraphPane {...props} buildLinkSnapshot={{ repositoryId: "test", revision: "reference", capturedAt: date, command: "bazel query", links: [{ from: "//core:a", to: "//docs:b", fromPath: "core", toPath: "docs" }] }} />);
    // Repository props are published on the next frame; await that below.
    return waitFor(() => expect((build as HTMLButtonElement).disabled).toBe(false)).then(() => {
      fireEvent.click(build);
      expect(screen.getByText(/Snapshot reference · 1 visible links · not live/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Mock agents/ }));
      expect(screen.getByText(/MOCK ACTIVITY · visual only · no agents launched/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Mock agents/ }));
      expect(screen.queryByText(/MOCK ACTIVITY/)).toBeNull();
      expect(screen.getByTestId("repository-flow")).toBe(flow);
      expect(flow.getAttribute("data-camera")).toBe(camera);
      expect(flow.getAttribute("data-fits")).toBe(fits);
      expect(onFocus).not.toHaveBeenCalled(); expect(onReconcile).not.toHaveBeenCalled(); expect(onNavigateDirectory).not.toHaveBeenCalled();
    });
  });
  it("keeps off-slice candidates in ambiguity without highlighting fictional nodes", () => {
    const snapshot = initialSnapshot(), repo = graph(observation("core"), snapshot), focus = snapshot.focus;
    const mapped = adaptGraph(repo, focus, [{ from: focus, targetTopology: "repo", ambiguous: true, candidates: [
      { nodeId: repo.nodes[0]!.id, focus: repo.nodes[0]!.focus, confidence: .7, reason: "Loaded" },
      { revealPath: "elsewhere/files.ts", focus: { ...focus, domain: "repo", path: "elsewhere/files.ts", key: "file:elsewhere/files.ts" }, confidence: .8, reason: "Off-slice" },
    ] }]);
    expect(mapped.nodes.filter((node) => node.data.focused).map((node) => node.id)).toEqual([repo.nodes[0]!.id]);
    expect(mapped.nodes.find((node) => node.id === repo.nodes[0]!.id)!.data.ambiguous).toBe(true); // The enclosing directory is now ordered before its children.
  });
  it("presents only the latest whole repository props per frame, retaining the mounted graph and cancelling on disposal", () => {
    const frames = new Map<number, FrameRequestCallback>(); let serial = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; });
    const cancel = vi.fn((id: number) => frames.delete(id)); vi.stubGlobal("cancelAnimationFrame", cancel);
    const frame = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); });
    const snapshot = initialSnapshot(), onFocus = vi.fn();
    const props = { focus: snapshot.focus, mappings: [], onFocus, onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false, interfaceZoom: 100 };
    // Legacy/mock repository graphs have no directory observation. Switching
    // to the real reader must not switch ReactFlow mode or remount its camera.
    const view = render(<GraphPane {...props} graph={snapshot.graphs[0]!} />);
    const flow = screen.getByTestId("repository-flow");
    const latestFocus = vi.fn();
    for (const directory of ["one", "two", "three"]) {
      const next = graph(observation(directory));
      view.rerender(<GraphPane {...props} onFocus={latestFocus} graph={next} repositoryNavigation={<span data-testid="directory-control">{directory}</span>} />);
      expect(flow.closest("[data-directory]")).toBeNull();
      expect(screen.queryByTestId("directory-control")).toBeNull();
      expect(frames.size).toBe(1);
    }
    frame();
    expect(flow.closest("[data-directory]")?.getAttribute("data-directory")).toBe("three");
    expect(screen.getByTestId("directory-control").textContent).toBe("three");
    fireEvent.click(screen.getByRole("button", { name: "Graph node files.ts" }));
    expect(latestFocus).toHaveBeenCalledWith(graph(observation("three")).nodes[0]!.focus);
    expect(onFocus).not.toHaveBeenCalled(); expect(screen.getByTestId("repository-flow")).toBe(flow);
    view.rerender(<GraphPane {...props} graph={graph(observation("cancelled"))} />);
    expect(frames.size).toBe(1);
    const pending = [...frames.values()];
    view.unmount(); expect(frames.size).toBe(0); expect(cancel).toHaveBeenCalled();
    act(() => pending.forEach((callback) => callback(0)));
    expect(screen.queryByTestId("repository-flow")).toBeNull();
  });
});

describe("actual App repository navigation wiring", () => {
  it("enters directories without source reads, opens an actual editor, retains exact dirty text/cursor/draft and both graphs through Up and Reveal", async () => {
    let sequence = 0;
    let snapshot: WorkspaceSnapshot = initialSnapshot();
    snapshot = WorkspaceSnapshotSchema.parse({ ...snapshot, mappings: [], graphs: [graph(observation(), snapshot), snapshot.graphs[1]!] });
    const listeners = new Set<(event: CoreEvent | FileEvent) => void>();
    const publish = () => { const event: CoreEvent = { protocolVersion: PROTOCOL_VERSION, type: "workspace.changed", sequence: ++sequence, epoch: snapshot.reconciliation.epoch, emittedAt: date, snapshot }; for (const listener of listeners) listener(event); };
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "repo.list") {
        const observed = observation(input.directory, { ...(input.revealPath ? { reveal: { path: input.revealPath,
          status: observation(input.directory).entries.some((entry) => entry.path === input.revealPath) ? "selected" as const : "absent" as const } } : {}) });
        snapshot = WorkspaceSnapshotSchema.parse({ ...snapshot, graphs: [graph(observed, snapshot), snapshot.graphs[1]!] }); publish();
        return { ...result(input, observed), snapshot, sequence };
      }
      if (input.type === "focus.select") { snapshot = { ...snapshot, focus: input.focus }; publish(); }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence, snapshot,
        ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: emptyAgentWorkbench().snapshot } } : {}),
        ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "one\ntwo\nthree\n", revision: "a".repeat(64), size: 14 } } : {}) };
    });
    window.swarm = { request, onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
    render(<App />);
    const enter = await screen.findByRole("button", { name: "Enter directory core" });
    const flows = screen.getAllByTestId("repository-flow");
    fireEvent.click(within(flows[1]!).getByRole("button", { name: "Pan graph" }));
    const serviceCamera = flows[1]!.getAttribute("data-camera");
    fireEvent.click(enter); await screen.findByRole("button", { name: "Open file core/files.ts" });
    expect(request.mock.calls.some(([input]) => input.type === "file.read")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open file core/files.ts" }));
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("one"));
    // Opening the text surface explicitly fits the newly narrowed graphs.
    await waitFor(() => expect(flows[1]!.getAttribute("data-fits")).toBe("1"));
    expect(flows[1]!.getAttribute("data-camera")).toBe(JSON.stringify({ x: 0, y: 0, zoom: 1 }));
    fireEvent.click(within(flows[1]!).getByRole("button", { name: "Pan graph" }));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
    act(() => editor.dispatch({ changes: { from: 0, insert: "UNSAVED\n" }, selection: { anchor: 4 } }));
    fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
    const draft = screen.getByLabelText("Task"); fireEvent.change(draft, { target: { value: "Retained draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Repository Up" })); await screen.findByRole("button", { name: "Enter directory core" });
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    expect(editor.state.doc.toString()).toBe("UNSAVED\none\ntwo\nthree\n"); expect(editor.state.selection.main.anchor).toBe(4);
    expect(screen.getAllByTestId("repository-flow")).toEqual(flows); expect(flows[1]!.getAttribute("data-camera")).toBe(serviceCamera);
    const pathInput = screen.getByLabelText("Open repository path"); fireEvent.change(pathInput, { target: { value: "core/files.ts" } }); fireEvent.submit(pathInput.closest("form")!);
    await screen.findByRole("button", { name: "Open file core/files.ts" });
    expect(editor.state.doc.toString()).toBe("UNSAVED\none\ntwo\nthree\n"); expect(editor.state.selection.main.anchor).toBe(4);
    expect(screen.getByLabelText("Task")).toBe(draft); expect((draft as HTMLTextAreaElement).value).toBe("Retained draft");
    // These are literal Unix repository filenames, not task metadata or URLs.
    for (const path of ["core/https:reference.ts", "core/naïve.ts"]) {
      fireEvent.change(pathInput, { target: { value: path } }); fireEvent.submit(pathInput.closest("form")!);
      await waitFor(() => expect(request.mock.calls.some(([input]) => input.type === "file.read" && input.path === path)).toBe(true));
      await waitFor(() => expect(document.querySelector(".source-surface header strong")?.textContent).toBe(path));
    }
    expect(validTaskReference({ path: "core/https:reference.ts", navigation: "candidate", line: null, note: null })).toBe(false);
    expect(request.mock.calls.some(([input]) => input.type === "file.write" || input.type === "agent.launch")).toBe(false);
  });
});
