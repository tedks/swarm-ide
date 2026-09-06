// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreSupervisor } from "../app/electron/core-supervisor";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { TaskRequest } from "../protocol/tasks";
import { initialSnapshot } from "../fixtures/world";
import { TASK_FIXTURE_COMMIT, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";

class FakeCore extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => true);
  ready() { this.emit("message", { type: "core.ready" }); }
  exit() { this.emit("exit", 0); }
}

const supervisors: CoreSupervisor[] = [];
const taskTypes = ["tasks.snapshot", "tasks.read"] as const;
function taskRequest(type: TaskRequest["type"], requestId: string = type): TaskRequest {
  const base = { protocolVersion: PROTOCOL_VERSION, requestId, worldId: "world:working" };
  return type === "tasks.snapshot"
    ? { ...base, type, refresh: true }
    : { ...base, type, metadataCommit: TASK_FIXTURE_COMMIT, taskId: "task-fixture" };
}
function response(request: TaskRequest): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1,
    snapshot: initialSnapshot(), task: request.type === "tasks.snapshot"
      ? { kind: "snapshot", observation: taskObservationFixture() } : taskReadFixture() };
}
function setup() {
  const children: FakeCore[] = [];
  const hooks = { launch: vi.fn(() => { const child = new FakeCore(); children.push(child); return child; }),
    status: vi.fn(), event: vi.fn() };
  const supervisor = new CoreSupervisor(hooks);
  supervisors.push(supervisor);
  supervisor.start();
  const first = children[0]!;
  first.ready();
  return { supervisor, first, children, hooks };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const supervisor of supervisors.splice(0)) supervisor.stop();
  vi.useRealTimers();
});

