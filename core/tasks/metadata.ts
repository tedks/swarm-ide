import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import {
  GitObjectIdSchema, TASK_LIMITS, TaskDetailSchema, TaskIdSchema,
  isTaskSourcePath, type GitObjectId, type TaskDetail, type TaskError,
} from "../../protocol/tasks";
import { TaskReaderError } from "./git-reader";
import { METADATA_WORKER_SOURCE } from "./metadata-worker";
import { projectTaskActivity } from "./activity";

export interface TaskMetadataInput { id: string | null; blob: GitObjectId; bytes: Uint8Array }
const requireHere = createRequire(__filename);
const encodedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
function fail(code: TaskError["code"]): never {
  throw new TaskReaderError(code, code === "TASK_LIMIT_EXCEEDED" ? "Task metadata exceeds a supported limit" :
    code === "TASK_OBSERVATION_FAILED" ? "Task metadata parsing was interrupted" : "Task metadata is malformed");
}
function malformed(): never { return fail("TASK_METADATA_MALFORMED"); }
function limited(): never { return fail("TASK_LIMIT_EXCEEDED"); }
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformed();
  return value as RecordValue;
}
function string(value: unknown, max: number, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && value.length === 0)) malformed();
  if (Buffer.byteLength(value, "utf8") > max) limited();
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) malformed();
  if (value.length > max) limited();
  return value;
}
function id(value: unknown): string {
  const result = string(value, TASK_LIMITS.idBytes, true);
  if (!TaskIdSchema.safeParse(result).success) malformed();
  return result;
}
function ids(value: unknown): string[] {
  const result = value === undefined ? [] : array(value, TASK_LIMITS.dependencies).map(id);
  if (new Set(result).size !== result.length) malformed();
  return result;
}

/** One owned worker handles the whole bounded batch. Settlement waits for exit
 * or awaited termination; callers never receive data while parsing still runs. */
async function parseDocuments(input: TaskMetadataInput[], signal: AbortSignal, deadline: number): Promise<unknown[]> {
  if (signal.aborted || !Number.isFinite(deadline) || deadline <= Date.now()) fail("TASK_OBSERVATION_FAILED");
  const worker = new Worker(METADATA_WORKER_SOURCE, { eval: true,
    workerData: { yamlPath: requireHere.resolve("yaml"), limits: TASK_LIMITS,
      documents: input.map((item) => item.bytes) },
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aborted = false;
  let terminate: Promise<number> | undefined;
  const abort = () => { aborted = true; terminate ??= worker.terminate(); };
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      let result: unknown;
      worker.once("message", (message: unknown) => { result = message; });
      worker.once("error", () => { aborted = true; });
      worker.once("exit", (exitCode) => {
        if (aborted || signal.aborted || Date.now() >= deadline || exitCode !== 0) {
          reject(new TaskReaderError("TASK_OBSERVATION_FAILED", "Task metadata parsing was interrupted"));
          return;
        }
        const reply = result as { ok?: boolean; documents?: unknown; code?: string } | undefined;
        if (reply?.ok === true && Array.isArray(reply.documents) && reply.documents.length === input.length) resolve(reply.documents);
        else reject(new TaskReaderError(reply?.code === "TASK_LIMIT_EXCEEDED" ? "TASK_LIMIT_EXCEEDED" :
          "TASK_METADATA_MALFORMED", "Task metadata could not be parsed safely"));
      });
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, Math.max(1, deadline - Date.now()));
      if (signal.aborted) abort();
    });
  } finally {
    signal.removeEventListener("abort", abort);
    clearTimeout(timer);
    if (terminate) await terminate;
  }
}

/** No source path is opened here. Every returned ref is literal metadata and
 * syntactic navigation eligibility is not filesystem authority. */
export async function parseTaskMetadata(input: TaskMetadataInput[], signal: AbortSignal, deadline: number): Promise<TaskDetail[]> {
  return (await parseTaskMetadataBatch(input, signal, deadline)).details;
}

