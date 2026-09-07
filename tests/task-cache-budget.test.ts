// @vitest-environment node
import { expect, it } from "vitest";
import { assertTaskCacheBudget } from "../core/tasks/provider";
import { TASK_LIMITS, TaskSnapshotSchema, TaskReadResultSchema, taskBaseSnapshot, type TaskDetail } from "../protocol/tasks";
import { taskObservationFixture } from "../fixtures/tasks";
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

it("admits the full original normalized cache capacity plus backlinks, and rejects one extra base byte", () => {
  const snapshot = taskObservationFixture().snapshot!, first = snapshot.summaries[0]!;
  snapshot.summaries = Array.from({ length: 256 }, (_, i) => ({ ...first, id: `${String(i).padStart(3, "0")}${"x".repeat(253)}`,
    title: "x".repeat(512), component: "x".repeat(256), counts: { blocks: 0, blockedBy: 0, fileRefs: 1 } }));
  const details: TaskDetail[] = snapshot.summaries.map((row) => ({ ...row, description: "", disposition: null, blocks: [], blockedBy: [],
    fileRefs: [{ path: "p".repeat(500), line: null, note: null, navigation: "candidate" }] }));
  const envelope = (detail: TaskDetail) => ({ kind: "read", provider: snapshot.provider, repositoryId: snapshot.repositoryId,
    worldId: snapshot.worldId, metadataCommit: snapshot.metadataCommit, taskId: detail.id, sequence: Number.MAX_SAFE_INTEGER,
    checkedAt: snapshot.observedAt, result: { ok: true, detail } });
  let remaining = TASK_LIMITS.cacheBytes - size({ snapshot, details });
  for (const detail of details) {
    const available = TASK_LIMITS.detailBytes - size(envelope(detail)) - 100;
    const nul = Math.min(16000, Math.floor(available / 6), Math.floor(remaining / 6));
    detail.description = "\u0000".repeat(nul); remaining -= nul * 6;
    const ascii = Math.min(available - nul * 6, TASK_LIMITS.descriptionBytes - nul, remaining);
    detail.description += "x".repeat(ascii); remaining -= ascii;
    expect(TaskReadResultSchema.safeParse(envelope(detail)).success).toBe(true);
  }
  expect(remaining).toBe(0); expect(size({ snapshot, details })).toBe(TASK_LIMITS.cacheBytes);
  snapshot.backlinks = { status: "complete", entries: details.map((detail) => ({ taskId: detail.id, refIndex: 0,
    path: detail.fileRefs[0]!.path, navigation: "candidate" })) };
  expect(TaskSnapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(size({ snapshot: taskBaseSnapshot(snapshot), details })).toBe(TASK_LIMITS.cacheBytes);
  expect(size({ snapshot, details })).toBeGreaterThan(TASK_LIMITS.cacheBytes);
  expect(size({ snapshot, details })).toBeLessThan(TASK_LIMITS.augmentedCacheBytes);
  expect(() => assertTaskCacheBudget(snapshot, details)).not.toThrow();
  details.at(-1)!.description += "x";
  expect(TaskReadResultSchema.safeParse(envelope(details.at(-1)!)).success).toBe(true);
  expect(() => assertTaskCacheBudget(snapshot, details)).toThrow("Task cache exceeds");
});
