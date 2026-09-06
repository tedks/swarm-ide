// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskDetailFixture, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import type { TaskFileRef } from "../protocol/tasks";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) =>
  <section data-testid="task-graph">{graph.title}<input aria-label={`Camera ${graph.topologyId}`} defaultValue="camera untouched" /></section>,
}));
import { App } from "../app/renderer/App";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear();
  delete window.swarm; delete window.swarmView; delete window.swarmLifecycle;
});

const source = paymentsFileFocus.path!;
const doc = "docs/architecture.md";
function setup(refs: TaskFileRef[] = [{ path: source, line: 2, note: "Explicit source", navigation: "candidate" }], failure?: string) {
  const snapshot = initialSnapshot(paymentsFileFocus);
  const observation = taskObservationFixture();
  const detail = { ...taskDetailFixture(), fileRefs: refs, counts: { ...taskDetailFixture().counts, fileRefs: refs.length } };
  observation.snapshot!.summaries[0]!.counts.fileRefs = refs.length;
  let sequence = 0;
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, snapshot };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: { ...observation, sequence } } };
    if (input.type === "tasks.read") return { ...common, task: { ...taskReadFixture(), sequence, result: { ok: true, detail } } };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if ((input.type === "file.read" || input.type === "file.watch") && input.path !== source && failure)
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: failure, message: "Contained-file broker refused this reference." } };
    if (input.type === "file.read") {
      const content = input.path === source ? "one\ntwo\nthree\n" : "Documentation\nReference\n";
      return { ...common, file: { kind: "read", path: input.path, content, revision: "d".repeat(64), size: content.length } };
    }
    return common;
  });
  window.swarm = { request, onEvent: () => () => undefined };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { request, observation };
}
async function openSource() {
  await screen.findByRole("button", { name: "Select task task-fixture" });
  fireEvent.click(screen.getAllByRole("button", { name: source })[0]!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("one"));
  return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
}
async function selectTask() {
  fireEvent.click(screen.getByRole("button", { name: "Select task task-fixture" }));
  await screen.findByRole("region", { name: "Task details" });
  await screen.findByRole("heading", { name: "Inspect a repository task" });
}
function showDetails() {
  fireEvent.click(within(document.getElementById("information-panel")!).getByRole("button", { name: "Show task details" }));
}
function reveal(path: string, line: number | null) {
  fireEvent.click(screen.getByRole("button", { name: `Reveal working file ${path}${line === null ? "" : ` at line ${line}`}` }));
}

