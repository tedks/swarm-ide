// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import type { SwarmBridge } from "../app/electron/preload";
import type { Lifecycle, LifecycleBridge } from "../app/lifecycle";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { TaskObservationSchema, type TaskObservation, type TaskReadResult } from "../protocol/tasks";
import { initialSnapshot } from "../fixtures/world";
import { TASK_FIXTURE_COMMIT, TASK_FIXTURE_WORLD, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";

const drain = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
type Pending = ReturnType<typeof deferred<CoreResponse>> & { request: CoreRequest };
const clients: TaskBridgeClient[] = [];
let hidden = false;
beforeEach(() => {
  vi.useFakeTimers(); hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

function harness(lifecycle = false) {
  const calls: Pending[] = [];
  const bridge: SwarmBridge = {
    request(request) { const call = { request, ...deferred<CoreResponse>() }; calls.push(call); return call.promise; },
    onEvent: vi.fn(() => { throw new Error("Tasks must not subscribe to workspace/agent events"); }),
  };
  const initial = deferred<Lifecycle>();
  let status: (value: Lifecycle) => void = () => undefined;
  const offStatus = vi.fn(() => { status = () => undefined; });
  const life: LifecycleBridge = {
    status: () => initial.promise,
    onStatus(listener) { status = listener; return offStatus; },
    reload: vi.fn(() => { throw new Error("Tasks must not reload the core"); }),
  };
  const ready = (generation: number, phase: Lifecycle["core"]["phase"] = "ready", revision = generation): Lifecycle => ({
    revision, core: { generation, phase, message: `Core ${phase}` }, reload: "idle", notice: "fixture" });
  const response = (call: Pending, task: unknown, sequence = 1, workspace = { ...initialSnapshot(),
    project: { id: TASK_FIXTURE_WORLD.repositoryId, name: "Task fixture" } }) => ({
    protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId, ok: true, sequence, snapshot: workspace, task,
  });
  const reply = (call: Pending, task: unknown, sequence = 1) => call.resolve(CoreResponseSchema.parse(response(call, task, sequence)));
  const snapshot = (observation = taskObservationFixture(), call = latest("tasks.snapshot")) => reply(call, { kind: "snapshot", observation });
  const read = (result = taskReadFixture(), call = latest("tasks.read")) => reply(call, result);
  const latest = (type: CoreRequest["type"]) => calls.filter((call) => call.request.type === type).at(-1)!;
  const client = new TaskBridgeClient(); clients.push(client);
  client.setContext(TASK_FIXTURE_WORLD.worldId, TASK_FIXTURE_WORLD.repositoryId);
  const disconnect = client.connect(bridge, lifecycle ? life : undefined);
  return { calls, bridge, life, ready, initial, status: (value: Lifecycle) => status(value), offStatus,
    response, reply, snapshot, read, latest, client, disconnect };
}
async function observed(observation = taskObservationFixture()) {
  const h = harness(); h.client.setVisible(true); h.snapshot(observation); await drain(); return h;
}
async function selected() {
  const h = await observed(); h.client.select("task-fixture"); h.read(); await drain(); return h;
}
function advanceObservation(sequence: number, hash = "c"): TaskObservation {
  const observation = taskObservationFixture(); observation.sequence = sequence;
  observation.snapshot!.metadataCommit = { algorithm: "sha1", hex: hash.repeat(40) };
  observation.localRef = observation.snapshot!.metadataCommit;
  return TaskObservationSchema.parse(observation);
}
function atRevision(result: TaskReadResult, observation: TaskObservation): TaskReadResult {
  return { ...result, metadataCommit: observation.snapshot!.metadataCommit, sequence: observation.sequence };
}

function linkedObservation(sequence = 1, hash?: string) {
  const observation = hash ? advanceObservation(sequence, hash) : { ...taskObservationFixture(), sequence };
  const read = taskReadFixture(); if (!read.result.ok) throw new Error("fixture");
  observation.snapshot!.backlinks = { status: "complete", entries: read.result.detail.fileRefs.map((ref, refIndex) => ({
    taskId: read.taskId, refIndex, path: ref.path, navigation: ref.navigation,
  })) };
  return observation;
}

function refChanged(sequence: number, retained = taskObservationFixture(), hash = "c") {
  return TaskObservationSchema.parse({ ...retained, sequence, status: "stale",
    localRef: { algorithm: "sha1", hex: hash.repeat(40) },
    reason: { code: "TASK_REF_CHANGED", message: "Local metadata changed." } });
}

describe("automatic task-list adoption", () => {
  it("recovers an initially missing snapshot once per newly available ref", async () => {
    const h = harness(); h.client.setVisible(true);
    h.snapshot({ ...taskObservationFixture("unavailable"), snapshot: null, localRef: null }); await drain();
    const failed = { ...taskObservationFixture("malformed"), snapshot: null, sequence: 2, localRef: advanceObservation(2).localRef };
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(failed); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot({ ...failed, sequence: 3 }); await drain();
    await vi.advanceTimersByTimeAsync(10000); h.snapshot({ ...failed, sequence: 4 }); await drain();
    expect(h.calls.filter((call) => call.request.type === "tasks.snapshot" && call.request.refresh)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000); h.snapshot({ ...failed, sequence: 5, localRef: advanceObservation(5, "d").localRef }); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot(advanceObservation(6, "d")); await drain();
    expect(h.client.getSnapshot().observation?.status).toBe("observed");
  });
  it("adopts a changed ref without Refresh, retains rows while held and coalesces focus/timer triggers", async () => {
    const h = await observed(), retained = h.client.getSnapshot().observation!.snapshot;
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    expect(h.calls.map((call) => (call.request as { refresh: boolean }).refresh)).toEqual([true, false, true]);
    expect(h.client.getSnapshot()).toMatchObject({ refreshing: true, observation: { snapshot: retained } });
    window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(15000);
    expect(h.calls).toHaveLength(3);
    const next = advanceObservation(3); next.snapshot!.summaries[0]!.title = "Updated task title";
    h.snapshot(next); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ refreshing: false, observation: next, notice: null });
    await vi.advanceTimersByTimeAsync(5000); h.snapshot({ ...next, sequence: 4 }); await drain();
    expect(h.calls).toHaveLength(4);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
  });

  it.each(["malformed", "unavailable", "error"] as const)("retains last-good rows after %s, scans that ref once and recovers at a different ref", async (status) => {
    const h = await observed(), retained = h.client.getSnapshot().observation!.snapshot;
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    const failed = { ...taskObservationFixture(status), sequence: 3, localRef: advanceObservation(3).localRef };
    h.snapshot(failed); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ refreshing: false, observation: { status, snapshot: retained, reason: failed.reason } });
    for (const sequence of [4, 5]) {
      await vi.advanceTimersByTimeAsync(5000); h.snapshot({ ...failed, sequence }); await drain();
      expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    }
    expect(h.calls.filter((call) => call.request.type === "tasks.snapshot" && call.request.refresh)).toHaveLength(2);
    // The provider retains the failure reason even after its cheap check sees D.
    await vi.advanceTimersByTimeAsync(5000);
    h.snapshot({ ...failed, sequence: 6, localRef: advanceObservation(6, "d").localRef }); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot(advanceObservation(7, "d")); await drain();
    expect(h.client.getSnapshot().observation?.status).toBe("observed");
    expect(h.client.getSnapshot().observation?.snapshot?.metadataCommit.hex).toBe("d".repeat(40));
  });

  it("bounds catch-up during moving metadata to one full read per normal ref check", async () => {
    const h = await observed();
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    const moved = refChanged(3, advanceObservation(3), "d");
    h.snapshot(moved); await drain();
    expect(h.calls).toHaveLength(3); expect(h.client.getSnapshot().refreshing).toBe(false);
    await vi.advanceTimersByTimeAsync(5000); h.snapshot({ ...moved, sequence: 4 }); await drain();
    expect(h.calls).toHaveLength(5); expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot(advanceObservation(5, "d")); await drain();
    expect(h.client.getSnapshot().observation?.status).toBe("observed");
  });

  it("rechecks a rollback to the retained revision after a newer revision failed", async () => {
    const h = await observed();
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    const failed = { ...taskObservationFixture("malformed"), sequence: 3, localRef: advanceObservation(3).localRef };
    h.snapshot(failed); await drain();
    await vi.advanceTimersByTimeAsync(5000);
    h.snapshot({ ...failed, sequence: 4, localRef: TASK_FIXTURE_COMMIT }); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot({ ...taskObservationFixture(), sequence: 5 }); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ observation: { status: "observed", reason: null }, refreshing: false });
  });

  it("does not repeat a failed automatic transport request at the same ref; explicit Refresh remains recovery", async () => {
    const h = await observed();
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.latest("tasks.snapshot").reject(new Error("transport failed")); await drain();
    expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(3)); await drain();
    expect(h.calls).toHaveLength(4); expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    void h.client.refresh(); expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot(advanceObservation(4)); await drain();
    expect(h.client.getSnapshot().observation?.status).toBe("observed");
  });

  it.each(["pane", "document", "dispose", "repository"])("does not escalate a pending ref check after %s cancellation", async (kind) => {
    const h = await observed(); await vi.advanceTimersByTimeAsync(5000);
    const pending = h.latest("tasks.snapshot");
    if (kind === "pane") h.client.setVisible(false);
    else if (kind === "document") { hidden = true; document.dispatchEvent(new Event("visibilitychange")); }
    else if (kind === "dispose") h.client.dispose();
    else h.client.setContext("world:other", "project:other");
    const count = h.calls.length;
    h.snapshot(refChanged(2), pending); await drain(); expect(h.calls).toHaveLength(count);
    if (kind === "pane" || kind === "document") {
      if (kind === "pane") h.client.setVisible(true);
      else { hidden = false; document.dispatchEvent(new Event("visibilitychange")); }
      h.snapshot(refChanged(3)); await drain();
      expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    }
  });

  it("rejects a delayed automatic read from the previous core generation", async () => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1)); h.snapshot(); await drain();
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2)); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    const pending = h.latest("tasks.snapshot");
    h.status(h.ready(2)); h.snapshot(); await drain();
    h.snapshot(advanceObservation(999), pending); await drain();
    expect(h.client.getSnapshot().observation?.snapshot?.metadataCommit).toEqual(TASK_FIXTURE_COMMIT);
    expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it("keeps the opened pinned detail and saved attachment reference at M while the list adopts N", async () => {
    const h = await observed(linkedObservation()), index = h.client.getSnapshot().backlinks!;
    const path = index.references("task-fixture")[0]!.path;
    const pin = h.client.inspectPinned(index.lookup(path)[0]!.target, { path, index }, () => true);
    h.read(); expect(await pin).toBe(true);
    const old = h.client.getSnapshot(), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    expect(candidate.isCurrent()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(refChanged(2, linkedObservation())); await drain();
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot(linkedObservation(3, "c")); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ selectedTaskId: "task-fixture", detailRevision: TASK_FIXTURE_COMMIT, detailStale: true });
    expect(h.client.getSnapshot().detail).toBe(old.detail);
    expect(h.client.getSnapshot().pin).toBe(old.pin);
    expect(candidate.reference.metadataCommit).toEqual(TASK_FIXTURE_COMMIT);
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(1);
  });
});

