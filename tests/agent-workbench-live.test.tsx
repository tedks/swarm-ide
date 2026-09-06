// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_LIMITS, AgentSnapshotSchema, PreparedAgentContextSchema } from "../protocol/agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { fixtureLaunchContext } from "../app/renderer/agents/client";
import { emptyAgentWorkbench, fixtureReducer } from "../app/renderer/agents/state";
import { emptyLiveAgentState, type LiveAgentState } from "../app/renderer/agents/live-state";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { LiveRunPane } from "../app/renderer/agents/LiveRunPane";
import { PreparedLaunchDraft } from "../app/renderer/agents/PreparedLaunchDraft";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <section data-testid="live-graph">{graph.title}<input aria-label={`Camera ${graph.topologyId}`} defaultValue="pan 20 zoom 2" /></section> }));
vi.mock("../app/renderer/EditorPane", () => ({ EditorPane: ({ content, onChange }: { content: string; onChange: (text: string) => void }) => <textarea aria-label="Source buffer" value={content} onChange={(e) => onChange(e.target.value)} /> }));
import { App } from "../app/renderer/App";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
const fixture = () => fixtureReducer(fixtureReducer(emptyAgentWorkbench(), { type: "launch", context: fixtureLaunchContext(paymentsFileFocus, "Explain failures", "requested-model", "") }), { type: "advance" });
const available = { availability: "available" as const, provider: "fixture", version: "test", reason: null, policy: "verified-read-only" as const, controls: { launch: true, steer: true, cancel: true } };
function runningState(): LiveAgentState {
  const f = fixture();
  return { ...emptyLiveAgentState(), snapshot: AgentSnapshotSchema.parse({ ...f.snapshot, capabilities: available }),
    connected: true, selectedRunId: f.run!.runId, paneOpen: true, run: f.run, records: f.records, detailStale: false };
}
const callbacks = () => ({ onInstruction: vi.fn(), onSteer: vi.fn(), onStop: vi.fn(), onRead: vi.fn(), onReveal: vi.fn(), onClose: vi.fn(), onHeight: vi.fn() });