describe("task-only supervisor read deadlines", () => {
  it.each(taskTypes)("accepts %s after the former 5s deadline and before 12s", async (type) => {
    const { supervisor, first } = setup();
    const input = taskRequest(type);
    const settled = vi.fn();
    const pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(settled).not.toHaveBeenCalled();
    first.emit("message", response(input));
    await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(response(input));
    // Only the supervisor's readiness-stability timer remains, not the read timer.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(first.postMessage).toHaveBeenCalledExactlyOnceWith(input);
    expect(first.kill).not.toHaveBeenCalled();
  });

  it.each(taskTypes)("times out unanswered %s at exactly 12s and ignores its late reply", async (type) => {
    const { supervisor, first } = setup();
    const input = taskRequest(type, "expired");
    const settled = vi.fn();
    const pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      requestId: "expired", ok: false, error: expect.objectContaining({ code: "CORE_TIMEOUT" }),
    }));
    const nextInput = taskRequest(type, "next");
    const nextSettled = vi.fn();
    const next = supervisor.request(nextInput).then(nextSettled);
    first.emit("message", response(input));
    await vi.advanceTimersByTimeAsync(1);
    expect(nextSettled).not.toHaveBeenCalled();
    first.emit("message", response(nextInput));
    await next;
    expect(nextSettled).toHaveBeenCalledExactlyOnceWith(response(nextInput));
    expect(settled).toHaveBeenCalledTimes(1);
    expect(first.postMessage).toHaveBeenCalledTimes(2);
    expect(first.kill).not.toHaveBeenCalled();
  });

  it("retains the 5s non-task deadline while a task read remains pending", async () => {
    const { supervisor, first } = setup();
    const input = taskRequest("tasks.snapshot");
    const taskSettled = vi.fn();
    const task = supervisor.request(input).then(taskSettled);
    const read: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "workspace", type: "workspace.snapshot" };
    const workspaceSettled = vi.fn();
    const workspace = supervisor.request(read).then(workspaceSettled);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(workspaceSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await workspace;
    expect(workspaceSettled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "CORE_TIMEOUT" }),
    }));
    expect(taskSettled).not.toHaveBeenCalled();
    first.emit("message", response(input));
    await task;
    expect(taskSettled).toHaveBeenCalledExactlyOnceWith(response(input));
  });

  it.each(taskTypes)("settles %s immediately on replacement and rejects old-generation replies", async (type) => {
    const { supervisor, first, children } = setup();
    const input = taskRequest(type);
    const pending = supervisor.request(input);
    await vi.advanceTimersByTimeAsync(6_000);
    supervisor.restart();
    expect(await pending).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
    expect(first.postMessage).toHaveBeenLastCalledWith({ type: "core.shutdown" });
    expect(children).toHaveLength(1);
    expect(await supervisor.request(taskRequest(type, "during-drain"))).toMatchObject({
      ok: false, error: { code: "CORE_UNAVAILABLE" },
    });
    first.emit("message", { type: "core.shutdown.ready" });
    expect(first.kill).toHaveBeenCalledTimes(1);
    first.exit();
    const second = children[1]!;
    second.ready();
    expect(second.postMessage).not.toHaveBeenCalled(); // Reads are not replayed.
    const nextSettled = vi.fn();
    const next = supervisor.request(input).then(nextSettled);
    first.emit("message", response(input));
    first.exit();
    await vi.advanceTimersByTimeAsync(6_000); // Cross the old generation's original deadline.
    expect(nextSettled).not.toHaveBeenCalled();
    expect(supervisor.state).toMatchObject({ generation: 2, phase: "ready" });
    expect(second.kill).not.toHaveBeenCalled();
    second.emit("message", response(input));
    await next;
    expect(nextSettled).toHaveBeenCalledExactlyOnceWith(response(input));
    expect(second.postMessage).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("settles both task reads on stop, clears all deadlines and never restarts or replays", async () => {
    const { supervisor, first, children } = setup();
    const inputs = taskTypes.map((type) => taskRequest(type));
    const pending = inputs.map((input) => supervisor.request(input));
    await vi.advanceTimersByTimeAsync(6_000);
    supervisor.stop();
    for (const result of await Promise.all(pending)) {
      expect(result).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
    }
    expect(vi.getTimerCount()).toBe(0);
    for (const input of inputs) first.emit("message", response(input));
    first.exit();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(children).toHaveLength(1);
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(first.postMessage).toHaveBeenCalledTimes(2);
    expect(supervisor.state.phase).toBe("stopped");
    expect(await supervisor.request(taskRequest("tasks.snapshot", "after-stop"))).toMatchObject({
      ok: false, error: { code: "CORE_UNAVAILABLE" },
    });
  });

  it("correlates out-of-order task snapshot and detail responses independently", async () => {
    const { supervisor, first } = setup();
    const snapshotInput = taskRequest("tasks.snapshot");
    const readInput = taskRequest("tasks.read");
    const snapshotSettled = vi.fn();
    const snapshot = supervisor.request(snapshotInput).then(snapshotSettled);
    const read = supervisor.request(readInput);
    await vi.advanceTimersByTimeAsync(6_000);
    first.emit("message", response(readInput));
    expect(await read).toEqual(response(readInput));
    expect(snapshotSettled).not.toHaveBeenCalled();
    first.emit("message", response(snapshotInput));
    await snapshot;
    expect(snapshotSettled).toHaveBeenCalledExactlyOnceWith(response(snapshotInput));
    expect(vi.getTimerCount()).toBe(1);
  });

  it("still rejects a task detail with the wrong pinned revision after 5s", async () => {
    const { supervisor, first } = setup();
    const input = taskRequest("tasks.read");
    const pending = supervisor.request(input);
    await vi.advanceTimersByTimeAsync(6_000);
    first.emit("message", { ...response(input), task: { ...taskReadFixture(),
      metadataCommit: { algorithm: "sha1", hex: "c".repeat(40) } } });
    expect(await pending).toMatchObject({ ok: false, error: { code: "INVALID_CORE_MESSAGE" } });
    expect(vi.getTimerCount()).toBe(1);
  });
});
