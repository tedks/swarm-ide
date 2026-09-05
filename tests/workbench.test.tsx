// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { PROTOCOL_VERSION, type CoreEvent, type CoreRequest, type CoreResponse, type FileEvent, type GraphSlice, type WorkspaceSnapshot } from "../protocol/schema";
import {
  isInterfaceZoomPercent,
  type ViewShellBridge,
  type ViewShellResult,
} from "../app/view-shell";
import { INTERFACE_ZOOM_STORAGE_KEY } from "../app/renderer/zoom";
import type { Lifecycle, LifecycleBridge } from "../app/lifecycle";
import { dirtySnapshot, initialSnapshot, paymentsFileFocus } from "../fixtures/world";
const testHotMemory = vi.hoisted(() => ({ workbench: undefined as unknown }));
vi.mock("../app/renderer/hot-memory", () => ({ hotMemory: testHotMemory }));

vi.mock("../app/renderer/GraphPane", () => ({
  GraphPane: ({ graph, onConnectionFocus }: { graph: GraphSlice; onConnectionFocus: (connection: unknown) => void }) => {
    const edge = graph.edges[0];
    const source = edge && graph.nodes.find((node) => node.id === edge.source);
    const target = edge && graph.nodes.find((node) => node.id === edge.target);
    return <section data-testid="graph-pane">{graph.title}{edge && source && target ? <button aria-label={`Inspect connection ${edge.id}`} onClick={() => onConnectionFocus({ id: edge.id, kind: edge.kind, label: edge.label ?? edge.kind, source: { label: source.label, focus: source.focus }, target: { label: target.label, focus: target.focus }, interfaceFocus: target.focus, contract: target.detail, provenance: graph.provenance })}>edge</button> : null}</section>;
  },
}));

