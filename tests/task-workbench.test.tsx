// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskDetailFixture, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreEvent, type FileEvent, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import type { TaskFileRef } from "../protocol/tasks";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readWorkspaceFile, resolveWorkspaceFile, WorkspaceFileError } from "../core/files";

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
function setup(refs: TaskFileRef[] = [{ path: source, line: 2, note: "Explicit source", navigation: "candidate" }], failure?: string, brokerRoot?: string) {
  const snapshot = initialSnapshot(paymentsFileFocus);
  const observation = taskObservationFixture();
  const detail = { ...taskDetailFixture(), fileRefs: refs, counts: { ...taskDetailFixture().counts, fileRefs: refs.length } };
  observation.snapshot!.summaries[0]!.counts.fileRefs = refs.length;
  let sequence = 0;
  const listeners = new Set<(event: CoreEvent | FileEvent) => void>();
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, snapshot };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: { ...observation, sequence } } };
    if (input.type === "tasks.read") return { ...common, task: { ...taskReadFixture(), sequence, result: { ok: true, detail } } };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (brokerRoot && (input.type === "file.read" || input.type === "file.watch")) {
      try {
        if (input.type === "file.watch") { await resolveWorkspaceFile(brokerRoot, input.path); return common; }
        return { ...common, file: await readWorkspaceFile(brokerRoot, input.path) };
      } catch (error) {
        if (!(error instanceof WorkspaceFileError)) throw error;
        return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: error.code, message: error.message } };
      }
    }
    if ((input.type === "file.read" || input.type === "file.watch") && input.path !== source && failure)
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: failure, message: "Contained-file broker refused this reference." } };
    if (input.type === "file.read") {
      const content = input.path === source ? "one\ntwo\nthree\n" : "Documentation\nReference\n";
      return { ...common, file: { kind: "read", path: input.path, content, revision: "d".repeat(64), size: content.length } };
    }
    return common;
  });
  window.swarm = { request, onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { request, observation, event: (event: CoreEvent | FileEvent) => act(() => { for (const listener of listeners) listener(event); }) };
}
async function openSource() {
  await screen.findByRole("button", { name: "Select task task-fixture" });
  fireEvent.click(screen.getAllByRole("button", { name: source })[0]!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("one"));
  return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
}

