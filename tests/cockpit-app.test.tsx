// @vitest-environment jsdom
import { workspaceTaskFixtures, workspaceReply, fixtureAcknowledgement } from "./support/workspace-fixture";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot, writerFileFocus } from "../fixtures/world";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { openContextPath } from "./context-navigation";
import { WorkLogSettingsSchema } from "../protocol/work-log";

vi.mock("../app/renderer/plans/ProjectionCanvas", () => ({ ProjectionCanvas: () => <div>Planning camera test stand-in</div> }));
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <div data-testid="retained-graph">{graph.title}</div> }));
vi.mock("../app/renderer/external-agents/client", () => ({ useExternalAgents: () => ({
  selected: "00000000-0000-4000-8000-000000000007", detail: null, snapshot: null, busy: false, notice: "", fleet: [],
}) }));
vi.mock("../app/renderer/external-agents/ExternalAgents", () => ({
  ExternalAgentRail: ({ onSelect }: { onSelect(): void }) => <button onClick={onSelect}>Inspect C7</button>,
  ExternalAgentInformation: ({ onOpen, visible }: { onOpen(path: string): void; visible: boolean }) => <div hidden={!visible}><button onClick={() => onOpen("app/file.ts")}>Inspect agent file</button></div>,
}));
import { App } from "../app/renderer/App";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });

it("Ctrl+W closes the agent inspection, not the underlying editor or file watch", async () => {
  const snapshot = initialSnapshot(writerFileFocus);
  const tasks = workspaceTaskFixtures(snapshot);
  let sequence = 0;
  let outcomeState: "working" | "completed" = "working";
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = workspaceReply(input, snapshot, ++sequence);
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: tasks.observation() } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "local source\n", revision: "a".repeat(64), size: 13 } };
    if (input.type === "worktree.inspect") return { ...common, worktreeInspection: { sessionId: input.sessionId, path: input.path, label: "C7", worktree: "/repos/child", content: "child source", diff: "", ...(input.comparison ? { comparison: input.comparison, base: "origin/master" } : {}) } };
    if (input.type === "workLog.read") return { ...common, workLog: { running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), notice: "", entries: [
      { id: "outcome-1", sessionId: "00000000-0000-4000-8000-000000000007", agent: "C7", taskId: null, at: "2026-09-08T04:00:00Z", state: outcomeState, outcome: "Connected the real operator cockpit.", areas: ["app/renderer/App.tsx"], checks: ["Mounted editor retained"], followUps: [], recorded: false },
    ] } };
    return fixtureAcknowledgement(input, snapshot, sequence);
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
  await openContextPath(writerFileFocus.path!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("local source"));
  const editorNode = document.querySelector<HTMLElement>(".cm-editor")!, graphs = screen.getAllByTestId("retained-graph");
  const editor = EditorView.findFromDOM(editorNode)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect C7" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect agent file" }));
  await screen.findByText("child source");
  fireEvent.click(screen.getByRole("button", { name: "System plan" }));
  expect(document.querySelector<HTMLElement>(".design-document-surface")?.hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Worktree · file.ts" }));
  await screen.findByText("child source");
  expect(document.querySelector<HTMLElement>(".design-document-surface")?.hidden).toBe(true);
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
  fireEvent.click(screen.getByRole("button", { name: "System plan" }));
  expect(screen.queryByRole("region", { name: "Work Log outcome" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Connected the real operator cockpit." }));
  expect(document.querySelector<HTMLElement>(".design-document-surface")?.hidden).toBe(true);
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("region", { name: "Work Log outcome" })).toBeNull();
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  expect(document.querySelector(".cm-editor")).toBe(editorNode);
  expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  expect(request.mock.calls.some(([input]) => input.type === "workLog.start" || input.type === "workLog.record")).toBe(false);
}, 10000);

it("opens, restores and keyboard-closes a file literally named graphs", async () => {
  const snapshot = initialSnapshot();
  const tasks = workspaceTaskFixtures(snapshot);
  let sequence = 0;
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = workspaceReply(input, snapshot, ++sequence);
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: tasks.observation() } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "ordinary file\n", revision: "a".repeat(64), size: 14 } };
    return fixtureAcknowledgement(input, snapshot, sequence);
  });
  window.swarm = { request, onEvent: () => () => {} };
  render(<App />);
  await openContextPath("graphs");
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("ordinary file"));
  fireEvent(window, new Event("beforeunload"));
  cleanup();
  render(<App />);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("ordinary file"));
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Close graphs" })).toBeNull());
  expect(request.mock.calls.some(([input]) => input.type === "file.unwatch" && input.path === "graphs")).toBe(true);
});
