// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  TASK_LIMITS, GitObjectIdSchema, TaskRequestSchema, TaskObservationSchema, TaskDetailSchema,
  TaskReadResultSchema, TaskResultSchema, TaskFileRefSchema, TaskDependencySchema, TaskSummarySchema,
  isTaskSourcePath, parseTaskResultForRequest,
} from "../protocol/tasks";
import { CoreRequestSchema, PROTOCOL_VERSION, parseCoreResponseForRequest, uncertainMutationCode } from "../protocol/schema";
import { TASK_FIXTURE_COMMIT, taskDetailFixture, taskObservationFixture, taskReadFixture } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { createUnavailableTaskProvider } from "../core/tasks/unavailable";
import { unavailableAgentSnapshot } from "../core/agents/unavailable";
import { RunSchema, LaunchContextSchema } from "../protocol/agents";
import { agentFixtureFrames } from "../fixtures/agents";

const snapshotRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "tasks-snapshot", type: "tasks.snapshot" as const, worldId: "world:working", refresh: true };
const readRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "tasks-read", type: "tasks.read" as const, worldId: "world:working", metadataCommit: TASK_FIXTURE_COMMIT, taskId: "task-fixture" };
const reply = (task: unknown, requestId = snapshotRequest.requestId) => ({ protocolVersion: PROTOCOL_VERSION, requestId,
  ok: true, sequence: 1, snapshot: initialSnapshot(), task });

