// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSnapshotSchema, RunSchema, utf8Bytes } from "../protocol/agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { fixtureLaunchContext, fixturePreviewEnabled } from "../app/renderer/agents/client";
import { canPrepareFixture, emptyAgentWorkbench, fixtureReducer } from "../app/renderer/agents/state";
import { LaunchDraft } from "../app/renderer/agents/LaunchDraft";
import { RunPane } from "../app/renderer/agents/RunPane";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <section data-testid="agent-test-graph">{graph.title}<input aria-label={`Camera ${graph.topologyId}`} defaultValue="pan 30 zoom 2" /></section> }));
vi.mock("../app/renderer/EditorPane", () => ({ EditorPane: ({ content, onChange }: { content: string; onChange: (text: string) => void }) => <textarea aria-label="Source buffer" value={content} onChange={(e) => onChange(e.target.value)} /> }));
import { App } from "../app/renderer/App";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.localStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
const context = () => fixtureLaunchContext(paymentsFileFocus, "Explain interface failures", "", "");
const started = () => fixtureReducer(emptyAgentWorkbench(), { type: "launch", context: context() });
const advance = (state: ReturnType<typeof started>) => fixtureReducer(state, { type: "advance" });

describe("bounded schema-valid fixture playback", () => {
  it("requires development AND explicit opt-in and never reports available backend capabilities", () => {
    expect(fixturePreviewEnabled(false, "1")).toBe(false);
    expect(fixturePreviewEnabled(true, undefined)).toBe(false);
    expect(fixturePreviewEnabled(true, "1")).toBe(true);
    expect(started().snapshot.capabilities.availability).toBe("unavailable");
    expect(context().attachments).toEqual([]);
  });
  it("separates admission, two stream updates, final answer and process cleanup", () => {
    let state = started();
    expect(state.run?.state).toBe("starting");
    expect(state.run?.providerTurnId).toBeNull();
    state = advance(state);
    expect(state.run?.state).toBe("running");
    expect(state.run?.providerObservation).toBeNull();
    state = advance(state);
    expect(state.records.at(-1)?.text).toContain("stream 2/2");
    state = advance(state);
    expect(state.run?.state).toBe("completed");
    expect(state.run?.processState).toBe("live");
    expect(canPrepareFixture(state)).toBe(false);
    expect(state.snapshot.tail).toEqual([]);
    state = advance(state);
    expect(state.run?.processState).toBe("exited");
    expect(state.run?.state).toBe("completed");
    expect(canPrepareFixture(state)).toBe(true);
    expect(RunSchema.safeParse(state.run).success).toBe(true);
  });
  it.each(["accepted", "rejected", "delivery-unknown"] as const)("keeps %s steering inspectable without completing or replaying", (outcome) => {
    const before = advance(started());
    const next = fixtureReducer(before, { type: "steer", text: "Focus on interfaces", outcome });
    expect(next.run?.state).toBe("running");
    expect(next.run?.instructions[0]?.status).toBe(outcome);
    expect(next.run?.instructions[0]?.text).toBe("Focus on interfaces");
    expect(advance(next).run?.instructions).toHaveLength(1);
    expect(before.run?.instructions).toEqual([]);
  });
  it.each([false, true])("Stop is only a request until the next event; pre-dispatch=%s", (beforeDispatch) => {
    let state = beforeDispatch ? started() : advance(started());
    state = fixtureReducer(state, { type: "stop" });
    expect(state.run?.state).toBe("cancelling");
    expect(state.run?.endedAt).toBeNull();
    state = advance(state);
    expect(state.run?.state).toBe("cancelled");
    expect(state.run?.providerOutcome.kind).toBe(beforeDispatch ? "dispatch-prevented" : "turn");
    expect(canPrepareFixture(state)).toBe(beforeDispatch);
    expect(RunSchema.safeParse(state.run).success).toBe(true);
  });
  it("bounds transcript, instructions and multibyte labels, preserving explicit truncation", () => {
    let state = fixtureReducer(emptyAgentWorkbench(), { type: "launch", context: fixtureLaunchContext(paymentsFileFocus, "🌳".repeat(300), "", "") });
    state = advance(state);
    for (let i = 0; i < 140; i++) state = fixtureReducer(state, { type: "steer", text: "x", outcome: "accepted" });
    expect(state.records).toHaveLength(32);
    expect(state.run?.instructions).toHaveLength(128);
    expect(state.run?.transcript.truncated).toBe(true);
    expect(utf8Bytes(state.snapshot.runs[0]!.taskLabel)).toBeLessThanOrEqual(256);
    expect(AgentSnapshotSchema.safeParse(state.snapshot).success).toBe(true);
  });
  it("rejects empty and oversized instructions without mutation", () => {
    const state = advance(started());
    for (const text of ["   ", "🌳".repeat(5000)]) expect(fixtureReducer(state, { type: "steer", text, outcome: "accepted" })).toBe(state);
  });
});

