// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";

// Keep the real CodeMirror instance. Only graph rendering is substituted: these
// tests prove mounted identity/state, not browser layout or React Flow geometry.
vi.mock("../app/renderer/GraphPane", () => ({
  GraphPane: ({ graph }: { graph: GraphSlice }) => <section data-testid="compact-graph">
    {graph.title}<input aria-label={`Camera ${graph.topologyId}`} defaultValue="pan 30,60 zoom 2" />
  </section>,
}));
import { App } from "../app/renderer/App";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  delete window.swarm;
  delete window.swarmView;
  delete window.swarmLifecycle;
});

function bridge() {
  const snapshot = initialSnapshot(paymentsFileFocus);
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (input.type.startsWith("agent.") && input.type !== "agent.snapshot") {
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false,
        error: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Compact layout test: no live provider" } };
    }
    return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, snapshot, sequence: 1,
      ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: emptyAgentWorkbench().snapshot } } : {}),
      ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "disk source\n", revision: "a".repeat(64), size: 12 } } : {}),
    };
  });
  window.swarm = { request, onEvent: () => () => undefined };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return request;
}
async function open() {
  const request = bridge();
  render(<App />);
  await screen.findByRole("button", { name: "Toggle work panel" });
  return request;
}
async function source() {
  fireEvent.click(screen.getAllByRole("button", { name: paymentsFileFocus.path! })[0]!);
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("disk source"));
  return EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
}
function toggle(panel: "work" | "information") {
  fireEvent.click(screen.getByRole("button", { name: `Toggle ${panel} panel` }));
}
function selectedPanel() { return document.querySelector("main.workbench")?.getAttribute("data-compact-panel"); }
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  act(() => { window.dispatchEvent(event); });
  return event;
}

