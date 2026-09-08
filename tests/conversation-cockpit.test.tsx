// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConversation } from "../app/renderer/external-agents/AgentConversation";
import { ExternalAgentInformation } from "../app/renderer/external-agents/ExternalAgents";
import { initialConversation, useConversationSelection, conversationPreference } from "../app/renderer/external-agents/conversation-selection";
import { SteeringMemory } from "../app/renderer/external-agents/steering-memory";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalAgentSummary, ExternalDetail } from "../protocol/external-agents";
import { extractEntries } from "../core/external-agents-activity";
import { ObservedActivity } from "../app/renderer/external-agents/ObservedActivity";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-09-08T06:00:00.000Z";
const root: ExternalAgentSummary = { id: id(1), label: "ROOT", evidence: "local", status: "observed", parentId: null,
  ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "Registered", contextPaths: [], control: "tmux" };
const child: ExternalAgentSummary = { ...root, id: id(2), label: "Child", parentId: root.id, ancestry: "registered-parent" };
const detail = (session = root): ExternalDetail => ({ session, handoff: "available", entries: [
  { id: "input", at, kind: "user", attribution: "user-message", text: "Please inspect the source" },
  { id: "output", at, kind: "assistant", attribution: "assistant-reported", text: `${session.label} answered` },
  { id: "tool", at, kind: "tool-call", attribution: "recorded-tool-event", text: "Ran git status" },
], coverage: { tailBytes: 1200, partial: false, omittedRecords: 0, message: "Recent" } });
const client = (selected: string | null = root.id, selectedDetail: ExternalDetail | null = detail()): ExternalClient => ({
  snapshot: { status: "observed", observedAt: at, message: "Registered", sessions: [root, child] },
  selected, detail: selectedDetail, busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}),
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("conversation-first selection", () => {
  it("chooses only one actual root, restores a registered choice and refuses ambiguous/example roots", () => {
    expect(initialConversation([root, child], null)).toBe(root.id);
    expect(initialConversation([root, child], child.id)).toBe(child.id);
    expect(initialConversation([root, child], id(99))).toBe(root.id);
    expect(initialConversation([root, { ...root, id: id(3) }], null)).toBeNull();
    expect(initialConversation([{ ...root, evidence: "synthetic" }], null)).toBeNull();
    expect(initialConversation([{ ...root, status: "unavailable" }], null)).toBeNull();
    expect(initialConversation([child], null)).toBeNull();
    // The current CTO ROOT is itself a fork of a session outside this registry.
    const registeredRoot = { ...root, ancestry: "unknown-parent" as const, parentId: id(99) };
    expect(initialConversation([registeredRoot, child], null)).toBe(root.id);
    expect(initialConversation([registeredRoot, { ...registeredRoot, id: id(3) }], null)).toBeNull();
    expect(initialConversation([{ ...root, ancestry: "cycle" }], null)).toBeNull();
    expect(initialConversation([registeredRoot, { ...root, id: id(99), status: "unavailable" }], null)).toBeNull();
  });
  it("waits for registry, restores explicit choice once and never steals after refresh/removal", () => {
    localStorage.setItem(conversationPreference, child.id);
    const initial = client(null, null), read = initial.read;
    const hook = renderHook(({ value }) => useConversationSelection(value), { initialProps: { value: { ...initial, snapshot: null } as ExternalClient } });
    expect(read).not.toHaveBeenCalled();
    hook.rerender({ value: initial }); expect(read).toHaveBeenCalledExactlyOnceWith(child.id);
    hook.rerender({ value: { ...initial, selected: child.id } });
    hook.rerender({ value: { ...initial, snapshot: { ...initial.snapshot!, sessions: [root] } } });
    expect(read).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(conversationPreference)).toBe(child.id);
  });
  it("does not replace selection on recovery and tolerates unavailable preferences", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const initial = client(child.id, detail(child));
    const hook = renderHook(({ value }) => useConversationSelection(value), { initialProps: { value: initial } });
    hook.rerender({ value: { ...initial, snapshot: null, detail: null } });
    hook.rerender({ value: initial }); expect(initial.read).not.toHaveBeenCalled();
  });
});