describe("explicit backlink selection", () => {
  it.each(["revision", "association", "coverage", "attention", "dispose"])("revokes delayed inspection after %s without replacing prior detail", async (change) => {
    const h = await observed(linkedObservation());
    const index = h.client.getSnapshot().backlinks!, path = index.references("task-fixture")[0]!.path;
    let current = true;
    const promise = h.client.inspectPinned(index.lookup(path)[0]!.target, { path, index }, () => current);
    const pending = h.latest("tasks.read");
    if (change === "attention") current = false;
    else if (change === "dispose") h.client.dispose();
    else {
      const next = linkedObservation(2, change === "revision" ? "c" : undefined);
      if (next.snapshot!.backlinks?.status === "complete" && change === "association") next.snapshot!.backlinks.entries[0]!.path = "other.ts";
      if (change === "coverage") next.snapshot!.backlinks = { status: "unavailable", reason: "projection-limit" };
      void h.client.refresh(); h.snapshot(next); await drain();
    }
    h.read(undefined, pending); expect(await promise).toBe(false);
    expect(h.client.getSnapshot().selectedTaskId).toBeNull(); expect(h.client.getSnapshot().detail).toBeNull();
    expect(h.calls.filter((c) => c.request.type === "tasks.read")).toHaveLength(1);
    if (["association", "coverage"].includes(change)) expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
  });
  it("reuses the exact index on ref checks and blocks a forged row before any detail request", async () => {
    const h = await observed(linkedObservation()), index = h.client.getSnapshot().backlinks!;
    await vi.advanceTimersByTimeAsync(5000); h.snapshot(linkedObservation(2)); await drain();
    expect(h.client.getSnapshot().backlinks).toBe(index); expect(vi.getTimerCount()).toBe(1);
    const path = index.references("task-fixture")[0]!.path, target = index.lookup(path)[0]!.target;
    expect(await h.client.inspectPinned({ ...target, issueBlob: { algorithm: "sha1", hex: "f".repeat(40) } }, { path, index }, () => true)).toBe(false);
    expect(h.calls.filter((c) => c.request.type === "tasks.read")).toHaveLength(0);
    h.client.setVisible(false); expect(vi.getTimerCount()).toBe(0);
  });
  it("blocks another inspection after invalid detail evidence until a valid observation is adopted", async () => {
    const h = await observed(linkedObservation()), index = h.client.getSnapshot().backlinks!;
    const path = index.references("task-fixture")[0]!.path, target = index.lookup(path)[0]!.target;
    const promise = h.client.inspectPinned(target, { path, index }, () => true);
    const bad = taskReadFixture(); if (!bad.result.ok) throw new Error("fixture");
    bad.result.detail.fileRefs[0]!.path = "wrong.ts";
    h.read(bad); expect(await promise).toBe(false);
    expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    expect(await h.client.inspectPinned(target, { path, index }, () => true)).toBe(false);
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(1);
    void h.client.refresh(); h.snapshot(linkedObservation(2)); await drain();
    const retry = h.client.inspectPinned(target, { path, index }, () => true); h.read(); expect(await retry).toBe(true);
  });
  it("invalidates old pending reads across an identical-identity replacement core", async () => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1)); h.snapshot(linkedObservation()); await drain();
    const index = h.client.getSnapshot().backlinks!, path = index.references("task-fixture")[0]!.path;
    const promise = h.client.inspectPinned(index.lookup(path)[0]!.target, { path, index }, () => true), pending = h.latest("tasks.read");
    h.status(h.ready(2)); h.snapshot(linkedObservation()); await drain();
    h.read({ ...taskReadFixture(), sequence: 999 }, pending);
    expect(await promise).toBe(false); expect(h.client.getSnapshot().detail).toBeNull();
    expect(h.client.getSnapshot().backlinks).not.toBe(index);
  });
  it("does not let a failed reconnect bind an old compatibility mode as new-lifetime authority", async () => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1)); h.snapshot(); await drain();
    h.status(h.ready(2)); h.snapshot(taskObservationFixture("unavailable", false)); await drain();
    expect(h.client.getSnapshot().observation?.snapshot).not.toBeNull();
    expect(h.client.getSnapshot().backlinks).toBeNull();
    void h.client.refresh(); h.snapshot(linkedObservation(2)); await drain();
    expect(h.client.getSnapshot().notice).toBeNull();
    expect(h.client.getSnapshot().backlinks?.lookup("docs/architecture.md")).toHaveLength(1);
  });
  it("retains a successful pin across subsequent refresh rather than silently substituting N", async () => {
    const h = await observed(linkedObservation());
    const index = h.client.getSnapshot().backlinks!;
    const path = index.references("task-fixture")[0]!.path;
    const row = index.lookup(path)[0]!;
    const pin = h.client.inspectPinned(row.target, { path, index }, () => true);
    h.read(); expect(await pin).toBe(true);
    const retained = h.client.getSnapshot().detail;
    await vi.advanceTimersByTimeAsync(5000); expect(h.client.getSnapshot().detailStale).toBe(true);
    h.snapshot(linkedObservation(2)); await drain();
    expect(h.client.getSnapshot().detailStale).toBe(false);
    const next = linkedObservation(3, "c");
    void h.client.refresh(); h.snapshot(next); await drain();
    const auto = h.calls.filter((c) => c.request.type === "tasks.read");
    if (auto.length > 1) { h.read(atRevision(taskReadFixture(), next)); await drain(); }
    expect(h.client.getSnapshot().detailRevision).toEqual(TASK_FIXTURE_COMMIT);
    expect(h.client.getSnapshot().detail).toBe(retained);
    expect(h.client.getSnapshot().detailStale).toBe(true);
    expect(auto).toHaveLength(1);
    h.client.select("task-fixture"); h.read(atRevision(taskReadFixture(), next)); await drain();
    expect(h.client.getSnapshot().detailRevision).toEqual(next.snapshot!.metadataCommit);
  });
});

