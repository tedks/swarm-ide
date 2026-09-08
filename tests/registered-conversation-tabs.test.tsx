// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
import { AgentConversation, AgentConversationActions } from "../app/renderer/external-agents/AgentConversation";
import { SteeringMemory } from "../app/renderer/external-agents/steering-memory";
import type { ExternalAgentSummary, ExternalDetail } from "../protocol/external-agents";
import { writerFileFocus } from "../fixtures/world";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-09-08T06:00:00.000Z";
const root: ExternalAgentSummary = { id: id(1), label: "ROOT", evidence: "local", status: "observed", parentId: null,
  ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "Registered", contextPaths: [], control: "tmux", lifecycle: { state: "working" } };
const child = { ...root, id: id(2), label: "Child", parentId: root.id };
const history = { ...root, id: id(3), label: "Earlier", lifecycle: { state: "completed" as const } };
const detail = (session: ExternalAgentSummary): ExternalDetail => ({ session, handoff: "available", entries: [
  { id: `${session.id}-output`, at, kind: "assistant", attribution: "assistant-reported", text: `${session.label} answered` },
], coverage: { tailBytes: 1200, partial: false, omittedRecords: 0, message: "Recent" } });

function setup(initial: ExternalAgentSummary[] = [root, child, history], selected = root.id) {
  const state = emptyLiveAgentState(), native = new AgentBridgeClient(state), onSelect = vi.fn(), request = vi.fn();
  const memory = new SteeringMemory(), onWorktree = vi.fn(), onContext = vi.fn();
  let open!: (id: string) => void;
  function Harness({ sessions, blocked = false }: { sessions: ExternalAgentSummary[] | null; blocked?: boolean }) {
    const [selection, select] = useState(selected), [version, bump] = useState(0), [draft, setDraft] = useState(false);
    open = (id) => { select(id); bump((v) => v + 1); onSelect(id); };
    const current = sessions?.find((session) => session.id === selection);
    const client = { snapshot: sessions ? { status: "observed" as const, observedAt: at, message: "Recent", sessions } : null, selected: selection,
      detail: current ? detail(current) : null, busy: false, notice: "", read: async (id: string) => open(id), refresh: vi.fn(), handoff: vi.fn() };
    return <><textarea aria-label="Source" defaultValue="source and cursor retained" />
      <AgentDock state={{ ...state, draft: draft ? { focus: writerFileFocus, task: "Retained", model: "", prepared: null, confirmed: false, preparing: false } : null }} client={native} onDraft={() => setDraft(true)} runContent={null} draftContent={<textarea aria-label="Native draft" />} jobsContent={null} activityContent={null}
        shortcutsBlocked={blocked} conversation={{ registered: { sessions, selected: selection, onSelect: open }, selectionVersion: String(version),
          actions: <AgentConversationActions client={client} onContext={onContext} onWorktree={onWorktree} />,
          content: <AgentConversation embeddedHeader client={client} memory={memory} bridge={{ request, onEvent: () => () => {} }} onContext={onContext} /> }} /></>;
  }
  const view = render(<Harness sessions={initial} />);
  return { memory, request, onSelect, onWorktree, onContext, open: (id: string) => act(() => open(id)), rerender: (sessions: ExternalAgentSummary[] | null, blocked = false) => view.rerender(<Harness sessions={sessions} blocked={blocked} />) };
}
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name} `) });

describe("registered conversation tabs", () => {
  it("adds live registrations without focus theft, keeps completed opened tabs and omits unopened history", () => {
    const view = setup([root, history]);
    expect(tab("ROOT").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("tab", { name: /Earlier/ })).toBeNull();
    const input = screen.getByRole("textbox", { name: "Message to ROOT" }); input.focus();
    fireEvent.change(input, { target: { value: "root unsent" } });
    view.rerender([root, child, history]);
    expect(tab("Child")).toBeTruthy(); expect(document.activeElement).toBe(input);
    expect(tab("ROOT").getAttribute("aria-selected")).toBe("true");
    view.rerender([{ ...root, lifecycle: { state: "completed" } }, child, history]);
    expect(tab("ROOT").getAttribute("aria-label")).toBe("ROOT Complete");
    expect((input as HTMLTextAreaElement).value).toBe("root unsent"); expect(view.request).not.toHaveBeenCalled();
  });
  it("selects exact identities with Ctrl-Tab, preserves drafts/outgoing rows and keeps one sender", () => {
    const view = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Message to ROOT" }), { target: { value: "root unsent" } });
    let outgoing!: string;
    act(() => { outgoing = view.memory.beginSend(root.id, "already queued", "ROOT")!; });
    act(() => view.memory.finishSend(root.id, outgoing, { receiptId: id(9), status: "queued", message: "Queued" }));
    const field = screen.getByRole("textbox", { name: "Message to ROOT" }); field.focus();
    fireEvent.keyDown(field, { key: "Tab", ctrlKey: true });
    expect(view.onSelect).toHaveBeenLastCalledWith(child.id);
    expect(tab("Child").getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("region", { name: "Session steering" })).toHaveLength(1);
    expect(screen.queryByText("already queued")).toBeNull();
    const childField = screen.getByRole("textbox", { name: "Message to Child" });
    fireEvent.change(childField, { target: { value: "child unsent" } });
    fireEvent.keyDown(childField, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(view.onSelect).toHaveBeenLastCalledWith(root.id);
    expect((screen.getByRole("textbox", { name: "Message to ROOT" }) as HTMLTextAreaElement).value).toBe("root unsent");
    expect(screen.getByText("already queued")).toBeTruthy();
    fireEvent.click(tab("Child"));
    expect((screen.getByRole("textbox", { name: "Message to Child" }) as HTMLTextAreaElement).value).toBe("child unsent");
    expect(view.request).not.toHaveBeenCalled();
  });
  it("does not take desktop Alt-Tab, source shortcuts, composition, prevented events or the palette", () => {
    const view = setup(); const input = screen.getByRole("textbox", { name: "Message to ROOT" });
    for (const options of [{ altKey: true }, { ctrlKey: true, altKey: true }, { ctrlKey: true, metaKey: true }, { ctrlKey: true, isComposing: true }, { ctrlKey: true, keyCode: 229 }]) {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, ...options });
      fireEvent(input, event); expect(event.defaultPrevented).toBe(false);
    }
    const blocked = new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true, bubbles: true, cancelable: true }); blocked.preventDefault();
    fireEvent(input, blocked);
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog");
    screen.getByRole("region", { name: "Agent messages" }).append(dialog);
    fireEvent.keyDown(dialog, { key: "Tab", ctrlKey: true }); dialog.remove();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Source" }), { key: "Tab", ctrlKey: true });
    view.rerender([root, child, history], true);
    fireEvent.keyDown(input, { key: "Tab", ctrlKey: true });
    expect(view.onSelect).not.toHaveBeenCalled();
  });
  it("dismisses views without termination, does not reopen on refresh, and explicitly reopens history", () => {
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close conversation Child" }));
    view.rerender([{ ...root }, { ...child }, history]);
    expect(screen.queryByRole("tab", { name: /Child/ })).toBeNull();
    expect(view.onSelect).not.toHaveBeenCalled();
    view.open(child.id); expect(tab("Child").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close conversation Child" }));
    expect(tab("ROOT").getAttribute("aria-selected")).toBe("true");
    view.open(history.id); expect(tab("Earlier").getAttribute("aria-selected")).toBe("true");
    expect(tab("Earlier").querySelector('[data-run-state="completed"]')).toBeTruthy();
    expect(view.request).not.toHaveBeenCalled();
  });
  it("leaves an explicitly chosen native draft active when more registrations arrive", () => {
    const view = setup([root]);
    fireEvent.click(screen.getByRole("button", { name: "New agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare an agent draft" }));
    const input = screen.getByRole("textbox", { name: "Native draft" }); input.focus();
    view.rerender([root, child]);
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("tab", { name: "Draft" }).getAttribute("aria-selected")).toBe("true");
    view.open(child.id); expect(tab("Child").getAttribute("aria-selected")).toBe("true");
  });
  it("uses manual arrow navigation and a shared conversation panel with distinct close buttons", () => {
    const view = setup(); tab("ROOT").focus();
    fireEvent.keyDown(tab("ROOT"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Child")); expect(view.onSelect).not.toHaveBeenCalled();
    fireEvent.click(tab("Child"));
    const panel = screen.getByRole("tabpanel", { name: "Child In progress" });
    expect(within(panel).getByRole("textbox", { name: "Message to Child" })).toBeTruthy();
    expect(tab("Child").querySelector("button")).toBeNull();
    expect(screen.getByTitle(/Ctrl\+Tab/)).toBeTruthy();
  });
  it("does not auto-open unavailable, unknown or example registrations, and removes revoked tabs", () => {
    const unknown = { ...child, lifecycle: undefined }, example = { ...history, evidence: "synthetic" as const, lifecycle: { state: "working" as const } };
    const view = setup([root, unknown, example]);
    expect(screen.queryByRole("tab", { name: /Child|Earlier/ })).toBeNull();
    view.open(child.id); expect(tab("Child").getAttribute("aria-label")).toBe("Child Status unavailable");
    view.rerender([root]);
    expect(screen.queryByRole("tab", { name: /Child/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message to Child" })).toBeNull();
    expect(view.request).not.toHaveBeenCalled();
  });
  it("retains dismissed tabs and opened history through a core reconnect without treating it as an empty registry", () => {
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close conversation Child" }));
    view.open(history.id);
    view.rerender(null);
    expect((tab("Earlier") as HTMLButtonElement).disabled).toBe(true);
    view.rerender([root, child, history]);
    expect(tab("Earlier").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("tab", { name: /Child/ })).toBeNull();
    expect(view.onSelect).toHaveBeenCalledTimes(1); expect(view.request).not.toHaveBeenCalled();
  });
  it("keeps explicit tools access and disabled session actions during reconnect without selecting anyone", () => {
    const view = setup(); view.rerender(null);
    expect((tab("ROOT") as HTMLButtonElement).disabled).toBe(true);
    const tools = screen.getByRole("button", { name: "New agent" });
    expect(tools.tabIndex).toBe(0);
    expect((screen.getByRole("button", { name: "Copy terminal command" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("region", { name: "Agent messages" }), { key: "Tab", ctrlKey: true });
    expect(tab("ROOT").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tools); expect(screen.getByRole("tabpanel", { name: "New agent" })).toBeTruthy();
    expect(view.onSelect).not.toHaveBeenCalled(); expect(view.request).not.toHaveBeenCalled();
  });
  it("renders exactly one header with icon actions and no permanent generic category", () => {
    const view = setup([{ ...root, worktree: "/repo/root" }, child]);
    const pane = screen.getByRole("region", { name: "Agent messages" });
    expect(pane.querySelectorAll(".agent-conversation-header")).toHaveLength(1);
    expect(pane.querySelector(".conversation-heading")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Conversation|Native agents|New/ })).toBeNull();
    const actions = screen.getByRole("group", { name: "Selected agent actions" });
    expect(actions.closest("header")?.contains(tab("ROOT"))).toBe(true);
    expect(actions.textContent).toBe("");
    fireEvent.click(within(actions).getByRole("button", { name: "Worktree" }));
    expect(view.onWorktree).toHaveBeenCalledExactlyOnceWith(root.id);
    fireEvent.click(within(actions).getByRole("button", { name: "Agent details" }));
    expect(view.onContext).toHaveBeenCalledOnce();
    fireEvent.click(tab("Child"));
    expect((screen.getByRole("button", { name: "Worktree" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.request).not.toHaveBeenCalled();
  });
  it("can close the last tab without losing draft memory or silently reselecting it", () => {
    const view = setup([root]);
    const input = screen.getByRole("textbox", { name: "Message to ROOT" });
    fireEvent.change(input, { target: { value: "keep this" } });
    fireEvent.click(screen.getByRole("button", { name: "Close conversation ROOT" }));
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Select an agent or click New agent to start one.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New agent" }));
    view.rerender([{ ...root }]); expect(screen.queryByRole("tab")).toBeNull();
    expect(view.onSelect).not.toHaveBeenCalled();
    view.open(root.id);
    expect(screen.getByRole("textbox", { name: "Message to ROOT" })).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("keep this");
    expect(view.request).not.toHaveBeenCalled();
  });
  it("starts empty without a duplicate title and exposes native controls without creating or sending a run", () => {
    const view = setup([]);
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New agent" }));
    expect(screen.getByRole("button", { name: "Prepare an agent draft" })).toBeTruthy();
    expect(view.request).not.toHaveBeenCalled(); expect(view.onSelect).not.toHaveBeenCalled();
  });
  it("keeps focus in the dock when a background tab closes while the untabbed tools view is open", () => {
    const view = setup([root]);
    const tools = screen.getByRole("button", { name: "New agent" });
    fireEvent.click(tools);
    const close = screen.getByRole("button", { name: "Close conversation ROOT" }); close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(tools);
    expect(screen.getByRole("tabpanel", { name: "New agent" })).toBeTruthy();
    expect(view.onSelect).not.toHaveBeenCalled(); expect(view.request).not.toHaveBeenCalled();
  });
});
