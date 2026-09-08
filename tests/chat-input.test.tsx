// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionSteering } from "../app/renderer/external-agents/SessionSteering";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";
import type { SwarmBridge } from "../app/electron/preload";
import type { ExternalDetail } from "../protocol/external-agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { TrustedSnapshotSchema } from "../protocol/trusted-local";
import { initialSnapshot } from "../fixtures/world";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const detail = (id = A): ExternalDetail => ({ session: { id, label: id === A ? "First" : "Second", evidence: "local", status: "observed",
  parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T13:00:00.000Z", message: "Observed", contextPaths: [] },
  entries: [], handoff: "available", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "Empty" } });
const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const edit = (text: string) => fireEvent.change(textarea(), { target: { value: text } });
const enter = (extra = {}) => fireEvent.keyDown(textarea(), { key: "Enter", code: "Enter", ...extra });
function external() {
  const calls: { input: CoreRequest; resolve: (value: CoreResponse) => void }[] = [];
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: (input) => new Promise((resolve) => calls.push({ input, resolve })) };
  const view = render(<SessionSteering detail={detail()} bridge={bridge} />);
  const answer = async (status: "queued" | "delivery-unknown") => {
    await act(async () => calls[0].resolve({ protocolVersion: PROTOCOL_VERSION, requestId: calls[0].input.requestId,
      ok: true, sequence: 1, snapshot: initialSnapshot(), external: { kind: "send", sessionId: A, receiptId: B, status, message: status } }));
  };
  return { calls, view, bridge, answer };
}

describe("registered chat Enter behavior", () => {
  it("sends once through the existing form and attributes late outcomes to the submitted session", async () => {
    const h = external(); edit("First instruction");
    expect(enter()).toBe(false);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].input).toMatchObject({ type: "externalAgents.send", sessionId: A, text: "First instruction" });
    enter(); expect(h.calls).toHaveLength(1);
    h.view.rerender(<SessionSteering detail={detail(B)} bridge={h.bridge} />); edit("Other target draft");
    enter(); expect(h.calls).toHaveLength(1);
    await h.answer("delivery-unknown");
    expect(textarea().value).toBe("Other target draft");
    h.view.rerender(<SessionSteering detail={detail()} bridge={h.bridge} />);
    expect(textarea().value).toBe("First instruction");
    expect(screen.getByRole("status").getAttribute("data-delivery-status")).toBe("delivery-unknown");
    enter({ repeat: true }); expect(h.calls).toHaveLength(1);
  });

  it("lets Shift-Enter insert a newline in the actual textarea", async () => {
    const h = external(), user = userEvent.setup();
    await user.click(textarea()); await user.type(textarea(), "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}line two");
    expect(textarea().value).toBe("line one\nline two"); expect(h.calls).toHaveLength(0);
    await user.keyboard("{Enter}");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].input).toMatchObject({ text: "line one\nline two" });
    await h.answer("queued"); expect(textarea().value).toBe("");
  });

  it("does not send while composing, on the browser IME fallback, or on a held Enter", () => {
    const h = external(); edit("変換");
    fireEvent.compositionStart(textarea());
    expect(enter()).toBe(true); expect(h.calls).toHaveLength(0);
    fireEvent.compositionEnd(textarea());
    expect(enter({ isComposing: true })).toBe(true);
    expect(enter({ keyCode: 229 })).toBe(true);
    expect(enter({ repeat: true })).toBe(false);
    expect(h.calls).toHaveLength(0);
    expect(enter()).toBe(false); expect(h.calls).toHaveLength(1);
  });

  it("keeps invalid, read-only and disconnected drafts and preserves other modified keys", () => {
    const h = external();
    for (const value of ["  ", "bad\0input", "😀".repeat(1001)]) { edit(value); enter(); }
    expect(h.calls).toHaveLength(0);
    edit("Keep this instruction");
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) expect(enter(extra)).toBe(true);
    h.view.rerender(<SessionSteering detail={{ ...detail(), handoff: "unavailable" }} bridge={h.bridge} />); enter();
    h.view.rerender(<SessionSteering detail={detail()} bridge={undefined} />); enter();
    expect(textarea().value).toBe("Keep this instruction"); expect(h.calls).toHaveLength(0);
  });
});

it("native Codex Enter uses the existing targeted turn sender, including its pending lock", async () => {
  const calls: CoreRequest[] = [];
  const snapshot = TrustedSnapshotSchema.parse({ instanceId: B, profile: "trusted-local", workspace: "/owned/test",
    preparation: null, runToken: A, status: "running", threadId: "thread", turnId: "turn", output: "Controlled output",
    message: "Observed", approvals: [], archived: false, runs: [{ runToken: A, title: "Test run", createdAt: "2026-09-08T13:00:00Z",
      updatedAt: "2026-09-08T13:00:00Z", status: "running", archived: false, approvalCount: 0, taskReference: null, message: "Observed" }] });
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: async (input) => {
    calls.push(input);
    if (input.type === "trusted.send") return new Promise(() => {});
    return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(),
      trusted: { kind: "trusted", snapshot } };
  } };
  render(<TrustedLocalPane bridge={bridge} draft={null} connected />);
  await screen.findByRole("textbox", { name: "Message Codex" });
  edit("Steer precisely"); fireEvent.compositionStart(textarea()); enter(); fireEvent.compositionEnd(textarea());
  expect(calls.filter((call) => call.type === "trusted.send")).toHaveLength(0);
  expect(enter()).toBe(false);
  await waitFor(() => expect(calls.filter((call) => call.type === "trusted.send")).toHaveLength(1));
  expect(calls.find((call) => call.type === "trusted.send")).toMatchObject({ token: A, expectedTurnId: "turn", text: "Steer precisely" });
  edit("Keep editing while the first is pending"); enter(); enter({ repeat: true });
  expect(calls.filter((call) => call.type === "trusted.send")).toHaveLength(1);
  expect(textarea().value).toBe("Keep editing while the first is pending");
});