describe("live workbench presentation", () => {
  it("shows actual unavailable diagnostics, keeps source/graphs mounted, and prepares disk-only text on explicit gesture", async () => {
    const snapshot = initialSnapshot(paymentsFileFocus);
    const agentSnapshot = emptyAgentWorkbench().snapshot;
    agentSnapshot.capabilities.reason = { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Effective hooks and MCP policy cannot be attested." };
    const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
      if (input.type === "agent.prepare") return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: agentSnapshot.capabilities.reason! };
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, snapshot, sequence: 1,
        ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: agentSnapshot } } : {}),
        ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "disk", revision: "a".repeat(64), size: 4 } } : {}) };
    });
    window.swarm = { request, onEvent: () => () => undefined };
    window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
    render(<App />);
    await screen.findByText(/ADAPTER_POLICY_UNAVAILABLE: Effective hooks/);
    expect(screen.queryByText("Preview agent fixture")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: paymentsFileFocus.path! })[0]!);
    const source = await screen.findByLabelText("Source buffer");
    const graph = screen.getAllByTestId("live-graph")[0];
    fireEvent.change(source, { target: { value: "PRIVATE UNSAVED BUFFER" } });
    const focuses = request.mock.calls.filter(([r]) => r.type === "focus.select").length;
    fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
    expect(screen.getByText(/Unsaved or unresolved buffers:/)).toBeTruthy();
    expect((screen.getByLabelText("Requested reasoning") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Prepare disk context" }));
    await waitFor(() => expect(request.mock.calls.some(([r]) => r.type === "agent.prepare")).toBe(true));
    const prepare = request.mock.calls.find(([r]) => r.type === "agent.prepare")![0];
    expect(JSON.stringify(prepare)).not.toContain("PRIVATE UNSAVED BUFFER");
    expect(prepare).toMatchObject({ effort: null, focus: expect.objectContaining({ path: paymentsFileFocus.path }) });
    expect(screen.getByLabelText("Source buffer")).toBe(source);
    expect(screen.getAllByTestId("live-graph")[0]).toBe(graph);
    expect(request.mock.calls.filter(([r]) => r.type === "focus.select")).toHaveLength(focuses);
    expect(request.mock.calls.some(([r]) => r.type === "agent.launch")).toBe(false);
  });

  it("requires context inspection and honestly disables unsupported reasoning", () => {
    const state = runningState();
    const context = state.run!.launchContext;
    const prepared = PreparedAgentContextSchema.parse({ runId: state.run!.runId, contextHash: context.contextHash,
      preparedAt: "2026-09-06T00:00:00.000Z", expiresAt: "2026-09-06T00:05:00.000Z", launchContext: context, capabilities: available });
    state.draft = { focus: paymentsFileFocus, task: context.taskText, model: "requested-model", prepared, preparing: false, confirmed: false };
    state.snapshot = AgentSnapshotSchema.parse({ runs: [], activeRunId: null, tail: [], capabilities: available });
    const client = new AgentBridgeClient();
    const view = render(<PreparedLaunchDraft state={state} client={client} dirtyPaths={[]} />);
    expect((screen.getByRole("button", { name: "Launch read-only run" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Requested reasoning") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/not a frozen filesystem/)).toBeTruthy();
    expect(screen.getByText(/not a host confidentiality sandbox/)).toBeTruthy();
    view.rerender(<PreparedLaunchDraft state={{ ...state, draft: { ...state.draft, confirmed: true } }} client={client} dirtyPaths={[]} />);
    expect((screen.getByRole("button", { name: "Launch read-only run" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("selection is inert, explicit Reveal navigates, and output/control characters remain plaintext", () => {
    const state = runningState();
    state.records = [{ ...state.records[0]!, text: "<img src=x onerror=alert(1)>\u202ehello" }];
    const props = callbacks();
    render(<LiveRunPane state={state} {...props} currentFingerprint="new" />);
    expect(props.onReveal).not.toHaveBeenCalled();
    expect(screen.getByRole("log", { name: "Agent transcript" }).textContent).toContain("<img src=x onerror=alert(1)>\\u{202e}hello");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/World advanced since launch/)).toBeTruthy();
    expect(screen.getByText(/Observed model: unobserved/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reveal launch focus" }));
    expect(props.onReveal).toHaveBeenCalledWith(paymentsFileFocus);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it.each(["pending", "delivery-unknown", "accepted"] as const)("does not confuse %s Stop acknowledgement with cleanup", (status) => {
    const state = runningState();
    state.operations = [{ kind: "cancel", requestId: "cancel-1", runId: state.run!.runId, text: null, status, message: "Stop transport evidence only" }];
    state.instructions[state.run!.runId] = "Retained instruction";
    render(<LiveRunPane state={state} {...callbacks()} />);
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send to this run" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Turn: running · process: live · cleanup: pending/)).toBeTruthy();
  });

  it("keeps failed/unknown instruction bytes inspectable even before run detail is available", () => {
    const state = runningState();
    state.operations = [{ kind: "steer", requestId: "steer-1", runId: state.run!.runId, text: "Never lose this", status: "delivery-unknown", message: "CORE_TIMEOUT" }];
    state.run = null;
    state.connected = false;
    state.instructions[state.selectedRunId!] = "Unsent next thought";
    render(<LiveRunPane state={state} {...callbacks()} />);
    expect(screen.getByRole("region", { name: "Instruction receipts" }).textContent).toContain("Never lose this");
    expect((screen.getByLabelText("Instruction to this run") as HTMLTextAreaElement).value).toBe("Unsent next thought");
    expect((screen.getByRole("button", { name: "Send to this run" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pages explicitly with gaps and does not render the wrong selected run", () => {
    const state = runningState(); const props = callbacks();
    state.run!.transcript = { lastRecord: 20, bytes: 100, truncated: true, tailMayBeLost: true };
    state.pageCursor = 10; state.pageTruncated = true;
    state.records = [4, 10].map((recordId) => ({ ...state.records[0]!, recordId, text: `record ${recordId}` }));
    const view = render(<LiveRunPane state={state} {...props} />);
    expect(screen.getByText(/Record gap: 5–9/)).toBeTruthy();
    expect(screen.getByText(/tail may have been lost/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read next transcript page" }));
    expect(props.onRead).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole("button", { name: "Read transcript from start" }));
    expect(props.onRead).toHaveBeenCalledWith(true);
    view.rerender(<LiveRunPane state={{ ...state, selectedRunId: "22222222-2222-4222-8222-222222222222" }} {...props} />);
    expect(screen.queryByText("record 4")).toBeNull();
    expect((screen.getByRole("button", { name: "Reveal launch focus" }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.records.length).toBeLessThan(AGENT_LIMITS.pageRecords);
  });
});
