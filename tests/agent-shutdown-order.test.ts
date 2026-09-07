// @vitest-environment node
/** ROOT-approved diagnostic only. The rehearsal close oracle demands emitted
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
import type { AdapterEvent, AgentAdapter, AgentHandle, AgentOperation } from "../core/agents/adapter";
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

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-close-order-")); roots.push(root);
  const prepared = agentFixtureContext(), clock = Date.parse(AGENT_FIXTURE_AT);
  const disk = await createFileRunStore(join(root, "private"), { now: () => clock }); stores.push(disk);
  const trace: string[] = [];
  const hooks: { read?: () => Promise<void>; append?: () => Promise<void>; update?: () => Promise<void> } = {};
  const oneHook = async (kind: keyof typeof hooks) => { const hook = hooks[kind]; delete hooks[kind]; await hook?.(); };
  const store: RunStore = {
    admit: (context) => disk.admit(context), snapshot: () => disk.snapshot(),
    instruction: (id, receipt) => disk.instruction(id, receipt),
    read: async (id, after) => { await oneHook("read"); return disk.read(id, after); },
    update: async (run) => { await oneHook("update"); return disk.update(run); },
    append: async (id, record) => {
      trace.push("append-enter"); await oneHook("append");
      const result = await disk.append(id, record);
      trace.push(result.ok ? "append-durable" : "append-failed"); return result;
    },
  };
  const running = deferred();
  let observer: ((event: AdapterEvent) => void) | undefined;
  let emissions = 0, starts = 0, disposals = 0;
  const handle: AgentHandle = {
    steer: async () => good({ status: "accepted" }), interrupt: async () => good({ status: "requested" }),
    dispose: async () => {
      disposals++; trace.push("dispose-enter");
      return { status: "confirmed", observedAt: AGENT_FIXTURE_AT, detail: "Synthetic in-process handle only; no external process." };
    },
  };
  const adapter: AgentAdapter = {
    probe: async () => ({ provider: "deterministic-fixture", version: "test-only", executable: "not-executed",
      available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }),
    start: async (_context, emit) => {
      starts++; observer = emit;
      emit({ type: "started", threadId: "controlled-thread", model: "no-model", cwd: prepared.launchContext.root,
        policy: "read-only", instructionPaths: [], at: AGENT_FIXTURE_AT });
      emit({ type: "turn-started", threadId: "controlled-thread", turnId: "controlled-turn", at: AGENT_FIXTURE_AT });
      return handle;
    },
  };
  const service = await createAgentService({ store, adapter, now: () => clock,
    capabilities: async () => prepared.capabilities,
    context: { prepare: async () => good(prepared), revalidate: async (context) => good(context) },
    emit: (snapshot) => { if (snapshot.runs.some((run) => run.state === "running")) running.resolve(); },
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
  await running.promise;
  const read = () => service.request({ ...base(), type: "agent.read", runId: prepared.runId, afterRecord: 0 });
  const emitItem = () => {
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
  return { pause, read, close, emitItem, inspect, trace, disk, root, prepared,
    counts: () => ({ starts, disposals }), raw: () => readFile(join(root, "private", "snapshot.json")),
    late: () => observer!({ type: "item", itemId: null, kind: "message", text: "Hostile post-close callback.", at: AGENT_FIXTURE_AT }) };
}

it("diagnostic oracle: pre-close queued output satisfies rehearsal emitted/retained equality", async () => {
  const f = await fixture(), gate = f.pause("read"); const reading = f.read(); await gate.entered;
  f.emitItem(); const closing = f.close();
  expect(f.counts().disposals).toBe(0); gate.release(); value(await reading); await closing;
  const result = await f.inspect("pre-close-queued");
  // This is the existing rehearsal oracle, NOT a universal lossless emit contract.
  expect(result.retained, "Existing rehearsal close requires emitted items equal retained records").toBe(result.emitted);
});

it("a successfully completed in-flight append remains durable across shutdown", async () => {
  const f = await fixture(), gate = f.pause("append"); f.emitItem(); await gate.entered;
  let settled = false; const closing = f.close().then(() => { settled = true; });
  expect(settled).toBe(false); expect(f.counts().disposals).toBe(0);
  gate.release(); await closing;
  const result = await f.inspect("in-flight-append");
  expect(result.retained).toBe(2); expect(result.retained).toBe(result.emitted);
  expect(f.trace.indexOf("append-durable")).toBeLessThan(f.trace.indexOf("dispose-enter"));
});

it("diagnostic oracle: emission before disposal during shutdown persistence preserves rehearsal equality", async () => {
  const f = await fixture(), gate = f.pause("update"), closing = f.close(); await gate.entered;
  expect(f.counts().disposals).toBe(0); f.emitItem(); gate.release(); await closing;
  const result = await f.inspect("closed-before-dispose");
  // The actual rehearsal's stream checks disposing/terminal, not outer closed.
  // This window is reachable before dispose entry, unlike hostile post-close emit.
  expect(result.retained, "Existing rehearsal close requires emitted items equal retained records").toBe(result.emitted);
});

it("truly post-close callbacks cannot mutate a durable prefix or redispatch", async () => {
  const f = await fixture(); await f.close(); const before = await f.raw();
  f.late(); value(await f.read());
  expect((await f.raw()).equals(before)).toBe(true);
  const result = await f.inspect("post-close-hostile-control");
  expect(result.retained).toBe(1); expect(result.retained).toBe(result.emitted);
});