export async function parseTaskMetadataBatch(input: TaskMetadataInput[], signal: AbortSignal, deadline: number) {
  if (signal.aborted || !Number.isFinite(deadline) || deadline <= Date.now()) fail("TASK_OBSERVATION_FAILED");
  if (input.length > TASK_LIMITS.issues + 1) limited();
  let total = 0;
  const seen = new Set<string>();
  for (const entry of input) {
    if (!GitObjectIdSchema.safeParse(entry.blob).success || !(entry.bytes instanceof Uint8Array)) malformed();
    if (entry.bytes.byteLength > TASK_LIMITS.blobBytes) limited();
    total += entry.bytes.byteLength;
    if (entry.id !== null) {
      id(entry.id);
      if (seen.has(entry.id)) malformed();
      seen.add(entry.id);
    }
  }
  if (total > TASK_LIMITS.inputBytes) limited();
  if (input.filter((entry) => entry.id === null).length !== 1) malformed();
  // Capture the identity and byte buffers before yielding to the worker. An
  // internal caller changing its input later cannot relabel parsed documents.
  input = input.map((entry) => ({ id: entry.id, blob: { ...entry.blob }, bytes: Uint8Array.from(entry.bytes) }));
  const documents = await parseDocuments(input, signal, deadline);
  const project = record(documents[input.findIndex((entry) => entry.id === null)]);
  string(project.name, TASK_LIMITS.blobBytes, true);
  string(project.version, TASK_LIMITS.blobBytes, true);
  const components = array(project.components, TASK_LIMITS.nodes);
  const componentNames = components.map((component) => string(record(component).name, TASK_LIMITS.componentBytes, true));
  if (new Set(componentNames).size !== componentNames.length) malformed();
  const releaseNames = array(project.releases, TASK_LIMITS.nodes).map((value) => {
    const release = record(value);
    const name = string(release.name, TASK_LIMITS.blobBytes, true);
    if (release.status !== "unreleased" && release.status !== "released") malformed();
    if (release.release_time !== null) string(release.release_time, TASK_LIMITS.blobBytes);
    array(release.log_events, TASK_LIMITS.nodes).forEach((value) => {
      const event = record(value);
      for (const field of ["time", "who", "what", "comment"]) string(event[field], TASK_LIMITS.blobBytes);
    });
    return name;
  });
  if (new Set(releaseNames).size !== releaseNames.length) malformed();
  const raw = input.flatMap((entry, index) => {
    if (entry.id === null) return [];
    const doc = record(documents[index]);
    if (id(doc.id) !== entry.id) malformed();
    const blocks = ids(doc.blocks);
    const blockedBy = ids(doc.blocked_by);
    const fileRefs = (doc.file_refs === undefined ? [] : array(doc.file_refs, TASK_LIMITS.fileRefs)).map((item) => {
      const ref = record(item);
      const path = string(ref.path, TASK_LIMITS.pathBytes);
      if (ref.line !== null && (typeof ref.line !== "number" || !Number.isSafeInteger(ref.line) || ref.line < 1)) malformed();
      return { path, line: ref.line as number | null,
        note: ref.note === null ? null : string(ref.note, TASK_LIMITS.noteBytes),
        navigation: isTaskSourcePath(path) ? "candidate" as const : "unsupported" as const };
    });
    const detail = { id: entry.id, blob: entry.blob,
      title: string(doc.title, TASK_LIMITS.titleBytes, true),
      description: string(doc.desc, TASK_LIMITS.descriptionBytes),
      type: doc.type, status: doc.status,
      component: string(doc.component, TASK_LIMITS.componentBytes),
      disposition: doc.disposition === null ? null : string(doc.disposition, 256),
      counts: { blocks: blocks.length, blockedBy: blockedBy.length, fileRefs: fileRefs.length },
      blocks: [], blockedBy: [], fileRefs,
    };
    // Validate enum and scalar shape before any graph derivation.
    if (encodedBytes(detail) > TASK_LIMITS.detailBytes) limited();
    const validated = TaskDetailSchema.safeParse({ ...detail, counts: { ...detail.counts, blocks: 0, blockedBy: 0 } });
    if (!validated.success) malformed();
    return [{ detail: validated.data, blocks, blockedBy, activity: projectTaskActivity(doc, entry.blob) }];
  });
  const byId = new Map(raw.map((item) => [item.detail.id, item]));
  // Interpret both recorded directions as directed blocker -> blocked edges.
  // Never add the reciprocal record to a returned task; diagnostics only.
  const outgoing = new Map(raw.map((item) => [item.detail.id, new Set(item.blocks.filter((target) => byId.has(target)))]));
  for (const item of raw) for (const source of item.blockedBy) outgoing.get(source)?.add(item.detail.id);
  const reachability = new Map<string, Set<string>>();
  const reaches = (from: string, target: string): boolean => {
    const retained = reachability.get(from);
    if (retained) return retained.has(target);
    const pending = [from];
    const visited = new Set<string>();
    while (pending.length) {
      const next = pending.pop()!;
      if (!visited.has(next)) { visited.add(next); pending.push(...outgoing.get(next) ?? []); }
    }
    reachability.set(from, visited);
    return visited.has(target);
  };
  const details = raw.map((item) => {
    const dependencies = (values: string[], direction: "blocks" | "blockedBy") => values.map((taskId) => {
      const target = byId.get(taskId);
      const diagnostics: ("missing" | "cyclic" | "asymmetric")[] = [];
      if (!target) diagnostics.push("missing");
      else {
        if (direction === "blocks" ? reaches(taskId, item.detail.id) : reaches(item.detail.id, taskId)) diagnostics.push("cyclic");
        if (!target[direction === "blocks" ? "blockedBy" : "blocks"].includes(item.detail.id)) diagnostics.push("asymmetric");
      }
      return { taskId, status: target?.detail.status ?? null, diagnostics };
    });
    const detail = { ...item.detail,
      counts: { ...item.detail.counts, blocks: item.blocks.length, blockedBy: item.blockedBy.length },
      blocks: dependencies(item.blocks, "blocks"), blockedBy: dependencies(item.blockedBy, "blockedBy") };
    if (encodedBytes(detail) > TASK_LIMITS.detailBytes) limited();
    return TaskDetailSchema.parse(detail);
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (encodedBytes(details) > TASK_LIMITS.cacheBytes) limited();
  if (signal.aborted || Date.now() >= deadline) fail("TASK_OBSERVATION_FAILED");
  return { details, activities: new Map(raw.map((item) => [item.detail.id, item.activity])) };
}
