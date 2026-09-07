// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwarmBridge } from "../app/electron/preload";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { AgentDock, type AgentDockProps } from "../app/renderer/agents/AgentDock";
import { fixtureLaunchContext } from "../app/renderer/agents/client";
import { LaunchContextView } from "../app/renderer/agents/LaunchContextView";
import { PreparedLaunchDraft } from "../app/renderer/agents/PreparedLaunchDraft";
import type { LiveAgentState } from "../app/renderer/agents/live-state";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import type { TaskAttachmentCandidate } from "../app/renderer/tasks/client";
import { fixtureV2Draft } from "../fixtures/agent-context-v2";
import { checkoutFileFocus, initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { AGENT_LIMITS, type PreparedAgentContext } from "../protocol/agents";
import { agentTaskBytes, formatRepositoryTask, taskUtf8Bytes, type AgentTaskReference } from "../protocol/agent-task";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type FocusRef } from "../protocol/schema";

type Candidate = TaskAttachmentCandidate;
type SourceChoice = { focus: FocusRef; isCurrent(): boolean } | null;
const reference = (commit = "a"): AgentTaskReference => ({ version: 1, worldId: paymentsFileFocus.worldId,
  repositoryId: "fixture-only", provider: "ditz", taskId: "task-one", metadataCommit: { algorithm: "sha1", hex: commit.repeat(40) },
  issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } });
const candidate = (patch: Partial<Candidate> = {}): Candidate => ({ reference: reference(), title: "Pinned fixture task",
  description: "Untrusted fixture prose — no provider contacted.", isCurrent: () => true, ...patch });
const source = (focus = paymentsFileFocus): Exclude<SourceChoice, null> => ({ focus, isCurrent: () => true });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
type Pending = ReturnType<typeof deferred<CoreResponse>> & { input: CoreRequest };
const capabilities = { availability: "available" as const, reason: null, provider: "deterministic-test-only", version: "test",
  policy: "verified-read-only" as const, controls: { launch: true, steer: true, cancel: true } };

/** Synthetic transport only. Successful prepared/history records are schema
 * fixtures, not D4 resolution, actual D3 behavior, or live provider evidence. */
