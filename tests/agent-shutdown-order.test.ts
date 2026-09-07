// @vitest-environment node
/** ROOT-approved shutdown repair regressions. The rehearsal close oracle demands emitted
 * item counts equal retained records; AdapterEvent emit():void is NOT itself a
 * durable acknowledgment. Keep any oracle counterexample RED, not it.fails or
 * a passing assertion that loss is desirable. No historical failure attribution.
 * Identical inputs use the checked-out PROTOCOL_VERSION on the v5/v6 branches.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFileRunStore, type FileRunStore } from "../core/agents/file-store";
import { createAgentService, type AgentService } from "../core/agents/service";
import type { RunStore } from "../core/agents/store";
import type { AdapterEvent, AgentAdapter, AgentHandle, AgentOperation, CleanupEvidence } from "../core/agents/adapter";
import { agentFixtureContext, AGENT_FIXTURE_AT } from "../fixtures/agents";
import { PROTOCOL_VERSION } from "../protocol/common";
import { utf8Bytes } from "../protocol/agents";

const good = <T>(value: T): AgentOperation<T> => ({ ok: true, value });
function value<T>(result: AgentOperation<T>): T {
  if (!result.ok) throw new Error(`Synthetic diagnostic operation failed: ${result.error.code}`);
  return result.value;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => { resolve = accept; });
  return { promise, resolve };
}
const roots: string[] = [], stores: FileRunStore[] = [], services: AgentService[] = [];
const releases: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  try {
    for (const service of services.splice(0)) await service.shutdown();
    for (const store of stores.splice(0)) await store.close();
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  } finally { vi.useRealTimers(); }
});

async function fixture(options: { turnStarted?: boolean; delayedHandle?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "swarm-close-order-")); roots.push(root);
  const prepared = agentFixtureContext(), clock = Date.parse(AGENT_FIXTURE_AT);
  const disk = await createFileRunStore(join(root, "private"), { now: () => clock }); stores.push(disk);
  const trace: string[] = [];
  const hooks: { read?: () => Promise<void>; append?: () => Promise<void>; update?: () => Promise<void>; instruction?: () => Promise<void> } = {};
  const faults = { update: false, append: false };
  const failure = (): AgentOperation<never> => ({ ok: false, error: { code: "STORAGE_UNAVAILABLE", message: "Synthetic storage failure." } });
  const updates: string[] = [];
  const oneHook = async (kind: keyof typeof hooks) => { const hook = hooks[kind]; delete hooks[kind]; await hook?.(); };
  const store: RunStore = {
    admit: (context) => disk.admit(context), snapshot: () => disk.snapshot(),
    instruction: async (id, receipt) => { await oneHook("instruction"); return disk.instruction(id, receipt); },
    read: async (id, after) => { await oneHook("read"); return disk.read(id, after); },
    update: async (run) => {
      updates.push(`${run.state}:${run.cleanup.status}`);
      await oneHook("update"); return faults.update ? failure() : disk.update(run);
    },
    append: async (id, record) => {
      trace.push("append-enter"); await oneHook("append");
      const result = faults.append ? failure() : await disk.append(id, record);
      trace.push(result.ok ? "append-durable" : "append-failed"); return result;
    },
  };
  const started = deferred(), handleRelease = deferred(); releases.push(handleRelease.resolve);
  const controls: { dispose?: () => Promise<CleanupEvidence> } = {};
  let observer: ((event: AdapterEvent) => void) | undefined;
  let emissions = 0, starts = 0, disposals = 0, interrupts = 0, steers = 0, disposing = false;
  const confirmed = (): CleanupEvidence => ({ status: "confirmed", observedAt: AGENT_FIXTURE_AT,
    detail: "Synthetic in-process handle only; no external process." });
  const handle: AgentHandle = {
    steer: async () => { steers++; return good({ status: "accepted" }); },
    interrupt: async () => { interrupts++; return good({ status: "requested" }); },
    dispose: () => {
      disposing = true; disposals++; trace.push("dispose-enter");
      return controls.dispose ? controls.dispose() : Promise.resolve(confirmed());
    },
  };
  const adapter: AgentAdapter = {
    probe: async () => ({ provider: "deterministic-fixture", version: "test-only", executable: "not-executed",
      available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }),
    start: async (_context, emit) => {
      starts++; observer = emit;
      emit({ type: "started", threadId: "controlled-thread", model: "no-model", cwd: prepared.launchContext.root,
        policy: "read-only", instructionPaths: [], at: AGENT_FIXTURE_AT });
      if (options.turnStarted !== false) emit({ type: "turn-started", threadId: "controlled-thread", turnId: "controlled-turn", at: AGENT_FIXTURE_AT });
      started.resolve();
      if (options.delayedHandle) await handleRelease.promise;
      return handle;
    },
  };
  const service = await createAgentService({ store, adapter, now: () => clock,
    capabilities: async () => prepared.capabilities,
    context: { prepare: async () => good(prepared), revalidate: async (context) => good(context) },
  }); services.push(service);
  let request = 0;
  const base = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: `close-order-${++request}` });
  const context = prepared.launchContext;
  value(await service.request({ ...base(), type: "agent.prepare", worldId: context.worldId, focus: context.focus,
    taskText: context.taskText, links: context.links, model: null, effort: null }));
  value(await service.request({ ...base(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash }));
  // Launch intentionally defers dispatch by exactly0ms. Release only that
  // scheduler step, not future deadline/publication/cleanup timers.
  await vi.advanceTimersByTimeAsync(0);
  await started.promise;
  const read = () => service.request({ ...base(), type: "agent.read", runId: prepared.runId, afterRecord: 0 });
  value(await read()); value(await read()); // Drain startup events and returned-handle registration.
  const emitItem = () => {
    if (disposing) return; // Actual rehearsal emitter checks this synchronously.
    emissions++; trace.push("emit-item");
    observer!({ type: "item", itemId: null, kind: "message", text: "Controlled synthetic item.", at: AGENT_FIXTURE_AT });
  };
  emitItem(); value(await read()); // Public queue barrier: durable prefix, never a timed poll.
  trace.length = 0;
  const pause = (kind: keyof typeof hooks) => {
    const entered = deferred(), release = deferred(); releases.push(release.resolve);
    hooks[kind] = async () => { trace.push(`${kind}-blocked`); entered.resolve(); await release.promise; trace.push(`${kind}-released`); };
    return { entered: entered.promise, release: release.resolve };
  };
  const close = () => { trace.push("shutdown-call"); return service.shutdown().then(() => { trace.push("shutdown-done"); }); };
  const inspect = async (caseId: string) => {
    const retained = value(await disk.read(prepared.runId, 0));
    const result = { caseId, emitted: emissions, retained: retained.page.records.length, state: retained.run.state,
      cleanup: retained.run.cleanup.status, process: retained.run.processState,
      tailMayBeLost: retained.run.transcript.tailMayBeLost, starts, disposals, trace: [...trace] };
    console.info("CLOSE_ORDER_RESULT", JSON.stringify(result)); // Fixed labels/counts only; no context/profile/content.
    expect(result).toMatchObject({ state: "unknown", cleanup: "confirmed", process: "exited", starts: 1, disposals: 1 });
    expect(retained.page.records.map((record) => record.recordId)).toEqual(retained.page.records.map((_, i) => i + 1));
    expect(retained.run.transcript.bytes).toBe(utf8Bytes(JSON.stringify(retained.page.records)));
    expect(vi.getTimerCount()).toBe(0);
    return result;
  };
  return { pause, read, close, emitItem, inspect, trace, disk, root, prepared, service, faults, controls, confirmed, updates,
    returnHandle: handleRelease.resolve,
    cancel: () => service.request({ ...base(), type: "agent.cancel", runId: prepared.runId }),
    steer: () => service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "controlled-steer", type: "agent.steer",
      runId: prepared.runId, expectedTurnId: "controlled-turn", text: "Synthetic pending instruction." }),
    event: (event: AdapterEvent) => observer!(event),
    counts: () => ({ starts, disposals, interrupts, steers }), raw: () => readFile(join(root, "private", "snapshot.json")),
    late: () => observer!({ type: "item", itemId: null, kind: "message", text: "Hostile post-close callback.", at: AGENT_FIXTURE_AT }) };
}

it("diagnostic oracle: pre-close queued output satisfies rehearsal emitted/retained equality", async () => {
  const f = await fixture(), gate = f.pause("read"); const reading = f.read(); await gate.entered;
  f.emitItem(); const closing = f.close();
  expect(f.counts().disposals).toBe(1); gate.release(); value(await reading); await closing;
  const result = await f.inspect("pre-close-queued");
  // This is the existing rehearsal oracle, NOT a universal lossless emit contract.
  expect(result.retained, "Existing rehearsal close requires emitted items equal retained records").toBe(result.emitted);
});

it("a successfully completed in-flight append remains durable across shutdown", async () => {
  const f = await fixture(), gate = f.pause("append"); f.emitItem(); await gate.entered;
  let settled = false; const closing = f.close().then(() => { settled = true; });
  expect(settled).toBe(false); expect(f.counts().disposals).toBe(1);
  gate.release(); await closing;
  const result = await f.inspect("in-flight-append");
  expect(result.retained).toBe(2); expect(result.retained).toBe(result.emitted);
  expect(f.trace.indexOf("dispose-enter")).toBeLessThan(f.trace.indexOf("append-durable"));
});

it("diagnostic oracle: emission before disposal during shutdown persistence preserves rehearsal equality", async () => {
  const f = await fixture(), gate = f.pause("update"), closing = f.close(); await gate.entered;
  expect(f.counts().disposals).toBe(1); f.emitItem(); gate.release(); await closing;
  const result = await f.inspect("closed-before-dispose");
  // The actual rehearsal's stream checks disposing/terminal, not outer closed.
  // Early dispose now closes this window before awaited shutdown persistence.
  expect(result.retained, "Existing rehearsal close requires emitted items equal retained records").toBe(result.emitted);
});

it("truly post-close callbacks cannot mutate a durable prefix or redispatch", async () => {
  const f = await fixture(); await f.close(); const before = await f.raw();
  f.late(); value(await f.read());
  expect((await f.raw()).equals(before)).toBe(true);
  const result = await f.inspect("post-close-hostile-control");
  expect(result.retained).toBe(1); expect(result.retained).toBe(result.emitted);
});

const terminal: AdapterEvent = { type: "terminal", at: AGENT_FIXTURE_AT,
  outcome: { kind: "turn", threadId: "controlled-thread", turnId: "controlled-turn", status: "completed", observedAt: AGENT_FIXTURE_AT } };
const turnStarted: AdapterEvent = { type: "turn-started", threadId: "controlled-thread", turnId: "controlled-turn", at: AGENT_FIXTURE_AT };
const cleanupModes = ["confirmed", "rejected", "throw"] as const;

it.each(cleanupModes)("retains queued terminal and exit evidence before %s cleanup", async (mode) => {
  const f = await fixture(), gate = f.pause("read"); const reading = f.read(); await gate.entered;
  f.controls.dispose = () => {
    if (mode === "throw") throw new Error("Synthetic synchronous dispose failure");
    return mode === "rejected" ? Promise.reject(new Error("Synthetic cleanup rejection")) : Promise.resolve(f.confirmed());
  };
  f.emitItem(); f.event(terminal); f.event({ type: "process-exit", exitCode: 7, at: AGENT_FIXTURE_AT });
  const closing = f.close(); gate.release(); value(await reading); await closing;
  const detail = value(await f.disk.read(f.prepared.runId, 0));
  expect(detail.run).toMatchObject({ state: "completed", providerOutcome: { kind: "turn", status: "completed" },
    cleanup: { status: mode === "confirmed" ? "confirmed" : "unknown" },
    processState: mode === "confirmed" ? "exited" : "unknown", exitCode: mode === "confirmed" ? 7 : null });
  expect(detail.page.records).toHaveLength(2);
  expect(f.updates.indexOf("completed:pending")).toBeLessThan(f.updates.indexOf(`completed:${mode === "confirmed" ? "confirmed" : "unknown"}`));
  expect(f.counts().disposals).toBe(1); expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])("defers previously queued cancelling cleanup behind cutoff evidence (terminal=%s)", async (withTerminal) => {
  const f = await fixture(), cleanup = deferred(); releases.push(cleanup.resolve);
  f.controls.dispose = async () => { await cleanup.promise; return f.confirmed(); };
  value(await f.cancel());
  await vi.advanceTimersByTimeAsync(5000); // Exactly the existing cancellation grace; begins cleanup.
  expect(f.counts().disposals).toBe(1);
  const gate = f.pause("read"), reading = f.read(); await gate.entered;
  cleanup.resolve(); await vi.advanceTimersByTimeAsync(0); // Queue finalization behind the held read.
  if (withTerminal) f.event(terminal);
  const closing = f.close(); gate.release(); value(await reading); await closing;
  const detail = value(await f.disk.read(f.prepared.runId, 0));
  expect(detail.run).toMatchObject({ state: withTerminal ? "completed" : "unknown", cleanup: { status: "confirmed" },
    providerOutcome: { kind: withTerminal ? "turn" : "none" } });
  expect(f.counts().disposals).toBe(1); expect(vi.getTimerCount()).toBe(0);
});

it.each(cleanupModes)("keeps shutdown-interrupted cancellation unknown with %s disposal", async (mode) => {
  const f = await fixture(); value(await f.cancel());
  f.controls.dispose = () => {
    if (mode === "throw") throw new Error("Synthetic synchronous failure");
    return mode === "rejected" ? Promise.reject(new Error("Synthetic rejection")) : Promise.resolve(f.confirmed());
  };
  await f.close();
  const detail = value(await f.disk.read(f.prepared.runId, 0));
  expect(detail.run).toMatchObject({ state: "unknown", providerOutcome: { kind: "none" },
    cleanup: { status: mode === "confirmed" ? "confirmed" : "unknown" } });
  expect(f.updates.indexOf("unknown:pending")).toBeLessThan(f.updates.lastIndexOf(`unknown:${mode === "confirmed" ? "confirmed" : "unknown"}`));
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["queued", "persisting"] as const)("does not interrupt a %s cancelling turn-start after disposal begins", async (position) => {
  const f = await fixture({ turnStarted: false }); value(await f.cancel());
  expect(f.counts().interrupts).toBe(0);
  const gate = f.pause(position === "queued" ? "read" : "update");
  const reading = position === "queued" ? f.read() : undefined;
  if (reading) await gate.entered;
  f.event(turnStarted);
  if (!reading) await gate.entered;
  const closing = f.close(); expect(f.counts().disposals).toBe(1);
  gate.release(); if (reading) value(await reading); await closing;
  expect(f.counts().interrupts).toBe(0);
  expect(value(await f.disk.read(f.prepared.runId, 0)).run.state).toBe("unknown");
  expect(vi.getTimerCount()).toBe(0);
});

it("retains a pending steering intent as unknown without sending or replaying after close", async () => {
  const f = await fixture(), gate = f.pause("instruction"), steering = f.steer(); await gate.entered;
  const closing = f.close(); gate.release();
  expect(value(await steering)).toMatchObject({ kind: "steer", receipt: { status: "delivery-unknown" } });
  await closing;
  expect(value(await f.steer())).toMatchObject({ receipt: { status: "delivery-unknown" } });
  expect(value(await f.disk.read(f.prepared.runId, 0)).run.instructions).toMatchObject([{ status: "delivery-unknown" }]);
  expect(f.counts()).toMatchObject({ steers: 0, disposals: 1 }); expect(vi.getTimerCount()).toBe(0);
});

it("waits for a handle registered while accepted work drains", async () => {
  const f = await fixture({ delayedHandle: true }), gate = f.pause("read"), reading = f.read(); await gate.entered;
  const cleanup = deferred(); releases.push(cleanup.resolve);
  f.controls.dispose = async () => { await cleanup.promise; return f.confirmed(); };
  let done = false; const closing = f.close().then(() => { done = true; });
  f.returnHandle(); await vi.advanceTimersByTimeAsync(0);
  gate.release(); value(await reading); value(await f.read()); value(await f.read());
  expect(f.counts().disposals).toBe(1); expect(done).toBe(false);
  cleanup.resolve(); await closing;
  expect(value(await f.disk.read(f.prepared.runId, 0)).run.cleanup.status).toBe("confirmed");
  expect(vi.getTimerCount()).toBe(0);
});

it("finishes with unresolved setup and disposes its later handle once without replay", async () => {
  const f = await fixture({ delayedHandle: true }); await f.close();
  expect(f.counts()).toMatchObject({ starts: 1, disposals: 0 });
  expect(value(await f.disk.read(f.prepared.runId, 0)).run).toMatchObject({ state: "unknown", cleanup: { status: "pending" } });
  f.returnHandle(); await vi.advanceTimersByTimeAsync(0); value(await f.read()); value(await f.read());
  // An explicit cleanup publication/write queue barrier, not a timed retry.
  await f.service.shutdown(); value(await f.read());
  expect(f.counts()).toMatchObject({ starts: 1, disposals: 1, interrupts: 0, steers: 0 });
  expect(value(await f.disk.read(f.prepared.runId, 0)).run.cleanup.status).toBe("confirmed");
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds unresolved disposal and rejects hostile callbacks throughout its wait", async () => {
  const f = await fixture(), cleanup = deferred(); releases.push(cleanup.resolve);
  f.controls.dispose = async () => { await cleanup.promise; return f.confirmed(); };
  const closing = f.close(); f.late();
  await vi.advanceTimersByTimeAsync(2000); await closing;
  const before = await f.raw(); f.late(); value(await f.read());
  expect((await f.raw()).equals(before)).toBe(true);
  expect(value(await f.disk.read(f.prepared.runId, 0))).toMatchObject({ run: { state: "unknown",
    processState: "unknown", cleanup: { status: "unknown" } }, page: { records: [expect.any(Object)] } });
  cleanup.resolve(); await vi.advanceTimersByTimeAsync(0); value(await f.read());
  expect((await f.raw()).equals(before)).toBe(true); expect(f.counts().disposals).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("disposes known handles even when shutdown persistence fails without claiming durable success", async () => {
  const f = await fixture(); f.faults.update = true;
  await f.close();
  const durable = value(await f.disk.read(f.prepared.runId, 0));
  expect(durable.run).toMatchObject({ state: "running", processState: "live", cleanup: { status: "pending" } });
  expect(value(await f.read())).toMatchObject({ run: { state: "unknown", cleanup: { status: "confirmed" } } });
  expect(f.counts().disposals).toBe(1); expect(vi.getTimerCount()).toBe(0);
});

it("remains idempotent even when dispose synchronously re-enters shutdown", async () => {
  const f = await fixture(); let nested: Promise<void> | undefined;
  f.controls.dispose = () => { nested = f.service.shutdown(); return Promise.resolve(f.confirmed()); };
  const closing = f.service.shutdown(); expect(nested).toBe(closing); expect(f.service.shutdown()).toBe(closing);
  await closing; expect(f.counts().disposals).toBe(1); expect(vi.getTimerCount()).toBe(0);
});
