// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrustedLocalPane } from "../app/renderer/agents/TrustedLocalPane";
import type { SwarmBridge } from "../app/electron/preload";
import type { LiveAgentState } from "../app/renderer/agents/live-state";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { TrustedSnapshotSchema, type TrustedSnapshot } from "../protocol/trusted-local";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const INSTANCE = "44444444-4444-4444-8444-444444444444";
const at = "2026-09-07T12:00:00.000Z";
function snapshot(token = A, extra: Partial<TrustedSnapshot> = {}): TrustedSnapshot {
  return TrustedSnapshotSchema.parse({ instanceId: INSTANCE, profile: "trusted-local", workspace: "/fixed/repository",
    preparation: null, runToken: token, status: "running", threadId: `thread:${token}`, turnId: `turn:${token}`,
    output: token === A ? "Output A" : "Output B", message: "Observed", approvals: [], archived: false,
    runs: [A, B].map((runToken) => ({ runToken, title: runToken === A ? "Run A" : "Run B", createdAt: at,
      updatedAt: at, status: "running", archived: false, approvalCount: 0, taskReference: null, message: "Observed" })), ...extra });
}
const draft: LiveAgentState["draft"] = { focus: { ...paymentsFileFocus, key: "file:services/payments/src/service.ts" },
  task: "Inspect fixed source", model: "", prepared: null, confirmed: false, preparing: false };
interface Deferred {
  request: CoreRequest; settled: boolean;
  resolve: (response: CoreResponse) => void; reject: (error: Error) => void;
}
function harness() {
  const calls: Deferred[] = [];
  const bridge: SwarmBridge = { onEvent: () => () => {}, request: (request) => new Promise((resolve, reject) => {
    calls.push({ request, resolve, reject, settled: false });
  }) };
  function take(type: CoreRequest["type"], token?: string) {
    const call = calls.find((c) => !c.settled && c.request.type === type && (token === undefined || ("token" in c.request && c.request.token === token)));
    if (!call) throw new Error(`Missing pending ${type} for ${token ?? "any token"}`);
    return call;
  }
  async function answer(call: Deferred, value: TrustedSnapshot, sequence: number) {
    call.settled = true;
    const response = CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId,
      ok: true, sequence, snapshot: initialSnapshot(), trusted: { kind: "trusted", snapshot: value } });
    await act(async () => { call.resolve(response); });
  }
  async function fail(call: Deferred, transport = false) {
    call.settled = true;
    await act(async () => {
      if (transport) call.reject(new Error("Acknowledgement lost"));
      else call.resolve(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId,
        ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Observed turn changed; message not delivered" } }));
    });
  }
  return { bridge, calls, take, answer, fail };
}
type Harness = ReturnType<typeof harness>;
function click(name: string | RegExp) { fireEvent.click(screen.getByRole("button", { name })); }
function edit(text: string) { fireEvent.change(screen.getByRole("textbox", { name: "Message Codex" }), { target: { value: text } }); }
function composer() { return (screen.getByRole("textbox", { name: "Message Codex" }) as HTMLTextAreaElement).value; }
async function mounted(value = snapshot()) {
  const h = harness();
  const view = render(<TrustedLocalPane bridge={h.bridge} draft={draft} connected generation={1} />);
  await h.answer(h.take("trusted.snapshot"), value, 1);
  return { h, view };
}
async function selectB(h: Harness, value = snapshot(B), sequence = 2) {
  click(/^Run B/);
  await h.answer(h.take("trusted.snapshot", B), value, sequence);
}
afterEach(() => { cleanup(); localStorage.clear(); });

