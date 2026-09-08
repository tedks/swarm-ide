// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import type { CoreRequest, CoreResponse } from "../protocol/schema";
import { PROTOCOL_VERSION } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import { taskObservationFixture, taskReadFixture } from "../fixtures/tasks";

const clients: TaskBridgeClient[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.dispose()); });
const drain = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
async function harness() {
  const client = new TaskBridgeClient(); clients.push(client);
  const pending: { request: CoreRequest; reply: (value: CoreResponse) => void }[] = [];
  client.setContext("world:working", "project:swarm-ide");
  const bridge = { request: (request: CoreRequest): Promise<CoreResponse> => new Promise((reply) => pending.push({ request, reply })), onEvent: vi.fn(() => () => {}) };
  client.connect(bridge);
  client.setVisible(true);
  const answer = (task: unknown, index = pending.length - 1) => {
    const snapshot = initialSnapshot(); snapshot.project.id = "project:swarm-ide";
    pending[index]!.reply({ protocolVersion: PROTOCOL_VERSION,
      requestId: pending[index]!.request.requestId, ok: true, sequence: 1, snapshot, task } as CoreResponse);
  };
  answer({ kind: "snapshot", observation: taskObservationFixture() }); await drain();
  return { client, bridge, pending, answer, snapshot: client.getSnapshot().observation!.snapshot! };
}
describe("graph reads share task authority without hijacking selection", () => {
  it("reads the pinned revision and leaves the selected detail untouched until deliberate activation", async () => {
    const h = await harness(); const before = h.client.getSnapshot();
    const read = h.client.readGraphDetail(h.snapshot, "task-fixture", new AbortController().signal);
    expect(h.pending.at(-1)!.request).toMatchObject({ type: "tasks.read", metadataCommit: h.snapshot.metadataCommit });
    h.answer(taskReadFixture()); expect((await read)?.id).toBe("task-fixture");
    expect(h.client.getSnapshot()).toBe(before);
    const open = h.client.inspectGraphTask(h.snapshot, "task-fixture"); h.answer(taskReadFixture());
    expect(await open).toBe(true);
    expect(h.client.getSnapshot()).toMatchObject({ selectedTaskId: "task-fixture", pin: { taskId: "task-fixture", metadataCommit: h.snapshot.metadataCommit } });
  });
  it.each(["cancel", "disconnect", "world", "revision", "summary"])("rejects %s before adopting a graph read", async (kind) => {
    const h = await harness(), controller = new AbortController();
    const read = h.client.readGraphDetail(h.snapshot, "task-fixture", controller.signal);
    const index = h.pending.length - 1;
    if (kind === "cancel") controller.abort();
    if (kind === "disconnect") h.client.disconnect();
    if (kind === "world") h.client.setContext("world:other", "project:other");
    if (kind === "revision") {
      void h.client.refresh(); const observation = taskObservationFixture(); observation.sequence = 2;
      observation.localRef = { algorithm: "sha1", hex: "c".repeat(40) }; observation.snapshot!.metadataCommit = observation.localRef;
      h.answer({ kind: "snapshot", observation }); await drain();
    }
    const result = taskReadFixture(); if (kind === "summary" && result.result.ok) result.result.detail.title = "Wrong immutable title";
    h.answer(result, index); expect(await read).toBeNull(); expect(h.client.getSnapshot().selectedTaskId).toBeNull();
  });
  it("does not let delayed graph activation override newer source intent", async () => {
    const h = await harness(); let current = true;
    const open = h.client.inspectGraphTask(h.snapshot, "task-fixture", () => current);
    current = false; h.answer(taskReadFixture()); expect(await open).toBe(false);
    expect(h.client.getSnapshot().selectedTaskId).toBeNull();
  });
  it("does not issue reads for missing IDs or a replaced graph revision", async () => {
    const h = await harness(), count = h.pending.length;
    expect(await h.client.inspectGraphTask(h.snapshot, "missing")).toBe(false);
    const old = { ...h.snapshot, metadataCommit: { algorithm: "sha1" as const, hex: "c".repeat(40) } };
    expect(await h.client.inspectGraphTask(old, "task-fixture")).toBe(false);
    expect(h.pending).toHaveLength(count);
  });
  it("waits for owned slots across canceled batches instead of skipping unread tasks", async () => {
    const h = await harness(); const controller = new AbortController();
    const first = Array.from({ length: 4 }, () => h.client.readGraphDetail(h.snapshot, "task-fixture", controller.signal));
    const pending = h.pending.slice(-4); controller.abort();
    let secondSettled = false;
    const second = h.client.readGraphDetail(h.snapshot, "task-fixture", new AbortController().signal)
      .then((value) => { secondSettled = true; return value; });
    await drain();
    expect(h.pending.filter((call) => call.request.type === "tasks.read")).toHaveLength(4);
    expect(secondSettled).toBe(false);
    for (const call of pending) h.answer(taskReadFixture(), h.pending.indexOf(call));
    expect(await Promise.all(first)).toEqual([null, null, null, null]); await drain();
    expect(h.pending.filter((call) => call.request.type === "tasks.read")).toHaveLength(5);
    h.answer(taskReadFixture()); expect((await second)?.id).toBe("task-fixture");
    const resumed = h.client.readGraphDetail(h.snapshot, "task-fixture", new AbortController().signal); h.answer(taskReadFixture());
    expect((await resumed)?.id).toBe("task-fixture");
  });
  it("cancels a waiting read without sending it when slots later become available", async () => {
    const h = await harness(), occupied = new AbortController(), waiting = new AbortController();
    const first = Array.from({ length: 4 }, () => h.client.readGraphDetail(h.snapshot, "task-fixture", occupied.signal));
    const pending = h.pending.slice(-4);
    const canceled = h.client.readGraphDetail(h.snapshot, "task-fixture", waiting.signal);
    waiting.abort(); expect(await canceled).toBeNull();
    for (const call of pending) h.answer(taskReadFixture(), h.pending.indexOf(call));
    await Promise.all(first);
    expect(h.pending.filter((call) => call.request.type === "tasks.read")).toHaveLength(4);
  });
});
