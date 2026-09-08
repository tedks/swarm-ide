// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalDetail } from "../protocol/external-agents";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskObservationFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreEvent, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { WorkLogSettingsSchema } from "../protocol/work-log";
import { openContextPath } from "./context-navigation";
import type { Lifecycle } from "../app/lifecycle";

const observer = vi.hoisted(() => ({ state: null as ExternalClient | null, listeners: new Set<() => void>() }));
vi.mock("../app/renderer/external-agents/client", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useExternalAgents: () => useSyncExternalStore((listener) => { observer.listeners.add(listener); return () => { observer.listeners.delete(listener); }; }, () => observer.state!) };
});
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <div data-testid="retained-graph">{graph.title}</div> }));
import { App } from "../app/renderer/App";

const session: ExternalDetail["session"] = { id: "00000000-0000-4000-8000-000000000007", label: "Refresh worker", worktree: "/repos/worker",
  control: "tmux", status: "observed", evidence: "local", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T12:00:00Z", message: "", contextPaths: [] };
const entry: ExternalDetail["entries"][number] = { id: "edit", text: "Edited activity-source.ts", path: "/repos/worker/activity-source.ts", patch: "+recorded",
  kind: "tool-call", attribution: "recorded-tool-event", at: "2026-09-08T12:00:00Z" };
const detail: ExternalDetail = { session, entries: [entry], handoff: "available", coverage: { tailBytes: 20, partial: false, omittedRecords: 0, message: "" } };
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); observer.listeners.clear(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); delete window.swarm; delete window.swarmLifecycle; });
function publish(next: Partial<ExternalClient>) { act(() => { observer.state = { ...observer.state!, ...next }; observer.listeners.forEach((listener) => listener()); }); }
async function setup(withLifecycle = false) {
  let snapshot = initialSnapshot(paymentsFileFocus), sequence = 0;
  let onEvent: (event: CoreEvent) => void = () => {};
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, snapshot };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") return { ...common, task: { kind: "snapshot", observation: taskObservationFixture() } };
    if (input.type === "file.read") return { ...common, file: { kind: "read", path: input.path, content: "local source\n", revision: "a".repeat(64), size: 13 } };
    if (input.type === "worktree.inspect") return { ...common, worktreeInspection: { sessionId: input.sessionId, path: input.path, label: session.label, worktree: session.worktree!, content: "registered source", diff: "" } };
    if (input.type === "workLog.read") return { ...common, workLog: { running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), notice: "", entries: [] } };
    return common;
  });
  const refresh = vi.fn(async () => {});
  observer.state = { selected: session.id, detail, fleet: [detail], snapshot: { status: "observed", sessions: [session], observedAt: session.observedAt, message: "" },
    busy: false, observing: true, notice: "", read: vi.fn(async () => {}), refresh, handoff: vi.fn(async () => {}) };
  window.swarm = { request, onEvent: (listener) => { onEvent = listener; return () => {}; } };
  let receiveStatus: (value: Lifecycle) => void = () => {};
  const lifecycle: Lifecycle = { revision: 1, core: { generation: 1, phase: "ready", message: "Ready" }, reload: "idle", notice: "" };
  if (withLifecycle) window.swarmLifecycle = { status: async () => lifecycle,
    onStatus: (listener) => { receiveStatus = listener; return () => {}; }, reload: async () => { throw new Error("No reload requested"); } };
  const view = render(<App />);
  await screen.findByRole("button", { name: "Select task task-fixture" });
  return { view, request, refresh, changeCore: () => act(() => receiveStatus({ ...lifecycle, revision: 2, core: { ...lifecycle.core, generation: 2 } })), changeWorld: () => act(() => {
    snapshot = { ...snapshot, world: { ...snapshot.world, id: "world:replacement" } };
    onEvent({ protocolVersion: PROTOCOL_VERSION, type: "workspace.changed", sequence: ++sequence, epoch: snapshot.reconciliation.epoch, emittedAt: session.observedAt, snapshot });
  }) };
}
const openOverview = () => fireEvent.click(within(document.querySelector(".dock-activity")! as HTMLElement).getByRole("button", { name: "Activity" }));
const activityPanel = () => within(screen.getByRole("region", { name: "Activity log" }));
const inspectDockEvent = () => fireEvent.click(within(document.querySelector(".dock-activity")! as HTMLElement).getByRole("button", { name: /Edited activity-source.ts/ }));