async function connected(checkpoint?: LiveAgentState) {
  const calls: Pending[] = [];
  const bridge: SwarmBridge = { onEvent: () => () => undefined,
    request(input) { const pending = { ...deferred<CoreResponse>(), input }; calls.push(pending); return pending.promise; } };
  const client = new AgentBridgeClient(checkpoint);
  const off = client.connect(bridge);
  const latest = (type: CoreRequest["type"]) => { const call = calls.filter((entry) => entry.input.type === type).at(-1);
    if (!call) throw new Error(`No ${type} request`); return call; };
  const success = (call: Pending, agent: NonNullable<Extract<CoreResponse, { ok: true }>["agent"]>) => call.resolve(CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION, requestId: call.input.requestId, ok: true, snapshot: initialSnapshot(paymentsFileFocus), sequence: 1, agent,
  }));
  success(latest("agent.snapshot"), { kind: "snapshot", snapshot: { ...emptyAgentWorkbench().snapshot, capabilities } });
  await drain();
  return { client, calls, bridge, off, latest, success };
}
function materialization(task: Candidate) {
  const content = formatRepositoryTask(task.reference, task.title, task.description);
  return { reference: task.reference, content, encoding: "swarm-repository-task-json-v1" as const,
    bytes: taskUtf8Bytes(content), digest: createHash("sha256").update(content).digest("hex") };
}
function preparedFixture(call: Pending, task?: Candidate): PreparedAgentContext {
  if (call.input.type !== "agent.prepare") throw new Error("Expected preparation");
  const input = call.input;
  return fixtureV2Draft({ runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", contextHash: "0".repeat(64),
    preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), capabilities,
    launchContext: { ...fixtureLaunchContext(input.focus, "fixture construction", input.model ?? "", ""),
      contextVersion: 2, sourceLinks: [], taskText: input.taskText, ...(task ? { repositoryTask: materialization(task) } : {}) },
  });
}
async function prepareFixture(h: Awaited<ReturnType<typeof connected>>, task?: Candidate) {
  const promise = h.client.prepare(); const call = h.latest("agent.prepare");
  const prepared = preparedFixture(call, task); h.success(call, { kind: "prepare", draft: prepared }); await promise;
  expect(h.client.getSnapshot().draft?.prepared).toEqual(prepared);
  return prepared;
}
function Draft({ client }: { client: AgentBridgeClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return <PreparedLaunchDraft client={client} state={state} dirtyPaths={[paymentsFileFocus.path!]} />;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("deliberate one-slot task attachment client (injected transport, no provider)", () => {
  it("reviews without drafting or requesting, then creates empty instructions at independent explicit source", async () => {
    const h = await connected(); const task = candidate(); const calls = h.calls.length;
    expect(h.client.proposeTaskAttachment(task, source(checkoutFileFocus))).toBe("review");
    expect(h.client.getSnapshot().draft).toBeNull();
    expect(h.client.getSnapshot().taskProposal).toMatchObject({ focus: checkoutFileFocus, reference: task.reference, instructions: "", hasDraft: false });
    h.client.acceptTaskAttachment("append");
    expect(h.client.getSnapshot().draft).toMatchObject({ focus: checkoutFileFocus, task: "", model: "", taskReference: task.reference,
      taskPreview: { title: task.title, description: task.description }, prepared: null, confirmed: false, preparing: false });
    expect(h.calls).toHaveLength(calls);
  });

  it("uses an existing fixed source over unrelated current navigation and preserves every instruction character", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus);
    const exact = "\ufeff  e\u0301\r\n\t\"quoted\" 🧪  "; client.editDraft({ task: exact, model: "requested-model" });
    client.proposeTaskAttachment(candidate(), source(checkoutFileFocus));
    expect(client.getSnapshot().taskProposal).toMatchObject({ focus: paymentsFileFocus, instructions: exact, hasDraft: true });
    client.acceptTaskAttachment("append");
    expect(client.getSnapshot().draft).toMatchObject({ focus: paymentsFileFocus, task: exact, model: "requested-model", taskReference: reference() });
  });

  it("keeps the generated starter or whitespace under Append and clears it only under explicit Replace", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus);
    const starter = client.getSnapshot().draft!.task;
    client.proposeTaskAttachment(candidate(), null); client.acceptTaskAttachment("append");
    expect(client.getSnapshot().draft?.task).toBe(starter);
    client.editDraft({ task: " \r\n\t " }); client.proposeTaskAttachment(candidate({ reference: reference("c") }), null);
    client.acceptTaskAttachment("replace");
    expect(client.getSnapshot().draft).toMatchObject({ task: "", focus: paymentsFileFocus, taskReference: reference("c") });
  });

  it.each([
    ["missing source", null],
    ["directory", source({ ...paymentsFileFocus, key: "directory:services", path: "services" })],
    ["service", source({ ...paymentsFileFocus, domain: "service", key: "service:payments" })],
    ["noncanonical path", source({ ...paymentsFileFocus, key: "file:services/../secret", path: "services/../secret" })],
    ["unmatched key", source({ ...paymentsFileFocus, key: "file:other.ts" })],
    ["built revision", source({ ...paymentsFileFocus, revisionKind: "built" })],
  ] as const)("refuses %s without manufacturing a source or draft", async (_name, choice) => {
    const h = await connected(); expect(h.client.proposeTaskAttachment(candidate(), choice)).toBe("unavailable");
    expect(h.client.getSnapshot().draft).toBeNull(); expect(h.client.getSnapshot().taskProposal ?? null).toBeNull();
    expect(h.calls.map((call) => call.input.type)).toEqual(["agent.snapshot"]);
  });

  it("does not retarget an unsupported existing draft to a supported selected source", async () => {
    const { client } = await connected(); client.openDraft({ ...paymentsFileFocus, domain: "service", key: "service:payments" });
    const draft = client.getSnapshot().draft;
    expect(client.proposeTaskAttachment(candidate(), source())).toBe("unavailable"); expect(client.getSnapshot().draft).toBe(draft);
  });

  it("rejects stale observed candidates and cross-world task references before proposal", async () => {
    const { client } = await connected();
    for (const task of [candidate({ isCurrent: () => false }), candidate({ reference: { ...reference(), worldId: "world:other" } })]) {
      expect(client.proposeTaskAttachment(task, source())).toBe("unavailable"); expect(client.getSnapshot().draft).toBeNull();
    }
  });

  it.each(["text", "model", "close", "task observation", "source choice", "disconnect"] as const)(
    "refuses stale proposal after %s without applying old intent", async (reason) => {
      const h = await connected(); let taskCurrent = true; let sourceCurrent = true;
      if (reason !== "source choice") { h.client.openDraft(paymentsFileFocus); h.client.editDraft({ task: "original" }); }
      h.client.proposeTaskAttachment(candidate({ isCurrent: () => taskCurrent }), { focus: paymentsFileFocus, isCurrent: () => sourceCurrent });
      if (reason === "text") h.client.editDraft({ task: "NEWER" });
      if (reason === "model") h.client.editDraft({ model: "NEWER" });
      if (reason === "close") h.client.closeDraft();
      if (reason === "task observation") taskCurrent = false;
      if (reason === "source choice") sourceCurrent = false;
      if (reason === "disconnect") h.off();
      const draft = h.client.getSnapshot().draft; h.client.acceptTaskAttachment("replace");
      expect(h.client.getSnapshot().draft).toBe(draft);
      expect(h.client.getSnapshot().notice).toMatch(/changed|stale|unavailable|review|connect/i);
    });

  it("an existing draft's source does not become stale merely because unrelated navigation changes", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus); let otherCurrent = true;
    client.proposeTaskAttachment(candidate(), { focus: checkoutFileFocus, isCurrent: () => otherCurrent }); otherCurrent = false;
    client.acceptTaskAttachment("append"); expect(client.getSnapshot().draft?.taskReference).toEqual(reference());
    expect(client.getSnapshot().draft?.focus).toEqual(paymentsFileFocus);
  });

  it("rejects captured accept and cancel handlers for a superseded proposal without altering the new one", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus); client.editDraft({ task: "Keep this exact intent" });
    client.proposeTaskAttachment(candidate(), null); const oldId = client.getSnapshot().taskProposal!.id;
    const oldAccept = () => client.acceptTaskAttachment("replace", oldId);
    const oldCancel = () => client.cancelTaskAttachment(oldId);
    client.proposeTaskAttachment(candidate({ reference: reference("c") }), null);
    const newer = client.getSnapshot().taskProposal; const draft = client.getSnapshot().draft;
    oldAccept(); expect(client.getSnapshot().taskProposal).toBe(newer); expect(client.getSnapshot().draft).toBe(draft);
    oldCancel(); expect(client.getSnapshot().taskProposal).toBe(newer); expect(client.getSnapshot().draft).toBe(draft);
    client.acceptTaskAttachment("append", newer!.id);
    expect(client.getSnapshot().draft).toMatchObject({ task: "Keep this exact intent", taskReference: reference("c") });
  });

  it("treats exact full pin as a no-op but reviews a newer commit even with identical blob and text", async () => {
    const h = await connected(); const task = candidate(); h.client.proposeTaskAttachment(task, source()); h.client.acceptTaskAttachment("append");
    await prepareFixture(h, task); h.client.confirmDraft(true); const before = h.client.getSnapshot();
    const listener = vi.fn(); const unsubscribe = h.client.subscribe(listener);
    expect(h.client.proposeTaskAttachment(candidate(), source(checkoutFileFocus))).toBe("already-attached");
    expect(h.client.getSnapshot()).toBe(before); expect(listener).not.toHaveBeenCalled(); unsubscribe();
    expect(h.client.proposeTaskAttachment(candidate({ reference: reference("c") }), null)).toBe("review");
    expect(h.client.getSnapshot().taskProposal?.replacing).toBe(true);
    h.client.acceptTaskAttachment("append");
    expect(h.client.getSnapshot().draft).toMatchObject({ taskReference: reference("c"), prepared: null, confirmed: false });
  });

  it("Cancel leaves pending preparation alive and later schema-valid reply can still complete it", async () => {
    const h = await connected(); h.client.openDraft(paymentsFileFocus);
    const pending = h.client.prepare(); const call = h.latest("agent.prepare");
    const draft = h.client.getSnapshot().draft;
    h.client.proposeTaskAttachment(candidate(), null); h.client.cancelTaskAttachment(); expect(h.client.getSnapshot().draft).toBe(draft);
    const prepared = preparedFixture(call); h.success(call, { kind: "prepare", draft: prepared }); await pending;
    expect(h.client.getSnapshot().draft?.prepared).toEqual(prepared);
  });

  it("Cancel preserves already prepared confirmation and does not clear its ticket", async () => {
    const h = await connected(); h.client.openDraft(paymentsFileFocus); await prepareFixture(h); h.client.confirmDraft(true);
    const draft = h.client.getSnapshot().draft; h.client.proposeTaskAttachment(candidate(), null); h.client.cancelTaskAttachment();
    expect(h.client.getSnapshot().draft).toBe(draft); expect(h.client.getSnapshot().draft?.confirmed).toBe(true);
  });

  it("accepted attachment and removal invalidate held Prepare replies without replay", async () => {
    const h = await connected(); h.client.openDraft(paymentsFileFocus); const first = h.client.prepare(); const firstCall = h.latest("agent.prepare");
    h.client.proposeTaskAttachment(candidate(), null); h.client.acceptTaskAttachment("append");
    h.success(firstCall, { kind: "prepare", draft: preparedFixture(firstCall) }); await first;
    expect(h.client.getSnapshot().draft).toMatchObject({ taskReference: reference(), prepared: null, preparing: false, confirmed: false });
    const second = h.client.prepare(); const secondCall = h.latest("agent.prepare"); const before = h.client.getSnapshot().draft!;
    h.client.removeTaskAttachment(); h.success(secondCall, { kind: "prepare", draft: preparedFixture(secondCall, candidate()) }); await second;
    expect(h.client.getSnapshot().draft).toMatchObject({ task: before.task, model: before.model, focus: before.focus, prepared: null, preparing: false, confirmed: false });
    expect(h.client.getSnapshot().draft?.taskReference).toBeUndefined(); expect(h.client.getSnapshot().draft?.taskPreview).toBeUndefined();
    expect(h.calls.filter((call) => call.input.type === "agent.prepare")).toHaveLength(2);
  });

  it("sends only the pinned reference with empty free instructions and preserves intent on unavailable response", async () => {
    const h = await connected(); const task = candidate({ title: "PRIVATE PREVIEW TITLE", description: "PRIVATE PREVIEW BODY" });
    h.client.proposeTaskAttachment(task, source()); h.client.acceptTaskAttachment("append"); const preparing = h.client.prepare(); const call = h.latest("agent.prepare");
    expect(call.input).toMatchObject({ type: "agent.prepare", taskText: "", taskReference: task.reference, focus: paymentsFileFocus });
    expect(JSON.stringify(call.input)).not.toMatch(/PRIVATE PREVIEW|repositoryTask|digest/);
    call.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: call.input.requestId, ok: false,
      error: { code: "UNSUPPORTED_CONTROL", message: "Repository-task context is unavailable" } }); await preparing;
    expect(h.client.getSnapshot().notice).toContain("UNSUPPORTED_CONTROL");
    expect(h.client.getSnapshot().draft).toMatchObject({ task: "", taskReference: task.reference, prepared: null, preparing: false });
    expect(h.calls.some((entry) => entry.input.type === "agent.launch")).toBe(false);
  });

  it("counts the exact escaped full 16 KiB envelope and refuses max+one without mutation", async () => {
    const { client } = await connected(); const task = candidate({ description: "\ufeffe\u0301\r\n\t\" 🧪" });
    const budget = AGENT_LIMITS.taskBytes - agentTaskBytes("", materialization(task));
    client.openDraft(paymentsFileFocus); client.editDraft({ task: "x".repeat(budget) });
    client.proposeTaskAttachment(task, null); client.acceptTaskAttachment("append");
    expect(client.getSnapshot().draft?.taskReference).toEqual(task.reference);
    client.removeTaskAttachment(); client.editDraft({ task: "x".repeat(budget + 1) }); const before = client.getSnapshot().draft;
    client.proposeTaskAttachment(task, null); client.acceptTaskAttachment("append");
    expect(client.getSnapshot().draft).toBe(before); expect(client.getSnapshot().notice).toMatch(/16 KiB|OUTPUT_LIMIT|limit/i);
  });

  it("keeps attachment intent across HMR but removes proposal and preparation authority without replay", async () => {
    const h = await connected(); const task = candidate(); h.client.proposeTaskAttachment(task, source()); h.client.acceptTaskAttachment("append");
    h.client.editDraft({ task: "keep\r\n exact", model: "kept-model" }); await prepareFixture(h, task); h.client.confirmDraft(true);
    h.client.proposeTaskAttachment(candidate({ reference: reference("c") }), null);
    const recovered = new AgentBridgeClient(h.client.getSnapshot()).getSnapshot();
    expect(recovered.connected).toBe(false); expect(recovered.taskProposal ?? null).toBeNull();
    expect(recovered.draft).toMatchObject({ task: "keep\r\n exact", model: "kept-model", taskReference: task.reference,
      taskPreview: { title: task.title, description: task.description, verified: false }, prepared: null, preparing: false, confirmed: false });
    expect(h.calls.filter((call) => call.input.type === "agent.prepare")).toHaveLength(1);
  });
});