describe("compact workbench presentation boundaries", () => {
  it("uses named native toggles and persistent panel targets, with one explicit compact selection", async () => {
    const request = await open();
    const work = screen.getByRole("button", { name: "Toggle work panel" });
    const information = screen.getByRole("button", { name: "Toggle information panel" });
    const rail = document.getElementById("work-panel");
    const instruments = document.getElementById("information-panel");
    const graphs = screen.getAllByTestId("compact-graph");
    const callsBefore = request.mock.calls.length;
    expect(rail?.tagName).toBe("ASIDE");
    expect(instruments?.tagName).toBe("ASIDE");
    expect(work.getAttribute("aria-controls")).toBe("work-panel");
    expect(information.getAttribute("aria-controls")).toBe("information-panel");
    expect(selectedPanel()).toBe("none");
    expect(work.getAttribute("aria-expanded")).toBe("false");
    expect(information.getAttribute("aria-expanded")).toBe("false");
    const activity = screen.getByLabelText("Build jobs and recent activity");
    expect(activity.tabIndex).toBe(0);
    activity.focus();
    expect(document.activeElement).toBe(activity);
    work.focus();
    expect(document.activeElement).toBe(work);
    toggle("work");
    expect(selectedPanel()).toBe("work");
    expect(work.getAttribute("aria-expanded")).toBe("true");
    toggle("information");
    expect(selectedPanel()).toBe("info");
    expect(work.getAttribute("aria-expanded")).toBe("false");
    expect(information.getAttribute("aria-expanded")).toBe("true");
    toggle("information");
    expect(selectedPanel()).toBe("none");
    expect(document.getElementById("work-panel")).toBe(rail);
    expect(document.getElementById("information-panel")).toBe(instruments);
    expect(screen.getAllByTestId("compact-graph")).toEqual(graphs);
    expect(request.mock.calls.slice(callsBefore)).toEqual([]);
  });

  it("preserves the actual edited CodeMirror, selection and graph camera inputs through panel and resize changes", async () => {
    const request = await open();
    const editor = await source();
    const graphs = screen.getAllByTestId("compact-graph");
    const camera = screen.getByRole("textbox", { name: "Camera repo" }) as HTMLInputElement;
    fireEvent.change(camera, { target: { value: "user pan 901,-72 zoom 1.7" } });
    act(() => editor.dispatch({ changes: { from: 0, insert: "PRIVATE UNSAVED SOURCE\n" }, selection: { anchor: 8 } }));
    const callsBefore = request.mock.calls.length;
    for (const panel of ["work", "information", "information", "work"] as const) {
      toggle(panel);
      act(() => { window.dispatchEvent(new Event("resize")); });
      expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
      expect(editor.state.doc.toString()).toBe("PRIVATE UNSAVED SOURCE\ndisk source\n");
      expect(editor.state.selection.main.anchor).toBe(8);
      expect(screen.getAllByTestId("compact-graph")).toEqual(graphs);
      expect(screen.getByRole("textbox", { name: "Camera repo" })).toBe(camera);
      expect(camera.value).toBe("user pan 901,-72 zoom 1.7");
    }
    expect(request.mock.calls.slice(callsBefore).some(([input]) => input.type === "focus.select" || input.type === "file.write")).toBe(false);
    expect(unload().defaultPrevented).toBe(true);
    expect(JSON.stringify(sessionStorage)).not.toContain("PRIVATE UNSAVED SOURCE");
  });

  it("explicitly reveals Work for a real launch draft and keeps its text and reload veto while inspecting Information", async () => {
    const request = await open();
    toggle("information");
    fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
    expect(selectedPanel()).toBe("work");
    const task = screen.getByLabelText("Task") as HTMLTextAreaElement;
    const model = screen.getByLabelText("Requested model") as HTMLInputElement;
    fireEvent.change(task, { target: { value: "PRIVATE FIXED-FOCUS DRAFT" } });
    fireEvent.change(model, { target: { value: "requested-model-only" } });
    const callsBefore = request.mock.calls.length;
    toggle("information");
    expect(selectedPanel()).toBe("info");
    expect(unload().defaultPrevented).toBe(true);
    toggle("work");
    expect(screen.getByLabelText("Task")).toBe(task);
    expect(screen.getByLabelText("Requested model")).toBe(model);
    expect(task.value).toBe("PRIVATE FIXED-FOCUS DRAFT");
    expect(model.value).toBe("requested-model-only");
    expect(request.mock.calls.slice(callsBefore)).toEqual([]);
    expect(JSON.stringify(sessionStorage)).not.toContain("PRIVATE FIXED-FOCUS DRAFT");
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE FIXED-FOCUS DRAFT");
    expect(document.title).toContain("Topology");
  });

  it("keeps fixture run selection, unsent instructions, editor and graphs while changing compact panels and dock extremes", async () => {
    vi.stubEnv("VITE_SWARM_AGENT_DEMO", "1");
    const request = await open();
    const editor = await source();
    const graphs = screen.getAllByTestId("compact-graph");
    toggle("information");
    fireEvent.click(screen.getByRole("button", { name: "Preview agent fixture" }));
    expect(selectedPanel()).toBe("work");
    fireEvent.click(screen.getByRole("button", { name: "Launch fixture — no provider" }));
    fireEvent.click(screen.getByRole("button", { name: "Next fixture event" }));
    const instruction = screen.getByLabelText("Instruction to this run") as HTMLTextAreaElement;
    fireEvent.change(instruction, { target: { value: "Unsent fixture instruction" } });
    const run = screen.getByRole("region", { name: "Selected agent run" });
    const slider = screen.getByRole("slider", { name: "Run pane height" }) as HTMLInputElement;
    const output = screen.getByLabelText("Agent output");
    const heading = run.querySelector<HTMLElement>(".agent-pane-header strong")!;
    const activity = screen.getByLabelText("Build and activity summary");
    // Bounded scrolling regions and overflowed headings must remain native
    // keyboard focus targets. Actual scroll geometry is a virtual-X11 gate.
    for (const target of [output, heading, activity]) {
      expect(target.tabIndex).toBe(0);
      target.focus();
      expect(document.activeElement).toBe(target);
    }
    const callsBefore = request.mock.calls.length;
    for (const value of [slider.min, slider.max]) {
      fireEvent.change(slider, { target: { value } });
      toggle("information"); toggle("work");
      act(() => { window.dispatchEvent(new Event("resize")); });
      // The upper endpoint stays above the 160px lower endpoint even when
      // 40vh falls below it, so growing the slider cannot shrink the dock.
      expect(document.querySelector<HTMLElement>("main.workbench")!.style.gridTemplateRows).toContain("clamp(180px, 40vh, 448px)");
      expect(screen.getByRole("region", { name: "Selected agent run" })).toBe(run);
      expect(screen.getByLabelText("Instruction to this run")).toBe(instruction);
      expect(instruction.value).toBe("Unsent fixture instruction");
      expect(EditorView.findFromDOM(document.querySelector(".cm-editor")!)).toBe(editor);
      expect(screen.getAllByTestId("compact-graph")).toEqual(graphs);
      expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.getByRole("log", { name: "Fixture transcript" }).textContent).not.toContain("Unsent fixture instruction");
    expect(request.mock.calls.slice(callsBefore)).toEqual([]);
    expect(request.mock.calls.some(([input]) => ["agent.launch", "agent.steer", "agent.cancel", "file.write"].includes(input.type))).toBe(false);
  });
});