describe("task read contract base", () => {
  it("uses a new wire version, exactly two read operations and no mutation semantics", () => {
    expect(PROTOCOL_VERSION).toBe(4);
    for (const request of [snapshotRequest, readRequest]) {
      expect(CoreRequestSchema.parse(request)).toEqual(request);
      expect(uncertainMutationCode(request)).toBeNull();
      for (const protocolVersion of [1, 2, 3]) expect(() => CoreRequestSchema.parse({ ...request, protocolVersion })).toThrow();
    }
    for (const type of ["tasks.write", "tasks.dispatch", "tasks.sync", "tasks.fetch", "tasks.start"]) {
      expect(() => CoreRequestSchema.parse({ ...snapshotRequest, type })).toThrow();
    }
  });
  it.each(["root", "ref", "argv", "path", "executable", "blob", "taskText"])("rejects renderer authority field %s", (field) => {
    for (const request of [snapshotRequest, readRequest]) expect(() => CoreRequestSchema.parse({ ...request, [field]: "/outside" })).toThrow();
  });
  it.each(["", "short:id", "../task", "task/id", "task name", "😀", "x".repeat(257)])("rejects invalid full task ID %j", (taskId) => {
    expect(() => TaskRequestSchema.parse({ ...readRequest, taskId })).toThrow();
  });
  it("requires explicit refresh, full tagged hashes and bounded world/request identities", () => {
    expect(() => TaskRequestSchema.parse({ ...snapshotRequest, refresh: undefined })).toThrow();
    for (const key of ["worldId", "requestId"]) {
      for (const value of ["", "x".repeat(257), "世界".repeat(86), "world\n"]) expect(() => TaskRequestSchema.parse({ ...snapshotRequest, [key]: value })).toThrow();
    }
    for (const value of ["a".repeat(40), { algorithm: "sha1", hex: "a".repeat(64) },
      { algorithm: "sha256", hex: "a".repeat(40) }, { algorithm: "sha1", hex: "A".repeat(40) },
      { algorithm: "sha1", hex: "a".repeat(40), path: "unsafe" }]) expect(() => GitObjectIdSchema.parse(value)).toThrow();
    expect(GitObjectIdSchema.parse({ algorithm: "sha256", hex: "f".repeat(64) }).algorithm).toBe("sha256");
  });
  it.each(["unobserved", "loading", "observed", "stale", "unavailable", "malformed", "limited", "error"] as const)("represents %s without losing the retained revision", (status) => {
    const observation = taskObservationFixture(status);
    expect(TaskObservationSchema.parse(observation).status).toBe(status);
    if (status !== "unobserved") expect(observation.snapshot?.metadataCommit).toEqual(TASK_FIXTURE_COMMIT);
  });
  it.each(["unavailable", "malformed", "limited", "error", "loading"] as const)("also represents first-attempt %s without inventing an empty cache", (status) => {
    expect(taskObservationFixture(status, false).snapshot).toBeNull();
  });
  it("distinguishes real empty from absent metadata and invalid state combinations", () => {
    const observed = taskObservationFixture();
    observed.snapshot!.summaries = [];
    expect(TaskObservationSchema.parse(observed).snapshot?.summaries).toEqual([]);
    expect(() => TaskObservationSchema.parse({ ...observed, snapshot: null })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...observed, localRef: null })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...observed, localRef: { algorithm: "sha1", hex: "c".repeat(40) } })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...taskObservationFixture("unavailable"), reason: null })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...taskObservationFixture("stale"), snapshot: null })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...observed, sequence: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...observed, checkedAt: "2020-01-01T00:00:00.000Z" })).toThrow();
  });
  it("rejects extra fields throughout the task result, metadata hash, detail and dependency", () => {
    expect(() => TaskResultSchema.parse({ kind: "snapshot", observation: taskObservationFixture(), arbitrary: true })).toThrow();
    expect(() => TaskObservationSchema.parse({ ...taskObservationFixture(), arbitrary: true })).toThrow();
    const observation = taskObservationFixture();
    expect(() => TaskObservationSchema.parse({ ...observation, snapshot: { ...observation.snapshot, arbitrary: true } })).toThrow();
    expect(() => TaskDetailSchema.parse({ ...taskDetailFixture(), rawYaml: "private" })).toThrow();
    expect(() => TaskDependencySchema.parse({ taskId: "id", status: "closed", diagnostics: [], ready: true })).toThrow();
  });
  it("rejects duplicate summaries, mixed object formats and a foreign retained world", () => {
    for (const mutate of [
      (value: ReturnType<typeof taskObservationFixture>) => { value.snapshot!.summaries.push(value.snapshot!.summaries[0]!); },
      (value: ReturnType<typeof taskObservationFixture>) => { value.snapshot!.worldId = "other"; },
      (value: ReturnType<typeof taskObservationFixture>) => { value.snapshot!.repositoryId = "other"; },
      (value: ReturnType<typeof taskObservationFixture>) => { value.snapshot!.summaries[0]!.blob = { algorithm: "sha256", hex: "b".repeat(64) }; },
    ]) {
      const observation = taskObservationFixture(); mutate(observation);
      expect(() => TaskObservationSchema.parse(observation)).toThrow();
    }
  });
  it("bounds every task text using UTF-8 bytes", () => {
    const detail = taskDetailFixture();
    for (const [key, value] of [["title", "é".repeat(257)], ["component", "é".repeat(129)],
      ["description", "é".repeat(8193)]] as const) expect(() => TaskDetailSchema.parse({ ...detail, [key]: value })).toThrow();
    expect(() => TaskFileRefSchema.parse({ path: "é".repeat(513), line: null, note: null, navigation: "candidate" })).toThrow();
    expect(() => TaskFileRefSchema.parse({ path: "valid", line: null, note: "é".repeat(257), navigation: "candidate" })).toThrow();
    expect(TaskDetailSchema.parse({ ...detail, title: "é".repeat(256) }).title).toHaveLength(256);
  });
  it("enforces count and whole JSON response limits without shortening content", () => {
    const observation = taskObservationFixture();
    observation.snapshot!.summaries = Array.from({ length: TASK_LIMITS.issues + 1 }, (_, i) => ({ ...observation.snapshot!.summaries[0]!, id: `task-${i}` }));
    expect(() => TaskObservationSchema.parse(observation)).toThrow();
    const detail = taskDetailFixture();
    expect(() => TaskDetailSchema.parse({ ...detail, counts: { ...detail.counts, blocks: 0 } })).toThrow();
    expect(() => TaskDetailSchema.parse({ ...detail, fileRefs: Array(33).fill(detail.fileRefs[0]) })).toThrow();
    // Field bytes are within bounds, but JSON escaping makes the combined response too large.
    observation.snapshot!.summaries = Array.from({ length: 256 }, (_, i) => ({ ...observation.snapshot!.summaries[0]!, id: `task-${i}`, title: "\u0000".repeat(512) }));
    expect(() => TaskObservationSchema.parse(observation)).toThrow();
    const large = { ...detail, description: "\u0000".repeat(TASK_LIMITS.descriptionBytes) };
    expect(() => TaskDetailSchema.parse(large)).toThrow();
    const almostFull = taskReadFixture();
    if (!almostFull.result.ok) throw new Error("fixture");
    almostFull.result.detail.description = "";
    const overhead = Buffer.byteLength(JSON.stringify(almostFull.result.detail));
    almostFull.result.detail.description = "\u0000".repeat(Math.floor((TASK_LIMITS.detailBytes - overhead - 100) / 6));
    expect(() => TaskDetailSchema.parse(almostFull.result.ok && almostFull.result.detail)).not.toThrow();
    expect(() => TaskReadResultSchema.parse(almostFull)).toThrow();
  });
  it("reports recorded dependency state and inconsistency without invented readiness", () => {
    expect(TaskDependencySchema.parse({ taskId: "a", status: "paused", diagnostics: ["cyclic", "asymmetric"] }).status).toBe("paused");
    for (const row of [{ taskId: "a", status: null, diagnostics: [] }, { taskId: "a", status: "closed", diagnostics: ["missing"] },
      { taskId: "a", status: "closed", diagnostics: ["cyclic", "cyclic"] }]) expect(() => TaskDependencySchema.parse(row)).toThrow();
    const detail = taskDetailFixture();
    expect(() => TaskDetailSchema.parse({ ...detail, blocks: [...detail.blocks, ...detail.blocks], counts: { ...detail.counts, blocks: 2 } })).toThrow();
    for (const status of ["ready", "running", "queued"]) expect(() => TaskSummarySchema.parse({ ...taskObservationFixture().snapshot!.summaries[0], status })).toThrow();
  });
  it.each(["../escape", "/absolute", "file://root", "https://example.org", "a//b", "a/./b", "a/../b", "a\\b", "a\n", "a\u007f", "a\u202e", ""])("keeps unsupported reference %j literal, never navigable", (path) => {
    expect(isTaskSourcePath(path)).toBe(false);
    expect(TaskFileRefSchema.parse({ path, line: null, note: null, navigation: "unsupported" }).path).toBe(path);
    expect(() => TaskFileRefSchema.parse({ path, line: 1, note: null, navigation: "candidate" })).toThrow();
  });
  it("validates positive safe reference lines without pretending a candidate exists", () => {
    const ref = { path: "docs/架構.md", line: 10, note: null, navigation: "candidate" };
    expect(TaskFileRefSchema.parse(ref)).toEqual(ref);
    for (const line of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => TaskFileRefSchema.parse({ ...ref, line })).toThrow();
  });
  it("correlates kind, request ID, world, repository, task and exact revision on success and errors", () => {
    const result = { kind: "snapshot", observation: taskObservationFixture() };
    expect(parseCoreResponseForRequest(reply(result), snapshotRequest).ok).toBe(true);
    expect(() => parseCoreResponseForRequest(reply(result, "wrong-request"), snapshotRequest)).toThrow();
    expect(() => parseCoreResponseForRequest(reply(result), { ...snapshotRequest, worldId: "other" })).toThrow();
    expect(() => parseCoreResponseForRequest(reply({ kind: "snapshot", observation: { ...taskObservationFixture("unavailable", false), repositoryId: "other" } }), snapshotRequest)).toThrow();
    for (const read of [taskReadFixture(), taskReadFixture({ code: "TASK_REVISION_EXPIRED", message: "Revision expired; refresh." }),
      taskReadFixture({ code: "TASK_NOT_FOUND", message: "Task absent in this revision." })]) {
      expect(parseCoreResponseForRequest(reply(read, readRequest.requestId), readRequest).ok).toBe(true);
      for (const changed of [{ ...readRequest, worldId: "other" }, { ...readRequest, taskId: "other" },
        { ...readRequest, metadataCommit: { algorithm: "sha1" as const, hex: "c".repeat(40) } }]) {
        expect(() => parseTaskResultForRequest(read, changed)).toThrow();
      }
      expect(() => parseTaskResultForRequest(read, snapshotRequest)).toThrow();
    }
    expect(() => parseTaskResultForRequest(result, readRequest)).toThrow();
    expect(() => parseCoreResponseForRequest(reply(undefined), snapshotRequest)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...reply(result), agent: { kind: "snapshot", snapshot: unavailableAgentSnapshot() } }, snapshotRequest)).toThrow();
    expect(() => parseCoreResponseForRequest(reply(result), { protocolVersion: PROTOCOL_VERSION, requestId: snapshotRequest.requestId, type: "workspace.snapshot" })).toThrow();
    const read = taskReadFixture();
    if (read.result.ok) read.result.detail.id = "other";
    expect(() => TaskReadResultSchema.parse(read)).toThrow();
  });
  it("sanitizes and bounds task errors while retaining standard transport failures", () => {
    const fail = (code: string, message: string) => ({ protocolVersion: PROTOCOL_VERSION, requestId: snapshotRequest.requestId, ok: false, error: { code, message } });
    for (const code of ["CORE_TIMEOUT", "CORE_UNAVAILABLE", "TASK_WORLD_MISMATCH"]) expect(parseCoreResponseForRequest(fail(code, "Unavailable"), snapshotRequest).ok).toBe(false);
    for (const message of ["x\nprivate", "x\u202e", "é".repeat(257)]) expect(() => parseCoreResponseForRequest(fail("TASK_OBSERVATION_FAILED", message), snapshotRequest)).toThrow();
    expect(() => parseCoreResponseForRequest(fail("MADE_UP", "no"), snapshotRequest)).toThrow();
    for (const request of [snapshotRequest, readRequest]) {
      for (const code of ["TASK_NOT_FOUND", "TASK_REVISION_EXPIRED", "TASK_METADATA_UNAVAILABLE", "TASK_METADATA_MALFORMED", "TASK_LIMIT_EXCEEDED", "TASK_PROVIDER_UNAVAILABLE", "TASK_REF_CHANGED", "TASK_RECONNECT_REQUIRED"]) {
        expect(() => parseCoreResponseForRequest({ ...fail(code, "Domain result needs correlated identity"), requestId: request.requestId }, request)).toThrow();
      }
    }
    expect(() => TaskObservationSchema.parse({ ...taskObservationFixture("limited"), reason: { code: "TASK_NOT_FOUND", message: "Not a limit" } })).toThrow();
    expect(() => TaskDetailSchema.parse({ ...taskDetailFixture(), description: "\uD800" })).toThrow();
  });
  it("returns honest unavailable data, monotonic sequence and idempotent disposal without reading its root", async () => {
    const provider = createUnavailableTaskProvider({ root: "/never-read-this", worldId: "world:working", repositoryId: "project:swarm-ide" });
    const first = await provider.snapshot({ refresh: true });
    expect(first).toMatchObject({ status: "unavailable", snapshot: null, localRef: null, sequence: 1 });
    const second = await provider.snapshot({ refresh: false });
    expect(second.sequence).toBe(2);
    expect(await provider.read({ metadataCommit: TASK_FIXTURE_COMMIT, taskId: "missing" })).toMatchObject({ sequence: 3,
      taskId: "missing", metadataCommit: TASK_FIXTURE_COMMIT, result: { ok: false, error: { code: "TASK_PROVIDER_UNAVAILABLE" } } });
    await provider.dispose(); await provider.dispose();
    await expect(provider.snapshot({ refresh: false })).rejects.toThrow("disposed");
  });
  it("does not migrate or extend persisted agent run/context shapes", () => {
    const run = agentFixtureFrames()["completed-cleaned"].run;
    expect(RunSchema.parse(run)).toEqual(run);
    expect(LaunchContextSchema.parse(run.launchContext)).toEqual(run.launchContext);
    expect(() => LaunchContextSchema.parse({ ...run.launchContext, taskId: "ditz" })).toThrow();
  });
});
