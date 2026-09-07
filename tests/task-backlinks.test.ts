import { describe, expect, it } from "vitest";
import { indexTaskBacklinks } from "../app/renderer/tasks/backlinks";
import { taskBacklinkSection } from "../app/renderer/context/task-backlinks";
import { composeContext, indexCapture, indexService } from "../app/renderer/context/compose";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import { CoreResponseSchema, PROTOCOL_VERSION } from "../protocol/schema";
import { TASK_LIMITS, TaskBacklinksSchema, TaskBacklinkTargetSchema, TaskSnapshotSchema, TaskObservationSchema, TaskResultSchema, TaskRequestSchema, taskBaseSnapshot, type TaskSnapshot } from "../protocol/tasks";
import { taskObservationFixture } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function snapshot(paths = ["core/files.ts", "core/files.ts", "other/files.ts", "../outside", ".git/config", "literal*.ts"]): TaskSnapshot {
  const value = taskObservationFixture().snapshot!;
  value.summaries[0]!.counts.fileRefs = paths.length;
  value.backlinks = { status: "complete", entries: paths.map((path, refIndex) => ({
    taskId: "task-fixture", refIndex, path, navigation: path.startsWith("../") ? "unsupported" : "candidate",
  })) };
  return TaskSnapshotSchema.parse(value);
}
describe("bounded explicit backlink publication", () => {
  it("accepts optional absence only as unpublished, with explicit v5/v6 rejection", () => {
    const value = taskObservationFixture().snapshot!;
    expect(TaskSnapshotSchema.parse(value).backlinks).toBeUndefined();
    expect(PROTOCOL_VERSION).toBe(7);
    expect(TaskRequestSchema.safeParse({ type: "tasks.snapshot", requestId: "test", worldId: "world", refresh: true, protocolVersion: 5 }).success).toBe(false);
    expect(CoreResponseSchema.safeParse({ protocolVersion: 5, requestId: "test", ok: true, sequence: 1, snapshot: initialSnapshot() }).success).toBe(false);
  });
  it("requires exact canonical count/ordinal/task coverage, even for unsupported or duplicate references", () => {
    const value = snapshot();
    expect(value.backlinks?.status).toBe("complete");
    const mutations = [
      (s: TaskSnapshot) => { if (s.backlinks?.status === "complete") s.backlinks.entries.pop(); },
      (s: TaskSnapshot) => { if (s.backlinks?.status === "complete") s.backlinks.entries[1]!.refIndex = 0; },
      (s: TaskSnapshot) => { if (s.backlinks?.status === "complete") s.backlinks.entries.reverse(); },
      (s: TaskSnapshot) => { if (s.backlinks?.status === "complete") s.backlinks.entries[0]!.taskId = "foreign"; },
      (s: TaskSnapshot) => { if (s.backlinks?.status === "complete") s.backlinks.entries[3]!.navigation = "candidate"; },
      (s: TaskSnapshot) => { s.summaries[0]!.counts.fileRefs++; },
    ];
    for (const mutate of mutations) { const bad = structuredClone(value); mutate(bad); expect(TaskSnapshotSchema.safeParse(bad).success).toBe(false); }
    expect(TaskBacklinksSchema.safeParse({ status: "unavailable", reason: "projection-limit", entries: [] }).success).toBe(false);
  });
  it("indexes literal grammar intersection once, deduplicates refs, and includes closed tasks", () => {
    const value = snapshot(); value.summaries[0]!.status = "closed";
    const index = indexTaskBacklinks(value);
    expect(index.lookup("core/files.ts")[0]?.refCount).toBe(2);
    expect(index.lookup("core/files.ts")[0]?.summary.status).toBe("closed");
    expect(index.lookup("files.ts")).toHaveLength(0); expect(index.lookup("CORE/files.ts")).toHaveLength(0);
    expect(index.lookup(".git/config")).toHaveLength(0); expect(index.lookup("../outside")).toHaveLength(0);
    expect(index.lookup("literal*.ts")).toHaveLength(1); expect(index.lookup("literalA.ts")).toHaveLength(0);
    expect(index.lookup("core/files.ts")).toBe(index.lookup("core/files.ts"));
    expect(index.references("task-fixture")).toHaveLength(6);
    const target = index.lookup("core/files.ts")[0]!.target;
    expect(TaskBacklinkTargetSchema.parse(target)).toEqual(target);
    expect(TaskBacklinkTargetSchema.safeParse({ ...target, issueBlob: { algorithm: "sha256", hex: "b".repeat(64) } }).success).toBe(false);
  });
  it("enforces exact serialized projection boundary including escaping, not raw path bytes", () => {
    const entries = Array.from({ length: 180 }, (_, index) => ({ taskId: `task-${index}`, refIndex: 0, path: "\\".repeat(650), navigation: "unsupported" as const }));
    const projection = { status: "complete" as const, entries };
    while (byteLength(projection) < TASK_LIMITS.backlinkBytes - 1100) entries.push({ taskId: `task-${entries.length}`, refIndex: 0, path: "\\".repeat(500), navigation: "unsupported" });
    const remaining = TASK_LIMITS.backlinkBytes - byteLength(projection);
    entries[0]!.path += "x".repeat(remaining);
    // If the final scalar would exceed 1024, distribute the padding instead.
    if (entries[0]!.path.length > 1024) {
      const excess = entries[0]!.path.slice(1024); entries[0]!.path = entries[0]!.path.slice(0, 1024); entries[1]!.path += excess;
    }
    expect(byteLength(projection)).toBe(TASK_LIMITS.backlinkBytes);
    expect(TaskBacklinksSchema.safeParse(projection).success).toBe(true);
    entries[2]!.path += "x";
    expect(TaskBacklinksSchema.safeParse(projection).success).toBe(false);
  });
  it("accounts for the full task result and independent workspace exactly once", () => {
    const observation = taskObservationFixture(); observation.snapshot = snapshot();
    const task = TaskResultSchema.parse({ kind: "snapshot", observation });
    const response = CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "backlinks-size", ok: true, sequence: Number.MAX_SAFE_INTEGER, snapshot: initialSnapshot(), task });
    if (!response.ok) throw new Error("fixture response");
    const { task: _task, ...base } = response;
    expect(byteLength(response) - byteLength(base)).toBe(byteLength(task) + ',"task":'.length);
    expect(JSON.stringify(response.snapshot)).not.toContain('"backlinks"');
    expect(byteLength(task)).toBeLessThan(TASK_LIMITS.resultBytes);
    expect(byteLength(taskBaseSnapshot(observation.snapshot!))).toBeLessThan(TASK_LIMITS.snapshotBytes);
  });
  it("preserves exact 512KiB base capacity with maximal escaped retention wrappers, independently of added backlinks", () => {
    const observation = taskObservationFixture("unavailable");
    observation.sequence = Number.MAX_SAFE_INTEGER;
    observation.worldId = observation.repositoryId = "\\".repeat(256);
    observation.reason!.message = "\\".repeat(512);
    observation.checkedAt = "9999-12-31T23:59:59.99999999999Z";
    observation.localRef = { algorithm: "sha256", hex: "a".repeat(64) };
    const s = observation.snapshot!;
    s.worldId = observation.worldId; s.repositoryId = observation.repositoryId;
    s.metadataCommit = observation.localRef;
    s.observedAt = observation.checkedAt;
    const summary = s.summaries[0]!;
    s.summaries = Array.from({ length: 256 }, (_, i) => ({ ...structuredClone(summary), id: `task-${String(i).padStart(3, "0")}`,
      title: "x", component: "", blob: { algorithm: "sha256" as const, hex: "b".repeat(64) }, counts: { blocks: 0, blockedBy: 0, fileRefs: 1 } }));
    const task = { kind: "snapshot" as const, observation };
    let remaining = TASK_LIMITS.snapshotBytes - byteLength(task);
    for (const row of s.summaries) {
      const nul = Math.min(511, Math.floor(remaining / 6)); row.title += "\u0000".repeat(nul); remaining -= nul * 6;
      const ascii = Math.min(512 - row.title.length, remaining); row.title += "x".repeat(ascii); remaining -= ascii;
    }
    expect(remaining).toBe(0); expect(byteLength(task)).toBe(TASK_LIMITS.snapshotBytes);
    expect(TaskResultSchema.safeParse(task).success).toBe(true);
    s.backlinks = { status: "complete", entries: s.summaries.map((row) => ({ taskId: row.id, refIndex: 0,
      path: "p".repeat(850), navigation: "candidate" })) };
    expect(byteLength(task)).toBeGreaterThan(TASK_LIMITS.snapshotBytes);
    expect(TaskResultSchema.safeParse(task).success).toBe(true);
    delete s.backlinks;
    s.summaries.at(-1)!.title += "x";
    expect(TaskObservationSchema.safeParse(observation).success).toBe(true);
    expect(TaskResultSchema.safeParse(task).success).toBe(false);
  });
  it("distinguishes unavailable/overflow and scoped complete empty without inventing no bugs", () => {
    const client = new TaskBridgeClient(), state = client.getSnapshot();
    const subject = { kind: "file" as const, path: "unmatched.ts", repositoryId: "project:swarm-ide", worldId: "world:working" };
    expect(taskBacklinkSection(subject, state).notice).toContain("not been observed");
    const observation = taskObservationFixture(); observation.snapshot = snapshot();
    const published = { ...state, connected: true, observation, backlinks: indexTaskBacklinks(observation.snapshot) };
    expect(taskBacklinkSection(subject, published).notice).toContain("No explicit file references in observed metadata sha1:");
    expect(taskBacklinkSection(subject, { ...published, notice: "INVALID_CORE_MESSAGE" }).notice).toContain("retained metadata");
    observation.snapshot.backlinks = { status: "unavailable", reason: "projection-limit" };
    expect(taskBacklinkSection(subject, published).notice).toContain("Task browsing remains available");
    client.dispose();
  });
  it("caps only the display at32, exposes total and escapes untrusted title controls", () => {
    const observation = taskObservationFixture(), value = snapshot(["core/files.ts"]);
    const first = value.summaries[0]!;
    value.summaries = Array.from({ length: 35 }, (_, i) => ({ ...first, id: `task-${String(i).padStart(2, "0")}`, title: "literal\u202etitle", status: "closed" }));
    value.backlinks = { status: "complete", entries: value.summaries.map((row) => ({ taskId: row.id, refIndex: 0, path: "core/files.ts", navigation: "candidate" })) };
    observation.snapshot = TaskSnapshotSchema.parse(value);
    const client = new TaskBridgeClient(), tasks = { ...client.getSnapshot(), connected: true, observation, backlinks: indexTaskBacklinks(observation.snapshot) };
    const sections = composeContext({ kind: "file", path: "core/files.ts", repositoryId: value.repositoryId, worldId: value.worldId }, {
      snapshot: initialSnapshot(), files: [], service: indexService(undefined), capture: indexCapture(undefined), realm: "test", session: "test", ready: true, tasks });
    const section = sections.find((item) => item.id === "task-backlinks")!;
    expect(section.rows).toHaveLength(32); expect(section.total).toBe(35);
    expect(section.notice).toContain("Showing 32 of 35 tasks");
    expect(section.rows[0]!.value).toContain("\\u{202e}"); expect(section.rows[0]!.value).not.toContain("\u202e");
    client.dispose();
  });
});