import { App } from "../app/renderer/App";
describe("selective live recovery", () => {
it("preserves an outstanding save as unknown across a structural component remount", async () => {
    shell();
    let finish!: (response: CoreResponse) => void;
    const source = files(() => new Promise<CoreResponse>((resolve) => { finish = resolve; }));
    const first = render(<App />); const editor = await open(source.path);
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "mine\n" } }));
    fireEvent.keyDown(editor.contentDOM, { key: "s", ctrlKey: true });
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-saving")).toBe(true));
    first.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Check disk" });
    expect(document.querySelector(".cm-content")?.textContent).toContain("mine");
    await act(async () => finish({ protocolVersion: PROTOCOL_VERSION, requestId: "old-save", ok: false, error: { code: "WRITE_OUTCOME_UNKNOWN", message: "old component's promise settled" } }));
    expect(source.request.mock.calls.filter(([r]) => r.type === "file.write")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Check disk" })).toBeTruthy();
    source.disk("base\nmine\n");
    fireEvent.click(screen.getByRole("button", { name: "Check disk" }));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBe(true));
    expect(source.request.mock.calls.filter(([r]) => r.type === "file.write")).toHaveLength(1);
  });
  function shell() {
    let state: Lifecycle = { revision: 1, core: { generation: 1, phase: "ready", message: "Ready" }, reload: "idle", notice: "" };
    let listener: ((status: Lifecycle) => void) | undefined;
    const bridge: LifecycleBridge = {
      status: async () => state,
      onStatus: (next) => { listener = next; return () => { listener = undefined; }; },
      reload: vi.fn(async () => state),
    };
    Object.defineProperty(window, "swarmLifecycle", { configurable: true, value: bridge });
    return { bridge, update: (patch: Partial<Lifecycle>) => act(() => { state = { ...state, ...patch, revision: state.revision + 1 }; listener?.(state); }) };
  }
  function files(writeResult?: (input: CoreRequest) => Promise<CoreResponse>) {
    const path = "services/payments/payments.ts";
    const base = initialSnapshot(paymentsFileFocus);
    let snapshot: WorkspaceSnapshot = { ...base, widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }] };
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    let disk = "base\n";
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.write" && writeResult) return writeResult(input);
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, ...(input.type === "file.read" ? { file: { kind: "read" as const, path, content: disk, revision: (disk === "base\n" ? "a" : "b").repeat(64), size: disk.length } } : {}) };
    });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: (next: typeof listener) => { listener = next; return () => undefined; } } });
    installViewBridge();
    return { request, path, disk: (text: string) => { disk = text; }, event: (sequence: number) => act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "workspace.changed", sequence, epoch: snapshot.reconciliation.epoch, emittedAt: "2026-09-06T00:00:00.000Z", snapshot })) };
  }
  async function open(path: string) {
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("base"));
    return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
  }
  it("defers preload refresh and keyboard unload for a dirty buffer; a clean document can refresh", async () => {
    const lifecycle = shell(); const source = files();
    render(<App />); const editor = await open(source.path);
    act(() => editor.dispatch({ changes: { from: 0, insert: "mine\n" } }));
    lifecycle.update({ reload: "pending" });
    expect(lifecycle.bridge.reload).not.toHaveBeenCalled();
    const unload = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(unload));
    expect(unload.defaultPrevented).toBe(true);
    expect(editor.state.doc.toString()).toBe("mine\nbase\n");
    act(() => editor.dispatch({ changes: { from: 0, to: 5, insert: "" } }));
    await waitFor(() => expect(lifecycle.bridge.reload).toHaveBeenCalled());
  });
  it("keeps the same editor and dirty text across core replacement, re-watches files and accepts reset sequences", async () => {
    const lifecycle = shell(); const source = files();
    render(<App />); const editor = await open(source.path);
    source.event(50);
    act(() => editor.dispatch({ changes: { from: 0, insert: "mine\n" } }));
    lifecycle.update({ core: { generation: 1, phase: "unavailable", message: "Disconnected; prior data stale" } });
    expect(screen.getAllByText(/Disconnected; prior data stale/).length).toBeGreaterThan(0);
    lifecycle.update({ core: { generation: 2, phase: "ready", message: "Recovered" } });
    await waitFor(() => expect(source.request.mock.calls.filter(([r]) => r.type === "file.watch")).toHaveLength(2));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    expect(editor.state.doc.toString()).toBe("mine\nbase\n");
    source.event(1);
    await waitFor(() => expect(document.title).toContain("Consistent"));
  });
  it.each(["base\n", "base\nmine\n", "someone else\n"])("never replays an unknown save; reconciles disk %j without overwriting the buffer", async (disk) => {
    const lifecycle = shell();
    const source = files(async (input) => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "WRITE_OUTCOME_UNKNOWN", message: "Core exited after possible rename" } }));
    render(<App />); const editor = await open(source.path);
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "mine\n" } }));
    fireEvent.keyDown(editor.contentDOM, { key: "s", ctrlKey: true });
    await screen.findByRole("button", { name: "Check disk" });
    lifecycle.update({ reload: "pending" });
    expect(lifecycle.bridge.reload).not.toHaveBeenCalled();
    // Further typing must not clear the unknown-outcome guard.
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "x" } }));
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length - 1, to: editor.state.doc.length, insert: "" } }));
    fireEvent.keyDown(editor.contentDOM, { key: "s", ctrlKey: true });
    expect(source.request.mock.calls.filter(([r]) => r.type === "file.write")).toHaveLength(1);
    source.disk(disk);
    fireEvent.click(screen.getByRole("button", { name: "Check disk" }));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-unknown")).toBe(false));
    expect(editor.state.doc.toString()).toBe("base\nmine\n");
    expect(source.request.mock.calls.filter(([r]) => r.type === "file.write")).toHaveLength(1);
    expect(document.querySelector(disk === "base\n" ? ".file-dirty" : disk === "base\nmine\n" ? ".file-saved" : ".file-conflict")).toBeTruthy();
  });
});

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Reflect.deleteProperty(window, "swarm");
  Reflect.deleteProperty(window, "swarmView");
  Reflect.deleteProperty(window, "swarmLifecycle");
  testHotMemory.workbench = undefined;
  vi.restoreAllMocks();
});

