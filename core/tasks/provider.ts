import {
  GitObjectIdSchema, sameGitObject, TASK_LIMITS, TASK_METADATA_REF, TaskIdSchema,
  TaskObservationSchema, TaskReadResultSchema, TaskResultSchema,
  type GitObjectId, type TaskDetail, type TaskError, type TaskObservation,
  type TaskObservationStatus, type TaskSnapshot,
} from "../../protocol/tasks";
import type { CreateTaskProvider, TaskProvider } from "./contracts";
import { TaskGitReader, TaskReaderError } from "./git-reader";
import { parseTaskMetadata } from "./metadata";

type Cache = { snapshot: TaskSnapshot; details: Map<string, TaskDetail> };
type Attempt = Pick<TaskObservation, "status" | "localRef" | "reason" | "checkedAt">;
const now = () => new Date().toISOString();
const error = (code: TaskError["code"], message: string): TaskError => ({ code, message });
const changed = error("TASK_REF_CHANGED", "The local metadata ref changed. Refresh tasks to adopt a new complete revision.");

/** Registered-root, read-only Ditz reader. Not installed by the default worker:
 * T3 owns composition and the task-specific outer request deadline. */
export const createDitzTaskProvider: CreateTaskProvider = (context): TaskProvider => {
  const world = { worldId: context.worldId, repositoryId: context.repositoryId, provider: "ditz" as const };
  // Validate constructor identities before starting any privileged work.
  TaskObservationSchema.parse({ ...world, status: "unobserved", sequence: 0, metadataRef: TASK_METADATA_REF,
    checkedAt: null, localRef: null, reason: null, snapshot: null });
  const git = new TaskGitReader(context.root);
  let cache: Cache | null = null;
  let sequence = 0;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  let attempt: Attempt = { status: "unobserved", checkedAt: null, localRef: null, reason: null };
  let active: { controller: AbortController; refresh: boolean; promise: Promise<void> } | null = null;

  function assertOpen() {
    if (disposed) throw new Error("Task provider is disposed");
  }
  function result(next: Attempt, selected: Cache | null, nextSequence: number): TaskObservation {
    const parsed = TaskResultSchema.parse({ kind: "snapshot", observation: {
      ...world, ...next, sequence: nextSequence, metadataRef: TASK_METADATA_REF, snapshot: selected?.snapshot ?? null,
    } });
    if (parsed.kind !== "snapshot") throw new Error("Invalid task snapshot");
    return parsed.observation;
  }
  function failure(cause: unknown, localRef: GitObjectId | null): Attempt {
    const known = cause instanceof TaskReaderError;
    const code = known ? cause.code : "TASK_OBSERVATION_FAILED";
    const status: TaskObservationStatus = code === "TASK_METADATA_UNAVAILABLE" ? "unavailable" :
      code === "TASK_METADATA_MALFORMED" ? "malformed" : code === "TASK_LIMIT_EXCEEDED" ? "limited" : "error";
    // Never expose Git stderr, YAML fragments, paths, people or arbitrary error text.
    const messages = {
      unavailable: "Local Ditz metadata is unavailable.", malformed: "Local Ditz metadata is malformed or unsupported.",
      limited: "Local Ditz metadata exceeds the bounded reader limits.", error: "The bounded local metadata observation failed.",
    };
    return { status, checkedAt: now(), localRef,
      reason: error(status === "error" ? "TASK_OBSERVATION_FAILED" : code, messages[status as keyof typeof messages]) };
  }

  async function observe(refresh: boolean, signal: AbortSignal, deadline: number) {
    let localRef: GitObjectId | null = null;
    let replacement: Cache | null = cache;
    let next: Attempt;
    try {
      localRef = await git.resolve(signal, deadline);
      if (!localRef) throw new TaskReaderError("TASK_METADATA_UNAVAILABLE", "Local metadata ref is absent.");
      if (refresh) {
        const blobs = await git.scan(localRef, signal, deadline);
        const details = await parseTaskMetadata(blobs, signal, deadline);
        const snapshot: TaskSnapshot = { ...world, metadataCommit: localRef, observedAt: now(),
          summaries: details.map(({ description: _description, disposition: _disposition,
            blocks: _blocks, blockedBy: _blockedBy, fileRefs: _fileRefs, ...summary }) => summary) };
        replacement = { snapshot, details: new Map(details.map((detail) => [detail.id, detail])) };
        // Include envelope overhead, maximum sequence width, identity and timestamps.
        for (const detail of details) {
          const full = { kind: "read" as const, ...world, metadataCommit: localRef, taskId: detail.id,
            sequence: Number.MAX_SAFE_INTEGER, checkedAt: snapshot.observedAt, result: { ok: true as const, detail } };
          if (Buffer.byteLength(JSON.stringify(full)) > TASK_LIMITS.detailBytes)
            throw new TaskReaderError("TASK_LIMIT_EXCEEDED", "Task detail response exceeds its limit.");
          TaskReadResultSchema.parse(full);
        }
        if (Buffer.byteLength(JSON.stringify({ snapshot, details })) > TASK_LIMITS.cacheBytes)
          throw new TaskReaderError("TASK_LIMIT_EXCEEDED", "Task cache exceeds its limit.");
        const after = await git.resolve(signal, deadline);
        next = { status: after && sameGitObject(localRef, after) ? "observed" : "stale",
          localRef: after, checkedAt: now(), reason: after && sameGitObject(localRef, after) ? null : changed };
      } else if (attempt.reason && ["malformed", "limited", "error", "unavailable"].includes(attempt.status) &&
          (!attempt.localRef || sameGitObject(attempt.localRef, localRef))) {
        // A cheap ref check cannot attest that a failed full scan now works,
        // even if the ref still equals the retained cache or the failed attempt
        // could not resolve it at all. Only explicit refresh clears that failure.
        next = { ...attempt, localRef, checkedAt: now() };
      } else if (cache) {
        if (sameGitObject(cache.snapshot.metadataCommit, localRef)) {
          next = { status: "observed", localRef, checkedAt: now(), reason: null };
        } else {
          next = { status: "stale", localRef, checkedAt: now(), reason: changed };
        }
      } else {
        next = attempt.localRef && sameGitObject(attempt.localRef, localRef) && attempt.reason
          ? { ...attempt, checkedAt: now() }
          : { status: "unavailable", localRef, checkedAt: now(),
            reason: error("TASK_METADATA_UNAVAILABLE", "No complete metadata snapshot is cached. Refresh tasks to read it.") };
      }
      // Reserve room for the longest failure reason too, so later retention
      // cannot overflow a snapshot that only just fit while observed.
      const reserve = { ...next, status: "unavailable" as const, localRef,
        reason: error("TASK_METADATA_UNAVAILABLE", "x".repeat(512)) };
      if (Buffer.byteLength(JSON.stringify({ kind: "snapshot", observation: { ...world, ...reserve,
        sequence: Number.MAX_SAFE_INTEGER, metadataRef: TASK_METADATA_REF, snapshot: replacement?.snapshot ?? null } })) > TASK_LIMITS.snapshotBytes)
        throw new TaskReaderError("TASK_LIMIT_EXCEEDED", "Task snapshot response exceeds its limit.");
      result(next, replacement, Number.MAX_SAFE_INTEGER);
    } catch (cause) {
      replacement = cache;
      next = failure(cause, localRef);
    }
    assertOpen();
    if (signal.aborted || Date.now() >= deadline) {
      replacement = cache;
      next = failure(null, localRef);
    }
    // Publication has no asynchronous gap: new cache and status become visible together.
    result(next, replacement, Number.MAX_SAFE_INTEGER);
    cache = replacement;
    attempt = next;
  }

  return {
    async snapshot(input) {
      assertOpen();
      if (typeof input.refresh !== "boolean") throw new Error("Invalid task refresh request");
      if (active) {
        // One pending escalation, not one queued scan per caller.
        if (input.refresh) active.refresh = true;
      } else {
        const controller = new AbortController();
        const job = { controller, refresh: input.refresh, promise: Promise.resolve() };
        active = job;
        job.promise = (async () => {
          const deadline = Date.now() + TASK_LIMITS.observationMs;
          const timer = setTimeout(() => controller.abort(), TASK_LIMITS.observationMs);
          try {
            const full = job.refresh;
            await observe(full, controller.signal, deadline);
            // A full request arriving during the cheap check is serviced once,
            // within the original observation deadline. Full scans coalesce.
            if (!full && job.refresh && !controller.signal.aborted) await observe(true, controller.signal, deadline);
          } finally {
            clearTimeout(timer);
            if (active === job) active = null;
          }
        })();
      }
      await active.promise;
      assertOpen();
      return result(attempt, cache, ++sequence);
    },
    async read(input) {
      assertOpen();
      const metadataCommit = GitObjectIdSchema.parse(input.metadataCommit);
      const taskId = TaskIdSchema.parse(input.taskId);
      const detail = cache && sameGitObject(cache.snapshot.metadataCommit, metadataCommit) ? cache.details.get(taskId) : null;
      return TaskReadResultSchema.parse({ kind: "read", ...world, metadataCommit, taskId, sequence: ++sequence, checkedAt: now(),
        result: detail ? { ok: true, detail } : { ok: false, error: !cache
          ? error("TASK_METADATA_UNAVAILABLE", "No complete metadata snapshot is cached.")
          : !sameGitObject(cache.snapshot.metadataCommit, metadataCommit)
            ? error("TASK_REVISION_EXPIRED", "The requested metadata revision is no longer cached. Refresh task details.")
            : error("TASK_NOT_FOUND", "The requested task is absent from this metadata revision.") } });
    },
    dispose() {
      if (!disposal) {
        disposed = true;
        const pending = active;
        pending?.controller.abort();
        disposal = (async () => {
          await pending?.promise.catch(() => undefined);
          cache = null;
        })();
      }
      return disposal;
    },
  };
};
