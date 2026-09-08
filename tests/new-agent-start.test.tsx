// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { TrustedSnapshot } from "../protocol/trusted-local";
import type { SwarmBridge } from "../app/electron/preload";
import { readNativeOutbox, saveNativeOutgoing } from "../app/renderer/agents/native-outbox";

afterEach(() => { cleanup(); localStorage.clear(); });
function harness() {
  let state: TrustedSnapshot = { instanceId: "22222222-2222-4222-8222-222222222222", profile: "trusted-local", workspace: "/project/primary",
    preparation: null, runToken: null, status: "idle", threadId: null, turnId: null, output: "", message: "", approvals: [], runs: [] };
  let sequence = 0;
  const calls: CoreRequest[] = [];
  const deferred: Array<() => void> = [];
  let held = false, reject = false;
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: vi.fn(async (request): Promise<CoreResponse> => {
    calls.push(request);
    if (request.type === "trusted.start") {
      expect(readNativeOutbox().some((message) => message.token === request.token && message.text === request.text)).toBe(true);
      if (held) await new Promise<void>((resolve) => deferred.push(resolve));
      if (reject) throw new Error("Disconnected");
      state = { ...state, runToken: request.token, status: "ready", workspace: "/project/selected", initialText: request.text,
        threadId: "new-thread", turnId: "first-turn", output: "Started without opening a source",
        runs: [{ runToken: request.token, title: request.text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "ready", archived: false, approvalCount: 0, taskReference: null, message: "" }] };
    }
    return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: ++sequence, snapshot: initialSnapshot(), trusted: { kind: "trusted", snapshot: structuredClone(state) } };
  }) };
  return { bridge, calls, deferred, set held(value: boolean) { held = value; }, set reject(value: boolean) { reject = value; } };
}

it("shows a real New agent button and immediately useful no-source composer", async () => {
  const h = harness(), onNewAgent = vi.fn();
  render(<AgentDock state={emptyLiveAgentState()} client={new AgentBridgeClient()} onDraft={vi.fn()} onNewAgent={onNewAgent}
    runContent={null} draftContent={null} jobsContent={null} activityContent={null}
    conversation={{ content: null, registered: { sessions: [], selected: null, onSelect: vi.fn() } }}
    trustedContent={<TrustedLocalPane bridge={h.bridge} draft={null} connected workspaceRoot="/project/selected" />} />);
  fireEvent.click(screen.getByRole("button", { name: "New agent" }));
  expect(onNewAgent).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "New agent message" })).toBeTruthy();
  expect(screen.queryByText(/Prepare a focused|Agent tools|Open an agent draft/)).toBeNull();
  expect(h.calls.every((call) => call.type === "trusted.snapshot")).toBe(true);
});

it("Enter starts once with no source, default model and durable exact text; focus stays in the composer", async () => {
  const h = harness(); h.held = true;
  render(<TrustedLocalPane bridge={h.bridge} draft={null} connected workspaceRoot="/project/selected" />);
  const box = screen.getByRole("textbox", { name: "New agent message" }); box.focus();
  fireEvent.change(box, { target: { value: "Inspect this project\nKeep files unchanged" } });
  fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
  expect(h.calls.filter((call) => call.type === "trusted.start")).toHaveLength(0);
  fireEvent.keyDown(box, { key: "Enter" }); fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(h.calls.filter((call) => call.type === "trusted.start")).toHaveLength(1));
  const call = h.calls.find((call) => call.type === "trusted.start")!;
  expect(call).toMatchObject({ text: "Inspect this project\nKeep files unchanged", model: null });
  expect(call).not.toHaveProperty("input");
  expect(document.activeElement).toBe(box);
  await act(async () => { h.deferred[0]!(); });
  await screen.findByText("Started without opening a source");
  expect(screen.getByRole("textbox", { name: "Message Codex" })).toBe(box);
  expect(document.activeElement).toBe(box);
  expect(readNativeOutbox()[0]).toMatchObject({ text: "Inspect this project\nKeep files unchanged", status: "sent", workspace: "/project/selected" });
});

