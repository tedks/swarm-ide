// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import type { SwarmBridge } from "../app/electron/preload";
import type { Lifecycle, LifecycleBridge } from "../app/lifecycle";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { AgentTaskReferenceSchema } from "../protocol/agent-task";
import { type TaskObservation, type TaskObservationStatus, type TaskReadResult } from "../protocol/tasks";
import { initialSnapshot } from "../fixtures/world";
import { TASK_FIXTURE_BLOB, TASK_FIXTURE_COMMIT, TASK_FIXTURE_WORLD, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";

// Deliberately use the real observer and schema-valid bridge replies. These are
// deterministic task-data fixtures, not a real Ditz repository or core resolver.
const drain = async () => { for (let i = 0; i < 16; ++i) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Pending = ReturnType<typeof deferred<CoreResponse>> & { request: CoreRequest };
const clients: TaskBridgeClient[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, "hidden", "get").mockReturnValue(false); });
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers(); vi.restoreAllMocks();
});
function linkedObservation() {
  const observation = taskObservationFixture(), read = taskReadFixture();
  if (!read.result.ok) throw new Error("Expected successful fixture");
  observation.snapshot!.backlinks = { status: "complete", entries: read.result.detail.fileRefs.map((ref, refIndex) => ({
    taskId: read.taskId, refIndex, path: ref.path, navigation: ref.navigation,
  })) };
  return observation;
}
function harness(lifecycle = false) {
  const calls: Pending[] = [];
  const bridge: SwarmBridge = {
    request(request) { const call = { request, ...deferred<CoreResponse>() }; calls.push(call); return call.promise; },
    onEvent: vi.fn(() => { throw new Error("Task observer must remain read-only"); }),
  };
  const initial = deferred<Lifecycle>();
  let status: (value: Lifecycle) => void = () => undefined;
  const life: LifecycleBridge = {
    status: () => initial.promise,
    onStatus(listener) { status = listener; return () => { status = () => undefined; }; },
    reload: vi.fn(() => { throw new Error("Attachment eligibility cannot reload"); }),
  };
  const ready = (generation: number): Lifecycle => ({ revision: generation,
    core: { generation, phase: "ready", message: "Fixture core" }, reload: "idle", notice: "fixture" });
  const latest = (type: CoreRequest["type"]) => calls.filter((call) => call.request.type === type).at(-1)!;
  const reply = (call: Pending, task: unknown) => call.resolve(CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION, requestId: call.request.requestId, ok: true, sequence: 1,
    snapshot: initialSnapshot(), task,
  }));
  const snapshot = (observation = taskObservationFixture(), call = latest("tasks.snapshot")) => reply(call, { kind: "snapshot", observation });
  const read = (result = taskReadFixture(), call = latest("tasks.read")) => reply(call, result);
  const client = new TaskBridgeClient(); clients.push(client);
  client.setContext(TASK_FIXTURE_WORLD.worldId, TASK_FIXTURE_WORLD.repositoryId);
  const disconnect = client.connect(bridge, lifecycle ? life : undefined);
  return { client, calls, bridge, life, latest, snapshot, read, disconnect, ready, status: (value: Lifecycle) => status(value) };
}
async function selected(observation = taskObservationFixture(), lifecycle = false) {
  const h = harness(lifecycle); h.client.setVisible(true);
  if (lifecycle) h.status(h.ready(1));
  h.snapshot(observation); await drain(); h.client.select("task-fixture"); h.read(); await drain();
  return h;
}

