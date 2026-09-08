// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskObservationFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { openContextPath } from "./context-navigation";

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
  const snapshot = initialSnapshot(paymentsFileFocus);
  let sequence = 0;
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, snapshot };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: taskObservationFixture() } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "local source\n", revision: "a".repeat(64), size: 13 } };
    if (input.type === "worktree.inspect") return { ...common, worktreeInspection: { sessionId: input.sessionId, path: input.path, label: "C7", worktree: "/repos/child", content: "child source", diff: "" } };
    return common;
  });
  window.swarm = { request, onEvent: () => () => {} };
  render(<App />);
  await screen.findByRole("button", { name: "Select task task-fixture" });
  await openContextPath(paymentsFileFocus.path!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("local source"));
  const editorNode = document.querySelector<HTMLElement>(".cm-editor")!, graphs = screen.getAllByTestId("retained-graph");
  const editor = EditorView.findFromDOM(editorNode)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect C7" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect agent file" }));
  await screen.findByText("child source");
  fireEvent.click(screen.getByRole("button", { name: "System design" }));
  expect(document.querySelector<HTMLElement>(".design-center")?.hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Worktree · file.ts" }));
  await screen.findByText("child source");
  expect(document.querySelector<HTMLElement>(".design-center")?.hidden).toBe(true);
  const before = request.mock.calls.length;
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("region", { name: "Agent worktree file" })).toBeNull();
  expect(document.querySelector(".cm-editor")).toBe(editorNode);
  expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  expect(request.mock.calls.slice(before).some(([input]) => input.type === "file.unwatch")).toBe(false);
});