it("retains failed startup text after reload without replaying; explicit new selection focuses but late ack cannot steal focus", async () => {
  const h = harness(); h.held = true; h.reject = true;
  const view = render(<><button>Other control</button><TrustedLocalPane bridge={h.bridge} draft={null} connected workspaceRoot="/project/selected" /></>);
  const box = screen.getByRole("textbox", { name: "New agent message" }); box.focus();
  fireEvent.change(box, { target: { value: "Do not lose this" } }); fireEvent.keyDown(box, { key: "Enter" });
  const other = screen.getByRole("button", { name: "Other control" }); other.focus();
  await act(async () => { h.deferred[0]!(); });
  expect(document.activeElement).toBe(other);
  expect((box as HTMLTextAreaElement).value).toBe("Do not lose this");
  expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
  view.unmount();
  render(<TrustedLocalPane bridge={h.bridge} draft={null} connected workspaceRoot="/project/selected" />);
  expect(screen.getByText("Do not lose this")).toBeTruthy();
  expect(readNativeOutbox()[0]?.status).toBe("unknown");
  expect(h.calls.filter((call) => call.type === "trusted.start")).toHaveLength(1);
});

it("does not send if local message storage cannot save", async () => {
  const h = harness(); localStorage.setItem("swarm.native-outbox.v1", "broken");
  render(<TrustedLocalPane bridge={h.bridge} draft={null} connected />);
  fireEvent.change(screen.getByRole("textbox", { name: "New agent message" }), { target: { value: "Keep me" } });
  fireEvent.click(screen.getByRole("button", { name: "Start agent" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Start agent" })).not.toHaveProperty("disabled", true));
  expect(h.calls.every((call) => call.type === "trusted.snapshot")).toBe(true);
  expect(localStorage.getItem("swarm.native-outbox.v1")).toBe("broken");
});

it("keeps text typed during startup in the admitted conversation composer", async () => {
  const h = harness(); h.held = true;
  render(<TrustedLocalPane bridge={h.bridge} draft={null} connected workspaceRoot="/project/selected" />);
  const box = screen.getByRole("textbox", { name: "New agent message" }); box.focus();
  fireEvent.change(box, { target: { value: "First instruction" } }); fireEvent.keyDown(box, { key: "Enter" });
  fireEvent.change(box, { target: { value: "Next instruction while starting" } });
  await act(async () => h.deferred[0]!());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Codex" })).toHaveProperty("value", "Next instruction while starting"));
  expect(document.activeElement).toBe(box);
  expect(h.calls.filter((request) => request.type === "trusted.start")).toHaveLength(1);
});

it("labels a new run with launch workspace, never an archived run's worktree; focuses the new mounted composer", async () => {
  const h = harness();
  const original = h.bridge.request;
  h.bridge.request = async (request) => {
    const response = await original(request);
    if (response.ok && response.trusted) response.trusted.snapshot = { ...response.trusted.snapshot,
      runToken: "11111111-1111-4111-8111-111111111111", status: "closed", archived: true,
      launchWorkspace: "/project/primary", workspace: "/project/previous-worktree", runs: undefined };
    return response;
  };
  render(<TrustedLocalPane bridge={h.bridge} draft={null} connected />);
  await screen.findByText("Archived conversation · closed. View-only history.");
  fireEvent.click(screen.getByRole("button", { name: "New agent" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "New agent message" })));
  expect(screen.getByText("Workspace: /project/primary")).toBeTruthy();
  expect(screen.queryByText("Workspace: /project/previous-worktree")).toBeNull();
});

it("does not overwrite unresolved outgoing rows when full", () => {
  for (let i = 0; i < 100; i++) saveNativeOutgoing({ id: crypto.randomUUID(), token: crypto.randomUUID(), workspace: "/root", text: String(i), kind: "start", at: new Date().toISOString(), status: "unknown" });
  expect(() => saveNativeOutgoing({ id: crypto.randomUUID(), token: crypto.randomUUID(), workspace: "/root", text: "101", kind: "start", at: new Date().toISOString(), status: "sending" })).toThrow("Saved messages are full");
  expect(readNativeOutbox()).toHaveLength(100);
});
