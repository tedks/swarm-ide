// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwarmBridge } from "../app/electron/preload";
import { ExternalAgentInformation } from "../app/renderer/external-agents/ExternalAgents";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

afterEach(() => { cleanup(); localStorage.clear(); });
const sessionId = "00000000-0000-4000-8000-000000000001";
const receiptId = "00000000-0000-4000-8000-000000000009";
function setup() {
  let resolve!: (response: CoreResponse) => void;
  const promise = new Promise<CoreResponse>((yes) => { resolve = yes; });
  const request = vi.fn((_input: CoreRequest) => promise);
  const bridge: SwarmBridge = { request, onEvent: () => () => {} };
  const client: ExternalClient = { snapshot: null, selected: sessionId, busy: false, notice: "",
    refresh: vi.fn(async () => {}), read: vi.fn(async () => {}), handoff: vi.fn(async () => {}),
    detail: { session: { id: sessionId, label: "Observed agent", evidence: "local", status: "observed", parentId: null,
      ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-07T20:00:00.000Z", message: "Recorded", contextPaths: [] },
      entries: [], handoff: "available", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "Empty tail" } } };
  // Spreading permits the pre-fix component to compile while ignoring visible,
  // so the regression fails on behavior, not a missing-prop type error.
  const panel = (visible: boolean) => <ExternalAgentInformation {...{ client, bridge, visible, onReturn: () => {}, onOpen: () => {} }} />;
  return { panel, request, resolve };
}
const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("session steering across source-information navigation", () => {
  it("hides the panel without destroying an unsent draft", () => {
    const { panel, request } = setup();
    const view = render(panel(true));
    fireEvent.change(textbox(), { target: { value: "Keep this unsent instruction" } });
    const original = textbox();
    view.rerender(panel(false));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(view.container.querySelector(".external-information")?.getAttribute("hidden")).toBe("");
    expect((view.container.querySelector(".external-information") as HTMLElement).style.display).toBe("none");
    view.rerender(panel(true));
    expect(textbox()).toBe(original);
    expect(textbox().value).toBe("Keep this unsent instruction");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["queued", "delivery-unknown"] as const)("retains a %s receipt that arrives while hidden without replay", async (status) => {
    const { panel, request, resolve } = setup();
    const view = render(panel(true));
    fireEvent.change(textbox(), { target: { value: "Inspect once" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(request).toHaveBeenCalledTimes(1);
    view.rerender(panel(false));
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => { resolve({ protocolVersion: PROTOCOL_VERSION, requestId: request.mock.calls[0][0].requestId,
      ok: true, sequence: 1, snapshot: initialSnapshot(), external: { kind: "send", sessionId, receiptId, status, message: `Recorded outcome: ${status}` } }); });
    view.rerender(panel(true));
    expect(screen.getByRole("status", { name: status === "delivery-unknown" ? "Unconfirmed" : "Sent to queue" })).toBeTruthy();
    expect(view.container.querySelector("[data-delivery-status]")?.getAttribute("data-delivery-status")).toBe(status);
    expect(screen.queryByText(receiptId)).toBeNull();
    expect(localStorage.getItem("swarm.message-outbox.v1")).toContain(receiptId);
    expect(view.container.querySelector(".external-information")?.getAttribute("data-external-session")).toBe(sessionId);
    expect(textbox().value).toBe(status === "queued" ? "" : "Inspect once");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