it("runs the demo palette commands without launching agents or building, and clears only mock surfaces", async () => {
  const { request } = setup(); render(<App />);
  await screen.findByRole("button", { name: "Select task task-fixture" });
  const command = (text: string) => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("textbox", { name: "Workspace command" });
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  command("Demo: populate everything");
  expect(screen.getByRole("region", { name: "Mock agent runs" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Mock agent conversation" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Mock context" })).toBeTruthy();
  expect(request.mock.calls.some(([input]) => ["agent.prepare", "agent.launch", "agent.steer", "agent.cancel", "reconciliation.start"].includes(input.type))).toBe(false);
  command("Demo: clear mock data");
  expect(screen.queryByRole("region", { name: "Mock agent runs" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Mock context" })).toBeNull();
  expect(screen.getByRole("button", { name: "Select task task-fixture" })).toBeTruthy();
});
async function selectTask() {
  fireEvent.click(screen.getByRole("button", { name: "Select task task-fixture" }));
  await screen.findByRole("region", { name: "Task details" });
  await screen.findByRole("heading", { name: "Inspect a repository task" });
}
function showDetails() {
  fireEvent.click(within(document.getElementById("information-panel")!).getByRole("button", { name: "Show task details" }));
}
function reveal(path: string, line: number | null) {
  const button = screen.getByRole("button", { name: `Reveal working file ${path}${line === null ? "" : ` at line ${line}`}` });
  act(() => button.focus());
  fireEvent.click(button);
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
    expect(request.mock.calls.slice(before).map(([input]) => input.type).filter((type) => type !== "tasks.snapshot")).toEqual(["tasks.read"]);
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
    expect(document.activeElement).toBe(editor.contentDOM);
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
    expect(request.mock.calls.slice(before).map(([input]) => input.type).filter((type) => type !== "tasks.snapshot")).toEqual(["focus.select"]);
    expect(document.activeElement).toBe(editor.contentDOM);
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

  it.each(["FILE_NOT_FOUND", "NOT_REGULAR_FILE", "BINARY_FILE", "FILE_TOO_LARGE", "PATH_ESCAPE", "SYMLINK_ESCAPE"])("keeps previous source on typed broker refusal %s", async (code) => {
    setup([{ path: "missing.txt", line: null, note: null, navigation: "candidate" }], code);
    render(<App />); const editor = await openSource();
    act(() => editor.dispatch({ changes: { from: 0, insert: "mine\n" }, selection: { anchor: 3 } }));
    await selectTask(); reveal("missing.txt", null);
    await waitFor(() => expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain(code));
    expect(document.activeElement).toBe(document.querySelector(".tasks-reveal-notice"));
    expect(screen.queryByRole("button", { name: "Close missing.txt" })).toBeNull();
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
    const sourceEditor = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const command = screen.getByRole("textbox", { name: "Workspace command" });
    fireEvent.change(command, { target: { value: "Show system graphs" } });
    fireEvent.keyDown(command, { key: "Enter" });
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".graphs-grid")));
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(sourceEditor);
    expect(sourceEditor.state.doc.toString()).toBe("mine\none\ntwo\nthree\n");
    expect(sourceEditor.state.selection.main.head).toBe(3);
    expect(document.querySelector(".surface-tab.active .surface-tab-main")?.getAttribute("title")).toBe(source);
  });

  it("returns from a task-only document to the graph-only layout", async () => {
    setup(); render(<App />);
    const row = await screen.findByRole("button", { name: "Select task task-fixture" });
    fireEvent.doubleClick(row);
    const document = await screen.findByRole("region", { name: "Task document" });
    fireEvent.click(within(document).getByRole("button", { name: "Return to source" }));
    expect(screen.queryByRole("region", { name: "Task document" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Document tabs" })).toBeNull();
  });

  it("does not display an unadmitted background source while Reveal is pending or revoked", async () => {
    const test = setup(); render(<App />);
    await screen.findByRole("button", { name: "Select task task-fixture" });
    await selectTask();
    const original = test.request.getMockImplementation()!;
    let finish!: () => void;
    test.request.mockImplementation((input) => input.type === "file.read" ? new Promise((resolve) => {
      finish = () => { void original(input).then(resolve); };
    }) : original(input));
    reveal(source, 2); await screen.findByText(`Opening working file ${source}…`);
    expect(document.querySelector(".source-surface")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await act(async () => finish());
    expect(document.querySelector(".source-surface")).toBeNull();
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(test.request.mock.calls.some(([input]) => input.type === "file.unwatch")).toBe(false);
  });

  it.each(["missing", "fifo"])("surfaces actual contained-file broker %s refusal through explicit Reveal", async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "swarm-t2-broker-"));
    try {
      await mkdir(dirname(join(root, source)), { recursive: true });
      await writeFile(join(root, source), "one\ntwo\nthree\n");
      if (kind === "fifo") execFileSync("mkfifo", [join(root, "reference")], { timeout: 1000 });
      const test = setup([{ path: "reference", line: null, note: null, navigation: "candidate" }], undefined, root);
      render(<App />); const editor = await openSource();
      act(() => editor.dispatch({ changes: { from: 0, insert: "unsaved\n" }, selection: { anchor: 3 } }));
      await selectTask(); reveal("reference", null);
      await waitFor(() => expect(document.querySelector(".tasks-reveal-notice")?.textContent).toContain(kind === "fifo" ? "NOT_REGULAR_FILE" : "FILE_NOT_FOUND"));
      expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
      expect(editor.state.selection.main.head).toBe(3);
      expect(editor.state.doc.toString()).toContain("unsaved");
      expect(test.request.mock.calls.some(([input]) => input.type === "file.write")).toBe(false);
    } finally { cleanup(); await rm(root, { recursive: true, force: true }); }
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
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Return to source information" })));
    expect(request.mock.calls.slice(before).some(([input]) => input.type === "focus.select" || input.type.startsWith("agent.") || input.type.startsWith("file."))).toBe(false);
  });

  it("explicit Show details opens Information and gives the keyboard a destination; row selection does neither", async () => {
    setup(); render(<App />); await openSource();
    fireEvent.click(screen.getByRole("button", { name: "Toggle work panel" }));
    const row = screen.getByRole("button", { name: "Select task task-fixture" }); row.focus();
    await selectTask();
    expect(document.activeElement).toBe(row);
    expect(document.querySelector(".workbench")?.getAttribute("data-compact-panel")).toBe("work");
    fireEvent.click(within(screen.getByRole("region", { name: "Tasks" })).getByRole("button", { name: "Show task details" }));
    expect(document.querySelector(".workbench")?.getAttribute("data-compact-panel")).toBe("info");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Return to source information" })));
    fireEvent.click(screen.getByRole("button", { name: "Return to source information" }));
    expect(document.activeElement).toBe(document.querySelector(".instrument-heading h2"));
  });

  it("consumes palette Enter so its default action cannot click the newly focused Return button", async () => {
    const { request } = setup(); render(<App />); await openSource();
    const before = request.mock.calls.length;
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Find a filename, path fragment or command…");
    fireEvent.change(input, { target: { value: "Show task details" } });
    expect(fireEvent.keyDown(input, { key: "Enter", cancelable: true })).toBe(false);
    fireEvent.keyUp(input, { key: "Enter" });
    expect(screen.getByRole("region", { name: "Task details" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Return to source information" }));
    expect(request.mock.calls.slice(before).some(([command]) => command.type === "focus.select" || command.type.startsWith("agent.") || command.type.startsWith("file."))).toBe(false);
  });

  it("recovers a prior null-revision watcher error by rewatch/read without waiting for another filesystem mutation", async () => {
    const test = setup(); render(<App />); const editor = await openSource();
    test.event({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 100, path: source,
      revision: null, change: "error", message: "Watcher unavailable", emittedAt: "2026-09-06T08:00:00.000Z" });
    await screen.findByRole("button", { name: "Reload disk" });
    await selectTask(); const before = test.request.mock.calls.length;
    reveal(source, 2);
    await waitFor(() => expect(editor.state.selection.main.head).toBe(4));
    expect(test.request.mock.calls.slice(before).map(([input]) => input.type)).toEqual(["file.watch", "file.read", "focus.select"]);
    expect(document.querySelector(".file-saved")).toBeTruthy();
  });

  it("settles superseded Reveal progress without moving source after its delayed read", async () => {
    const test = setup(); render(<App />); const editor = await openSource(); await selectTask();
    const original = test.request.getMockImplementation()!;
    let finish!: () => void;
    test.request.mockImplementation((input) => input.type === "file.read" ? new Promise((resolve) => { finish = () => { void original(input).then(resolve); }; }) : original(input));
    reveal(source, 2);
    await screen.findByText(`Opening working file ${source}…`);
    fireEvent.pointerDown(document.querySelector(".source-surface")!);
    await screen.findByText(/Reveal superseded by a newer interaction/);
    const before = test.request.mock.calls.length;
    await act(async () => { finish(); });
    expect(test.request.mock.calls.slice(before).some(([input]) => input.type === "focus.select")).toBe(false);
    expect(editor.state.selection.main.head).toBe(0);
    expect(screen.queryByText(`Opening working file ${source}…`)).toBeNull();
  });

  it.each([
    ["draft", "success"], ["draft", "failure"],
    ["palette", "success"], ["palette", "failure"],
  ] as const)("retains newer %s input when a delayed Reveal ends in %s", async (destination, outcome) => {
    const test = setup(); render(<App />); const editor = await openSource();
    fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
    const draft = screen.getByLabelText("Task") as HTMLTextAreaElement;
    await selectTask();
    const original = test.request.getMockImplementation()!;
    let finish!: () => void;
    test.request.mockImplementation((input) => input.type === "file.read" ? new Promise((resolve) => {
      finish = () => { if (outcome === "success") void original(input).then(resolve);
        else resolve({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false,
          error: { code: "FILE_NOT_FOUND", message: "Deleted during read" } }); };
    }) : original(input));
    reveal(source, 2); await screen.findByText(`Opening working file ${source}…`);
    if (destination === "draft") {
      act(() => draft.focus());
      fireEvent.change(draft, { target: { value: "Newer agent instruction, still unsent" } });
    } else {
      // Revoke synchronously at the shortcut, before its deferred input focus.
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    }
    const before = test.request.mock.calls.length;
    await act(async () => { finish(); });
    const target = destination === "draft" ? draft : screen.getByPlaceholderText("Find a filename, path fragment or command…");
    await waitFor(() => expect(document.activeElement).toBe(target));
    if (destination === "palette") fireEvent.change(target, { target: { value: "Newer palette search" } });
    expect((target as HTMLInputElement).value).toBe(destination === "draft" ? "Newer agent instruction, still unsent" : "Newer palette search");
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
    expect(editor.state.doc.toString()).toBe("one\ntwo\nthree\n");
    expect(editor.state.selection.main.head).toBe(0);
    expect(test.request.mock.calls.slice(before).some(([input]) => input.type === "focus.select" || input.type.startsWith("agent.") || input.type === "file.write")).toBe(false);
    expect(screen.queryByText(`Opening working file ${source}…`)).toBeNull();
  });

  it("revokes old Reveal focus authority across same-generation App remount", async () => {
    const test = setup(); const first = render(<App />); await openSource(); await selectTask();
    const original = test.request.getMockImplementation()!;
    let finish!: () => void;
    test.request.mockImplementation((input) => input.type === "file.read" ? new Promise((resolve) => { finish = () => { void original(input).then(resolve); }; }) : original(input));
    reveal(source, 2); await screen.findByText(`Opening working file ${source}…`);
    first.unmount(); render(<App />);
    await screen.findByRole("button", { name: "Select task task-fixture" });
    const before = test.request.mock.calls.length;
    await act(async () => { finish(); });
    expect(test.request.mock.calls.slice(before).some(([input]) => input.type === "focus.select")).toBe(false);
    expect(document.querySelector(".cm-editor")).toBeNull();
  });

  it("adopts newly read saved content before locating its recorded line", async () => {
    const test = setup(); render(<App />); const editor = await openSource(); await selectTask();
    const original = test.request.getMockImplementation()!;
    test.request.mockImplementation(async (input) => {
      const response = await original(input);
      return input.type === "file.read" && response.ok ? { ...response, file: { kind: "read", path: source, content: "fresh\nnext\n", revision: "e".repeat(64), size: 11 } } : response;
    });
    reveal(source, 2);
    await waitFor(() => expect(editor.state.doc.toString()).toBe("fresh\nnext\n"));
    expect(editor.state.selection.main.head).toBe(6);
    expect(document.activeElement).toBe(editor.contentDOM);
    expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
  });

  it("rejects a fresh watcher failure that supersedes a pending Reveal read", async () => {
    const test = setup(); render(<App />); const editor = await openSource(); await selectTask();
    const original = test.request.getMockImplementation()!;
    let finish!: () => void;
    test.request.mockImplementation((input) => input.type === "file.read" ? new Promise((resolve) => { finish = () => { void original(input).then(resolve); }; }) : original(input));
    reveal(source, 2); await screen.findByText(`Opening working file ${source}…`);
    test.event({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 100, path: source,
      revision: null, change: "error", message: "New failure", emittedAt: "2026-09-06T08:00:00.000Z" });
    const before = test.request.mock.calls.length;
    await act(async () => { finish(); });
    await screen.findByText(/Working file changed during Reveal/);
    expect(test.request.mock.calls.slice(before).some(([input]) => input.type === "focus.select")).toBe(false);
    expect(editor.state.selection.main.head).toBe(0);
  });
});
