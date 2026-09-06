/** Test-only task data. Production task provider never imports this module. */
import {
  TASK_METADATA_REF, TaskDetailSchema, TaskObservationSchema, TaskReadResultSchema,
  type GitObjectId, type TaskObservationStatus, type TaskReadResult,
} from "../protocol/tasks";

export const TASK_FIXTURE_WORLD = { worldId: "world:working", repositoryId: "project:swarm-ide", provider: "ditz" as const };
export const TASK_FIXTURE_COMMIT: GitObjectId = { algorithm: "sha1", hex: "a".repeat(40) };
export const TASK_FIXTURE_BLOB: GitObjectId = { algorithm: "sha1", hex: "b".repeat(40) };
export const TASK_FIXTURE_AT = "2026-09-06T06:00:00.000Z";
export function taskDetailFixture() {
  return TaskDetailSchema.parse({ id: "task-fixture", blob: TASK_FIXTURE_BLOB, title: "Inspect a repository task",
    type: "task", component: "workbench", status: "unstarted", counts: { blocks: 1, blockedBy: 0, fileRefs: 2 },
    description: "Explicit fixture, not a task read from your repository.", disposition: null,
    blocks: [{ taskId: "task-missing", status: null, diagnostics: ["missing"] }], blockedBy: [],
    fileRefs: [{ path: "docs/architecture.md", line: 2, note: "Read as source text", navigation: "candidate" },
      { path: "../outside", line: null, note: null, navigation: "unsupported" }],
  });
}
export function taskObservationFixture(status: TaskObservationStatus = "observed", retain = true) {
  const { description: _description, disposition: _disposition, blocks: _blocks, blockedBy: _blockedBy, fileRefs: _refs, ...summary } = taskDetailFixture();
  const reasons = {
    stale: { code: "TASK_REF_CHANGED", message: "Local metadata advanced; refresh to adopt it." },
    unavailable: { code: "TASK_METADATA_UNAVAILABLE", message: "Local metadata is unavailable." },
    malformed: { code: "TASK_METADATA_MALFORMED", message: "Metadata shape is unsupported." },
    limited: { code: "TASK_LIMIT_EXCEEDED", message: "Complete observation exceeds a prototype limit." },
    error: { code: "TASK_OBSERVATION_FAILED", message: "Local observation failed." },
  };
  const observed = status === "observed" || status === "stale";
  return TaskObservationSchema.parse({ ...TASK_FIXTURE_WORLD, status, sequence: status === "unobserved" ? 0 : 1,
    metadataRef: TASK_METADATA_REF, checkedAt: status === "unobserved" ? null : TASK_FIXTURE_AT,
    localRef: status === "unobserved" ? null : status === "stale" ? { algorithm: "sha1", hex: "c".repeat(40) } : TASK_FIXTURE_COMMIT,
    reason: reasons[status as keyof typeof reasons] ?? null,
    snapshot: status !== "unobserved" && (observed || retain)
      ? { ...TASK_FIXTURE_WORLD, metadataCommit: TASK_FIXTURE_COMMIT, observedAt: TASK_FIXTURE_AT, summaries: [summary] } : null,
  });
}
export function taskReadFixture(error?: Extract<TaskReadResult["result"], { ok: false }>["error"]) {
  return TaskReadResultSchema.parse({ kind: "read", ...TASK_FIXTURE_WORLD, metadataCommit: TASK_FIXTURE_COMMIT,
    taskId: "task-fixture", sequence: 1, checkedAt: TASK_FIXTURE_AT,
    result: error ? { ok: false, error } : { ok: true, detail: taskDetailFixture() } });
}
