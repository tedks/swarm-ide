// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { taskObservationFixture, taskReadFixture } from "../fixtures/tasks";
import type { Lifecycle } from "../app/lifecycle";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { NAVIGATION_KEY, NavigationSchema } from "../app/renderer/recovery";
import { fixtureBuildObservation } from "./support/build-graph-fixture";
import type { ReactNode } from "react";

// This suite checks composition and retained real CodeMirror state. The domain
// owner separately proves real plan data/graphs; geometry is a packaged check.
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph, reframeVersion }: { graph: GraphSlice; reframeVersion: number }) => <section data-testid="retained-layout-graph" data-reframe={reframeVersion}><input aria-label={`Camera ${graph.topologyId}`} defaultValue="pan 30,60 zoom 2" /></section> }));
vi.mock("../app/renderer/plans/PlanWorkspace", () => ({ PlanWorkspace: ({ renderWorkspace, onOpenDesign, onOpenFile, onOpenBuild }: { renderWorkspace(parts: { components: ReactNode; document: ReactNode; tasks: ReactNode }): ReactNode; onOpenDesign(): void; onOpenFile(path: string): void; onOpenBuild(label: string): void }) => renderWorkspace({
  components: <section aria-label="Component design" data-testid="retained-layout-graph"><input aria-label="Camera components" defaultValue="component camera" /><button onClick={onOpenDesign}>Read design</button><button onClick={() => onOpenFile(paymentsFileFocus.path!)}>Open plan implementation</button><button onClick={() => onOpenBuild("//tools/policy:activation-test")}>Open plan build target</button><button onClick={() => onOpenBuild("//absent:unknown")}>Open missing target</button></section>,
  document: <article>Full readable design document</article>,
  tasks: <section data-testid="retained-layout-graph"><input aria-label="Camera tasks" defaultValue="task camera" /></section>,
}) }));
import { App } from "../app/renderer/App";

beforeAll(() => {
  // jsdom has no layout observer; actual geometry is proved in the owned app.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.localStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });

function bridge(withBuild = false) {
  const snapshot = initialSnapshot(paymentsFileFocus);
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, snapshot, sequence: 1,
    ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: emptyAgentWorkbench().snapshot } } : {}),
    ...(input.type === "tasks.snapshot" ? { task: { kind: "snapshot" as const, observation: taskObservationFixture() } } : {}),
    ...(input.type === "tasks.read" ? { task: taskReadFixture() } : {}),
    ...(withBuild && input.type === "buildGraph.observe" ? { buildGraph: fixtureBuildObservation(snapshot) } : {}),
    ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "source\n", revision: "a".repeat(64), size: 7 } } : {}),
  }));
  window.swarm = { request, onEvent: () => () => {} };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return request;
}

