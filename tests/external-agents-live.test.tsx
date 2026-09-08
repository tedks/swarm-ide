// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitFor } from "@testing-library/react";
import type { SwarmBridge } from "../app/electron/preload";
import { useExternalAgents } from "../app/renderer/external-agents/client";
import { ExternalAgentService } from "../core/external-agents";
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

  it("publishes the due selected conversation before a fleet read at the same deadline", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    f.setTail(detail(1, "Reply already in the selected transcript"));
    f.hold((r) => { if (r.type === "externalAgents.snapshot") { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Reply already in the selected transcript");
    expect(f.request.mock.calls.slice(-2).map(([r]) => r.type)).toEqual(["externalAgents.read", "externalAgents.snapshot"]);
    expect(input.type).toBe("externalAgents.snapshot");
    expect(hook.result.current.selected).toBe(id(1));
    expect(hook.result.current.busy).toBe(false);
    expect(f.max()).toBe(1); expect(vi.getTimerCount()).toBe(0);
    hook.unmount();
    await act(async () => { held.resolve(success(input, { kind: "snapshot", snapshot: { status: "observed", observedAt: at, message: "Finished fleet", sessions: [row(1), row(2)] } })); });
  });

  it("does not add another full interval after a slow selected read finishes", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    f.hold((r) => { if (r.type === "externalAgents.read" && !input) { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); held.resolve(success(input, { kind: "read", detail: detail(1, "Slow read result") })); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Slow read result");
    f.setTail(detail(1, "Next available reply"));
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(f.request.mock.calls.filter(([r]) => r.type === "externalAgents.read")).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Next available reply");
    expect(f.request.mock.calls.filter(([r]) => r.type === "externalAgents.read")).toHaveLength(3);
    expect(f.max()).toBe(1); expect(vi.getTimerCount()).toBe(1);
  });

  it("gives overdue fleet reads a turn under sustained slow conversation reads without catch-up bursts", async () => {
    const f = setup(); await start(f); const origin = Date.now();
    const starts: { type: string; at: number }[] = [];
    f.hold((r) => {
      starts.push({ type: r.type, at: Date.now() - origin });
      if (r.type === "externalAgents.read") return new Promise((resolve) => {
        setTimeout(() => resolve(success(r, { kind: "read", detail: detail(1, "Slow live tail") })), 1_500);
      });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    // At 7s the selected read's 6.5s deadline is older than the fleet's 7s
    // deadline. It gets one turn, then the overdue fleet runs immediately.
    expect(starts.filter((r) => r.type === "externalAgents.snapshot").map((r) => r.at)).toEqual([4_000, 8_500]);
    expect(starts.filter((r) => r.type === "externalAgents.read").map((r) => r.at)).toEqual([1_000, 2_500, 4_000, 5_500, 7_000, 8_500, 10_000]);
    expect(f.max()).toBe(1);
    // Only the controlled bridge's slow read is timed while a request is active.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("observes a real appended transcript through the core reader and selected hook without manual refresh", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swarm-selected-observation-"));
    const root = join(dir, "repo"), registry = join(dir, "registry.json"), rollout = join(dir, "session.jsonl");
    const record = (text: string) => JSON.stringify({ timestamp: at, type: "response_item", payload: {
      type: "message", role: "assistant", content: [{ type: "output_text", text }],
    } }) + "\n";
    let service: ExternalAgentService | undefined, unmount: (() => void) | undefined;
    const calls: CoreRequest["type"][] = [];
    try {
      await mkdir(root);
      await writeFile(rollout, JSON.stringify({ type: "session_meta", payload: { id: id(1) } }) + "\n" + record("Recorded opening message"));
      await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id: id(1), label: "Owned transcript example", rollout, evidence: "synthetic" }] }), { mode: 0o600 });
      const reader = service = new ExternalAgentService(root, registry);
      const bridge: SwarmBridge = { onEvent: () => () => {}, request: async (request) => {
        calls.push(request.type);
        if (request.type !== "externalAgents.snapshot" && request.type !== "externalAgents.read") throw new Error("Observation must not send or hand off");
        return success(request, await reader.request(request));
      } };
      const hook = renderHook(() => useExternalAgents(bridge, true, 1)); unmount = hook.unmount;
      await waitFor(() => expect(hook.result.current.snapshot?.sessions[0]?.id).toBe(id(1)));
      await act(async () => { await hook.result.current.read(id(1)); });
      const originalEntry = hook.result.current.detail?.entries[0]?.id;
      expect(hook.result.current.detail?.entries[0]?.text).toBe("Recorded opening message");
      await appendFile(rollout, record("Reply appended to the actual owned JSONL file"));
      await waitFor(() => expect(hook.result.current.detail?.entries.at(-1)?.text).toBe("Reply appended to the actual owned JSONL file"), { timeout: 3_000 });
      expect(hook.result.current.detail?.entries).toHaveLength(2);
      expect(hook.result.current.detail?.entries[0]?.id).toBe(originalEntry);
      expect(hook.result.current.selected).toBe(id(1));
      expect(hook.result.current.detail?.session.evidence).toBe("synthetic");
      expect(calls.every((type) => type === "externalAgents.snapshot" || type === "externalAgents.read")).toBe(true);
    } finally {
      unmount?.(); await service?.dispose(); await rm(dir, { recursive: true, force: true });
    }
  });

  it("drains an in-flight fleet read, then immediately reads only the latest explicit selection", async () => {
    const f = setup(), hook = await start(f), held = deferred<CoreResponse>(); let input!: CoreRequest;
    f.hold((r) => { if (r.type === "externalAgents.snapshot" && !input) { input = r; return held.promise; } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    let earlier!: Promise<void>, latest!: Promise<void>;
    act(() => { earlier = hook.result.current.read(id(1)); latest = hook.result.current.read(id(2)); });
    const count = f.request.mock.calls.length;
    await act(async () => { await earlier; await vi.advanceTimersByTimeAsync(5_000); });
    expect(f.request).toHaveBeenCalledTimes(count);
    expect(hook.result.current.selected).toBe(id(2)); expect(hook.result.current.detail).toBeNull();
    // The old snapshot cannot remove a newer selection; its own read validates it.
    await act(async () => { held.resolve(success(input, { kind: "snapshot", snapshot: { status: "observed", observedAt: at, message: "Older registry", sessions: [row(1)] } })); await latest; });
    expect(f.request.mock.calls[count]?.[0]).toMatchObject({ type: "externalAgents.read", sessionId: id(2) });
    expect(hook.result.current.detail?.session.id).toBe(id(2)); expect(f.max()).toBe(1);
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
    const f = setup();
    f.setTail({ ...detail(1), terminal: { attach: "tmux attach", switch: "tmux switch", location: "@1 / %1" } });
    const hook = await start(f);
    expect(hook.result.current.detail?.terminal).toBeDefined();
    f.setFailure(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.detail?.entries[0]?.text).toBe("Original tail");
    expect(hook.result.current.detail?.handoff).toBe("unavailable");
    expect(hook.result.current.detail?.terminal).toBeUndefined();
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