describe("task attachment mounted review and immutable history (schema fixtures only)", () => {
  it("a new proposal reveals Agents without recreating an existing draft, run output or mock conversation", async () => {
    const h = await connected(); h.client.openDraft(paymentsFileFocus); h.client.editDraft({ task: "Existing draft bytes" });
    const firstId = "11111111-1111-4111-8111-111111111111";
    const select = vi.spyOn(h.client, "select").mockImplementation(() => undefined);
    const selectMock = vi.fn();
    const base: LiveAgentState = { ...h.client.getSnapshot(), selectedRunId: firstId, paneOpen: true,
      snapshot: { ...h.client.getSnapshot().snapshot!, runs: [{ runId: firstId, state: "completed", taskLabel: "Retained fixture run",
        focusLabel: "core/files.ts", createdAt: "2026-09-07T10:00:00.000Z", updatedAt: "2026-09-07T10:01:00.000Z", endedAt: "2026-09-07T10:01:00.000Z" }] } };
    const dock: AgentDockProps = { state: base, client: h.client, onDraft: vi.fn(),
      draftContent: <textarea aria-label="Retained dock draft" defaultValue="Existing draft bytes" />,
      runContent: <pre>Immutable fixture output</pre>, jobsContent: <div>Existing build evidence</div>, activityContent: <div>Existing activity evidence</div>,
      mockConversation: { tabs: [{ id: "aster", name: "Aster" }], selected: "aster", selectionVersion: 1,
        onSelect: selectMock, content: <textarea aria-label="Retained mock instructions" defaultValue="Unsent mock bytes" /> } };
    const view = render(<AgentDock {...dock} />);
    const draft = screen.getByLabelText("Retained dock draft") as HTMLTextAreaElement;
    const mock = screen.getByLabelText("Retained mock instructions") as HTMLTextAreaElement;
    const run = screen.getByText("Immutable fixture output");
    draft.setSelectionRange(3, 8, "backward"); mock.setSelectionRange(2, 6, "forward");
    expect(screen.getByRole("tab", { name: "Aster mock" }).getAttribute("aria-selected")).toBe("true");
    h.client.proposeTaskAttachment(candidate(), null);
    const proposed: LiveAgentState = { ...base, taskProposal: h.client.getSnapshot().taskProposal };
    view.rerender(<AgentDock {...dock} state={proposed} />);
    expect(screen.getByRole("tab", { name: "Agents · draft" }).getAttribute("aria-selected")).toBe("true");
    expect(select).not.toHaveBeenCalled(); expect(selectMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Retained fixture run completed" }));
    view.rerender(<AgentDock {...dock} state={{ ...proposed, notice: "Unrelated background update", reading: true }} />);
    expect(screen.getByRole("tab", { name: "Retained fixture run completed" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Aster mock" }));
    view.rerender(<AgentDock {...dock} state={{ ...proposed, notice: "Another observation", reading: false }} />);
    expect(screen.getByRole("tab", { name: "Aster mock" }).getAttribute("aria-selected")).toBe("true");
    h.client.proposeTaskAttachment(candidate({ reference: reference("c") }), null);
    const newer: LiveAgentState = { ...base, taskProposal: h.client.getSnapshot().taskProposal };
    view.rerender(<AgentDock {...dock} state={newer} />);
    expect(screen.getByRole("tab", { name: "Agents · draft" }).getAttribute("aria-selected")).toBe("true");
    h.client.cancelTaskAttachment(newer.taskProposal!.id);
    view.rerender(<AgentDock {...dock} state={{ ...newer, taskProposal: null }} />);
    expect(screen.getByLabelText("Retained dock draft")).toBe(draft); expect(draft.value).toBe("Existing draft bytes");
    expect([draft.selectionStart, draft.selectionEnd, draft.selectionDirection]).toEqual([3, 8, "backward"]);
    expect(screen.getByLabelText("Retained mock instructions")).toBe(mock); expect(mock.value).toBe("Unsent mock bytes");
    expect([mock.selectionStart, mock.selectionEnd, mock.selectionDirection]).toEqual([2, 6, "forward"]);
    expect(screen.getByText("Immutable fixture output")).toBe(run);
    expect(select).toHaveBeenCalledExactlyOnceWith(firstId); expect(selectMock).toHaveBeenCalledExactlyOnceWith("aster");
    expect(h.calls.map((call) => call.input.type)).toEqual(["agent.snapshot"]);
  });

  it("a stale mounted review button cannot accept or cancel the newer proposal it did not show", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus); client.editDraft({ task: "Protected draft" });
    client.proposeTaskAttachment(candidate(), null); const captured = client.getSnapshot();
    // A deliberately stale view models an event dispatched before its render
    // consumes the latest external store update. The actual handler must carry
    // the id the person saw, not whichever proposal happens to be current.
    render(<PreparedLaunchDraft state={captured} client={client} dirtyPaths={[]} />);
    client.proposeTaskAttachment(candidate({ reference: reference("c") }), null);
    const newer = client.getSnapshot().taskProposal; const draft = client.getSnapshot().draft;
    fireEvent.click(screen.getByRole("button", { name: "Replace — clear instructions" }));
    expect(client.getSnapshot().taskProposal).toBe(newer); expect(client.getSnapshot().draft).toBe(draft);
    fireEvent.click(screen.getByRole("button", { name: "Cancel attachment" }));
    expect(client.getSnapshot().taskProposal).toBe(newer); expect(client.getSnapshot().draft).toBe(draft);
    fireEvent.keyDown(screen.getByRole("region", { name: "Review task attachment" }), { key: "Escape" });
    expect(client.getSnapshot().taskProposal).toBe(newer); expect(client.getSnapshot().draft).toBe(draft);
  });

  it("reviews a new attachment before a draft exists, Escape cancels and returns to its still-connected invoker", async () => {
    const { client } = await connected(); const view = render(<><button>Original attach invoker</button><Draft client={client} /></>);
    const invoker = screen.getByRole("button", { name: "Original attach invoker" }); invoker.focus();
    act(() => { client.proposeTaskAttachment(candidate(), source(), invoker); });
    const review = screen.getByRole("region", { name: "Review task attachment" });
    expect(within(review).getByRole("button", { name: "Attach task" })).toBeTruthy();
    fireEvent.keyDown(review, { key: "Escape" }); expect(client.getSnapshot().draft).toBeNull();
    expect(screen.queryByRole("region", { name: "Review task attachment" })).toBeNull(); expect(document.activeElement).toBe(invoker);
    view.unmount();
  });

  it("preserves instructions under labelled Append and shows the attached preview as readonly, not editable prose", async () => {
    const { client } = await connected(); client.openDraft(paymentsFileFocus); client.editDraft({ task: "Keep my exact instructions" });
    render(<Draft client={client} />); const task = candidate(); act(() => { client.proposeTaskAttachment(task, null); });
    const review = screen.getByRole("region", { name: "Review task attachment" });
    fireEvent.click(within(review).getByRole("button", { name: "Append — keep instructions" }));
    expect(client.getSnapshot().draft?.task).toBe("Keep my exact instructions");
    expect(screen.getByText(task.title)).toBeTruthy(); expect(screen.getByText(task.description)).toBeTruthy();
    expect(screen.getByText(/core verifies at Prepare/i)).toBeTruthy();
    expect(screen.getAllByRole("textbox").some((element) => (element as HTMLTextAreaElement).value === task.description)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove attached task" }));
    expect(client.getSnapshot().draft?.task).toBe("Keep my exact instructions"); expect(client.getSnapshot().draft?.taskReference).toBeUndefined();
  });

  it("names occupied-slot replacement explicitly and enables empty-instruction Prepare only while attached", async () => {
    const { client } = await connected(); client.proposeTaskAttachment(candidate(), source()); client.acceptTaskAttachment("append");
    render(<Draft client={client} />);
    expect((screen.getByRole("button", { name: "Prepare disk context" }) as HTMLButtonElement).disabled).toBe(false);
    act(() => { client.proposeTaskAttachment(candidate({ reference: reference("c") }), null); });
    const review = screen.getByRole("region", { name: "Review task attachment" });
    expect(within(review).getAllByRole("button").filter((button) => /replace attached task/i.test(button.textContent ?? "")).length).toBeGreaterThan(0);
    fireEvent.click(within(review).getByRole("button", { name: "Cancel attachment" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove attached task" }));
    expect((screen.getByRole("button", { name: "Prepare disk context" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders original immutable task provenance and labels untagged legacy history without fetching current metadata", async () => {
    const h = await connected(); const task = candidate(); h.client.proposeTaskAttachment(task, source()); h.client.acceptTaskAttachment("append");
    const preparing = h.client.prepare(); const call = h.latest("agent.prepare"); const prepared = preparedFixture(call, task);
    h.success(call, { kind: "prepare", draft: prepared }); await preparing;
    const view = render(<LaunchContextView context={prepared.launchContext} />);
    expect(screen.getAllByText(new RegExp(task.title)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(task.reference.metadataCommit.hex)).length).toBeGreaterThan(0);
    const legacy = fixtureLaunchContext(paymentsFileFocus, "Original legacy task", "", "");
    view.rerender(<LaunchContextView context={legacy} />);
    expect(screen.getByText(/Legacy context; no structured task provenance recorded/i)).toBeTruthy();
    expect(h.calls.map((entry) => entry.input.type)).toEqual(["agent.snapshot", "agent.prepare"]);
  });
});