describe("TaskBridgeClient read-only observation scheduling", () => {
  it("opens once, checks the ref every visible five seconds and coalesces explicit full refresh without a poll backlog", async () => {
    const h = harness(); expect(h.calls).toHaveLength(0);
    h.client.setVisible(true); expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    await vi.advanceTimersByTimeAsync(15000); expect(h.calls).toHaveLength(1);
    void h.client.refresh(); void h.client.refresh(); void h.client.refresh();
    h.snapshot(); await drain(); expect(h.calls).toHaveLength(2);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
    h.snapshot({ ...taskObservationFixture(), sequence: 2 }); await drain();
    await vi.advanceTimersByTimeAsync(5000); expect(h.calls).toHaveLength(3);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    expect(h.calls.every((call) => call.request.type === "tasks.snapshot")).toBe(true);
    expect(h.bridge.onEvent).not.toHaveBeenCalled();
  });

  it("stops hidden timers, checks on reopen/focus and never responds to incidental same-context/source churn", async () => {
    const h = await observed(); h.client.setVisible(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20000); window.dispatchEvent(new Event("focus")); expect(h.calls).toHaveLength(1);
    h.client.setVisible(true); expect(h.calls).toHaveLength(2);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false }); h.snapshot(); await drain();
    for (let i = 0; i < 20; i++) { h.client.setContext(TASK_FIXTURE_WORLD.worldId, TASK_FIXTURE_WORLD.repositoryId); h.client.setVisible(true); }
    expect(h.calls).toHaveLength(2);
    window.dispatchEvent(new Event("focus")); expect(h.calls).toHaveLength(3); h.snapshot(); await drain();
    hidden = true; document.dispatchEvent(new Event("visibilitychange")); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20000); expect(h.calls).toHaveLength(3);
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(h.calls).toHaveLength(4);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    h.disconnect(); expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); expect(h.calls).toHaveLength(4);
  });

  it("does not begin a scan while the document is hidden or add its own five-second request timeout", async () => {
    hidden = true; const h = harness(); h.client.setVisible(true); expect(h.calls).toHaveLength(0);
    hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9000); expect(h.client.getSnapshot().refreshing).toBe(true);
    h.snapshot(); await drain(); expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it.each(["unavailable", "limited", "malformed", "error"] as const)("preserves complete data/detail across a %s attempt that has no snapshot", async (status) => {
    const h = await selected(); const old = h.client.getSnapshot();
    void h.client.refresh(); h.snapshot({ ...taskObservationFixture(status, false), sequence: 3 }); await drain();
    expect(h.client.getSnapshot().observation).toMatchObject({ status, snapshot: old.observation!.snapshot });
    expect(h.client.getSnapshot().detail).toBe(old.detail);
    expect(h.client.getSnapshot().observation?.reason?.code).toContain("TASK_");
    expect(h.client.getSnapshot().notice).toBeNull();
    expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it("reports unavailable as unavailable, not a successful empty snapshot", async () => {
    const h = await observed(taskObservationFixture("unavailable", false));
    expect(h.client.getSnapshot()).toMatchObject({ observation: { status: "unavailable", snapshot: null }, refreshing: false });
    expect(h.calls).toHaveLength(1);
  });

  it.each(["CORE_TIMEOUT", "CORE_UNAVAILABLE"])("finishes a %s request without deleting old detail or endlessly retrying", async (code) => {
    const h = await selected(); const old = h.client.getSnapshot(); void h.client.refresh(); const call = h.latest("tasks.snapshot");
    call.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId, ok: false, error: { code, message: "Read did not complete." } });
    await drain(); expect(h.client.getSnapshot()).toMatchObject({ refreshing: false, detail: old.detail, observation: old.observation });
    expect(h.client.getSnapshot().notice).toContain(code); const count = h.calls.length;
    await drain(); expect(h.calls).toHaveLength(count);
  });

  it("keeps the prior transport warning during the next bounded pending request until a valid observation replaces it", async () => {
    const h = await observed(); void h.client.refresh(); const failed = h.latest("tasks.snapshot");
    failed.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: failed.request.requestId,
      ok: false, error: { code: "CORE_TIMEOUT", message: "Read did not complete." } }); await drain();
    const notice = h.client.getSnapshot().notice;
    expect(notice).toContain("CORE_TIMEOUT");
    void h.client.refresh();
    expect(h.client.getSnapshot()).toMatchObject({ notice, refreshing: true });
    await vi.advanceTimersByTimeAsync(9000);
    expect(h.client.getSnapshot()).toMatchObject({ notice, refreshing: true });
    expect(h.calls).toHaveLength(3);
    h.snapshot({ ...taskObservationFixture(), sequence: 2 }); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ notice: null, refreshing: false });
  });

  it("does not repeat an initial failed scan without an available metadata ref", async () => {
    const h = harness(); h.client.setVisible(true); const first = h.latest("tasks.snapshot");
    expect(first.request).toMatchObject({ refresh: true });
    first.resolve({ protocolVersion: PROTOCOL_VERSION, requestId: first.request.requestId,
      ok: false, error: { code: "CORE_TIMEOUT", message: "Initial scan did not complete." } }); await drain();
    h.client.setVisible(false); h.client.setVisible(true);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    h.snapshot({ ...taskObservationFixture("unavailable", false), localRef: null }); await drain();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: false });
    h.snapshot({ ...taskObservationFixture("unavailable", false), localRef: null, sequence: 2 }); await drain();
    expect(h.calls.filter((call) => call.request.type === "tasks.snapshot" && call.request.refresh)).toHaveLength(1);
    void h.client.refresh(); expect(h.latest("tasks.snapshot").request).toMatchObject({ refresh: true });
  });

  it("does not expose a thrown bridge error even if it spoofs a known error prefix", async () => {
    const h = harness(); h.client.setVisible(true);
    h.latest("tasks.snapshot").reject(new Error("CORE_UNAVAILABLE: secret task body")); await drain();
    expect(h.client.getSnapshot().notice).not.toContain("secret");
    expect(h.client.getSnapshot().refreshing).toBe(false);
  });
});