describe("task attachment observation authority", () => {
  it("exposes only a detached full pin and readonly preview without requests, focus changes or timers", async () => {
    const h = await selected(), state = h.client.getSnapshot(), calls = h.calls.length, timers = vi.getTimerCount();
    const candidate = h.client.getAttachmentCandidate("task-fixture")!;
    expect(candidate).not.toBeNull(); expect(candidate.isCurrent()).toBe(true);
    expect(AgentTaskReferenceSchema.parse(candidate.reference)).toEqual({ version: 1, ...TASK_FIXTURE_WORLD,
      metadataCommit: TASK_FIXTURE_COMMIT, issueBlob: TASK_FIXTURE_BLOB, taskId: "task-fixture" });
    expect(candidate.title).toBe(state.detail!.title); expect(candidate.description).toBe(state.detail!.description);
    expect(candidate.reference.metadataCommit).not.toBe(state.detailRevision);
    expect(candidate.reference.issueBlob).not.toBe(state.detail!.blob);
    expect(Object.isFrozen(candidate)).toBe(true); expect(Object.isFrozen(candidate.reference)).toBe(true);
    expect(Object.isFrozen(candidate.reference.issueBlob)).toBe(true);
    expect(h.client.getAttachmentCandidate(null)).toBeNull();
    expect(h.client.getAttachmentCandidate("task-fixture-prefix")).toBeNull();
    expect(h.client.getSnapshot()).toBe(state); expect(h.calls).toHaveLength(calls); expect(vi.getTimerCount()).toBe(timers);
    expect(h.bridge.onEvent).not.toHaveBeenCalled();
  });

  it("requires successful full detail, not an observed summary or pending detail", async () => {
    const h = harness(); h.client.setVisible(true); h.snapshot(); await drain();
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.client.select("task-fixture"); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.read(); await drain(); expect(h.client.getAttachmentCandidate("task-fixture")?.isCurrent()).toBe(true);
  });

  it.each<TaskObservationStatus>(["loading", "stale", "unavailable", "malformed", "limited", "error"])(
    "retains readable detail but refuses an %s current-ref attempt", async (status) => {
      const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!, detail = h.client.getSnapshot().detail;
      void h.client.refresh(); h.snapshot({ ...taskObservationFixture(status), sequence: 2 }); await drain();
      if (h.client.getSnapshot().reading) { h.read(); await drain(); }
      expect(h.client.getSnapshot().detail).toEqual(detail);
      expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    });

  it("revokes an existing proposal immediately on refresh, even when the exact pin is unchanged afterward", async () => {
    const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    void h.client.refresh(); expect(candidate.isCurrent()).toBe(false);
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.snapshot({ ...taskObservationFixture(), sequence: 2 }); await drain();
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.read(); await drain();
    expect(candidate.isCurrent()).toBe(false);
    expect(h.client.getAttachmentCandidate("task-fixture")?.reference).toEqual(candidate.reference);
  });

  it("revokes a candidate on a new ref-check observation without requiring a new detail or a different commit", async () => {
    const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!, detail = h.client.getSnapshot().detail;
    await vi.advanceTimersByTimeAsync(5000);
    expect(candidate.isCurrent()).toBe(false);
    h.snapshot({ ...taskObservationFixture(), sequence: 2 }); await drain();
    expect(h.client.getSnapshot().detail).toBe(detail); expect(candidate.isCurrent()).toBe(false);
    expect(h.client.getAttachmentCandidate("task-fixture")?.isCurrent()).toBe(true);
  });

  it("does not permit a coalesced explicit refresh between observation publication and its queued scan", async () => {
    const h = await selected(), observedEligibility: boolean[] = [];
    const off = h.client.subscribe(() => observedEligibility.push(Boolean(h.client.getAttachmentCandidate("task-fixture"))));
    void h.client.refresh(); void h.client.refresh();
    h.snapshot({ ...taskObservationFixture(), sequence: 2 }); await drain();
    expect(observedEligibility.every((value) => !value)).toBe(true);
    expect(h.client.getSnapshot().refreshing).toBe(true); off();
  });

  it.each(["same", "away-and-back"])("revokes a candidate after %s task selection even if its final pin matches", async (selection) => {
    const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    if (selection === "away-and-back") h.client.select("task-missing");
    h.client.select("task-fixture"); expect(candidate.isCurrent()).toBe(false);
    h.read(); await drain(); expect(candidate.isCurrent()).toBe(false);
    expect(h.client.getAttachmentCandidate("task-fixture")?.isCurrent()).toBe(true);
  });

  it.each(["disconnect", "dispose", "context", "replacement-core"])("revokes an otherwise identical candidate on %s", async (change) => {
    const h = await selected(taskObservationFixture(), true), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    if (change === "disconnect") h.disconnect();
    else if (change === "dispose") h.client.dispose();
    else if (change === "context") h.client.setContext("world:another", TASK_FIXTURE_WORLD.repositoryId);
    else h.status(h.ready(2));
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
  });

  it("reconnect/HMR must freshly observe and read, and cannot resurrect an old candidate", async () => {
    const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    h.disconnect(); h.client.connect(h.bridge);
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.snapshot(); await drain(); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.read(); await drain(); expect(candidate.isCurrent()).toBe(false);
    expect(h.client.getAttachmentCandidate("task-fixture")?.isCurrent()).toBe(true);
  });

  it("does not accept a late detail reply after selection has moved", async () => {
    const h = harness(); h.client.setVisible(true); h.snapshot(); await drain(); h.client.select("task-fixture");
    const pending = h.latest("tasks.read"); h.client.select("task-missing"); h.read(undefined, pending); await drain();
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull(); expect(h.client.getSnapshot().selectedTaskId).toBe("task-missing");
  });

  it.each(["world", "repository", "id", "commit", "blob", "summary"])("rejects a schema-valid but uncorrelated %s detail", async (mismatch) => {
    const h = harness(); h.client.setVisible(true); h.snapshot(); await drain(); h.client.select("task-fixture");
    const result = taskReadFixture(); if (!result.result.ok) throw new Error("fixture");
    if (mismatch === "world") result.worldId = "world:other";
    else if (mismatch === "repository") result.repositoryId = "project:other";
    else if (mismatch === "id") { result.taskId = "other"; result.result.detail.id = "other"; }
    else if (mismatch === "commit") result.metadataCommit = { algorithm: "sha1", hex: "c".repeat(40) };
    else if (mismatch === "blob") result.result.detail.blob = { algorithm: "sha1", hex: "d".repeat(40) };
    else result.result.detail.title = "Not the observed summary";
    h.read(result); await drain();
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull(); expect(h.client.getSnapshot().detailNotice).toContain("INVALID_CORE_MESSAGE");
  });

  it("rejects a failed read and a failed current-ref request while retaining old preview", async () => {
    const h = await selected(), candidate = h.client.getAttachmentCandidate("task-fixture")!;
    h.client.select("task-fixture");
    h.read(taskReadFixture({ code: "TASK_REVISION_EXPIRED", message: "The requested revision expired." })); await drain();
    expect(h.client.getSnapshot().detail).not.toBeNull(); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    void h.client.refresh(); h.latest("tasks.snapshot").reject(new Error("Private transport detail")); await drain();
    expect(h.client.getSnapshot().notice).toContain("INVALID_CORE_MESSAGE");
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
  });

  it("permits completed current pinned detail, but never a backlink summary or pending inspection", async () => {
    const h = harness(); h.client.setVisible(true); h.snapshot(linkedObservation()); await drain();
    const index = h.client.getSnapshot().backlinks!, path = index.references("task-fixture")[0]!.path;
    const target = index.lookup(path)[0]!.target;
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    const inspected = h.client.inspectPinned(target, { path, index }, () => true);
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    h.read(); expect(await inspected).toBe(true);
    const candidate = h.client.getAttachmentCandidate("task-fixture")!;
    expect(candidate.reference).toEqual({ ...target, version: 1 }); expect(candidate.isCurrent()).toBe(true);
    // Even a cached identical inspection is a new explicit selection generation.
    expect(await h.client.inspectPinned(target, { path, index }, () => true)).toBe(true);
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")?.isCurrent()).toBe(true);
  });

  it("retains old pinned detail after metadata moves but refuses it as current attachment authority", async () => {
    const h = await selected(linkedObservation());
    const index = h.client.getSnapshot().backlinks!, path = index.references("task-fixture")[0]!.path;
    expect(await h.client.inspectPinned(index.lookup(path)[0]!.target, { path, index }, () => true)).toBe(true);
    const candidate = h.client.getAttachmentCandidate("task-fixture")!, next: TaskObservation = linkedObservation();
    next.sequence = 2; next.snapshot!.metadataCommit = { algorithm: "sha1", hex: "c".repeat(40) }; next.localRef = next.snapshot!.metadataCommit;
    void h.client.refresh(); h.snapshot(next); await drain();
    expect(h.client.getSnapshot().detailRevision).toEqual(TASK_FIXTURE_COMMIT);
    expect(candidate.isCurrent()).toBe(false); expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
  });

  it("requires the new revision's detail even when its issue blob and prose have not changed", async () => {
    const h = await selected(), previous = h.client.getAttachmentCandidate("task-fixture")!, next = taskObservationFixture();
    next.sequence = 2; next.snapshot!.metadataCommit = { algorithm: "sha1", hex: "c".repeat(40) }; next.localRef = next.snapshot!.metadataCommit;
    void h.client.refresh(); h.snapshot(next); await drain();
    expect(h.client.getAttachmentCandidate("task-fixture")).toBeNull();
    const result: TaskReadResult = { ...taskReadFixture(), metadataCommit: next.localRef, sequence: 2 };
    h.read(result); await drain(); const current = h.client.getAttachmentCandidate("task-fixture")!;
    expect(previous.isCurrent()).toBe(false); expect(current.reference.issueBlob).toEqual(previous.reference.issueBlob);
    expect(current.reference.metadataCommit).not.toEqual(previous.reference.metadataCommit); expect(current.isCurrent()).toBe(true);
  });
});