function installCoreBridge() {
  Object.defineProperty(window, "swarm", {
    configurable: true,
    value: {
      request: async (input: CoreRequest) => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() }),
      onEvent: () => () => undefined,
    },
  });
}

function installViewBridge(result?: (percent: number) => ViewShellResult): ViewShellBridge {
  const implementation: (percent: number) => ViewShellResult = result ?? ((percent): ViewShellResult =>
    isInterfaceZoomPercent(percent)
      ? { ok: true, percent }
      : { ok: false, message: "not allowed", zoomState: "unchanged" });
  const bridge: ViewShellBridge = {
    setZoomPercent: vi.fn(async (percent: number) => implementation(percent)),
  };
  Object.defineProperty(window, "swarmView", { configurable: true, value: bridge });
  return bridge;
}

describe("workbench shell", () => {
  it("renders four regions and directs a build through the typed bridge", async () => {
    const requests: CoreRequest[] = [];
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      requests.push(input);
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: () => () => undefined },
    });
    installViewBridge();

    render(<App />);
    expect(await screen.findByText("swarm-ide")).toBeTruthy();
    expect(screen.getByText("Repository topology")).toBeTruthy();
    expect(screen.getByText("Service calls")).toBeTruthy();
    expect(screen.getByText("Changes entering the world")).toBeTruthy();
    expect(screen.getByText("Relevant bugs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Inspect connection service-e1" }));
    await waitFor(() => expect(document.querySelector(".connection-widget")?.textContent).toContain("Gateway→Checkout"));
    expect(screen.getByRole("heading", { name: "CreateOrder" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Build topology/ }));
    await waitFor(() => expect(requests.some((item) => item.type === "reconciliation.start")).toBe(true));
  });

  it("opens the keyboard-first command surface", async () => {
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: {
        request: async (input: CoreRequest) => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot() }),
        onEvent: () => () => undefined,
      },
    });
    installViewBridge();
    render(<App />);
    await screen.findByText("swarm-ide");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByPlaceholderText("Navigate or apply intelligence…")).toBeTruthy();
  });

  it("shows fixed controls, persists 100 to 125, resets, and restores after reload", async () => {
    installCoreBridge();
    const firstBridge = installViewBridge();
    const first = render(<App />);

    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBe("125");
    expect(firstBridge.setZoomPercent).toHaveBeenLastCalledWith(125);

    first.unmount();
    const reloadBridge = installViewBridge();
    render(<StrictMode><App /></StrictMode>);
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(reloadBridge.setZoomPercent).toHaveBeenCalledWith(125);

    fireEvent.click(screen.getByRole("button", { name: /Reset zoom to 100%/ }));
    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBe("100");
  });

  it("resets malformed persistence and keeps the last applied level on bridge failure", async () => {
    window.localStorage.setItem(INTERFACE_ZOOM_STORAGE_KEY, "125%");
    installCoreBridge();
    installViewBridge((percent) => percent === 125
      ? { ok: false, message: "Zoom renderer is unavailable.", zoomState: "unchanged" }
      : { ok: true, percent: 100 });
    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByText("Saved zoom was invalid and was reset to 100%.")).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBeNull();
    await screen.findByRole("button", { name: /Current zoom 100%/ });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(await screen.findByText("Zoom renderer is unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(window.localStorage.getItem(INTERFACE_ZOOM_STORAGE_KEY)).toBeNull();
  });

  it("reports a missing view bridge without preventing the workbench from loading", async () => {
    installCoreBridge();
    render(<App />);
    expect(await screen.findByText("swarm-ide")).toBeTruthy();
    expect(screen.getByText("Interface zoom is unavailable outside the swarm-ide Electron shell.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();
  });

  it("handles Ctrl zoom while preserving editable focus and ignores plain text keys", async () => {
    installCoreBridge();
    const bridge = installViewBridge();
    render(<App />);
    await screen.findByText("swarm-ide");

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Navigate or apply intelligence…");
    fireEvent.change(input, { target: { value: "focus remains" } });
    input.focus();
    const callsBeforePlainKey = vi.mocked(bridge.setZoomPercent).mock.calls.length;
    expect(fireEvent.keyDown(input, { key: "=", code: "Equal" })).toBe(true);
    expect(vi.mocked(bridge.setZoomPercent).mock.calls).toHaveLength(callsBeforePlainKey);

    expect(fireEvent.keyDown(input, { key: "=", code: "Equal", ctrlKey: true })).toBe(false);
    expect(await screen.findByRole("button", { name: /Current zoom 125%/ })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("focus remains");

    expect(fireEvent.keyDown(input, { key: "0", code: "Digit0", ctrlKey: true })).toBe(false);
    expect(await screen.findByRole("button", { name: /Current zoom 100%/ })).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it("coalesces rapid repeated shortcuts to the latest requested level", async () => {
    installCoreBridge();
    const resolvers: Array<(result: ViewShellResult) => void> = [];
    const setZoomPercent = vi.fn((_percent: number) => new Promise<ViewShellResult>((resolve) => resolvers.push(resolve)));
    Object.defineProperty(window, "swarmView", {
      configurable: true,
      value: { setZoomPercent } satisfies ViewShellBridge,
    });
    render(<App />);
    await waitFor(() => expect(setZoomPercent).toHaveBeenCalledWith(100));

    fireEvent.keyDown(window, { key: "+", code: "Equal", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "+", code: "Equal", ctrlKey: true, shiftKey: true, repeat: true });
    resolvers.shift()?.({ ok: true, percent: 100 });
    await waitFor(() => expect(setZoomPercent).toHaveBeenLastCalledWith(150));
    expect(setZoomPercent).toHaveBeenCalledTimes(2);
    resolvers.shift()?.({ ok: true, percent: 150 });
    expect(await screen.findByRole("button", { name: /Current zoom 150%/ })).toBeTruthy();
  });

  it("keeps zoom controls focusable while applying and recovers from an unknown initial state", async () => {
    installCoreBridge();
    const bridge = installViewBridge(() => ({
      ok: false,
      message: "Applied zoom could not be verified.",
      zoomState: "unknown",
    }));
    render(<App />);
    expect(await screen.findByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();

    const zoomInButton = screen.getByRole("button", { name: "Zoom in" });
    zoomInButton.focus();
    fireEvent.click(zoomInButton);
    await waitFor(() => expect(bridge.setZoomPercent).toHaveBeenLastCalledWith(125));
    expect(document.activeElement).toBe(zoomInButton);
    expect(zoomInButton.hasAttribute("disabled")).toBe(false);
  });

  it("reports an unknown applied level when the view bridge throws", async () => {
    installCoreBridge();
    const bridge: ViewShellBridge = {
      setZoomPercent: vi.fn(async () => { throw new Error("renderer was destroyed"); }),
    };
    Object.defineProperty(window, "swarmView", { configurable: true, value: bridge });

    render(<App />);
    expect(await screen.findByRole("button", { name: /Current zoom unknown/ })).toBeTruthy();
    expect(screen.getByText("The interface zoom bridge failed; the applied zoom level is unknown.")).toBeTruthy();
  });

  it("does not let a delayed bootstrap snapshot replace a newer event", async () => {
    let resolveSnapshot!: (response: CoreResponse) => void;
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const response = new Promise<CoreResponse>((resolve) => { resolveSnapshot = resolve; });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: {
        request: vi.fn(async (request: CoreRequest) => request.type === "workspace.snapshot" ? response : ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 10, snapshot: dirtySnapshot(initialSnapshot()) })),
        onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; },
      },
    });
    installViewBridge();
    render(<App />);
    await waitFor(() => expect(listener).toBeTruthy());
    const dirty = dirtySnapshot(initialSnapshot());
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "reconciliation.changed", sequence: 10, epoch: dirty.reconciliation.epoch, emittedAt: "2026-09-05T12:00:00.000Z", snapshot: dirty }));
    resolveSnapshot({ protocolVersion: PROTOCOL_VERSION, requestId: "bootstrap", ok: true, sequence: 0, snapshot: initialSnapshot() });
    expect(await screen.findByText("Reconciling")).toBeTruthy();
    expect(document.title).toContain("work:b2");
  });

  it("opens real source responses in multiple tabs and visualizes an external replacement", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const base = initialSnapshot(paymentsFileFocus);
    const paths = ["services/payments/payments.ts", "services/payments/contract.ts"];
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{
        id: "source-paths",
        title: "Implementation sources",
        kind: "list",
        priority: 0,
        value: paths,
        provenance: base.widgets[0]!.provenance,
      }],
    };
    let disk = new Map([
      [paths[0]!, { content: "one\nold\n", revision: "a".repeat(64) }],
      [paths[1]!, { content: "export interface Contract {}\n", revision: "b".repeat(64) }],
    ]);
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.read") {
        const file = disk.get(input.path)!;
        return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, file: { kind: "read", path: input.path, content: file.content, revision: file.revision, size: file.content.length } };
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } },
    });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: paths[0] })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("old"));
    expect(screen.getAllByTestId("graph-pane")).toHaveLength(2);
    expect(document.querySelector(".navigation-field.source-open")).toBeTruthy();
    expect(document.querySelector(".graphs-grid.is-sidebar")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: paths[1] })[0]!);
    await waitFor(() => expect(document.querySelectorAll(".surface-tabs > button, .surface-tab-main")).toHaveLength(3));
    expect(request.mock.calls.some(([input]) => input.type === "focus.select" && input.focus.path === paths[1])).toBe(true);
    const surfaceTabs = [...document.querySelectorAll<HTMLButtonElement>(".surface-tabs > button, .surface-tab-main")];
    expect(surfaceTabs.some((tab) => tab.textContent?.includes("payments.ts"))).toBe(true);
    expect(surfaceTabs.some((tab) => tab.textContent?.includes("contract.ts"))).toBe(true);
    fireEvent.click(surfaceTabs.find((tab) => tab.textContent?.includes("payments.ts"))!);
    await waitFor(() => expect(request.mock.calls.filter(([input]) => input.type === "focus.select").at(-1)?.[0]).toMatchObject({ type: "focus.select", focus: { path: paths[0] } }));
    const paymentsEditor = EditorView.findFromDOM(document.querySelector(".cm-editor")!);
    if (!paymentsEditor) throw new Error("CodeMirror editor was not mounted");
    act(() => paymentsEditor.dispatch({ selection: { anchor: 1 } }));

    disk = new Map(disk).set(paths[0]!, { content: "one\nnew\n", revision: "c".repeat(64) });
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:01:00.000Z", path: paths[0]!, revision: "c".repeat(64), change: "modified" }));
    await waitFor(() => expect(document.querySelector(".cm-added-flash")?.textContent).toContain("new"));
    expect(document.querySelector(".cm-removed-ghost")?.textContent).toContain("old");
    expect(paymentsEditor.state.selection.main.anchor).toBe(1);
    const closeShortcut = new KeyboardEvent("keydown", { key: "w", ctrlKey: true, cancelable: true });
    const focusRequestsBeforeClose = request.mock.calls.filter(([input]) => input.type === "focus.select").length;
    window.dispatchEvent(closeShortcut);
    expect(closeShortcut.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: `Close ${paths[0]}` })).toBeNull());
    expect(screen.getByRole("button", { name: `Close ${paths[1]}` })).toBeTruthy();
    await waitFor(() => expect(request.mock.calls.filter(([input]) => input.type === "focus.select")).toHaveLength(focusRequestsBeforeClose + 1));
    expect(request.mock.calls.filter(([input]) => input.type === "focus.select").at(-1)?.[0]).toMatchObject({ type: "focus.select", focus: { path: paths[1] } });
    expect(screen.getAllByTestId("graph-pane")).toHaveLength(2);
  });

  it("closes multiple clean tabs in one interaction batch without resurrecting either", async () => {
    const paths = ["services/payments/payments.ts", "services/payments/contract.ts"];
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: paths, provenance: base.widgets[0]!.provenance }],
    };
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => input.type === "file.read"
      ? { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, file: { kind: "read", path: input.path, content: `${input.path}\n`, revision: "a".repeat(64), size: input.path.length + 1 } }
      : { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: () => () => undefined } });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: paths[0] })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: paths[1] })[0]!);
    await waitFor(() => expect(screen.getByRole("button", { name: `Close ${paths[0]}` })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: `Close ${paths[1]}` })).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: `Close ${paths[1]}` }));
      fireEvent.click(screen.getByRole("button", { name: `Close ${paths[0]}` }));
    });
    expect(screen.queryByRole("button", { name: `Close ${paths[0]}` })).toBeNull();
    expect(screen.queryByRole("button", { name: `Close ${paths[1]}` })).toBeNull();
    expect(screen.getByRole("button", { name: /System graphs/ }).className).toBe("active");
  });

  it("saves with the expected revision and preserves a dirty buffer on external conflict", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/payments/payments.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }],
    };
    let disk = { content: "one\n", revision: "a".repeat(64) };
    let writeNumber = 0;
    const requests: CoreRequest[] = [];
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      requests.push(input);
      if (input.type === "file.read") {
        return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, file: { kind: "read", path, content: disk.content, revision: disk.revision, size: disk.content.length } };
      }
      if (input.type === "file.write") {
        if (input.expectedRevision !== disk.revision) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "REVISION_CONFLICT", message: "disk changed" } };
        writeNumber += 1;
        const priorRevision = disk.revision;
        disk = { content: input.content, revision: (writeNumber === 1 ? "b" : "c").repeat(64) };
        listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: writeNumber, emittedAt: "2026-09-05T12:01:00.000Z", path, revision: writeNumber === 1 ? disk.revision : priorRevision, change: "modified" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, file: { kind: "write", path, revision: disk.revision, workingFingerprint: "c".repeat(64) } };
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } },
    });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("one"));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!);
    if (!editor) throw new Error("CodeMirror editor was not mounted");
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "saved locally\n" } }));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-dirty")).toBeTruthy());
    fireEvent.keyDown(editor.contentDOM, { key: "s", code: "KeyS", ctrlKey: true });
    await waitFor(() => expect(requests.some((item) => item.type === "file.write")).toBe(true));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy());
    expect(disk.content).toContain("saved locally");

    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "saved twice\n" } }));
    fireEvent.keyDown(editor.contentDOM, { key: "s", code: "KeyS", ctrlKey: true });
    await waitFor(() => expect(requests.filter((item) => item.type === "file.write")).toHaveLength(2));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy());
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 3, emittedAt: "2026-09-05T12:01:01.000Z", path, revision: disk.revision, change: "modified" }));
    expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy();

    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "my unsaved line\n" } }));
    disk = { content: "external replacement\n", revision: "d".repeat(64) };
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 4, emittedAt: "2026-09-05T12:02:00.000Z", path, revision: disk.revision, change: "modified" }));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-conflict")).toBeTruthy());
    expect(editor.state.doc.toString()).toContain("my unsaved line");
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "still mine\n" } }));
    expect(document.querySelector(".file-state")?.classList.contains("file-conflict")).toBeTruthy();
    fireEvent.keyDown(editor.contentDOM, { key: "s", code: "KeyS", ctrlKey: true });
    expect(screen.getByText("The working file changed; your local buffer is preserved.")).toBeTruthy();
    expect(editor.state.doc.toString()).toContain("my unsaved line");
    expect(editor.state.doc.toString()).toContain("still mine");
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(screen.getByRole("button", { name: `Close ${path}` })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Close ${path}` }));
    expect(screen.getByRole("button", { name: `Close ${path}` })).toBeTruthy();
    expect(editor.state.doc.toString()).toContain("still mine");
    fireEvent.click(screen.getByRole("button", { name: "Reload disk" }));
    await waitFor(() => expect(editor.state.doc.toString()).toBe("external replacement\n"));
    expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy();
  });

  it("keeps a conflict raised during save and leaves transient failures dirty and retryable", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/payments/payments.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = { ...base, widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }] };
    let saveNumber = 0;
    let finishSave!: (response: CoreResponse) => void;
    const delayedSave = new Promise<CoreResponse>((resolve) => { finishSave = resolve; });
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.read") return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot, file: { kind: "read", path, content: "base\n", revision: "a".repeat(64), size: 5 } };
      if (input.type === "file.write") {
        saveNumber += 1;
        if (saveNumber === 1) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "WRITE_FAILED", message: "disk briefly unavailable" } };
        return delayedSave;
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } } });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("base"));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!);
    if (!editor) throw new Error("CodeMirror editor was not mounted");
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "mine\n" } }));
    fireEvent.keyDown(editor.contentDOM, { key: "s", ctrlKey: true });
    await waitFor(() => expect(screen.getByText(/can be retried/)).toBeTruthy());
    expect(document.querySelector(".file-state")?.classList.contains("file-dirty")).toBeTruthy();
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(screen.getByRole("button", { name: `Close ${path}` })).toBeTruthy();

    fireEvent.keyDown(editor.contentDOM, { key: "s", ctrlKey: true });
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-saving")).toBeTruthy());
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 4, emittedAt: "2026-09-05T12:03:00.000Z", path, revision: "c".repeat(64), change: "modified" }));
    await waitFor(() => expect(document.querySelector(".file-state")?.classList.contains("file-conflict")).toBeTruthy());
    finishSave({ protocolVersion: PROTOCOL_VERSION, requestId: "save", ok: true, sequence: 5, snapshot, file: { kind: "write", path, revision: "b".repeat(64), workingFingerprint: "d".repeat(64) } });
    await act(async () => { await delayedSave; });
    expect(document.querySelector(".file-state")?.classList.contains("file-conflict")).toBeTruthy();
    expect(editor.state.doc.toString()).toContain("mine");
  });

  it("registers observation before reading and rejects an older external read that completes last", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/fraudcheck/fraudcheck.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }],
    };
    const requests: CoreRequest["type"][] = [];
    let readCount = 0;
    let releaseOld!: (response: CoreResponse) => void;
    const oldRead = new Promise<CoreResponse>((resolve) => { releaseOld = resolve; });
    const response = (requestIdValue: string, content: string, revision: string): CoreResponse => ({
      protocolVersion: PROTOCOL_VERSION,
      requestId: requestIdValue,
      ok: true,
      sequence: 0,
      snapshot,
      file: { kind: "read", path, content, revision, size: content.length },
    });
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      requests.push(input.type);
      if (input.type === "file.read") {
        readCount += 1;
        if (readCount === 1) return response(input.requestId, "initial\n", "a".repeat(64));
        if (readCount === 2) return oldRead;
        return response(input.requestId, "newest\n", "c".repeat(64));
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", {
      configurable: true,
      value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } },
    });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("initial"));
    expect(requests.filter((type) => type.startsWith("file.")).slice(0, 2)).toEqual(["file.watch", "file.read"]);
    act(() => {
      listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:03:00.000Z", path, revision: "b".repeat(64), change: "modified" });
      listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 2, emittedAt: "2026-09-05T12:03:01.000Z", path, revision: "c".repeat(64), change: "modified" });
    });
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("newest"));
    releaseOld(response("old-event", "older\n", "b".repeat(64)));
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector(".cm-content")?.textContent).toContain("newest");
    expect(document.querySelector(".cm-content")?.textContent).not.toContain("older");
  });

  it("lets initial open consume a newer watcher event without duplicate competing reads", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/fraudcheck/fraudcheck.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }],
    };
    let readCount = 0;
    let releaseInitial!: (response: CoreResponse) => void;
    const initialRead = new Promise<CoreResponse>((resolve) => { releaseInitial = resolve; });
    const response = (requestIdValue: string, content: string, revision: string): CoreResponse => ({
      protocolVersion: PROTOCOL_VERSION,
      requestId: requestIdValue,
      ok: true,
      sequence: 0,
      snapshot,
      file: { kind: "read", path, content, revision, size: content.length },
    });
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.read") {
        readCount += 1;
        if (readCount === 1) return initialRead;
        return response(input.requestId, "newest\n", "b".repeat(64));
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } } });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await screen.findByText("Loading the canonical working file…");
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:03:00.000Z", path, revision: "b".repeat(64), change: "modified" }));
    releaseInitial(response("initial", "initial\n", "a".repeat(64)));
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("newest"));
    expect(readCount).toBe(2);
    expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy();
  });

  it("hands initial observation off before a post-read event can be dropped", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/fraudcheck/fraudcheck.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }],
    };
    let readCount = 0;
    let releaseInitial!: (response: CoreResponse) => void;
    const initialRead = new Promise<CoreResponse>((resolve) => { releaseInitial = resolve; });
    const response = (requestIdValue: string, content: string, revision: string): CoreResponse => ({
      protocolVersion: PROTOCOL_VERSION,
      requestId: requestIdValue,
      ok: true,
      sequence: 0,
      snapshot,
      file: { kind: "read", path, content, revision, size: content.length },
    });
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.read") {
        readCount += 1;
        if (readCount === 1) return initialRead;
        return response(input.requestId, "post-handoff\n", "b".repeat(64));
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } } });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await screen.findByText("Loading the canonical working file…");
    await act(async () => {
      releaseInitial(response("initial", "initial\n", "a".repeat(64)));
      await Promise.resolve();
      listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:03:00.000Z", path, revision: "b".repeat(64), change: "modified" });
    });
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("post-handoff"));
    expect(readCount).toBe(2);
    expect(document.querySelector(".file-state")?.classList.contains("file-saved")).toBeTruthy();
  });

  it("does not let an observed read from a closed tab overwrite its reopened lifecycle", async () => {
    let listener: ((event: CoreEvent | FileEvent) => void) | undefined;
    const path = "services/fraudcheck/fraudcheck.ts";
    const base = initialSnapshot(paymentsFileFocus);
    const snapshot: WorkspaceSnapshot = {
      ...base,
      widgets: [{ id: "source-paths", title: "Implementation sources", kind: "list", priority: 0, value: [path], provenance: base.widgets[0]!.provenance }],
    };
    let readCount = 0;
    let releaseOldLifecycle!: (response: CoreResponse) => void;
    const oldLifecycleRead = new Promise<CoreResponse>((resolve) => { releaseOldLifecycle = resolve; });
    const response = (requestIdValue: string, content: string, revision: string): CoreResponse => ({
      protocolVersion: PROTOCOL_VERSION,
      requestId: requestIdValue,
      ok: true,
      sequence: 0,
      snapshot,
      file: { kind: "read", path, content, revision, size: content.length },
    });
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "file.read") {
        readCount += 1;
        if (readCount === 1) return response(input.requestId, "initial\n", "a".repeat(64));
        if (readCount === 2) return oldLifecycleRead;
        return response(input.requestId, "reopened\n", "c".repeat(64));
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot };
    });
    Object.defineProperty(window, "swarm", { configurable: true, value: { request, onEvent: (next: (event: CoreEvent | FileEvent) => void) => { listener = next; return () => undefined; } } });
    installViewBridge();
    render(<App />);
    await screen.findByText("Implementation sources");
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("initial"));
    act(() => listener?.({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:04:00.000Z", path, revision: "b".repeat(64), change: "modified" }));
    await waitFor(() => expect(readCount).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: `Close ${path}` }));
    await waitFor(() => expect(screen.queryByRole("button", { name: `Close ${path}` })).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: path })[0]!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("reopened"));
    releaseOldLifecycle(response("old-lifecycle", "stale\n", "b".repeat(64)));
    await act(async () => { await oldLifecycleRead; });
    expect(document.querySelector(".cm-content")?.textContent).toContain("reopened");
    expect(document.querySelector(".cm-content")?.textContent).not.toContain("stale");
  });
});
