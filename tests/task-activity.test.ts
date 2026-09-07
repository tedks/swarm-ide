// @vitest-environment node
import { expect, it } from "vitest";
import { stringify } from "yaml";
import { projectTaskActivity } from "../core/tasks/activity";
import { parseTaskMetadata, parseTaskMetadataBatch } from "../core/tasks/metadata";
import { TaskActivityResultSchema } from "../protocol/task-activity";
import { parseCoreRequest, parseCoreResponseForRequest, PROTOCOL_VERSION } from "../protocol/schema";
import { TrustedResultSchema } from "../protocol/trusted-local";
import { initialSnapshot } from "../fixtures/world";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDitzTaskProvider } from "../core/tasks/provider";
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

it("composes task activity and trusted-local namespaces without cross-result authority", () => {
  const snapshot = initialSnapshot();
  const activityRequest = parseCoreRequest({ type: "taskActivity.read", protocolVersion: PROTOCOL_VERSION, requestId: "joined",
    worldId: snapshot.world.id, repositoryId: snapshot.project.id, metadataCommit: blob, taskId: "task" });
  const trustedRequest = parseCoreRequest({ type: "trusted.snapshot", protocolVersion: PROTOCOL_VERSION, requestId: "joined" });
  const taskActivity = TaskActivityResultSchema.parse({ worldId: snapshot.world.id, repositoryId: snapshot.project.id,
    metadataCommit: blob, taskId: "task", activity: projectTaskActivity({ log_events: [] }, blob), unavailable: null });
  const trusted = TrustedResultSchema.parse({ kind: "trusted", snapshot: {
    instanceId: "11111111-1111-4111-8111-111111111111", profile: "trusted-local", workspace: "/fixture",
    preparation: null, runToken: null, status: "idle", threadId: null, turnId: null, output: "", message: "", approvals: [],
  } });
  const base = { protocolVersion: PROTOCOL_VERSION, requestId: "joined", ok: true, sequence: 1, snapshot };
  expect(parseCoreResponseForRequest({ ...base, taskActivity }, activityRequest).ok).toBe(true);
  expect(parseCoreResponseForRequest({ ...base, trusted }, trustedRequest).ok).toBe(true);
  for (const request of [activityRequest, trustedRequest]) {
    expect(() => parseCoreResponseForRequest({ ...base, taskActivity, trusted }, request)).toThrow();
    expect(() => parseCoreResponseForRequest(base, request)).toThrow();
  }
  expect(() => parseCoreResponseForRequest({ ...base, trusted }, activityRequest)).toThrow();
  expect(() => parseCoreResponseForRequest({ ...base, taskActivity }, trustedRequest)).toThrow();
});

it("reads only its cached pinned Git/YAML history, retains old data on ref movement and awaits disposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-activity-test-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
  let provider: Awaited<ReturnType<typeof createDitzTaskProvider>> | undefined;
  try {
    git("init", "-b", "ditz-metadata"); await mkdir(join(root, ".ditz"));
    await writeFile(join(root, ".ditz/project.yaml"), stringify({ name: "fixture", version: "0.1", components: [{ name: "core" }], releases: [] }));
    const issue = { id: "task", title: "Task", desc: "Instructions", type: "task", component: "core", status: "unstarted", disposition: null, log_events: [event] };
    await writeFile(join(root, ".ditz/issue-task.yaml"), stringify(issue)); git("add", "."); git("commit", "-m", "Test metadata");
    const first = { algorithm: "sha1" as const, hex: git("rev-parse", "HEAD") };
    provider = await createDitzTaskProvider({ root, worldId: "world", repositoryId: "repo" });
    expect((await provider.activity!({ metadataCommit: first, taskId: "task" })).unavailable).toBe("not-cached");
    await provider.snapshot({ refresh: true });
    const observed = await provider.activity!({ metadataCommit: first, taskId: "task" });
    expect(observed.activity?.events[0]?.comment).toBe(event.comment);
    observed.activity!.events[0]!.comment = "mutated renderer copy";
    await writeFile(join(root, ".ditz/issue-task.yaml"), stringify({ ...issue, log_events: [{ ...event, comment: "New revision" }] }));
    git("add", "."); git("commit", "-m", "Advance test metadata");
    const second = { algorithm: "sha1" as const, hex: git("rev-parse", "HEAD") };
    expect((await provider.snapshot({ refresh: false })).status).toBe("stale");
    expect((await provider.activity!({ metadataCommit: first, taskId: "task" })).activity?.events[0]?.comment).toBe(event.comment);
    expect((await provider.activity!({ metadataCommit: second, taskId: "task" })).unavailable).toBe("revision-expired");
    await provider.snapshot({ refresh: true });
    expect((await provider.activity!({ metadataCommit: first, taskId: "task" })).unavailable).toBe("revision-expired");
    expect((await provider.activity!({ metadataCommit: second, taskId: "task" })).activity?.events[0]?.comment).toBe("New revision");
    await provider.dispose();
    await expect(provider.activity!({ metadataCommit: second, taskId: "task" })).rejects.toThrow("disposed");
  } finally { await provider?.dispose(); await rm(root, { recursive: true, force: true }); }
});
