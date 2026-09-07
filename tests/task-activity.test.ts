// @vitest-environment node
import { expect, it } from "vitest";
import { stringify } from "yaml";
import { projectTaskActivity } from "../core/tasks/activity";
import { parseTaskMetadata, parseTaskMetadataBatch } from "../core/tasks/metadata";
import { TaskActivityResultSchema } from "../protocol/task-activity";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
const blob = { algorithm: "sha1" as const, hex: "a".repeat(40) };
const event = { time: "2026-09-06T02:31:53-00:00", who: "Fixture operator", what: "commented", comment: "Literal <script>not markup</script>" };
it("keeps actual offset timestamps, source order and duplicate log events", () => {
  const activity = projectTaskActivity({ creation_time: event.time, log_events: [event, event] }, blob);
  expect(activity).toMatchObject({ createdAt: event.time, status: "complete", total: 2, omitted: 0 });
  expect(activity.events.map((row) => row.ordinal)).toEqual([0, 1]);
  expect(activity.events[0]).toMatchObject(event);
});
it("bounds history independently and distinguishes malformed, absent and partial fields", () => {
  expect(projectTaskActivity({}, blob).status).toBe("unavailable");
  expect(projectTaskActivity({ log_events: [] }, blob).status).toBe("complete");
  const activity = projectTaskActivity({ creation_time: 12, log_events: [event, { ...event, comment: "x".repeat(4097) }] }, blob);
  expect(activity).toMatchObject({ createdAt: null, status: "partial", total: 2, omitted: 1 });
  const many = projectTaskActivity({ log_events: Array(40).fill(event) }, blob);
  expect(many.events).toHaveLength(32); expect(many.omitted).toBe(8);
});
it("same real owned YAML parse produces supplemental history without changing detail bytes", async () => {
  const issue = { id: "task", title: "Task", desc: "Instructions", type: "task", component: "core", status: "unstarted", disposition: null };
  const project = { name: "fixture", version: "0.1", components: [{ name: "core" }], releases: [] };
  const input = (extra = {}) => [{ id: null, blob, bytes: Buffer.from(stringify(project)) }, { id: "task", blob, bytes: Buffer.from(stringify({ ...issue, ...extra })) }];
  const original = await parseTaskMetadata(input(), new AbortController().signal, Date.now() + 5000);
  const batch = await parseTaskMetadataBatch(input({ creation_time: event.time, log_events: [event] }), new AbortController().signal, Date.now() + 5000);
  expect(JSON.stringify(batch.details)).toBe(JSON.stringify(original));
  expect(batch.activities.get("task")?.events[0]).toMatchObject(event);
  const malformed = await parseTaskMetadataBatch(input({ log_events: { invalid: true } }), new AbortController().signal, Date.now() + 5000);
  expect(malformed.details).toEqual(original); expect(malformed.activities.get("task")?.status).toBe("unavailable");
});
it("response is bound to exact world, repository, metadata revision and task", () => {
  const snapshot = initialSnapshot();
  const request = { type: "taskActivity.read" as const, protocolVersion: PROTOCOL_VERSION, requestId: "activity",
    worldId: snapshot.world.id, repositoryId: snapshot.project.id, metadataCommit: blob, taskId: "task" };
  const result = TaskActivityResultSchema.parse({ worldId: request.worldId, repositoryId: request.repositoryId,
    metadataCommit: blob, taskId: "task", activity: projectTaskActivity({ log_events: [] }, blob), unavailable: null });
  const response = { protocolVersion: PROTOCOL_VERSION, requestId: "activity", ok: true, sequence: 1, snapshot, taskActivity: result };
  expect(parseCoreResponseForRequest(response, request).ok).toBe(true);
  for (const delta of [{ worldId: "elsewhere" }, { repositoryId: "elsewhere" }, { taskId: "elsewhere" }, { metadataCommit: { ...blob, hex: "b".repeat(40) } }])
    expect(() => parseCoreResponseForRequest({ ...response, taskActivity: { ...result, ...delta } }, request)).toThrow();
  expect(() => parseCoreResponseForRequest(response, { type: "workspace.snapshot", requestId: "activity", protocolVersion: PROTOCOL_VERSION })).toThrow();
});
