// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskObservationFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { openContextPath } from "./context-navigation";
import { WorkLogSettingsSchema } from "../protocol/work-log";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <div data-testid="retained-graph">{graph.title}</div> }));
vi.mock("../app/renderer/external-agents/client", () => ({ useExternalAgents: () => ({
  selected: "00000000-0000-4000-8000-000000000007", detail: null, snapshot: null, busy: false, notice: "", fleet: [],
}) }));
vi.mock("../app/renderer/external-agents/ExternalAgents", () => ({
  ExternalAgentRail: ({ onSelect }: { onSelect(): void }) => <button onClick={onSelect}>Inspect C7</button>,
  ExternalAgentInformation: ({ onOpen, onWorktree, visible }: { onOpen(path: string): void; onWorktree?(id: string): void; visible: boolean }) => <div hidden={!visible}><button onClick={() => onOpen("app/file.ts")}>Inspect agent file</button><button onClick={() => onWorktree?.("00000000-0000-4000-8000-000000000007")}>Explore agent worktree</button></div>,
}));
import { App } from "../app/renderer/App";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });

it("Ctrl+W closes the agent inspection, not the underlying editor or file watch", async () => {
  const snapshot = initialSnapshot(paymentsFileFocus);
  let sequence = 0;
  let outcomeState: "working" | "completed" = "working";
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, snapshot };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: taskObservationFixture() } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "local source\n", revision: "a".repeat(64), size: 13 } };
    if (input.type === "worktree.inspect") return { ...common, worktreeInspection: { sessionId: input.sessionId, path: input.path, label: "C7", worktree: "/repos/child", content: "child source", diff: "", ...(input.comparison ? { comparison: input.comparison, base: "origin/master" } : {}) } };
    if (input.type === "worktree.browse") return { ...common, worktreeBrowse: { sessionId: input.sessionId, label: "C7", worktree: "/repos/child", branch: "feature/child", base: "origin/master", changesComplete: true, changes: [{ path: "app/file.ts", status: "modified" }], directory: {
      directory: input.directory, observationId: "browser", capturedAt: "2026-09-08T06:00:00Z", state: "observed", complete: true, capturedCount: 0, filteredCount: 0, page: input.page, pageCount: 1, filter: "", entries: [],
    } } };
    if (input.type === "workLog.read") return { ...common, workLog: { running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), notice: "", entries: [
      { id: "outcome-1", sessionId: "00000000-0000-4000-8000-000000000007", agent: "C7", taskId: null, at: "2026-09-08T04:00:00Z", state: outcomeState, outcome: "Connected the real operator cockpit.", areas: ["app/renderer/App.tsx"], checks: ["Mounted editor retained"], followUps: [], recorded: false },
    ] } };
    return common;
  });
  window.swarm = { request, onEvent: () => () => {} };
  render(<App />);
  await screen.findByRole("button", { name: "Select task task-fixture" });
  const workLog = await screen.findByRole("region", { name: "Work Log" });
  expect(screen.getAllByRole("region", { name: "Work Log" })).toHaveLength(1);
  expect(workLog.closest(".dock-work-log")?.nextElementSibling).toBe(document.querySelector(".dock-activity"));
  expect(document.querySelector("#work-panel")?.contains(workLog)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Agent runs" }));
  expect(screen.getByRole("region", { name: "Work Log" })).toBe(workLog);
  fireEvent.click(within(workLog).getByRole("button", { name: "Summary settings" }));
  const summaryModel = within(workLog).getByRole("textbox", { name: "Model" }) as HTMLInputElement;
  fireEvent.change(summaryModel, { target: { value: "gpt-5.6-luna-draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Agent runs" }));
  await openContextPath(paymentsFileFocus.path!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("local source"));
  const editorNode = document.querySelector<HTMLElement>(".cm-editor")!, graphs = screen.getAllByTestId("retained-graph");
  const editor = EditorView.findFromDOM(editorNode)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect C7" }));
  fireEvent.click(screen.getByRole("button", { name: "Explore agent worktree" }));
  await screen.findByText("C7 / Worktree");
  expect(request.mock.calls.find(([input]) => input.type === "worktree.browse")?.[0]).toMatchObject({ sessionId: "00000000-0000-4000-8000-000000000007", directory: "" });
  fireEvent.click(screen.getByRole("button", { name: "modified app/file.ts" }));
  await screen.findByText("Changes against origin/master, including committed and local edits.");
  fireEvent.click(screen.getByRole("button", { name: "Source" }));
  await screen.findByText("child source");
  expect(request.mock.calls.find(([input]) => input.type === "worktree.inspect" && input.comparison === "master")?.[0]).toMatchObject({ sessionId: "00000000-0000-4000-8000-000000000007", comparison: "master" });
  fireEvent.click(screen.getByRole("button", { name: "Return to workspace" }));
  expect(document.querySelector(".cm-editor")).toBe(editorNode);
  expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  fireEvent.click(screen.getByRole("button", { name: "Inspect agent file" }));
  await screen.findByText("child source");
  fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace lenses" })).getByRole("button", { name: "Plan" }));
  expect(document.querySelector<HTMLElement>(".planning-field")?.hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Worktree · file.ts" }));
  await screen.findByText("child source");
  expect(document.querySelector<HTMLElement>(".planning-field")?.hidden).toBe(true);
  const before = request.mock.calls.length;
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("region", { name: "Agent worktree file" })).toBeNull();
  expect(document.querySelector(".cm-editor")).toBe(editorNode);
  expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  expect(screen.getByRole("region", { name: "Work Log" })).toBe(workLog);
  expect(within(workLog).getByRole("textbox", { name: "Model" })).toBe(summaryModel);
  expect(summaryModel.value).toBe("gpt-5.6-luna-draft");
  expect(request.mock.calls.slice(before).some(([input]) => input.type === "file.unwatch")).toBe(false);
  fireEvent.click(await screen.findByRole("button", { name: "Connected the real operator cockpit." }));
  expect(screen.getByRole("region", { name: "Work Log outcome" }).textContent).toContain("Mounted editor retained");
  expect(within(screen.getByRole("region", { name: "Work Log outcome" })).getByText("Saved update")).toBeTruthy();
  const readsBefore = request.mock.calls.filter(([input]) => input.type === "workLog.read").length;
  outcomeState = "completed";
  summaryModel.focus();
  await within(screen.getByRole("region", { name: "Work Log outcome" })).findByText("Completed turn", {}, { timeout: 4500 });
  expect(request.mock.calls.filter(([input]) => input.type === "workLog.read")).toHaveLength(readsBefore + 1);
  expect(within(workLog).getByText("Completed turn")).toBeTruthy();
  expect(document.activeElement).toBe(summaryModel);
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(true);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace lenses" })).getByRole("button", { name: "Plan" }));
  expect(screen.queryByRole("region", { name: "Work Log outcome" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Connected the real operator cockpit." }));
  expect(document.querySelector<HTMLElement>(".planning-field")?.hidden).toBe(true);
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("region", { name: "Work Log outcome" })).toBeNull();
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  expect(document.querySelector(".cm-editor")).toBe(editorNode);
  expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  expect(request.mock.calls.some(([input]) => input.type === "workLog.start" || input.type === "workLog.record")).toBe(false);
}, 10000);
