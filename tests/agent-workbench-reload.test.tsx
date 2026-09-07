// @vitest-environment jsdom
import { openContextPath } from "./context-navigation";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import type { AgentClientMemory } from "../app/renderer/agents/client-memory";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import type { Lifecycle } from "../app/lifecycle";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type GraphSlice } from "../protocol/schema";
const harness = vi.hoisted(() => ({ memory: {} as AgentClientMemory, client: null as AgentBridgeClient | null }));
vi.mock("../app/renderer/agents/use-agent-workbench", async (original) => {
  const actual = await original<typeof import("../app/renderer/agents/use-agent-workbench")>();
  return { ...actual, useAgentWorkbench: () => {
    const result = actual.useAgentClient(window.swarm, window.swarmLifecycle, harness.memory);
    harness.client = result.client;
    return result;
  } };
});
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <section data-testid="reload-graph">{graph.title}</section> }));
vi.mock("../app/renderer/EditorPane", () => ({ EditorPane: ({ content, onChange }: { content: string; onChange: (text: string) => void }) => <textarea aria-label="Source buffer" value={content} onChange={(e) => onChange(e.target.value)} /> }));
import { App } from "../app/renderer/App";

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); harness.memory = {}; harness.client = null; delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
function shell() {
  let state: Lifecycle = { revision: 1, core: { generation: 1, phase: "ready", message: "Ready" }, reload: "idle", notice: "" };
  const listeners = new Set<(status: Lifecycle) => void>();
  const reload = vi.fn(async (_revision: number) => state);
  window.swarmLifecycle = { status: async () => state, onStatus: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, reload };
  const update = (patch: Partial<Lifecycle>) => act(() => { state = { ...state, ...patch, revision: state.revision + 1 }; for (const listener of listeners) listener(state); });
  const snapshot = initialSnapshot(paymentsFileFocus);
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (input.type.startsWith("agent.") && input.type !== "agent.snapshot") return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Fixture test: effective policy is unavailable" } };
    return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, snapshot, sequence: 1,
      ...(input.type === "agent.snapshot" ? { agent: { kind: "snapshot" as const, snapshot: emptyAgentWorkbench().snapshot } } : {}),
      ...(input.type === "file.read" ? { file: { kind: "read" as const, path: input.path, content: "disk", revision: "a".repeat(64), size: 4 } } : {}),
    };
  });
  window.swarm = { request, onEvent: () => () => undefined };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { update, reload, request };
}
async function openApp() {
  render(<StrictMode><App /></StrictMode>);
  await screen.findByRole("button", { name: "Ask an agent about this focus" });
  await waitFor(() => expect(harness.client?.getSnapshot().connected).toBe(true));
}
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  act(() => { window.dispatchEvent(event); });
  return event;
}
function draft() {
  fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
  fireEvent.change(screen.getByLabelText("Task"), { target: { value: "PRIVATE LOCAL DRAFT" } });
}
function options() { fireEvent.click(screen.getByText("Inspect local agent intent / refresh options")); }
function discard() { options(); fireEvent.click(screen.getByRole("button", { name: "Discard local agent intent and allow refresh" })); }

