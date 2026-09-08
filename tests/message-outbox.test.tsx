// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SteeringMemory } from "../app/renderer/external-agents/steering-memory";
import { OUTBOX_KEY, OUTBOX_MAX_MESSAGES, readOutbox, writeOutbox, type OutboxStorage } from "../app/renderer/external-agents/message-outbox";
import { AgentConversation } from "../app/renderer/external-agents/AgentConversation";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function storage(): OutboxStorage {
  let raw: string | null = null;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
}
function client(sessionId = id(1)): ExternalClient {
  return { selected: sessionId, detail: null, snapshot: null, busy: false, notice: "", read: vi.fn(), refresh: vi.fn(), handoff: vi.fn() };
}

describe("saved outgoing messages", () => {
  it("saves exact text before dispatch and retains queued text across reload without claiming delivery", () => {
    const disk = storage(), memory = new SteeringMemory(disk), text = "  Keep é and 👋\nexactly.\n";
    memory.update(id(1), () => ({ draft: text }));
    const localId = memory.beginSend(id(1), text, "Root")!;
    expect(readOutbox(disk)).toEqual([expect.objectContaining({ id: localId, sessionId: id(1), text, status: "sending" })]);
    expect(memory.beginSend(id(1), text, "Root")).toBeNull();
    memory.finishSend(id(1), localId, { status: "queued", message: "Accepted", receiptId: id(9) });
    expect(memory.getSnapshot().targets.get(id(1))?.draft).toBe("");
    const resumed = new SteeringMemory(disk);
    expect(resumed.getSnapshot().outgoing[0]).toMatchObject({ text, status: "queued", receiptId: id(9) });
    expect(resumed.getSnapshot().pending).toBeNull();
  });

  it("reloads an interrupted send as uncertain, never resends or infers rejection", () => {
    const disk = storage(), before = new SteeringMemory(disk);
    before.beginSend(id(1), "Please inspect", "Root");
    const after = new SteeringMemory(disk);
    expect(after.getSnapshot().outgoing[0]).toMatchObject({ text: "Please inspect", status: "delivery-unknown" });
    expect(after.getSnapshot().pending).toBeNull();
    const next = after.beginSend(id(2), "Second instruction", "Child")!;
    expect(after.getSnapshot().outgoing[0].status).toBe("delivery-unknown");
    after.finishSend(id(2), next, { status: "queued", message: "Accepted" });
    expect(after.getSnapshot().outgoing[0].status).toBe("delivery-unknown");
  });

  it.each(["rejected", "delivery-unknown"] as const)("retains %s recovery text and settles only the original session", (status) => {
    const disk = storage(), memory = new SteeringMemory(disk);
    memory.update(id(1), () => ({ draft: "First" }));
    const localId = memory.beginSend(id(1), "First", "Root")!;
    memory.update(id(2), () => ({ draft: "Other" }));
    memory.finishSend(id(2), localId, { status, message: "Wrong target" });
    expect(memory.getSnapshot().pending?.id).toBe(id(1));
    memory.finishSend(id(1), localId, { status, message: "Outcome" });
    expect(memory.getSnapshot().targets.get(id(1))?.draft).toBe("First");
    expect(memory.getSnapshot().targets.get(id(2))?.draft).toBe("Other");
    expect(new SteeringMemory(disk).getSnapshot().outgoing[0]).toMatchObject({ text: "First", status });
  });

  it("does not clear a changed draft when a queued result arrives", () => {
    const memory = new SteeringMemory(storage());
    const localId = memory.beginSend(id(1), "Original", "Root")!;
    memory.update(id(1), () => ({ draft: "New draft" }));
    memory.finishSend(id(1), localId, { status: "queued", message: "Accepted" });
    expect(memory.getSnapshot().targets.get(id(1))?.draft).toBe("New draft");
  });

  it.each(["denied", "corrupt", "full"])("does not dispatch or erase saved text when storage is %s", (failure) => {
    const disk = storage();
    if (failure === "corrupt") disk.setItem(OUTBOX_KEY, "not-json");
    if (failure === "full") writeOutbox(disk, Array.from({ length: OUTBOX_MAX_MESSAGES }, (_, i) => ({
      id: id(i + 1), sessionId: id(1), text: `Retain ${i}`, status: "queued" as const, at: "2026-09-08T12:00:00.000Z",
    })));
    const raw = disk.getItem(OUTBOX_KEY);
    if (failure === "denied") disk.setItem = () => { throw new Error("Denied"); };
    const memory = new SteeringMemory(disk);
    memory.update(id(1), () => ({ draft: "Do not lose this" }));
    expect(memory.beginSend(id(1), "Do not lose this", "Root")).toBeNull();
    expect(memory.getSnapshot().pending).toBeNull();
    expect(memory.getSnapshot().targets.get(id(1))?.draft).toBe("Do not lose this");
    expect(disk.getItem(OUTBOX_KEY)).toBe(raw);
  });

  it("preserves the saved original if a delivery-update write fails", () => {
    const disk = storage(), memory = new SteeringMemory(disk);
    const localId = memory.beginSend(id(1), "Recover me", "Root")!;
    disk.setItem = () => { throw new Error("Full"); };
    memory.finishSend(id(1), localId, { status: "queued", message: "Accepted" });
    expect(memory.getSnapshot().storageNotice).toContain("could not be saved");
    expect(new SteeringMemory(disk).getSnapshot().outgoing[0]).toMatchObject({ text: "Recover me", status: "delivery-unknown" });
  });

  it("shows a submitted row immediately while the transcript is unavailable and copies exact text after reload", async () => {
    const disk = storage(), memory = new SteeringMemory(disk), text = "  Wait for me\n🙂\n";
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const view = render(<AgentConversation client={client()} memory={memory} onContext={() => {}} />);
    act(() => { memory.beginSend(id(1), text, "Root"); });
    expect(view.container.querySelector(".conversation-outgoing p")?.textContent).toBe(text);
    expect(screen.getByRole("status", { name: "Sending" })).toBeTruthy();
    view.rerender(<AgentConversation client={client(id(2))} memory={memory} onContext={() => {}} />);
    expect(view.container.querySelector(".conversation-outgoing")).toBeNull();
    view.unmount();
    const after = render(<AgentConversation client={client()} memory={new SteeringMemory(disk)} onContext={() => {}} />);
    expect(screen.getByRole("status", { name: "Unconfirmed" })).toBeTruthy();
    fireEvent.click(within(after.container.querySelector(".conversation-outgoing") as HTMLElement).getByRole("button", { name: "Copy message" }));
    await act(async () => {});
    expect(copy).toHaveBeenCalledWith(text);
    expect(after.container.querySelector(".conversation-outgoing p")?.textContent).toBe(text);
  });

  it.each(["absent", "rejected"])("offers manual copying when clipboard is %s", async (failure) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: failure === "absent" ? undefined : { writeText: async () => { throw new Error("Denied"); } } });
    const memory = new SteeringMemory(storage());
    memory.beginSend(id(1), "Keep this text", "Root");
    render(<AgentConversation client={client()} memory={memory} onContext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(await screen.findByText("Select the message text to copy it.")).toBeTruthy();
    expect(screen.getByText("Keep this text")).toBeTruthy();
  });

  it("places later replies after submitted text without treating matching content as delivery", () => {
    const disk = storage();
    writeOutbox(disk, [{ id: id(8), sessionId: id(1), text: "Please inspect", status: "queued", at: "2026-09-08T12:00:00.000Z" }]);
    const selected = client();
    selected.detail = { session: { id: id(1), label: "Root", evidence: "local", status: "observed", parentId: null,
      ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T12:00:03.000Z", message: "", contextPaths: [] },
      handoff: "unavailable", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "" },
      entries: [{ id: "reply", at: "2026-09-08T12:00:02.000Z", kind: "assistant", text: "I inspected it", attribution: "assistant-reported" }] };
    const view = render(<AgentConversation client={selected} memory={new SteeringMemory(disk)} onContext={() => {}} />);
    expect([...view.container.querySelectorAll(".conversation-messages li > p")].map((row) => row.textContent)).toEqual(["Please inspect", "I inspected it"]);
    expect(screen.getByRole("status", { name: "Queued" })).toBeTruthy();
  });

  it("shows exact form-submitted text before a held reply, then retains it after a full memory remount", async () => {
    const disk = storage(), memory = new SteeringMemory(disk), selected = client();
    selected.detail = { session: { id: id(1), label: "Root", evidence: "local", status: "observed", parentId: null,
      ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T12:00:03.000Z", message: "", contextPaths: [] },
      handoff: "available", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "" }, entries: [] };
    let resolve!: (value: CoreResponse) => void;
    const request = vi.fn((input: CoreRequest) => {
      expect(input.type).toBe("externalAgents.send");
      if (input.type !== "externalAgents.send") throw new Error("Wrong request");
      expect(readOutbox(disk)).toEqual([expect.objectContaining({ sessionId: input.sessionId, text: input.text, status: "sending" })]);
      return new Promise<CoreResponse>((yes) => { resolve = yes; });
    });
    const bridge = { request, onEvent: () => () => {} };
    const view = render(<AgentConversation client={selected} bridge={bridge} memory={memory} onContext={() => {}} />);
    const text = "  Exact submitted text\n👋\n";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(view.container.querySelector(".conversation-outgoing p")?.textContent).toBe(text);
    expect(readOutbox(disk)[0].text).toBe(text);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ protocolVersion: PROTOCOL_VERSION, requestId: request.mock.calls[0][0].requestId,
      ok: true, sequence: 1, snapshot: initialSnapshot(), external: { kind: "send", sessionId: id(1), receiptId: id(9), status: "queued", message: "Stored" } }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    view.unmount();
    const after = render(<AgentConversation client={selected} bridge={bridge} memory={new SteeringMemory(disk)} onContext={() => {}} />);
    expect(after.container.querySelector(".conversation-outgoing p")?.textContent).toBe(text);
    expect(after.container.querySelector("[data-outgoing-status='queued']")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not call the form transport when saving fails", () => {
    const disk = storage(); disk.setItem = () => { throw new Error("Storage denied"); };
    const selected = client();
    selected.detail = { session: { id: id(1), label: "Root", evidence: "local", status: "observed", parentId: null,
      ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T12:00:03.000Z", message: "", contextPaths: [] },
      handoff: "available", coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "" }, entries: [] };
    const request = vi.fn(), bridge = { request, onEvent: () => () => {} };
    render(<AgentConversation client={selected} bridge={bridge} memory={new SteeringMemory(disk)} onContext={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Retain draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(request).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Retain draft");
    expect(screen.getByText(/Could not save this message/)).toBeTruthy();
  });
});