describe("run-specific presentation", () => {
  it("freezes draft focus and discloses disk/no-bytes/provenance limits", () => {
    const onLaunch = vi.fn();
    const view = render(<LaunchDraft focus={paymentsFileFocus} onLaunch={onLaunch} onClose={() => undefined} />);
    view.rerender(<LaunchDraft focus={{ ...paymentsFileFocus, key: "changed", path: "changed.ts" }} onLaunch={onLaunch} onClose={() => undefined} />);
    expect(screen.getByText(/unsaved edits are not included/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Launch fixture — no provider" }));
    expect(onLaunch.mock.calls[0]![0].focus).toEqual(paymentsFileFocus);
    expect(onLaunch.mock.calls[0]![0].attachments).toEqual([]);
  });
  it("renders text safely, retains instruction after unknown delivery, and exposes keyboard resize", () => {
    let state = advance(started());
    state = { ...state, records: [{ ...state.records[0]!, text: "<img src=x onerror=alert(1)>" }] };
    const dispatch = vi.fn(); const onHeight = vi.fn(); const reveal = vi.fn();
    render(<RunPane state={state} dispatch={dispatch} onReveal={reveal} onClose={() => undefined} height={290} onHeight={onHeight} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Instruction to this run"), { target: { value: "Preserve this instruction" } });
    fireEvent.change(screen.getByLabelText("Fixture steering outcome"), { target: { value: "delivery-unknown" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to this run" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "steer", text: "Preserve this instruction", outcome: "delivery-unknown" });
    expect((screen.getByLabelText("Instruction to this run") as HTMLTextAreaElement).value).toBe("Preserve this instruction");
    fireEvent.change(screen.getByRole("slider", { name: "Run pane height" }), { target: { value: "330" } });
    expect(onHeight).toHaveBeenCalledWith(330);
    expect(reveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reveal launch focus" }));
    expect(reveal).toHaveBeenCalledWith(paymentsFileFocus);
  });
  it("keeps source buffer and graph instances through launch, selection, output and pane resizing", async () => {
    vi.stubEnv("VITE_SWARM_AGENT_DEMO", "1");
    const snapshot = initialSnapshot(paymentsFileFocus);
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId,
      ok: true, snapshot, sequence: 0, ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "disk source", revision: "a".repeat(64), size: 11 } } : {}) }));
    window.swarm = { request, onEvent: () => () => undefined };
    window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
    render(<App />);
    await screen.findByRole("button", { name: "Preview agent fixture" });
    fireEvent.click(screen.getAllByRole("button", { name: paymentsFileFocus.path! })[0]!);
    const source = await screen.findByLabelText("Source buffer");
    fireEvent.change(source, { target: { value: "UNSAVED PRIVATE BUFFER" } });
    const graph = screen.getAllByTestId("agent-test-graph")[0]!;
    const focusesBefore = request.mock.calls.filter(([r]) => r.type === "focus.select").length;
    fireEvent.click(screen.getByRole("button", { name: "Preview agent fixture" }));
    fireEvent.click(screen.getByRole("button", { name: "Launch fixture — no provider" }));
    fireEvent.click(screen.getByRole("button", { name: "Next fixture event" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "330" } });
    fireEvent.click(screen.getByRole("button", { name: "Close run pane" }));
    fireEvent.click(document.querySelector(".agent-run-select")!);
    await waitFor(() => expect(screen.getByLabelText("Source buffer")).toBe(source));
    expect((source as HTMLTextAreaElement).value).toBe("UNSAVED PRIVATE BUFFER");
    expect(screen.getAllByTestId("agent-test-graph")[0]).toBe(graph);
    expect(request.mock.calls.filter(([r]) => r.type === "focus.select")).toHaveLength(focusesBefore);
    expect(request.mock.calls.some(([r]) => r.type.startsWith("agent."))).toBe(false);
    expect(screen.getByRole("log").textContent).not.toContain("UNSAVED PRIVATE BUFFER");
    await act(async () => undefined);
  });
});
