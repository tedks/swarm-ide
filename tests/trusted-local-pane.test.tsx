// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import type { SwarmBridge } from "../app/electron/preload";
import type { TrustedSnapshot } from "../protocol/trusted-local";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { LiveAgentState } from "../app/renderer/agents/live-state";

const token = "11111111-1111-4111-8111-111111111111";
const fresh = (): TrustedSnapshot => ({ instanceId: "22222222-2222-4222-8222-222222222222", profile: "trusted-local", workspace: "/fixed/repository",
  preparation: null, runToken: null, status: "idle", output: "", threadId: null, turnId: null, approvals: [], message: "No turn started" });
const draft = (): LiveAgentState["draft"] => ({ focus: { ...paymentsFileFocus, key: "file:services/payments/src/service.ts" }, task: "Inspect fixed source", model: "", prepared: null, confirmed: false, preparing: false });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function harness() {
  let state = fresh(), seq = 0;
  const calls: CoreRequest[] = [];
  let failReads = 0, unknownLaunch = false;
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: vi.fn(async (request): Promise<CoreResponse> => {
    calls.push(request);
    if (request.type === "trusted.snapshot" && failReads-- > 0) throw new Error("Transient observation failure");
    if (request.type === "trusted.prepare") state = { ...fresh(), preparation: { token, prompt: JSON.stringify(request.input), expiresAt: "2099-01-01T00:00:00.000Z", model: null } };
    if (request.type === "trusted.launch") {
      if (unknownLaunch) return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Launch acknowledgement unavailable" } };
      state = { ...state, preparation: null, runToken: token, status: "running", output: "A real-shaped controlled response" };
    }
    if (request.type === "trusted.stop") state = { ...state, status: "closed" };
    if (request.type === "trusted.decide") state = { ...state, approvals: [] };
    return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: ++seq, snapshot: initialSnapshot(), trusted: { kind: "trusted", snapshot: structuredClone(state) } };
  }) };
  return { bridge, calls, get state() { return state; }, set state(v) { state = v; }, set failReads(n: number) { failReads = n; }, set unknownLaunch(v: boolean) { unknownLaunch = v; } };
}
async function prepare() {
  fireEvent.click(screen.getByRole("button", { name: "Prepare trusted-local context" }));
  await screen.findByRole("checkbox", { name: /Launch in this workspace/ });
}
describe("trusted-local deliberate UI", () => {
  it("never launches on mount, requires confirmation and invalidates changed draft review", async () => {
    const h = harness(), d = draft()!;
    const v = render(<TrustedLocalPane bridge={h.bridge} draft={d} connected />);
    await screen.findByText("Workspace: /fixed/repository");
    expect(h.calls.every((r) => r.type === "trusted.snapshot")).toBe(true);
    await prepare();
    expect((screen.getByRole("button", { name: "Launch trusted-local Codex" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    v.rerender(<TrustedLocalPane bridge={h.bridge} draft={{ ...d, task: "Changed instructions" }} connected />);
    expect(screen.queryByRole("button", { name: "Launch trusted-local Codex" })).toBeNull();
    expect(h.calls.some((r) => r.type === "trusted.launch")).toBe(false);
  });
  it("coalesces a rapid double click and only answers an approval after explicit click", async () => {
    const h = harness(); render(<TrustedLocalPane bridge={h.bridge} draft={draft()} connected />);
    await prepare(); fireEvent.click(screen.getByRole("checkbox"));
    const launch = screen.getByRole("button", { name: "Launch trusted-local Codex" });
    fireEvent.click(launch); fireEvent.click(launch);
    await screen.findByRole("button", { name: "Stop conversation" });
    expect(h.calls.filter((r) => r.type === "trusted.launch")).toHaveLength(1);
    h.state = { ...h.state, approvals: [{ id: "number:42", method: "item/commandExecution/requestApproval", summary: "cwd /fixed/repository\nRun command: pwd", choices: ["accept", "decline"] }] };
    await screen.findByRole("button", { name: "Allow once" }, { timeout: 1800 });
    expect(h.calls.some((r) => r.type === "trusted.decide")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    await waitFor(() => expect(h.calls.filter((r) => r.type === "trusted.decide")).toHaveLength(1));
  });
  it("keeps read-only reconciliation after uncertain launch and transient observation failure, without replay", async () => {
    const h = harness(); h.unknownLaunch = true;
    render(<TrustedLocalPane bridge={h.bridge} draft={draft()} connected />);
    await prepare(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Launch trusted-local Codex" }));
    await screen.findByText("Launch acknowledgement unavailable");
    h.failReads = 1;
    h.state = { ...h.state, preparation: null, runToken: token, status: "running", output: "Late launch is now observed" };
    await screen.findByText("Late launch is now observed", {}, { timeout: 3000 });
    expect(h.calls.filter((r) => r.type === "trusted.launch")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop conversation" }));
    await waitFor(() => expect(h.calls.filter((r) => r.type === "trusted.stop")).toHaveLength(1));
  });
  it("renderer remount observes an active conversation but never dispatches a turn", async () => {
    const h = harness(); h.state = { ...h.state, runToken: token, status: "ready", output: "Retained core conversation" };
    const v = render(<TrustedLocalPane bridge={h.bridge} draft={null} connected generation={1} />);
    await screen.findByText("Retained core conversation");
    v.unmount(); render(<TrustedLocalPane bridge={h.bridge} draft={null} connected generation={1} />);
    await screen.findByText("Retained core conversation");
    expect(h.calls.every((r) => r.type === "trusted.snapshot")).toBe(true);
    await act(async () => {});
  });
});