describe("mounted trusted fleet response races", () => {
  it("targets the observed run and turn and never clears another selected run's composer", async () => {
    const { h } = await mounted();
    edit("Steer A"); click("Send message");
    const send = h.take("trusted.send", A);
    expect(send.request).toMatchObject({ token: A, expectedTurnId: `turn:${A}`, text: "Steer A" });
    await selectB(h); edit("Unsent B");
    await h.answer(send, snapshot(A, { output: "A acknowledged" }), 3);
    expect(composer()).toBe("Unsent B");
    expect(screen.getByLabelText("Codex conversation").textContent).toBe("Output B");
    expect(screen.getByRole("button", { name: /^Run B/ }).getAttribute("aria-pressed")).toBe("true");
    click(/^Run A/); expect(composer()).toBe("");
  });

  it("retains edits made to the sending composer's revision while its response is delayed", async () => {
    const { h } = await mounted();
    edit("First revision"); click("Send message");
    const send = h.take("trusted.send", A);
    edit("New unsent revision");
    await h.answer(send, snapshot(), 2);
    expect(composer()).toBe("New unsent revision");
    expect(h.calls.filter((c) => c.request.type === "trusted.send")).toHaveLength(1);
  });

  it("allows independent pending runs without duplicate delivery or cross-run busy release", async () => {
    const { h } = await mounted();
    edit("A pending"); click("Send message"); click("Send message");
    const a = h.take("trusted.send", A);
    await selectB(h); edit("B pending"); click("Send message");
    const b = h.take("trusted.send", B);
    await h.answer(a, snapshot(), 3);
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
    click("Send message");
    expect(h.calls.filter((c) => c.request.type === "trusted.send")).toHaveLength(2);
    await h.answer(b, snapshot(B), 4);
    expect(composer()).toBe("");
    edit("B again");
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("accepts older A detail independently of a newer B response without moving selection", async () => {
    const { h } = await mounted();
    edit("A delivery"); click("Send message");
    const a = h.take("trusted.send", A);
    await selectB(h, snapshot(B, { output: "B newer" }), 12);
    await h.answer(a, snapshot(A, { output: "A delayed detail" }), 11);
    expect(screen.getByLabelText("Codex conversation").textContent).toBe("B newer");
    click(/^Run A/);
    expect(screen.getByLabelText("Codex conversation").textContent).toBe("A delayed detail");
  });

  it("does not roll the same run back when a stale observation follows a newer command response", async () => {
    const { h } = await mounted();
    click("Refresh conversations"); const oldRead = h.take("trusted.snapshot");
    expect(oldRead.request).not.toHaveProperty("token");
    edit("A delivery"); click("Send message");
    await h.answer(h.take("trusted.send", A), snapshot(A, { output: "New output", turnId: "new-turn" }), 10);
    await h.answer(oldRead, snapshot(A, { status: "ready", turnId: null, output: "Stale output" }), 9);
    expect(screen.getByLabelText("Codex conversation").textContent).toBe("New output");
    edit("New turn target"); click("Send message");
    expect(h.take("trusted.send", A).request).toMatchObject({ expectedTurnId: "new-turn" });
  });

  it("drops old-generation completion and gates retained drafts on fresh observation", async () => {
    const { h, view } = await mounted();
    edit("Keep local draft"); click("Send message"); const oldSend = h.take("trusted.send", A);
    view.rerender(<TrustedLocalPane bridge={h.bridge} draft={draft} connected generation={2} />);
    expect(screen.queryByRole("textbox", { name: "Message Codex" })).toBeNull();
    await h.answer(oldSend, snapshot(A, { output: "Old core reply" }), 100);
    expect(screen.queryByText("Old core reply")).toBeNull();
    await h.answer(h.take("trusted.snapshot"), snapshot(A, { instanceId: P, output: "Replacement core" }), 1);
    expect(composer()).toBe("Keep local draft");
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false);
    expect(h.calls.filter((c) => c.request.type === "trusted.send")).toHaveLength(1);
  });

  it("rediscovers an uncertain launch after the selected run disappears across a core generation", async () => {
    const { h, view } = await mounted();
    edit("Local A draft survives recovery");
    view.rerender(<TrustedLocalPane bridge={h.bridge} draft={draft} connected generation={2} />);
    const idle = snapshot(A, { instanceId: P, runToken: null, threadId: null, turnId: null,
      status: "idle", output: "", runs: [] });
    await h.answer(h.take("trusted.snapshot"), idle, 1);
    await waitFor(() => expect(h.take("trusted.snapshot", A)).toBeTruthy(), { timeout: 1500 });
    const unavailable = async (call: Deferred) => {
      call.settled = true;
      await act(async () => call.resolve(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION,
        requestId: call.request.requestId, ok: false,
        error: { code: "AGENT_RUN_UNAVAILABLE", message: "Selected run is absent from this core" } })));
    };
    await unavailable(h.take("trusted.snapshot", A));
    fireEvent.click(screen.getByText("Use attached source or task"));
    click("Prepare trusted-local context");
    await h.answer(h.take("trusted.prepare"), { ...idle, preparation: { token: B, prompt: "New B prompt",
      expiresAt: "2099-01-01T00:00:00.000Z", model: null } }, 2);
    fireEvent.click(screen.getByRole("checkbox", { name: /Launch in this workspace/ }));
    click("Launch trusted-local Codex");
    await h.fail(h.take("trusted.launch", B), true);
    // An uncertain launch now refreshes automatically; the empty-state composer has no toolbar.
    // Finish the old targeted read if a serialized refresh was already in flight.
    const oldRead = h.calls.find((call) => !call.settled && call.request.type === "trusted.snapshot" && call.request.token === A);
    if (oldRead) await unavailable(oldRead);
    const defaultRead = () => h.calls.find((call) => !call.settled && call.request.type === "trusted.snapshot" && call.request.token === undefined);
    await waitFor(() => expect(defaultRead()).toBeDefined(), { timeout: 1500 });
    await h.answer(defaultRead()!, snapshot(B, { instanceId: P, runs: [snapshot().runs![1]!] }), 3);
    expect(screen.getByRole("button", { name: /^Run B/ })).toBeTruthy();
    expect(h.calls.filter((call) => call.request.type === "trusted.launch")).toHaveLength(1);
    expect(h.calls.filter((call) => call.request.type === "trusted.send")).toHaveLength(0);
    // Re-observing A in a later core must recover its local text, never deliver it to B.
    view.rerender(<TrustedLocalPane bridge={h.bridge} draft={draft} connected generation={3} />);
    const restoredRead = h.calls.filter((call) => !call.settled && call.request.type === "trusted.snapshot").at(-1)!;
    await h.answer(restoredRead, snapshot(A), 1);
    expect(composer()).toBe("Local A draft survives recovery");
  });

  it("prepares beside a pending live run and reconciles uncertain launch without replay", async () => {
    const { h } = await mounted();
    edit("Existing draft"); click("Send message");
    click("New agent"); fireEvent.click(screen.getByText("Use attached source or task")); click("Prepare trusted-local context");
    const preparation = { token: P, prompt: "Exact new prompt", expiresAt: "2099-01-01T00:00:00.000Z", model: null };
    await h.answer(h.take("trusted.prepare"), snapshot(A, { preparation }), 2);
    click(/^Run A/);
    expect(composer()).toBe("Existing draft");
    click("New agent");
    fireEvent.click(screen.getByText("Use attached source or task"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Launch in this workspace/ }));
    click("Launch trusted-local Codex");
    const launch = h.take("trusted.launch", P);
    await h.fail(launch, true);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/Connection interrupted/)).toBeTruthy();
    const runs = [...snapshot().runs!, { ...snapshot().runs![1]!, runToken: P, title: "Newly launched run" }];
    await h.answer(h.take("trusted.snapshot"), snapshot(A, { runs }), 3);
    click(/^Newly launched run/);
    // Launch recovery may have queued a catalog read before selection; reads are serialized.
    await waitFor(() => expect(h.take("trusted.snapshot")).toBeTruthy());
    const inFlight = h.take("trusted.snapshot");
    if (inFlight.request.type === "trusted.snapshot" && inFlight.request.token !== P) {
      expect([undefined, A]).toContain(inFlight.request.token);
      await h.answer(inFlight, snapshot(A, { runs }), 3);
    }
    await waitFor(() => expect(h.take("trusted.snapshot", P)).toBeTruthy());
    await h.answer(h.take("trusted.snapshot", P), snapshot(P, { runs, output: "Late launch observed" }), 4);
    expect(screen.getByText("Late launch observed")).toBeTruthy();
    expect(h.calls.filter((c) => c.request.type === "trusted.launch")).toHaveLength(1);
  });

  it("targets approvals and stop explicitly, retains rejected drafts, and makes archives read-only", async () => {
    const approval = { id: "approval-a", method: "command", summary: "A asks", choices: ["accept", "decline"] };
    const { h } = await mounted(snapshot(A, { approvals: [approval] }));
    click("Allow once"); const decide = h.take("trusted.decide", A);
    expect(decide.request).toMatchObject({ token: A, approvalId: "approval-a", choice: "accept" });
    await selectB(h, snapshot(B, { status: "ready", turnId: null }));
    edit("Next B turn"); click("Send message"); const send = h.take("trusted.send", B);
    expect(send.request).toMatchObject({ expectedTurnId: null, token: B });
    await h.fail(send);
    expect(composer()).toBe("Next B turn");
    click("Stop conversation"); expect(h.take("trusted.stop", B).request).toMatchObject({ token: B });
    await h.answer(decide, snapshot(A), 3);
    const read = h.take("trusted.snapshot", B);
    await h.answer(read, snapshot(B, { archived: true, status: "closed", approvals: [approval] }), 4);
    expect(screen.getByText(/Archived conversation/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Allow once" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop conversation" })).toBeNull();
    expect(within(screen.getByText("Unsent draft").parentElement!).getByText("Next B turn")).toBeTruthy();
    expect(h.calls.filter((c) => c.request.type === "trusted.send")).toHaveLength(1);
  });
});