describe("TaskBridgeClient authority and selection", () => {
  it.each(["world", "repository", "provider", "kind", "request", "malformed"])("rejects a %s snapshot without replacing the last complete observation", async (fault) => {
    const h = await observed(); const old = h.client.getSnapshot().observation; void h.client.refresh(); const call = h.latest("tasks.snapshot");
    const observation = taskObservationFixture(); observation.sequence = 2;
    const response = h.response(call, { kind: "snapshot", observation });
    if (fault === "world") { observation.worldId = "world:other"; observation.snapshot!.worldId = "world:other"; }
    if (fault === "repository") { observation.repositoryId = "project:other"; observation.snapshot!.repositoryId = "project:other"; response.snapshot.project.id = "project:other"; }
    if (fault === "provider") Object.assign(observation, { provider: "other" });
    if (fault === "kind") response.task = taskReadFixture();
    if (fault === "request") response.requestId = "wrong-request";
    if (fault === "malformed") Object.assign(observation, { arbitrary: "injected" });
    call.resolve(response as CoreResponse); await drain();
    expect(h.client.getSnapshot().observation).toBe(old);
    expect(h.client.getSnapshot()).toMatchObject({ refreshing: false });
    expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
  });

  it("uses task sequence, not the incidental workspace sequence, and never adopts workspace focus", async () => {
    const h = await observed({ ...taskObservationFixture(), sequence: 10 }); const old = h.client.getSnapshot().observation;
    void h.client.refresh(); const call = h.latest("tasks.snapshot");
    h.reply(call, { kind: "snapshot", observation: { ...taskObservationFixture(), sequence: 9 } }, 99999); await drain();
    expect(h.client.getSnapshot().observation).toBe(old);
    expect(h.client.getSnapshot()).not.toHaveProperty("focus");
    expect(h.client.getSnapshot()).not.toHaveProperty("workspace");
  });

  it("accepts a pinned detail even when a later-sequenced cheap snapshot completes first", async () => {
    const h = await observed(); h.client.select("task-fixture"); const detail = h.latest("tasks.read");
    await vi.advanceTimersByTimeAsync(5000);
    h.snapshot({ ...taskObservationFixture(), sequence: 3 }); await drain();
    h.read({ ...taskReadFixture(), sequence: 2 }, detail); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detail: { id: "task-fixture" }, reading: false,
      detailStale: false, detailNotice: null, observation: { sequence: 3 } });
  });

  it("accepts a snapshot even when a later-sequenced detail completes first", async () => {
    const h = await observed(); await vi.advanceTimersByTimeAsync(5000); const pending = h.latest("tasks.snapshot");
    h.client.select("task-fixture"); h.read({ ...taskReadFixture(), sequence: 3 }); await drain();
    h.snapshot({ ...taskObservationFixture("stale"), sequence: 2 }, pending); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ observation: { status: "stale", sequence: 2 }, notice: null,
      detail: { id: "task-fixture" }, detailStale: false, reading: false });
  });

  it("still rejects an older detail sequence within its own result stream", async () => {
    const h = await observed(); h.client.select("task-fixture"); h.read({ ...taskReadFixture(), sequence: 5 }); await drain();
    const old = h.client.getSnapshot().detail;
    h.client.select("task-fixture"); h.read({ ...taskReadFixture(), sequence: 4 }); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detail: old, detailStale: true, reading: false });
    expect(h.client.getSnapshot().detailNotice).toContain("became stale");
  });

  it("rejects an incoherent object algorithm when retaining a snapshot across a failed attempt", async () => {
    const h = await observed(); const old = h.client.getSnapshot().observation; void h.client.refresh();
    const failed = taskObservationFixture("error", false); failed.sequence = 2;
    failed.localRef = { algorithm: "sha256", hex: "a".repeat(64) };
    h.snapshot(failed); await drain();
    expect(h.client.getSnapshot().observation).toBe(old);
    expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it("rejects a changed summary at an already observed immutable metadata revision", async () => {
    const h = await observed(); const old = h.client.getSnapshot().observation; void h.client.refresh();
    const changed = taskObservationFixture(); changed.sequence = 2;
    changed.snapshot!.summaries[0]!.title = "Different title at the same commit";
    h.snapshot(changed); await drain();
    expect(h.client.getSnapshot().observation).toBe(old);
    expect(h.client.getSnapshot().notice).toContain("immutable task revision");
    expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it("retains the full selected ID after deletion and never silently selects a different row", async () => {
    const h = await selected(); const oldDetail = h.client.getSnapshot().detail;
    const observation = advanceObservation(4); observation.snapshot!.summaries = [];
    void h.client.refresh(); h.snapshot(observation); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ selectedTaskId: "task-fixture", detail: oldDetail, detailStale: true, reading: false });
    expect(h.client.getSnapshot().detailNotice).toContain("not present in this revision");
    const count = h.calls.length; h.client.select("../unsafe"); expect(h.calls).toHaveLength(count);
  });

  it("allows a literal missing dependency selection, without a read or source/agent authority", async () => {
    const h = await selected(); const count = h.calls.length;
    h.client.select("task-missing"); expect(h.calls).toHaveLength(count);
    expect(h.client.getSnapshot()).toMatchObject({ selectedTaskId: "task-missing", detail: null });
    expect(h.client.getSnapshot().detailNotice).toContain("not present");
    expect(h.calls.every((call) => call.request.type === "tasks.snapshot" || call.request.type === "tasks.read")).toBe(true);
  });

  it("discards an old selected task's delayed detail even if its sequence is newer", async () => {
    const observation = taskObservationFixture(); observation.snapshot!.summaries.push({ ...observation.snapshot!.summaries[0]!, id: "task-other" });
    const h = await observed(observation); h.client.select("task-fixture"); const old = h.latest("tasks.read");
    h.client.select("task-other"); const result = taskReadFixture(); result.taskId = "task-other";
    if (!result.result.ok) throw new Error("fixture"); result.result.detail.id = "task-other"; result.sequence = 2;
    h.read(result); await drain(); h.read({ ...taskReadFixture(), sequence: 99 }, old); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ selectedTaskId: "task-other", detail: { id: "task-other" }, reading: false });
  });

  it.each(["task", "revision", "blob", "summary", "repository", "kind"])("rejects a %s detail mismatch, preserving the prior known detail", async (fault) => {
    const h = await selected(); const old = h.client.getSnapshot().detail; h.client.select("task-fixture"); const call = h.latest("tasks.read");
    const result = taskReadFixture(); result.sequence = 3;
    if (!result.result.ok) throw new Error("fixture");
    const response = h.response(call, result);
    if (fault === "task") { result.taskId = "task-other"; result.result.detail.id = "task-other"; }
    if (fault === "revision") result.metadataCommit = { algorithm: "sha1", hex: "c".repeat(40) };
    if (fault === "blob") result.result.detail.blob = { algorithm: "sha1", hex: "c".repeat(40) };
    if (fault === "summary") result.result.detail.title = "Unobserved replacement title";
    if (fault === "repository") { result.repositoryId = "project:other"; response.snapshot.project.id = "project:other"; }
    if (fault === "kind") response.task = { kind: "snapshot", observation: taskObservationFixture() };
    call.resolve(response as CoreResponse); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detail: old, reading: false, detailStale: true });
    expect(h.client.getSnapshot().detailNotice).toContain("INVALID_CORE_MESSAGE");
  });

  it("retains old revision detail on an expired read without retargeting to a moving revision", async () => {
    const h = await selected(); h.client.select("task-fixture");
    h.read({ ...taskReadFixture({ code: "TASK_REVISION_EXPIRED", message: "Revision is no longer cached." }), sequence: 3 }); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detailRevision: TASK_FIXTURE_COMMIT, detailStale: true, reading: false });
    expect(h.client.getSnapshot().detailNotice).toContain("TASK_REVISION_EXPIRED");
    expect(h.latest("tasks.read").request).toMatchObject({ metadataCommit: TASK_FIXTURE_COMMIT });
  });

  it("does not retry a failed pinned detail on ref checks; explicit refresh and new revisions can retry", async () => {
    const h = await observed(); h.client.select("task-fixture");
    h.read({ ...taskReadFixture({ code: "TASK_REVISION_EXPIRED", message: "Revision is no longer cached." }), sequence: 2 }); await drain();
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(1);
    for (const sequence of [3, 4]) {
      await vi.advanceTimersByTimeAsync(5000); h.snapshot({ ...taskObservationFixture(), sequence }); await drain();
    }
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(1);
    expect(h.client.getSnapshot().detailNotice).toContain("TASK_REVISION_EXPIRED");
    void h.client.refresh(); h.snapshot({ ...taskObservationFixture(), sequence: 5 }); await drain();
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(2);
    h.read({ ...taskReadFixture({ code: "TASK_REVISION_EXPIRED", message: "Revision is no longer cached." }), sequence: 6 }); await drain();
    const next = advanceObservation(7); await vi.advanceTimersByTimeAsync(5000); h.snapshot(next); await drain();
    expect(h.calls.filter((call) => call.request.type === "tasks.read")).toHaveLength(3);
    h.read(atRevision(taskReadFixture(), next)); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detailNotice: null, detailStale: false, reading: false });
  });

  it("reads a new pinned revision after it advances during an old detail read", async () => {
    const h = await observed(); h.client.select("task-fixture"); const old = h.latest("tasks.read");
    const observation = advanceObservation(3); void h.client.refresh(); h.snapshot(observation); await drain();
    const current = h.latest("tasks.read"); expect(current).not.toBe(old);
    expect(current.request).toMatchObject({ metadataCommit: observation.snapshot!.metadataCommit });
    h.read({ ...taskReadFixture(), sequence: 99 }, old); await drain(); expect(h.client.getSnapshot().detail).toBeNull();
    h.read(atRevision(taskReadFixture(), observation), current); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ detailRevision: observation.snapshot!.metadataCommit, detailStale: false, reading: false });
  });
});