describe("task inspection in the source cockpit", () => {
  it("keeps dirty source, cursor, graph instances, compact choice and draft while inspecting metadata", async () => {
    const { request } = setup(); render(<App />); const editor = await openSource();
    fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
    const draft = screen.getByLabelText("Task");
    fireEvent.change(draft, { target: { value: "Independent fixed-focus draft" } });
    act(() => editor.dispatch({ changes: { from: 0, insert: "unsaved\n" }, selection: { anchor: 4 } }));
    const graphs = screen.getAllByTestId("task-graph");
    const camera = screen.getByLabelText("Camera repo");
    fireEvent.change(camera, { target: { value: "pan 1024,768 zoom 2" } });
    const before = request.mock.calls.length;
    const selected = screen.getByRole("button", { name: "Select task task-fixture" }); selected.focus();
    await selectTask();
    expect(document.activeElement).toBe(selected);
    expect(document.querySelector("main.workbench")?.getAttribute("data-compact-panel")).toBe("work");
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    expect(editor.state.doc.toString()).toBe("unsaved\none\ntwo\nthree\n");
    expect(editor.state.selection.main.anchor).toBe(4);
    expect(screen.getAllByTestId("task-graph")).toEqual(graphs);
    expect((camera as HTMLInputElement).value).toBe("pan 1024,768 zoom 2");
    expect(screen.getByLabelText("Task")).toBe(draft);
    expect((draft as HTMLTextAreaElement).value).toBe("Independent fixed-focus draft");
    expect(request.mock.calls.slice(before).map(([input]) => input.type)).toEqual(["tasks.read"]);
    fireEvent.pointerDown(document.querySelector(".source-surface")!);
    expect(screen.queryByRole("region", { name: "Task details" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select task task-fixture" }).getAttribute("aria-pressed")).toBe("true");
    showDetails();
    expect(screen.getByRole("region", { name: "Task details" })).toBeTruthy();
  });

  it("repeated clean Reveal navigates the requested line without recreating CodeMirror or issuing writes", async () => {
    const { request } = setup(); render(<App />); const editor = await openSource();
    await selectTask(); reveal(source, 2);
    await waitFor(() => expect(editor.state.selection.main.head).toBe(4));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    act(() => editor.dispatch({ selection: { anchor: 0 } }));
    showDetails(); reveal(source, 2);
    await waitFor(() => expect(editor.state.selection.main.head).toBe(4));
    expect(request.mock.calls.some(([input]) => input.type === "file.write" || ["agent.prepare", "agent.launch", "agent.steer", "agent.cancel"].includes(input.type))).toBe(false);
  });

  it("preserves a dirty cursor instead of pretending a metadata line locates unsaved text", async () => {
    const { request } = setup(); render(<App />); const editor = await openSource();
    act(() => editor.dispatch({ changes: { from: 0, insert: "unsaved\n" }, selection: { anchor: 2 } }));
    await selectTask(); const before = request.mock.calls.length; reveal(source, 2);
    await screen.findByText(/metadata line cannot safely map/);
    expect(editor.state.selection.main.head).toBe(2);
    expect(editor.state.doc.toString()).toContain("unsaved");
    expect(request.mock.calls.slice(before).map(([input]) => input.type)).toEqual(["focus.select"]);
  });

  it("opens valid files for out-of-range lines without clamping or moving an existing cursor", async () => {
    setup([{ path: source, line: 999, note: null, navigation: "candidate" }]);
    render(<App />); const editor = await openSource();
    act(() => editor.dispatch({ selection: { anchor: 2 } }));
    await selectTask(); reveal(source, 999);
    await screen.findByText(/Referenced line 999 is unavailable/);
    expect(editor.state.selection.main.head).toBe(2);
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
  });

  it.each(["FILE_NOT_FOUND", "NOT_REGULAR_FILE", "BINARY_FILE", "FILE_TOO_LARGE", "PATH_OUTSIDE_ROOT"])("keeps previous source on typed broker refusal %s", async (code) => {
    setup([{ path: "missing.txt", line: null, note: null, navigation: "candidate" }], code);
    render(<App />); const editor = await openSource();
    act(() => editor.dispatch({ changes: { from: 0, insert: "mine\n" }, selection: { anchor: 3 } }));
    await selectTask(); reveal("missing.txt", null);
    await waitFor(() => expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain(code));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    expect(editor.state.doc.toString()).toContain("mine");
    expect(editor.state.selection.main.head).toBe(3);
    expect(screen.getByRole("region", { name: "Task details" })).toBeTruthy();
  });

  it("opens docs as working text and restores dirty source cursor when returning to its full-path tab", async () => {
    setup([{ path: doc, line: 2, note: null, navigation: "candidate" }]);
    render(<App />); const editor = await openSource();
    act(() => editor.dispatch({ changes: { from: 0, insert: "mine\n" }, selection: { anchor: 3 } }));
    await selectTask(); reveal(doc, 2);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("Documentation"));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)!.state.selection.main.head).toBe(14);
    fireEvent.click(document.querySelector<HTMLButtonElement>(`.surface-tab-main[title="${source}"]`)!);
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("mine"));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)!.state.selection.main.head).toBe(3);
    expect(screen.getByRole("button", { name: `Close ${doc}` })).toBeTruthy();
  });

  it("offers palette Tasks and details without selecting a source or preparing an agent", async () => {
    const { request } = setup(); render(<App />); await openSource();
    const before = request.mock.calls.length;
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(await screen.findByRole("button", { name: /Show repository Tasks/ }));
    expect(document.querySelector("main.workbench")?.getAttribute("data-compact-panel")).toBe("work");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(await screen.findByRole("button", { name: /Show task details.*retained task selection/ }));
    expect(document.querySelector("main.workbench")?.getAttribute("data-compact-panel")).toBe("info");
    expect(screen.getByText("Select a task in Work to inspect its metadata.")).toBeTruthy();
    expect(request.mock.calls.slice(before).some(([input]) => input.type === "focus.select" || input.type.startsWith("agent.") || input.type.startsWith("file."))).toBe(false);
  });
});