it("starts on four coordinated graphs without a Plan/Code mode switch", async () => {
  bridge(); render(<App />);
  const lenses = await screen.findByRole("navigation", { name: "Workspace navigation" });
  expect(within(lenses).getAllByRole("button").map((node) => node.textContent)).toEqual(["←", "→", "Workspace"]);
  expect(within(lenses).getByRole("button", { name: "Go back" }).hasAttribute("disabled")).toBe(true);
  expect(within(lenses).getByRole("button", { name: "Go forward" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getAllByTestId("retained-layout-graph")).toHaveLength(4);
  expect(document.querySelector(".graphs-grid")?.classList.contains("is-sidebar")).toBe(false);
  expect(screen.queryByText("Live workspace")).toBeNull();
  expect(document.querySelector(".global-truth")?.textContent).not.toMatch(/epoch|Reconciling/i);
  expect(screen.getByRole("region", { name: "Activity" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Recent activity" })).toBeNull();
});

it("pins an authored target to the current build graph and never guesses a missing BUILD file", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const request = bridge(true); render(<App />);
  await screen.findByText("Build graph current");
  fireEvent.click(screen.getByRole("button", { name: "Open plan build target" }));
  await waitFor(() => expect((screen.getByRole("combobox", { name: "Bazel target" }) as HTMLInputElement).value).toBe("//tools/policy:activation-test"));
  expect(screen.getByRole("region", { name: "Component design" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open missing target" }));
  await screen.findByText("This repository's current build graph does not contain //absent:unknown.");
  expect(request.mock.calls.some(([input]) => input.type === "file.read" || input.type === "file.write" || input.type === "reconciliation.start")).toBe(false);
});

it("resizes the outer dock by keyboard without replacing source or moving its cursor", async () => {
  bridge(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open plan implementation" }));
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  const element = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(element)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  const divider = screen.getByRole("separator", { name: "Resize plan and conversation" });
  expect(divider.getAttribute("aria-orientation")).toBe("horizontal");
  fireEvent.keyDown(divider, { key: "ArrowUp" });
  expect(divider.getAttribute("aria-valuenow")).toBe("33");
  expect((document.querySelector(".workbench") as HTMLElement).style.gridTemplateRows).toContain("33%");
  for (let i = 0; i < 40; i++) fireEvent.keyDown(divider, { key: "ArrowDown" });
  expect(divider.getAttribute("aria-valuenow")).toBe("22");
  fireEvent.keyDown(divider, { key: "Home" });
  expect(divider.getAttribute("aria-valuenow")).toBe("32");
  // At interface zoom the workbench's minimum height may exceed the viewport.
  // Pointer math and the assigned grid track must use that same container.
  const workbench = document.querySelector<HTMLElement>(".workbench")!;
  vi.spyOn(workbench, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 500));
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
  divider.setPointerCapture = vi.fn(); divider.releasePointerCapture = vi.fn();
  for (const [type, clientY] of [["pointerdown", 340], ["pointermove", 250], ["pointerup", 250]] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
    Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(divider, event);
  }
  expect(divider.getAttribute("aria-valuenow")).toBe("50");
  expect(workbench.style.gridTemplateRows).toBe("var(--topbar-height) minmax(0, 1fr) 50%");
  expect(document.querySelector(".cm-editor")).toBe(element);
  expect(editor.state.doc.toString()).toBe("dirty source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
});

it("observes build context on the unified home without starting a service build or requiring a graph click", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const request = bridge(); render(<App />);
  await waitFor(() => expect(request.mock.calls.some(([input]) => input.type === "buildGraph.observe" && !input.refresh)).toBe(true));
  expect(screen.getByRole("region", { name: "Component design" })).toBeTruthy();
  const before = request.mock.calls.filter(([input]) => input.type === "buildGraph.observe").length;
  fireEvent.click(screen.getByRole("button", { name: "Read design" }));
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(request.mock.calls.filter(([input]) => input.type === "buildGraph.observe")).toHaveLength(before);
  expect(request.mock.calls.some(([input]) => input.type === "reconciliation.start")).toBe(false);
  expect(screen.queryByRole("button", { name: /Build topology/ })).toBeNull();
  fireEvent.click(screen.getByText("⋯"));
  expect(document.querySelector(".topology-actions button")?.textContent).toBe("Refresh dependencies");
});

it("keeps all four graphs, dirty source, cursor and watches through home, design and file navigation", async () => {
  const request = bridge(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open plan implementation" }));
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  const element = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(element)!;
  const graphs = screen.getAllByTestId("retained-layout-graph");
  expect(graphs).toHaveLength(4);
  const camera = screen.getByRole("textbox", { name: "Camera components" }) as HTMLInputElement;
  fireEvent.change(camera, { target: { value: "user pan" } });
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  const before = request.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Read design" }));
  expect(screen.getByRole("region", { name: "Design reading area" }).textContent).toContain("Full readable design document");
  expect(document.querySelector(".graphs-grid")?.classList.contains("is-sidebar")).toBe(true);
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(true);
  fireEvent.click(document.querySelector('.surface-tab-main[title]')!);
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(document.querySelector(".graphs-grid")?.classList.contains("is-sidebar")).toBe(false);
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(true);
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(document.querySelector(".cm-editor")).toBe(element);
  fireEvent.click(screen.getByRole("button", { name: "Open plan implementation" }));
  expect(document.querySelector(".cm-editor")).toBe(element);
  expect(editor.state.doc.toString()).toBe("dirty source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-layout-graph")).toEqual(graphs);
  expect(camera.value).toBe("user pan");
  expect(graphs.map((node) => node.getAttribute("data-reframe"))).toEqual([null, null, "0", "0"]);
  expect(request.mock.calls.slice(before).some(([input]) => input.type === "file.unwatch" || input.type === "file.write")).toBe(false);
});

it("returns from a task to its retained source after visiting the overview", async () => {
  bridge(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open plan implementation" }));
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  const element = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(element)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  fireEvent.click(screen.getByRole("button", { name: "Select task task-fixture" }));
  await screen.findByRole("region", { name: "Task document" });
  fireEvent.click(screen.getByRole("button", { name: "Return to source" }));
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  expect(document.querySelector(".cm-editor")).toBe(element);
  expect(editor.state.doc.toString()).toBe("dirty source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
});

it("migrates every old lens without discarding saved paths/focus or hiding graphs", async () => {
  const saved = { paths: [paymentsFileFocus.path!], activeSurface: paymentsFileFocus.path!, lens: "Refactor", focus: paymentsFileFocus };
  expect(NavigationSchema.parse(saved)).toEqual({ ...saved, lens: "Workspace" });
  for (const lens of ["Plan", "Code", "Performance", "System", "Refactor"]) expect(NavigationSchema.parse({ ...saved, lens }).lens).toBe("Workspace");
  window.sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(saved));
  bridge(); render(<App />);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  expect(screen.getAllByTestId("retained-layout-graph")).toHaveLength(4);
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  expect(document.querySelector(".cm-content")?.textContent).toBe("source");
});

it("does not reframe retained graphs when returning to a task-only document", async () => {
  bridge(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select task task-fixture" }));
  await screen.findByRole("region", { name: "Task document" });
  expect(document.querySelector(".cm-editor")).toBeNull();
  const graphs = screen.getAllByTestId("retained-layout-graph");
  const reframe = graphs.map((node) => node.getAttribute("data-reframe"));
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(screen.queryByRole("region", { name: "Task document" })).toBeNull();
  fireEvent.click(document.querySelector('.surface-tab-main[title="task-fixture"]')!);
  expect(screen.getByRole("region", { name: "Task document" })).toBeTruthy();
  expect(screen.getAllByTestId("retained-layout-graph")).toEqual(graphs);
  expect(graphs.map((node) => node.getAttribute("data-reframe"))).toEqual(reframe);
});

it("restores files without overriding a design-reading choice made while reconnecting", async () => {
  const saved = { paths: [paymentsFileFocus.path!], activeSurface: paymentsFileFocus.path!, lens: "System", focus: paymentsFileFocus, snapshot: initialSnapshot(paymentsFileFocus) };
  window.sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(saved));
  const request = bridge();
  let receive!: (value: Lifecycle) => void;
  let status: Lifecycle = { revision: 1, core: { generation: 1, phase: "starting", message: "Starting" }, reload: "idle", notice: "" };
  window.swarmLifecycle = { status: async () => status, onStatus: (listener) => { receive = listener; return () => {}; }, reload: async () => status };
  render(<App />);
  await screen.findByRole("navigation", { name: "Workspace navigation" });
  await waitFor(() => expect(receive).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Read design" }));
  await act(async () => { status = { ...status, revision: 2, core: { ...status.core, phase: "ready", message: "" } }; receive(status); });
  await waitFor(() => expect(request.mock.calls.some(([input]) => input.type === "file.read" && input.path === paymentsFileFocus.path)).toBe(true));
  expect(screen.getByRole("region", { name: "Design reading area" })).toBeTruthy();
  fireEvent.click(document.querySelector('.surface-tab-main[title]')!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
});