describe("TaskBridgeClient connection and store lifetime", () => {
  it("subscribes before reading lifecycle, rejects obsolete status and revokes old-generation results", async () => {
    const h = harness(true); h.client.setVisible(true); expect(h.calls).toHaveLength(0);
    h.status(h.ready(2)); const old = h.latest("tasks.snapshot");
    h.initial.resolve(h.ready(1, "failed")); await drain(); h.status(h.ready(1, "unavailable"));
    expect(h.client.getSnapshot().connected).toBe(true); expect(h.calls).toHaveLength(1);
    h.status(h.ready(3, "starting")); expect(vi.getTimerCount()).toBe(0);
    h.status(h.ready(3, "ready", 4)); const current = h.latest("tasks.snapshot");
    expect(current.request).toMatchObject({ refresh: true });
    h.snapshot({ ...taskObservationFixture(), sequence: 999 }, old); await drain(); expect(h.client.getSnapshot().observation).toBeNull();
    h.snapshot(taskObservationFixture(), current); await drain(); expect(h.client.getSnapshot().observation?.sequence).toBe(1);
    h.status(h.ready(3, "failed", 3)); expect(h.client.getSnapshot().connected).toBe(true);
  });

  it("does not claim reconnect failure during the first pending ready scan", async () => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1));
    expect(h.client.getSnapshot()).toMatchObject({ connected: true, refreshing: true, notice: null, observation: null });
    await vi.advanceTimersByTimeAsync(9000);
    expect(h.calls).toHaveLength(1);
    expect(h.client.getSnapshot().notice).toBeNull();
    h.snapshot(); await drain(); expect(h.client.getSnapshot().refreshing).toBe(false);
  });

  it.each(["same generation", "new generation"])("retains stale revision evidence but clears obsolete connection notices during %s recovery", async (kind) => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1)); h.snapshot(); await drain();
    const retained = h.client.getSnapshot().observation!.snapshot;
    h.status(h.ready(1, "draining", 2));
    expect(h.client.getSnapshot().notice).toContain("CORE_UNAVAILABLE");
    h.status(h.ready(kind === "same generation" ? 1 : 2, "ready", 3));
    expect(h.client.getSnapshot()).toMatchObject({ connected: true, refreshing: true, notice: null,
      observation: { status: "stale", snapshot: retained, reason: { code: "TASK_RECONNECT_REQUIRED" } } });
    await vi.advanceTimersByTimeAsync(9000);
    expect(h.client.getSnapshot().notice).toBeNull();
    expect(h.calls).toHaveLength(2);
  });

  it("retains stale selected data across a core replacement and rejects pending detail before recovery", async () => {
    const h = harness(true); h.client.setVisible(true); h.status(h.ready(1)); h.snapshot(); await drain();
    h.client.select("task-fixture"); h.read(); await drain(); h.client.select("task-fixture"); const old = h.latest("tasks.read");
    h.status(h.ready(2, "starting"));
    expect(h.client.getSnapshot()).toMatchObject({ connected: false, reading: false, detailStale: true, observation: { status: "stale" } });
    h.read({ ...taskReadFixture(), sequence: 999 }, old); await drain();
    h.status(h.ready(2, "ready", 3)); h.snapshot(); await drain(); h.read(); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ connected: true, reading: false, detailStale: false, selectedTaskId: "task-fixture" });
  });

  it("an old disconnect callback cannot tear down a newer connection", async () => {
    const h = await observed(); const oldOff = h.disconnect;
    const newOff = h.client.connect(h.bridge); const call = h.latest("tasks.snapshot"); oldOff(); h.snapshot(taskObservationFixture(), call); await drain();
    expect(h.client.getSnapshot().connected).toBe(true); newOff(); expect(h.client.getSnapshot().connected).toBe(false);
  });

  it("clears cross-repository identity and rejects a former context response", async () => {
    const h = await selected(); void h.client.refresh(); const old = h.latest("tasks.snapshot");
    h.client.setContext("world:other", "project:other"); h.snapshot({ ...taskObservationFixture(), sequence: 999 }, old); await drain();
    expect(h.client.getSnapshot()).toMatchObject({ observation: null, selectedTaskId: null, detail: null });
    expect(h.latest("tasks.snapshot").request).toMatchObject({ worldId: "world:other", refresh: true });
  });

  it("provides stable external-store snapshots, unsubscribe and complete disposal without late publication", async () => {
    const h = harness(true); const listener = vi.fn(); const off = h.client.subscribe(listener);
    expect(h.client.getSnapshot()).toBe(h.client.getSnapshot());
    h.client.setVisible(true); h.status(h.ready(1)); const call = h.latest("tasks.snapshot"); expect(listener).toHaveBeenCalled();
    off(); listener.mockClear(); h.client.dispose(); const after = h.client.getSnapshot();
    h.snapshot(taskObservationFixture(), call); h.initial.resolve(h.ready(1)); await drain();
    expect(h.client.getSnapshot()).toBe(after); expect(listener).not.toHaveBeenCalled();
    expect(h.offStatus).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