it("explicit event opens intact, while overview reopening and close/reopen restore the updating list", async () => {
  const { request, refresh } = await setup();
  inspectDockEvent();
  expect(activityPanel().getByRole("button", { name: "All activity" })).toBeTruthy();
  expect(activityPanel().getByText("+recorded")).toBeTruthy();
  openOverview();
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
  expect(activityPanel().getByRole("button", { name: "Refresh worker: Edited activity-source.ts" })).toBeTruthy();
  fireEvent.click(activityPanel().getByRole("button", { name: "Refresh activity" }));
  expect(refresh).toHaveBeenCalledTimes(1); expect(request.mock.calls.some(([input]) => input.type === "changelog.read")).toBe(false);
  inspectDockEvent();
  fireEvent.click(activityPanel().getByRole("button", { name: "Close logical changes" }));
  openOverview(); // With no source open, closing the sole document hides its tab strip.
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
});

it("client publications update central rows without clicks and preserve dirty source, composer, graphs and focus", async () => {
  const { request } = await setup();
  await openContextPath(paymentsFileFocus.path!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("local source"));
  const editorNode = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(editorNode)!;
  const graphs = screen.getAllByTestId("retained-graph");
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  openOverview();
  const composer = screen.getByRole("textbox", { name: "Message to Refresh worker" }) as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: "unsent steering" } }); composer.focus();
  const list = activityPanel().getByRole("list"); list.scrollTop = 31;
  publish({ fleet: [{ ...detail, entries: [entry, { ...entry, id: "next", text: "Ran bazel test", at: "2026-09-08T12:01:00Z", path: undefined, patch: undefined }] }] });
  expect(activityPanel().getByRole("button", { name: "Refresh worker: Ran bazel test" })).toBeTruthy();
  expect(document.activeElement).toBe(composer); expect(composer.value).toBe("unsent steering");
  expect(activityPanel().getByRole("list")).toBe(list); expect(list.scrollTop).toBe(31);
  expect(document.querySelector(".cm-editor")).toBe(editorNode); expect(editor.state.doc.toString()).toBe("dirty local source\n");
  expect(editor.state.selection.main.anchor).toBe(4); expect(screen.getAllByTestId("retained-graph")).toEqual(graphs);
  expect(request.mock.calls.some(([input]) => input.type === "file.write" || input.type === "externalAgents.send")).toBe(false);
  inspectDockEvent();
  fireEvent.click(activityPanel().getByRole("button", { name: "Close logical changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
});

it("a changed workspace identity cannot revive an old inspected event", async () => {
  const { changeWorld } = await setup(); inspectDockEvent();
  expect(activityPanel().getByRole("button", { name: "All activity" })).toBeTruthy();
  changeWorld();
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
});

it("core recovery discards the old event selection before current controls can use it", async () => {
  const { changeCore } = await setup(true); inspectDockEvent();
  expect(activityPanel().getByRole("button", { name: "All activity" })).toBeTruthy();
  changeCore();
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
});

it("the Activity subtab is an explicit overview action, without clearing a dock-selected event on opening", async () => {
  await setup(); inspectDockEvent();
  expect(activityPanel().getByRole("button", { name: "All activity" })).toBeTruthy();
  fireEvent.click(activityPanel().getByRole("button", { name: "Saved summaries" }));
  fireEvent.click(activityPanel().getByRole("button", { name: "Activity" }));
  expect(activityPanel().queryByRole("button", { name: "All activity" })).toBeNull();
  inspectDockEvent();
  expect(activityPanel().getByRole("button", { name: "All activity" })).toBeTruthy();
});
