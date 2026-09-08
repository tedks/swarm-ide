// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwarmBridge } from "../app/electron/preload";
import { useExternalAgents } from "../app/renderer/external-agents/client";
import { initialSnapshot } from "../fixtures/world";
import type { ExternalAgentSummary, ExternalDetail, ExternalResult } from "../protocol/external-agents";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-09-08T00:40:00.000Z";
const row = (n: number): ExternalAgentSummary => ({ id: id(n), label: `Session ${n}`, evidence: "synthetic", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "Controlled fixture", contextPaths: [] });
const detail = (n: number, text = "Original tail", offset = "0"): ExternalDetail => ({ session: row(n), handoff: "available", coverage: { tailBytes: 100, partial: false, omittedRecords: 0, message: "Bounded fixture" }, entries: [{ id: `${offset}:0`, at, kind: "assistant", attribution: "assistant-reported", text }] });
const success = (request: CoreRequest, external: ExternalResult): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(), external });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup() {
  let tail = detail(1), sessions = [row(1), row(2)], fail = false;
  let override: ((request: CoreRequest) => Promise<CoreResponse> | undefined) | undefined;
  let active = 0, maximum = 0;
  const request = vi.fn(async (input: CoreRequest) => {
    ++active; maximum = Math.max(maximum, active);
    try {
      const held = override?.(input); if (held) return await held;
      if (fail) throw new Error("Controlled transport loss");
      if (input.type === "externalAgents.snapshot") return success(input, { kind: "snapshot", snapshot: { status: "observed", observedAt: at, message: "Controlled registry", sessions } });
      if (input.type === "externalAgents.read") return success(input, { kind: "read", detail: input.sessionId === id(1) ? tail : detail(2) });
      throw new Error(`Unexpected action ${input.type}`);
    } finally { --active; }
  });
  const bridge: SwarmBridge = { request, onEvent: () => () => {} };
  return { bridge, request, max: () => maximum, setTail: (value: ExternalDetail) => { tail = value; }, setSessions: (value: ExternalAgentSummary[]) => { sessions = value; }, setFailure: (value: boolean) => { fail = value; }, hold: (fn: typeof override) => { override = fn; } };
}
async function start(fixture: ReturnType<typeof setup>) {
  vi.useFakeTimers();
  const hook = renderHook(({ ready, generation, visible }) => useExternalAgents(fixture.bridge, ready, generation, visible), { initialProps: { ready: true, generation: 1, visible: true } });
  await act(async () => {});
  await act(async () => { await hook.result.current.read(id(1)); });
  return hook;
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("live external observation", () => {
  it("refreshes the selected tail every second and registry every three seconds without duplicates or overlap", async () => {
    const f = setup(), hook = await start(f);
    f.setTail(detail(1, "New bounded tail", "262144"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.result.current.detail?.entries.map((entry) => entry.text)).toEqual(["New bounded tail"]);
    expect(hook.result.current.selected).toBe(id(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(f.request.mock.calls.filter(([r]) => r.type === "externalAgents.snapshot")).toHaveLength(2);
    expect(f.request.mock.calls.filter(([r]) => r.type === "externalAgents.read")).toHaveLength(4);
    expect(f.max()).toBe(1); expect(vi.getTimerCount()).toBe(1);
    expect(hook.result.current.detail?.entries).toHaveLength(1);
  });

  it("retains detail without explicit busy during slow refresh and coalesces newer selections", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    f.hold((r) => { if (r.type === "externalAgents.read" && !input) { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Original tail");
    expect(hook.result.current.busy).toBe(false); expect(hook.result.current.refreshing).toBe(true);
    let superseded!: Promise<void>, latest!: Promise<void>;
    act(() => { superseded = hook.result.current.read(id(1)); latest = hook.result.current.read(id(2)); });
    await act(async () => { await superseded; await vi.advanceTimersByTimeAsync(60_000); });
    expect(f.max()).toBe(1); expect(f.request).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
    await act(async () => { held.resolve(success(input, { kind: "read", detail: detail(1, "Late old agent") })); await latest; });
    expect(hook.result.current.detail?.session.id).toBe(id(2));
    expect(hook.result.current.detail?.entries[0]?.text).not.toBe("Late old agent"); expect(f.max()).toBe(1);
  });

  it("pauses hidden requests and timers, ignores a late result, then refreshes on return", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    f.hold((r) => { if (r.type === "externalAgents.read" && !input) { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    hook.rerender({ ready: true, generation: 1, visible: false });
    await act(async () => { held.resolve(success(input, { kind: "read", detail: detail(1, "Hidden late tail") })); await vi.advanceTimersByTimeAsync(60_000); });
    expect(f.request).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Original tail");
    expect(hook.result.current.detail?.handoff).toBe("unavailable"); expect(hook.result.current.observing).toBe(false);
    f.setTail(detail(1, "Current after return"));
    await act(async () => { hook.rerender({ ready: true, generation: 1, visible: true }); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Current after return"); expect(f.max()).toBe(1);
  });

  it("obeys document visibility and unmount without publishing late rejections or leaving timers", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>();
    f.hold((r) => r.type === "externalAgents.read" ? held.promise : undefined);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.observing).toBe(false); expect(vi.getTimerCount()).toBe(0);
    hook.unmount(); const calls = f.request.mock.calls.length;
    await act(async () => { held.reject(new Error("Late rejection")); await vi.advanceTimersByTimeAsync(60_000); });
    expect(f.request).toHaveBeenCalledTimes(calls); expect(vi.getTimerCount()).toBe(0);
  });

  it("retains failed-read evidence with revoked handoff, retries boundedly, and clears removed registrations", async () => {
    const f = setup(), hook = await start(f); f.setFailure(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Original tail");
    expect(hook.result.current.detail?.handoff).toBe("unavailable");
    expect(hook.result.current.notice).toContain("retaining"); expect(f.max()).toBe(1);
    f.setFailure(false); f.setSessions([row(2)]);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.selected).toBeNull(); expect(hook.result.current.detail).toBeNull();
  });

  it("drains a previous core generation before new reads and rejects malformed mismatched responses", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    f.hold((r) => { if (r.type === "externalAgents.read" && !input) { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    hook.rerender({ ready: true, generation: 2, visible: true });
    expect(hook.result.current.detail).toBeNull(); expect(f.max()).toBe(1);
    f.hold((r) => r.type === "externalAgents.read" ? Promise.resolve(success(r, { kind: "read", detail: detail(2) })) : undefined);
    await act(async () => { held.resolve(success(input, { kind: "read", detail: detail(1, "Old generation") })); });
    expect(hook.result.current.detail).toBeNull(); expect(hook.result.current.notice).toContain("unavailable"); expect(f.max()).toBe(1);
  });

  it("retains last evidence when the real protocol reports a temporarily unavailable registry or transcript", async () => {
    const f = setup(), hook = await start(f);
    f.hold((request) => request.type === "externalAgents.snapshot"
      ? Promise.resolve(success(request, { kind: "snapshot", snapshot: { status: "unavailable", observedAt: at, message: "Registry temporarily unavailable", sessions: [] } }))
      : request.type === "externalAgents.read" ? Promise.resolve(success(request, { kind: "read", detail: { ...detail(1), session: { ...row(1), status: "unavailable", message: "Transcript temporarily unavailable" }, handoff: "unavailable", entries: [] } })) : undefined);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.snapshot?.sessions).toHaveLength(2);
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Original tail");
    expect(hook.result.current.detail?.handoff).toBe("unavailable");
    expect(hook.result.current.notice).toContain("retaining");
    expect(hook.result.current.stale).toBe(true);
    f.hold(undefined); f.setTail(detail(1, "Recovered evidence"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Recovered evidence");
    expect(hook.result.current.stale).toBe(false);
  });

  it("clears registry-only failure state after recovery when no session is selected", async () => {
    vi.useFakeTimers(); const f = setup(); f.setFailure(true);
    const hook = renderHook(() => useExternalAgents(f.bridge, true, 1));
    await act(async () => {});
    expect(hook.result.current.stale).toBe(true); expect(hook.result.current.selected).toBeNull();
    f.setFailure(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.snapshot?.sessions).toHaveLength(2);
    expect(hook.result.current.stale).toBe(false); expect(hook.result.current.notice).toBe("");
  });
});