describe("agent intent at the actual document/preload refresh boundary", () => {
  it("keeps local recovery actions available even before a workspace snapshot can be loaded", async () => {
    harness.memory.state = { ...emptyLiveAgentState(), draft: { focus: paymentsFileFocus, task: "Preserved during remount", model: "", prepared: null, confirmed: false, preparing: false } };
    shell(); delete window.swarm;
    render(<StrictMode><App /></StrictMode>);
    expect(screen.getByText(/Opening the working world/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Local agent reload protection" }).textContent).toContain("Preserved during remount");
    expect(unload().defaultPrevented).toBe(true);
    discard();
    expect(unload().defaultPrevented).toBe(false);
  });
  it("defers manual and successive preload revisions for a launch draft without browser persistence or graph replacement", async () => {
    const h = shell(); await openApp(); const graphs = screen.getAllByTestId("reload-graph");
    draft();
    h.update({ reload: "pending" }); h.update({ reload: "pending" });
    expect(h.reload).not.toHaveBeenCalled();
    expect(unload().defaultPrevented).toBe(true);
    expect((screen.getByLabelText("Task") as HTMLTextAreaElement).value).toBe("PRIVATE LOCAL DRAFT");
    expect(screen.getAllByTestId("reload-graph")[0]).toBe(graphs[0]);
    expect(JSON.stringify(sessionStorage)).not.toContain("PRIVATE LOCAL DRAFT");
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE LOCAL DRAFT");
    discard();
    await waitFor(() => expect(h.reload).toHaveBeenCalledExactlyOnceWith(3));
    expect(unload().defaultPrevented).toBe(false);
    expect(h.request.mock.calls.some(([r]) => ["agent.launch", "agent.steer", "agent.cancel"].includes(r.type))).toBe(false);
  });

  it("discarding agent text never discards a dirty source buffer or bypasses its refresh guard", async () => {
    const h = shell(); await openApp();
    await openContextPath(paymentsFileFocus.path!);
    const source = await screen.findByLabelText("Source buffer");
    fireEvent.change(source, { target: { value: "PRIVATE SOURCE BUFFER" } });
    draft(); h.update({ reload: "pending" }); discard();
    expect(h.reload).not.toHaveBeenCalled();
    expect(unload().defaultPrevented).toBe(true);
    expect((screen.getByLabelText("Source buffer") as HTMLTextAreaElement).value).toBe("PRIVATE SOURCE BUFFER");
    expect(screen.getByLabelText("Source buffer")).toBe(source);
    fireEvent.change(source, { target: { value: "disk" } });
    await waitFor(() => expect(h.reload).toHaveBeenCalledOnce());
    expect(JSON.stringify(sessionStorage)).not.toMatch(/PRIVATE SOURCE|PRIVATE LOCAL/);
    expect(h.request.mock.calls.some(([r]) => r.type === "file.write")).toBe(false);
  });

  it("still defers safely after explicit discard if navigation storage throws, with no reload/veto loop", async () => {
    const h = shell(); await openApp(); draft(); h.update({ reload: "pending" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota denied"); });
    discard();
    await screen.findByText(/document checkpoint could not be stored/);
    expect(h.reload).not.toHaveBeenCalled();
    expect(unload().defaultPrevented).toBe(true);
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("vetoes intent inserted after preflight, then applies the latest pending revision only after a new explicit decision", async () => {
    const h = shell(); await openApp();
    let prevented: boolean | undefined;
    h.reload.mockImplementationOnce(async () => {
      // No React render/effect is allowed between the client mutation and unload.
      harness.client!.openDraft(paymentsFileFocus);
      harness.client!.editDraft({ task: "Arrived after preload preflight" });
      const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
      prevented = event.defaultPrevented;
      return { revision: 3, core: { generation: 1, phase: "ready", message: "Ready" }, reload: "pending", notice: "vetoed" };
    });
    h.update({ reload: "pending" });
    await waitFor(() => expect(prevented).toBe(true));
    h.update({ reload: "pending" });
    expect(h.reload).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Task") as HTMLTextAreaElement).value).toBe("Arrived after preload preflight");
    discard(); await waitFor(() => expect(h.reload).toHaveBeenLastCalledWith(3));
    expect(h.reload).toHaveBeenCalledTimes(2);
  });

  it("offers inspect/reconcile/discard for a hidden unknown receipt with an unavailable core, without selection or replay", async () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    harness.memory.state = { ...emptyLiveAgentState(), instructions: { [runId]: "Hidden text" }, operations: [
      { runId, requestId: "unknown-launch", kind: "launch", text: "Possible dispatch", status: "delivery-unknown", message: "Core lost before acknowledgement" },
    ] };
    const h = shell(); await openApp();
    expect(unload().defaultPrevented).toBe(true); options();
    const local = screen.getByRole("region", { name: "Local agent reload protection" });
    expect(local.textContent).toContain("Possible dispatch");
    fireEvent.click(screen.getByText(/launch · delivery-unknown/));
    fireEvent.click(screen.getByRole("button", { name: "Reconcile receipt unknown-launch" }));
    await waitFor(() => expect(h.request.mock.calls.some(([r]) => r.type === "agent.read" && r.runId === runId)).toBe(true));
    expect(harness.client!.getSnapshot().selectedRunId).toBeNull();
    expect(unload().defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear local agent drafts and instruction text" }));
    expect(unload().defaultPrevented).toBe(true); // An unresolved receipt needs separate loss consent.
    h.update({ core: { generation: 2, phase: "unavailable", message: "Core offline" } });
    expect((screen.getByRole("button", { name: "Reconcile receipt unknown-launch" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard local agent intent and allow refresh" }));
    expect(unload().defaultPrevented).toBe(false);
    expect(harness.client!.getSnapshot().operations[0]).toMatchObject({ status: "delivery-unknown", text: null, documentLossAcknowledged: true });
    expect(h.request.mock.calls.some(([r]) => ["agent.launch", "agent.steer", "agent.cancel", "focus.select"].includes(r.type))).toBe(false);
  });
});
