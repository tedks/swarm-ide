// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { NAVIGATION_KEY, NavigationSchema } from "../app/renderer/recovery";

// This suite checks composition and retained real CodeMirror state. The domain
// owner separately proves real plan data/graphs; geometry is a packaged check.
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <section data-testid="retained-layout-graph"><input aria-label={`Camera ${graph.topologyId}`} defaultValue="pan 30,60 zoom 2" /></section> }));
vi.mock("../app/renderer/plans/PlanWorkspace", () => ({ PlanWorkspace: ({ visible, onOpenFile }: { visible: boolean; onOpenFile(path: string): void }) => <section className="planning-field" aria-label="Planning workspace" hidden={!visible}><button onClick={() => onOpenFile(paymentsFileFocus.path!)}>Open plan implementation</button></section> }));
import { App } from "../app/renderer/App";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.localStorage.clear(); delete window.swarm; delete window.swarmView; });

function bridge() {
  const snapshot = initialSnapshot(paymentsFileFocus);
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, snapshot, sequence: 1,
    ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: emptyAgentWorkbench().snapshot } } : {}),
    ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "source\n", revision: "a".repeat(64), size: 7 } } : {}),
  }));
  window.swarm = { request, onEvent: () => () => {} };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return request;
}

it("starts on one Plan home, retains Code access and removes empty/jargon chrome", async () => {
  bridge(); render(<App />);
  const lenses = await screen.findByRole("navigation", { name: "Workspace lenses" });
  expect(within(lenses).getAllByRole("button").map((node) => node.textContent)).toEqual(["Plan", "Code"]);
  expect(within(lenses).getByRole("button", { name: "Plan" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("region", { name: "Planning workspace" })).toBeTruthy();
  expect(screen.queryByText("Live workspace")).toBeNull();
  expect(document.querySelector(".global-truth")?.textContent).not.toMatch(/epoch|Reconciling/i);
  expect(screen.getByRole("region", { name: "Activity" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Recent activity" })).toBeNull();
});

it("keeps dirty source, cursor, graph instances and watches through Plan/Code and a same-file plan link", async () => {
  const request = bridge(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Open plan implementation" }));
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  const element = document.querySelector<HTMLElement>(".cm-editor")!, editor = EditorView.findFromDOM(element)!;
  const graphs = screen.getAllByTestId("retained-layout-graph");
  act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 4 } }));
  const before = request.mock.calls.length;
  const lenses = screen.getByRole("navigation", { name: "Workspace lenses" });
  fireEvent.click(within(lenses).getByRole("button", { name: "Plan" }));
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(true);
  fireEvent.click(within(lenses).getByRole("button", { name: "Code" }));
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  fireEvent.click(within(lenses).getByRole("button", { name: "Plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Open plan implementation" }));
  expect(document.querySelector(".cm-editor")).toBe(element);
  expect(editor.state.doc.toString()).toBe("dirty source\n");
  expect(editor.state.selection.main.anchor).toBe(4);
  expect(screen.getAllByTestId("retained-layout-graph")).toEqual(graphs);
  expect(request.mock.calls.slice(before).some(([input]) => input.type === "file.unwatch" || input.type === "file.write")).toBe(false);
});

it("migrates retired lenses without discarding saved paths/focus and honors restored Plan", async () => {
  const saved = { paths: [paymentsFileFocus.path!], activeSurface: paymentsFileFocus.path!, lens: "Refactor", focus: paymentsFileFocus };
  expect(NavigationSchema.parse(saved)).toEqual({ ...saved, lens: "Plan" });
  expect(NavigationSchema.parse({ ...saved, lens: "Performance" }).lens).toBe("Plan");
  expect(NavigationSchema.parse({ ...saved, lens: "System" }).lens).toBe("Code");
  window.sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(saved));
  bridge(); render(<App />);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe("source"));
  expect(screen.getByRole("region", { name: "Planning workspace" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace lenses" })).getByRole("button", { name: "Code" }));
  expect(document.querySelector<HTMLElement>(".source-surface")?.hidden).toBe(false);
  expect(document.querySelector(".cm-content")?.textContent).toBe("source");
});
