// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";
import type { SwarmBridge } from "../app/electron/preload";
import { initialSnapshot } from "../fixtures/world";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { TrustedSnapshotSchema, type TrustedSnapshot } from "../protocol/trusted-local";

const A = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const INSTANCE = "33333333-3333-4333-8333-333333333333", at = "2026-09-08T02:00:00.000Z";
const summary = (runToken: string, title: string) => ({ runToken, title, createdAt: at, updatedAt: at,
  status: "ready", archived: false, approvalCount: 0, taskReference: null, message: "Observed" });
const parent = (token = A): TrustedSnapshot => TrustedSnapshotSchema.parse({ instanceId: INSTANCE, profile: "trusted-local", workspace: "/repo",
  preparation: null, runToken: token, status: "ready", threadId: `thread:${token}`, turnId: `turn:${token}`,
  forkPoint: { threadId: `thread:${token}`, turnId: `turn:${token}` }, output: `Output ${token}`, message: "Ready", approvals: [], archived: false,
  runs: [summary(A, "Parent"), summary(OTHER, "Other")] });
function child(token: string): TrustedSnapshot {
  return TrustedSnapshotSchema.parse({ ...parent(token), runs: [...parent().runs!, { ...summary(token, "Child instructions"),
    fork: { parentRunToken: A, parentThreadId: `thread:${A}`, parentTurnId: `turn:${A}`, sharedWorkspace: true, inheritedTaskReference: null, confirmed: true } }] });
}
type Pending = { request: CoreRequest; settled: boolean; resolve: (value: CoreResponse) => void; reject: (error: Error) => void };
function harness() {
  const calls: Pending[] = [];
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: (request) => new Promise((resolve, reject) => calls.push({ request, resolve, reject, settled: false })) };
  const take = (type: CoreRequest["type"]) => {
    const call = calls.find((c) => !c.settled && c.request.type === type);
    if (!call) throw new Error(`Missing ${type}`); return call;
  };
  const answer = async (call: Pending, snapshot: TrustedSnapshot, sequence = 1) => {
    call.settled = true;
    await act(async () => call.resolve(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId, sequence,
      ok: true, snapshot: initialSnapshot(), trusted: { kind: "trusted", snapshot } })));
  };
  return { calls, bridge, take, answer };
}
async function mounted() {
  const h = harness(), view = render(<TrustedLocalPane bridge={h.bridge} draft={null} connected generation={1} />);
  await h.answer(h.take("trusted.snapshot"), parent());
  return { h, view };
}
function submit() {
  fireEvent.change(screen.getByRole("textbox", { name: "Child instructions" }), { target: { value: "Child instructions" } });
  fireEvent.click(screen.getByRole("button", { name: "Fork child conversation" }));
}
afterEach(cleanup);

describe("joined explicit fork cockpit", () => {
  it("dispatches the pinned parent, selects the child and can navigate back without clearing the parent's composer", async () => {
    const { h } = await mounted();
    fireEvent.change(screen.getByRole("textbox", { name: "Message Codex" }), { target: { value: "Unsent parent note" } });
    submit(); const call = h.take("trusted.fork");
    expect(call.request).toMatchObject({ token: A, expectedInstanceId: INSTANCE, expectedThreadId: `thread:${A}`, expectedTurnId: `turn:${A}`, text: "Child instructions", model: null });
    if (call.request.type !== "trusted.fork") throw new Error("fixture");
    await h.answer(call, child(call.request.childToken), 2);
    expect(screen.getByText(/Fork of Parent · shared workspace/)).toBeTruthy();
    expect(screen.getByLabelText("Codex conversation").textContent).toBe(`Output ${call.request.childToken}`);
    fireEvent.click(screen.getByRole("button", { name: "View parent" }));
    expect((screen.getByRole("textbox", { name: "Message Codex" }) as HTMLTextAreaElement).value).toBe("Unsent parent note");
    expect(h.calls.filter((c) => c.request.type === "trusted.send")).toHaveLength(0);
  });
  it("does not steal selection or another composer's draft when a fork acknowledges late", async () => {
    const { h } = await mounted(); submit(); const call = h.take("trusted.fork");
    fireEvent.click(screen.getByRole("button", { name: /^Other/ }));
    await h.answer(h.take("trusted.snapshot"), parent(OTHER), 2);
    fireEvent.change(screen.getByRole("textbox", { name: "Message Codex" }), { target: { value: "Other unsent" } });
    if (call.request.type !== "trusted.fork") throw new Error("fixture");
    await h.answer(call, child(call.request.childToken), 3);
    expect(screen.getByLabelText("Codex conversation").textContent).toBe(`Output ${OTHER}`);
    expect((screen.getByRole("textbox", { name: "Message Codex" }) as HTMLTextAreaElement).value).toBe("Other unsent");
  });
  it("retains instructions and locks replay when the bridge rejects the fork", async () => {
    const { h } = await mounted(); submit(); const call = h.take("trusted.fork");
    call.settled = true;
    await act(async () => call.resolve(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId,
      ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Admission unknown" } })));
    await waitFor(() => expect(screen.getByText(/Fork outcome unknown/)).toBeTruthy());
    expect((screen.getByRole("textbox", { name: "Child instructions" }) as HTMLTextAreaElement).value).toBe("Child instructions");
    fireEvent.click(screen.getByRole("button", { name: "Fork child conversation" }));
    expect(h.calls.filter((c) => c.request.type === "trusted.fork")).toHaveLength(1);
  });
  it("fences a late fork response across core generation changes", async () => {
    const { h, view } = await mounted(); submit(); const call = h.take("trusted.fork");
    view.rerender(<TrustedLocalPane bridge={h.bridge} draft={null} connected generation={2} />);
    const next = { ...parent(), instanceId: "44444444-4444-4444-8444-444444444444" };
    await h.answer(h.take("trusted.snapshot"), next, 1);
    if (call.request.type !== "trusted.fork") throw new Error("fixture");
    await h.answer(call, child(call.request.childToken), 99);
    expect(screen.getByLabelText("Codex conversation").textContent).toBe(`Output ${A}`);
    expect(screen.queryByRole("button", { name: /^Child instructions/ })).toBeNull();
  });
});
