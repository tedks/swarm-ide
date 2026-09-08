// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwarmBridge } from "../app/electron/preload";
import { SessionSteering } from "../app/renderer/external-agents/SessionSteering";
import { initialSnapshot } from "../fixtures/world";
import type { ExternalDetail, ExternalResult } from "../protocol/external-agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function detail(n = 1): ExternalDetail {
  return { session: { id: id(n), label: `Agent ${n}`, evidence: "local", status: "observed", parentId: null, ancestry: "root",
    observationId: String(n).repeat(64), observedAt: "2026-09-07T20:00:00.000Z", message: "Recorded local metadata", contextPaths: [] },
    entries: [], handoff: "available", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "Empty tail" } };
}
function success(request: CoreRequest, status: "queued" | "rejected" | "delivery-unknown" = "queued", targetId = id(1)): CoreResponse {
  const external: ExternalResult = { kind: "send", sessionId: targetId, receiptId: id(9), status, message: `Target outcome: ${status}` };
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(), external };
}
function bridgeWith(handle: (request: CoreRequest) => Promise<CoreResponse>) {
  const request = vi.fn(handle);
  const bridge: SwarmBridge = { request, onEvent: () => () => {} };
  return { bridge, request };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const sendButton = () => screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement;
const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const draft = (text: string) => fireEvent.change(textbox(), { target: { value: text } });

describe("explicit observed-session steering", () => {
  it.each(["keyboard", "button"] as const)("keeps the same focused composer through a held %s send and queued receipt", async (method) => {
    const user = userEvent.setup(), held = deferred<CoreResponse>();
    const { bridge, request } = bridgeWith(() => held.promise);
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    const composer = textbox();
    await user.click(composer); await user.type(composer, "First message");
    if (method === "keyboard") await user.keyboard("{Enter}");
    else await user.click(sendButton());
    expect(textbox()).toBe(composer);
    expect(composer.disabled).toBe(false);
    expect(composer.readOnly).toBe(true);
    expect(document.activeElement).toBe(composer);
    expect(sendButton().disabled).toBe(true);
    await user.keyboard("ignored while pending{Enter}");
    expect(composer.value).toBe("First message");
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("swarm.message-outbox.v1")!).messages[0].text).toBe("First message");
    await act(async () => { held.resolve(success(request.mock.calls[0][0])); });
    expect(textbox()).toBe(composer);
    expect(document.activeElement).toBe(composer);
    expect(composer.readOnly).toBe(false);
    expect(composer.value).toBe("");
    await user.keyboard("Next message");
    expect(composer.value).toBe("Next message");
    expect(request).toHaveBeenCalledTimes(1);
    expect(sendButton().title).toBe("Send message");
    expect(sendButton().textContent).toBe("");
    expect(sendButton().querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });

  it.each(["rejected", "delivery-unknown"] as const)("keeps focus and exact draft for a held %s outcome", async (status) => {
    const user = userEvent.setup(), held = deferred<CoreResponse>();
    const { bridge, request } = bridgeWith(() => held.promise);
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    const composer = textbox();
    await user.click(composer); await user.type(composer, "  Keep this text 👋");
    await user.click(sendButton());
    await act(async () => { held.resolve(success(request.mock.calls[0][0], status)); });
    expect(textbox()).toBe(composer);
    expect(document.activeElement).toBe(composer);
    expect(composer.value).toBe("  Keep this text 👋");
    expect(composer.readOnly).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("never takes focus after navigation before a late receipt (changed agent: %s)", async (switchAgent) => {
    const user = userEvent.setup(), held = deferred<CoreResponse>();
    const { bridge, request } = bridgeWith(() => held.promise);
    const ui = (n: number) => <><button>Source or modal</button><SessionSteering detail={detail(n)} bridge={bridge} /></>;
    const view = render(ui(1));
    await user.type(textbox(), "Send once"); await user.click(sendButton());
    if (switchAgent) {
      view.rerender(ui(2));
      await user.type(textbox(), "Other agent draft");
    }
    const elsewhere = screen.getByRole("button", { name: "Source or modal" });
    await user.click(elsewhere);
    view.rerender(ui(switchAgent ? 2 : 1));
    expect(document.activeElement).toBe(elsewhere);
    await act(async () => { held.resolve(success(request.mock.calls[0][0])); });
    expect(document.activeElement).toBe(elsewhere);
    expect(textbox().value).toBe(switchAgent ? "Other agent draft" : "");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("targets the observed identity only on explicit Send and distinguishes queueing from consumption", async () => {
    const { bridge, request } = bridgeWith(async (input) => success(input));
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    expect(screen.getByText("Agent 1")).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    draft("Please inspect the failing test.");
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(sendButton());
    await screen.findByRole("status", { name: "Queued" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ protocolVersion: PROTOCOL_VERSION, type: "externalAgents.send", sessionId: id(1),
      observationId: "1".repeat(64), text: "Please inspect the failing test." });
    expect(textbox().value).toBe("");
    expect(document.querySelector("[data-delivery-status='queued']")).toBeTruthy();
    expect(screen.queryByText(id(9))).toBeNull();
    expect(localStorage.getItem("swarm.message-outbox.v1")).toContain(id(9));
  });

  it("rejects blank, NUL and oversized UTF-8 input without silently truncating it", () => {
    const { bridge, request } = bridgeWith(async (input) => success(input));
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    for (const text of [" \n\t", "hello\0world", "😀".repeat(1001)]) {
      draft(text); expect(sendButton().disabled).toBe(true);
      fireEvent.submit(sendButton().closest("form")!);
    }
    expect(textbox().value).toBe("😀".repeat(1001));
    expect(request).not.toHaveBeenCalled();
    draft("😀".repeat(1000)); expect(sendButton().disabled).toBe(false);
    expect(screen.queryByText("4000 / 4000 UTF-8 bytes")).toBeNull();
  });

  it("fails closed for synthetic, unavailable, unchecked or disconnected sessions", () => {
    const { bridge, request } = bridgeWith(async (input) => success(input));
    const observed = detail();
    const view = render(<SessionSteering detail={observed} bridge={bridge} />);
    draft("Keep this draft");
    for (const unavailable of [
      { ...observed, session: { ...observed.session, evidence: "synthetic" as const } },
      { ...observed, session: { ...observed.session, status: "unavailable" as const } },
      { ...observed, handoff: "unavailable" as const }, { ...observed, handoff: "unconfigured" as const },
    ]) {
      view.rerender(<SessionSteering detail={unavailable} bridge={bridge} />);
      expect(sendButton().disabled).toBe(true); expect(textbox().disabled).toBe(true);
      fireEvent.submit(sendButton().closest("form")!);
    }
    view.rerender(<SessionSteering detail={observed} bridge={undefined} />);
    expect(sendButton().disabled).toBe(true); expect(request).not.toHaveBeenCalled();
    expect(textbox().value).toBe("Keep this draft");
  });

  it.each(["rejected", "delivery-unknown"] as const)("preserves the draft and does not retry a %s receipt", async (status) => {
    const { bridge, request } = bridgeWith(async (input) => success(input, status));
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    draft("Review the patch"); fireEvent.click(sendButton());
    await screen.findByRole("status", { name: status === "delivery-unknown" ? "Unconfirmed" : "Not sent" });
    expect(textbox().value).toBe("Review the patch");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["transport", "envelope", "identity"])("treats %s failure as unknown, never as confirmed rejection", async (failure) => {
    const { bridge, request } = bridgeWith(async (input) => {
      if (failure === "transport") throw new Error("Transport lost");
      if (failure === "envelope") return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false,
        error: { code: "INVALID_CORE_MESSAGE", message: "Lost result" } };
      return success(input, "queued", id(2));
    });
    render(<SessionSteering detail={detail()} bridge={bridge} />);
    draft("Review the patch"); fireEvent.click(sendButton());
    await screen.findByRole("status", { name: "Unconfirmed" });
    expect(screen.queryByText(/Rejected —/)).toBeNull();
    expect(textbox().value).toBe("Review the patch"); expect(request).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate sends across selection changes and attributes a late receipt only to its original target", async () => {
    const held = deferred<CoreResponse>();
    const { bridge, request } = bridgeWith(() => held.promise);
    const view = render(<SessionSteering detail={detail()} bridge={bridge} />);
    draft("First target draft");
    act(() => { fireEvent.submit(sendButton().closest("form")!); fireEvent.submit(sendButton().closest("form")!); });
    expect(request).toHaveBeenCalledTimes(1);
    view.rerender(<SessionSteering detail={null} bridge={bridge} />);
    expect(screen.getByRole("status").textContent).toContain(`Agent 1 (${id(1)})`);
    view.rerender(<SessionSteering detail={detail(2)} bridge={bridge} />);
    expect(textbox().value).toBe(""); draft("Second target draft");
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(`Agent 1 (${id(1)})`);
    await act(async () => { held.resolve(success(request.mock.calls[0][0], "rejected")); });
    expect(textbox().value).toBe("Second target draft");
    expect(screen.queryByRole("status", { name: "Not sent" })).toBeNull();
    expect(sendButton().disabled).toBe(false);
    view.rerender(<SessionSteering detail={detail()} bridge={bridge} />);
    expect(textbox().value).toBe("First target draft");
    expect(screen.getByRole("status", { name: "Not sent" })).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not resend when refreshed or remounted after an uncertain result", async () => {
    const { bridge, request } = bridgeWith(async () => { throw new Error("Connection lost"); });
    const view = render(<SessionSteering detail={detail()} bridge={bridge} />);
    draft("Inspect once"); fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Unconfirmed"));
    view.rerender(<SessionSteering detail={{ ...detail(), session: { ...detail().session, observationId: "a".repeat(64) } }} bridge={bridge} />);
    expect(textbox().value).toBe("Inspect once");
    view.unmount(); render(<SessionSteering detail={detail()} bridge={bridge} />);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