describe("one mounted target-specific message owner", () => {
  it("does not hide an explicitly chosen native tab when the initial ROOT arrives late", () => {
    const state = emptyLiveAgentState(), native = new AgentBridgeClient(state);
    const props = { state, client: native, onDraft: vi.fn(), runContent: null, draftContent: <textarea aria-label="Native input" defaultValue="keep focus" />, jobsContent: null, activityContent: null };
    const view = render(<AgentDock {...props} conversation={{ content: <AgentConversation client={client(null, null)} onContext={vi.fn()} /> }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Native agents / New" }));
    const input = screen.getByRole("textbox", { name: "Native input" }); input.focus();
    view.rerender(<AgentDock {...props} conversation={{ content: <AgentConversation client={client()} onContext={vi.fn()} /> }} />);
    expect(screen.getByRole("tab", { name: "Native agents / New" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(input);
    view.rerender(<AgentDock {...props} conversation={{ selectionVersion: "explicit-child-click", content: <AgentConversation client={client(child.id, detail(child))} onContext={vi.fn()} /> }} />);
    expect(screen.getByRole("tab", { name: "Conversation" }).getAttribute("aria-selected")).toBe("true");
  });
  it("keeps drafts, focus and native controls while selection, loading and tabs change", () => {
    const bridge = { request: vi.fn(), onEvent: () => () => {} }, state = emptyLiveAgentState(), native = new AgentBridgeClient(state);
    const memory = new SteeringMemory();
    const panel = (value: ExternalClient, version: string) => <><AgentDock state={state} client={native} onDraft={vi.fn()} runContent={<p>Retained run history</p>}
      draftContent={<textarea aria-label="Native draft" defaultValue="native unsent" />} trustedContent={<p>Owned native fleet</p>} jobsContent={null} activityContent={null}
      conversation={{ selectionVersion: version, content: <AgentConversation client={value} memory={memory} bridge={bridge} onContext={vi.fn()} /> }} />
      <ExternalAgentInformation client={value} contextOnly onOpen={vi.fn()} onReturn={vi.fn()} /></>;
    const view = render(panel(client(), "root"));
    expect(screen.getAllByRole("region", { name: "Session steering" })).toHaveLength(1);
    const messages = screen.getByRole("list", { name: "Conversation messages" });
    expect(messages.textContent).toContain("Please inspect the source"); expect(messages.textContent).toContain("ROOT answered"); expect(messages.textContent).not.toContain("Ran git status");
    const field = screen.getByRole("textbox", { name: "Message to ROOT" });
    fireEvent.change(field, { target: { value: "root draft" } }); field.focus();
    view.rerender(panel(client(), "root")); expect(document.activeElement).toBe(field);
    fireEvent.click(screen.getByRole("tab", { name: "Native agents / New" }));
    expect((screen.getByRole("textbox", { name: "Native draft" }) as HTMLTextAreaElement).value).toBe("native unsent");
    view.rerender(panel(client(), "root")); expect(screen.getByRole("tab", { name: "Native agents / New" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Conversation" })); expect(screen.getByRole("textbox", { name: "Message to ROOT" })).toBe(field);
    view.rerender(panel(client(child.id, null), "child"));
    expect(screen.queryByRole("textbox", { name: "Message to ROOT" })).toBeNull();
    view.rerender(panel(client(child.id, detail(child)), "child"));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Child" }), { target: { value: "child draft" } });
    view.rerender(panel(client(), "root-again")); expect((screen.getByRole("textbox", { name: "Message to ROOT" }) as HTMLTextAreaElement).value).toBe("root draft");
    view.rerender(panel(client(child.id, detail(child)), "child-again")); expect((screen.getByRole("textbox", { name: "Message to Child" }) as HTMLTextAreaElement).value).toBe("child draft");
    expect(bridge.request).not.toHaveBeenCalled();
  });
  it("retains a late unknown receipt through an actual remount without replay or cross-target clearing", async () => {
    let resolve!: (value: CoreResponse) => void;
    const request = vi.fn((_input: CoreRequest) => new Promise<CoreResponse>((yes) => { resolve = yes; }));
    const bridge = { request, onEvent: () => () => {} }, memory = new SteeringMemory();
    const panel = (value: ExternalClient) => <AgentConversation client={value} memory={memory} bridge={bridge} onContext={vi.fn()} />;
    const first = render(panel(client()));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to ROOT" }), { target: { value: "send once" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(request).toHaveBeenCalledTimes(1); first.unmount();
    const second = render(panel(client(child.id, detail(child))));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Child" }), { target: { value: "child retained" } });
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve({ protocolVersion: PROTOCOL_VERSION, requestId: request.mock.calls[0]![0].requestId, ok: true, sequence: 1, snapshot: initialSnapshot(),
      external: { kind: "send", sessionId: root.id, receiptId: id(9), status: "delivery-unknown", message: "Controlled" } }));
    expect((screen.getByRole("textbox", { name: "Message to Child" }) as HTMLTextAreaElement).value).toBe("child retained");
    second.rerender(panel(client()));
    expect((screen.getByRole("textbox", { name: "Message to ROOT" }) as HTMLTextAreaElement).value).toBe("send once");
    expect(document.querySelector("[data-delivery-status]")?.getAttribute("data-delivery-status")).toBe("delivery-unknown");
    expect(screen.queryByText(id(9))).toBeNull();
    expect(localStorage.getItem("swarm.message-outbox.v1")).toContain(id(9)); expect(request).toHaveBeenCalledTimes(1);
  });
  it("never labels old detail as a new selected agent or enables send from it", () => {
    render(<AgentConversation client={client(child.id, detail())} bridge={{ request: vi.fn(), onEvent: () => () => {} }} onContext={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull(); expect(screen.queryByText("ROOT answered")).toBeNull();
  });
});

it("projects one canonical user event without reasoning, injected instructions or raw activity duplication", () => {
  const input = { type: "event_msg", timestamp: at, payload: { type: "user_message", message: "<b>Hello</b> " + "a".repeat(6000) } };
  const entries = extractEntries(input, "test");
  expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ kind: "user", attribution: "user-message" });
  expect(entries[0]!.text.length).toBeLessThanOrEqual(4096);
  expect(extractEntries({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Duplicated input" }] } }, "copy")).toEqual([]);
  const value = client(); value.fleet = [detail()];
  render(<ObservedActivity client={value} onOpen={vi.fn()} />);
  expect(screen.queryByText("Please inspect the source")).toBeNull(); expect(screen.getByText("Ran git status")).toBeTruthy();
});
