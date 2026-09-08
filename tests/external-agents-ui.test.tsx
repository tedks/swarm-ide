// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwarmBridge } from "../app/electron/preload";
import { ExternalAgentInformation, ExternalAgentRail, lineageRows } from "../app/renderer/external-agents/ExternalAgents";
import { useExternalAgents } from "../app/renderer/external-agents/client";
import { initialSnapshot } from "../fixtures/world";
import type { ExternalAgentSummary, ExternalDetail, ExternalResult } from "../protocol/external-agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const at = "2026-09-07T20:00:00.000Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function session(n: number, parent?: number): ExternalAgentSummary {
  return { id: id(n), label: `Agent ${n}`, evidence: "synthetic", status: "observed", parentId: parent === undefined ? null : id(parent),
    ancestry: parent === undefined ? "root" : "registered-parent", observationId: String(n % 10).repeat(64), observedAt: at,
    message: "Recorded metadata only", contextPaths: ["docs/architecture.md"] };
}
function detail(n: number): ExternalDetail {
  return { session: session(n), handoff: "available", coverage: { tailBytes: 800, partial: true, omittedRecords: 2, message: "Input messages withheld." },
    entries: [
      { id: "turn", at, kind: "turn-start", text: "Turn began", attribution: "harness-event" },
      { id: "tool", at, kind: "tool-result", text: "Reported tool output: /private/not-a-link; <button>malicious</button>", attribution: "recorded-tool-event" },
      { id: "reply", at, kind: "assistant", text: `Agent ${n} reports a change; not repository verification.`, attribution: "assistant-reported" },
    ] };
}
function success(request: CoreRequest, external: ExternalResult): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(), external };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(handle?: (request: CoreRequest) => Promise<CoreResponse> | undefined) {
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    const held = handle?.(input); if (held) return held;
    if (input.type === "externalAgents.snapshot") return success(input, { kind: "snapshot", snapshot: { status: "observed", observedAt: at, message: "Explicit operator registrations", sessions: [session(1), session(2, 1)] } });
    if (input.type === "externalAgents.read") return success(input, { kind: "read", detail: detail(input.sessionId === id(1) ? 1 : 2) });
    if (input.type === "externalAgents.handoff") return success(input, { kind: "handoff", sessionId: input.sessionId, status: "opened", message: "Existing target selected." });
    throw new Error(`Unexpected request ${input.type}`);
  });
  const bridge: SwarmBridge = { request, onEvent: () => () => {} };
  return { bridge, request };
}

describe("external observer presentation and lifecycle", () => {
  it("connects real branches with continuing ancestor trunks and last-child elbows, never across roots", () => {
    const rows = lineageRows([session(1), session(2, 1), session(3, 2), session(4, 2), session(5, 1), session(6, 5), session(7), session(8, 7)]);
    expect(rows.map(({ session: item, ...geometry }) => ({ id: item.id, ...geometry }))).toEqual([
      { id: id(1), depth: 0, ancestorTrunks: [], lastSibling: true, hasChildren: true },
      { id: id(2), depth: 1, ancestorTrunks: [], lastSibling: false, hasChildren: true },
      { id: id(3), depth: 2, ancestorTrunks: [true], lastSibling: false, hasChildren: false },
      { id: id(4), depth: 2, ancestorTrunks: [true], lastSibling: true, hasChildren: false },
      { id: id(5), depth: 1, ancestorTrunks: [], lastSibling: true, hasChildren: true },
      { id: id(6), depth: 2, ancestorTrunks: [false], lastSibling: true, hasChildren: false },
      { id: id(7), depth: 0, ancestorTrunks: [], lastSibling: true, hasChildren: true },
      { id: id(8), depth: 1, ancestorTrunks: [], lastSibling: true, hasChildren: false },
    ]);
  });

  it("keeps unknown, cyclic and absent registered parents disconnected without losing sessions", () => {
    const rows = lineageRows([
      { ...session(1, 99), ancestry: "unknown-parent" },
      { ...session(2, 3), ancestry: "cycle" }, { ...session(3, 2), ancestry: "cycle" },
      session(4, 99), session(5, 6), session(6, 5), session(7, 7),
    ]);
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toMatchObject({ depth: 0, ancestorTrunks: [], hasChildren: false });
  });

  it("keeps native buttons focused and selection read-only while drawing uncapped connectors", async () => {
    const chain = Array.from({ length: 12 }, (_, i) => session(i + 1, i ? i : undefined));
    const client = { snapshot: { status: "observed" as const, observedAt: at, message: "Bounded", sessions: chain }, detail: null, selected: id(12),
      busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) };
    const onSelect = vi.fn(), view = render(<ExternalAgentRail client={client} onSelect={onSelect} />);
    const selected = screen.getByRole("button", { name: "Inspect external agent Agent 12" });
    selected.focus(); expect(document.activeElement).toBe(selected);
    view.rerender(<ExternalAgentRail client={{ ...client, notice: "Observation refreshed" }} onSelect={onSelect} />);
    expect(document.activeElement).toBe(selected);
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.querySelectorAll(".external-lineage-branch")).toHaveLength(11);
    expect(view.container.querySelectorAll(".external-lineage-stem")).toHaveLength(11);
    expect(view.container.querySelector(`[data-session="${id(12)}"]`)?.getAttribute("style")).toContain("176px");
    expect(screen.getByRole("list", { name: "Fork lineage" }).parentElement?.className).toBe("external-lineage-scroll");
    fireEvent.click(selected);
    expect(onSelect).toHaveBeenCalledTimes(1); expect(client.read).toHaveBeenCalledExactlyOnceWith(id(12));
    expect(client.handoff).not.toHaveBeenCalled();
  });

  it("renders all 64 ancestry levels without assigning role-based depth or inventing unknown parents", () => {
    const chain = Array.from({ length: 64 }, (_, i) => session(i + 1, i ? i : undefined));
    const rows = lineageRows([...chain].reverse());
    expect(rows.map((row) => row.depth)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(rows.map((row) => row.session.id)).toEqual(chain.map((row) => row.id));
    const unknown = { ...session(65, 999), ancestry: "unknown-parent" as const };
    const cyclic = { ...session(66, 66), ancestry: "cycle" as const };
    expect(lineageRows([unknown, cyclic, cyclic]).map((row) => [row.session.id, row.depth])).toEqual([[id(65), 0], [id(66), 0]]);
    const client = { snapshot: { status: "observed" as const, observedAt: at, message: "Bounded", sessions: chain }, detail: null, selected: null,
      busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) };
    const view = render(<ExternalAgentRail client={client} onSelect={() => {}} />);
    expect(screen.getAllByRole("button", { name: /Inspect external agent/ })).toHaveLength(64);
    expect(view.container.querySelector(`[data-session="${id(64)}"]`)?.getAttribute("data-depth")).toBe("63");
    expect(client.read).not.toHaveBeenCalled();
  });

  it("selection only reads; explicit handoff, context opening and return are separate gestures", async () => {
    const { bridge, request } = setup(); const onSelect = vi.fn(), onOpen = vi.fn(), onReturn = vi.fn();
    function Harness() {
      const client = useExternalAgents(bridge, true, 1);
      return <><ExternalAgentRail client={client} onSelect={onSelect} /><ExternalAgentInformation client={client} onOpen={onOpen} onReturn={onReturn} /></>;
    }
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect external agent Agent 1" }));
    await screen.findByText("Example session");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([r]) => r.type)).toEqual(["externalAgents.snapshot", "externalAgents.read"]);
    expect(screen.getByRole("region", { name: "Session steering" })).toBeTruthy();
    const log = screen.getByRole("list", { name: "Recorded agent worklog" });
    expect(within(log).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual(detail(1).entries.map((entry) => entry.text));
    expect(within(log).queryByRole("button")).toBeNull(); expect(within(log).queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Conversation" }));
    expect(within(screen.getByRole("list", { name: "Recorded assistant conversation" })).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByText("Why this context?"));
    fireEvent.click(screen.getByRole("button", { name: "docs/architecture.md" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("docs/architecture.md");
    fireEvent.click(screen.getByRole("button", { name: "Return to source information" })); expect(onReturn).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.filter(([r]) => r.type === "externalAgents.handoff")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Select in tmux" }));
    await waitFor(() => expect(screen.getAllByText("Existing target selected.")).toHaveLength(2));
    expect(request.mock.calls.at(-1)?.[0]).toMatchObject({ type: "externalAgents.handoff", sessionId: id(1), observationId: "1".repeat(64) });
    await waitFor(() => expect((screen.getByRole("button", { name: "Select in tmux" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("waits for readiness and pauses automatic observation when hidden", async () => {
    const { bridge, request } = setup();
    vi.useFakeTimers();
    const hook = renderHook(({ ready, visible }) => useExternalAgents(bridge, ready, 1, visible), { initialProps: { ready: false, visible: true } });
    expect(request).not.toHaveBeenCalled();
    await act(async () => { hook.rerender({ ready: true, visible: true }); });
    expect(hook.result.current.snapshot).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(request.mock.calls.map(([r]) => r.type)).toEqual(["externalAgents.snapshot", "externalAgents.snapshot"]);
    hook.rerender({ ready: true, visible: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let an earlier held selection overwrite a newer selected conversation", async () => {
    const held = deferred<CoreResponse>(); let first!: CoreRequest;
    const { bridge } = setup((input) => { if (input.type === "externalAgents.read" && input.sessionId === id(1)) { first = input; return held.promise; } });
    const hook = renderHook(() => useExternalAgents(bridge, true, 1));
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    let firstRead!: Promise<void>; act(() => { firstRead = hook.result.current.read(id(1)); });
    let secondRead!: Promise<void>; act(() => { secondRead = hook.result.current.read(id(2)); });
    expect(hook.result.current.selected).toBe(id(2)); expect(hook.result.current.detail).toBeNull();
    await act(async () => { held.resolve(success(first, { kind: "read", detail: detail(1) })); await firstRead; });
    await act(async () => { await secondRead; });
    expect(hook.result.current.selected).toBe(id(2)); expect(hook.result.current.detail?.session.id).toBe(id(2));
    expect(hook.result.current.notice).toBe(""); expect(hook.result.current.busy).toBe(false);
  });

  it("invalidates held successes and rejections across core recovery without stale notices or busy-state changes", async () => {
    const held = deferred<CoreResponse>(); let first!: CoreRequest;
    const { bridge, request } = setup((input) => { if (input.type === "externalAgents.read" && input.sessionId === id(1)) { first = input; return held.promise; } });
    const hook = renderHook(({ ready, generation }) => useExternalAgents(bridge, ready, generation), { initialProps: { ready: true, generation: 1 } });
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    let firstRead!: Promise<void>; act(() => { firstRead = hook.result.current.read(id(1)); });
    hook.rerender({ ready: false, generation: 2 });
    await act(async () => { held.resolve(success(first, { kind: "read", detail: detail(1) })); await firstRead; });
    expect(hook.result.current.detail).toBeNull(); expect(hook.result.current.snapshot).toBeNull();
    expect(hook.result.current.notice).toContain("core recovers"); expect(hook.result.current.busy).toBe(false);
    const rejected = deferred<CoreResponse>(); let heldOnce = false;
    const next = setup((input) => {
      if (!heldOnce && input.type === "externalAgents.read" && input.sessionId === id(2)) { heldOnce = true; return rejected.promise; }
    });
    hook.unmount();
    const recovered = renderHook(({ generation }) => useExternalAgents(next.bridge, true, generation), { initialProps: { generation: 2 } });
    await waitFor(() => expect(recovered.result.current.snapshot).not.toBeNull());
    let staleRead!: Promise<void>; act(() => { staleRead = recovered.result.current.read(id(2)); });
    recovered.rerender({ generation: 3 });
    await act(async () => { rejected.reject(new Error("Old transport lost")); await staleRead; });
    await waitFor(() => expect(recovered.result.current.detail?.session.id).toBe(id(2)));
    expect(recovered.result.current.detail?.session.id).toBe(id(2)); expect(recovered.result.current.notice).toBe("");
    expect(recovered.result.current.busy).toBe(false);
    expect(request.mock.calls.filter(([r]) => r.type === "externalAgents.handoff")).toHaveLength(0);
  });

  it("does not publish a held result after disposal or invalidate a newer selection after held handoff", async () => {
    const held = deferred<CoreResponse>(); let command!: CoreRequest;
    const { bridge } = setup((input) => { if (input.type === "externalAgents.handoff") { command = input; return held.promise; } });
    const hook = renderHook(() => useExternalAgents(bridge, true, 1));
    await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
    await act(async () => { await hook.result.current.read(id(1)); });
    let handoff!: Promise<void>; act(() => { handoff = hook.result.current.handoff(); });
    let nextRead!: Promise<void>; act(() => { nextRead = hook.result.current.read(id(2)); });
    await act(async () => { held.resolve(success(command, { kind: "handoff", sessionId: id(1), status: "opened", message: "Old target opened." })); await handoff; });
    await act(async () => { await nextRead; });
    expect(hook.result.current.detail?.session.id).toBe(id(2)); expect(hook.result.current.detail?.handoff).toBe("available"); expect(hook.result.current.notice).toBe("");
    const last = deferred<CoreResponse>(); let pending!: CoreRequest, renders = 0;
    const disposed = setup((input) => { pending = input; return last.promise; });
    const unmounted = renderHook(() => { ++renders; return useExternalAgents(disposed.bridge, true, 1); });
    unmounted.unmount(); const count = renders;
    await act(async () => { last.resolve(success(pending, { kind: "snapshot", snapshot: { status: "observed", observedAt: at, message: "Late", sessions: [session(1)] } })); });
    expect(renders).toBe(count); expect(unmounted.result.current.snapshot).toBeNull();
  });
});
