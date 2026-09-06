import { constants, type Stats } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, opendir, rename, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createServer, type Server } from "node:net";
import { z } from "zod";
import {
  AGENT_LIMITS, AdmissionReceiptSchema, AgentSnapshotSchema, InstructionReceiptSchema,
  PreparedAgentContextSchema, RunSchema, TranscriptPageSchema, TranscriptRecordSchema,
  canTransitionRun, isTerminalRunState, utf8Bytes,
  type AdmissionReceipt, type AgentError, type InstructionReceipt, type PreparedAgentContext, type Run, type TranscriptRecord,
} from "../../protocol/agents";
import type { AgentOperation } from "./adapter";
import type { RunStore } from "./store";
import { unavailableAgentSnapshot } from "./unavailable";

/** Linux/local-core owned storage, never a renderer-selected path. One live core
 * holds an abstract Unix socket lock for the directory inode; the kernel
 * releases it on core death without stale PID files or process signalling.
 * Inputs and outputs are detached, and all operations share one serial queue.
 */
export interface FileRunStore extends RunStore { close(): Promise<void> }
export interface FileRunStoreOptions {
  now?: () => number;
  /** Core test injection only; thrown errors follow the real persistence path. */
  beforePersist?: (phase: "write" | "rename" | "directory-sync") => void | Promise<void>;
}
const RecordListSchema = z.unknown().transform((input, ctx) => {
  const invalid = () => { ctx.addIssue({ code: "custom", message: "Invalid bounded transcript." }); return z.NEVER; };
  if (!Array.isArray(input)) return invalid();
  const records: TranscriptRecord[] = [];
  let bytes = 2;
  // Stop at the first bad record. Zod array aggregation on attacker-supplied
  // millions of malformed objects could greatly exceed the bounded input size.
  for (const item of input) {
    const parsed = TranscriptRecordSchema.safeParse(item);
    if (!parsed.success) return invalid();
    bytes += utf8Bytes(JSON.stringify(parsed.data)) + (records.length ? 1 : 0);
    if (bytes > AGENT_LIMITS.transcriptBytes) return invalid();
    records.push(parsed.data);
  }
  return records;
});
const SnapshotSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    receipt: AdmissionReceiptSchema, run: RunSchema,
    records: RecordListSchema,
  }).strict()).max(AGENT_LIMITS.history),
}).strict();
type Snapshot = z.infer<typeof SnapshotSchema>;
type Entry = Snapshot["entries"][number];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const recordBytes = (records: TranscriptRecord[]) => records.length ? utf8Bytes(JSON.stringify(records)) : 0;
// One bounded final record plus one page for terminal/cleanup/receipt metadata.
// Terminal evidence may consume the reservation; ordinary output never may.
const finalReserve = AGENT_LIMITS.pageBytes * 2;
const error = (code: AgentError["code"], message: string): AgentOperation<never> => ({ ok: false, error: { code, message } });
class StoreFailure extends Error {
  constructor(readonly code: AgentError["code"] = "STORAGE_UNAVAILABLE") { super("Agent history storage is unavailable."); }
}
function storageFailure(cause: unknown): AgentOperation<never> {
  const code = cause instanceof StoreFailure ? cause.code :
    cause && typeof cause === "object" && "code" in cause && ["ENOSPC", "EDQUOT", "EFBIG"].includes(String(cause.code)) ? "STORAGE_FULL" : "STORAGE_UNAVAILABLE";
  return error(code, code === "STORAGE_FULL" ? "Agent history storage is full; no history was removed." : "Agent history storage is unavailable; no execution is authorized.");
}
function inside(parent: string, child: string): boolean {
  const suffix = relative(parent, child);
  return suffix === "" || (!suffix.startsWith("../") && suffix !== ".." && !isAbsolute(suffix));
}
function validHashes(run: Run): boolean {
  return digest(run.launchContext.submittedPrompt) === run.launchContext.contextHash &&
    run.launchContext.attachments.every((a) => digest(a.content) === a.digest) &&
    run.instructions.every((r) => digest(r.text) === r.textHash);
}
function validate(input: unknown): Snapshot {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const bound = (value: unknown, maximum: number) => { if (Array.isArray(value) && value.length > maximum) throw new StoreFailure(); };
  const entries = object(input).entries;
  if (!Array.isArray(entries) || entries.length > AGENT_LIMITS.history) throw new StoreFailure();
  for (const entry of entries) {
    const run = object(object(entry).run), context = object(run.launchContext);
    bound(run.instructions, AGENT_LIMITS.receipts);
    bound(context.attachments, 1); bound(context.instructionSources, 32); bound(context.configurationSources, 32);
    bound(object(run.providerObservation).instructionSources, 32);
    if (utf8Bytes(JSON.stringify(context)) > AGENT_LIMITS.contextBytes) throw new StoreFailure();
  }
  const snapshot = SnapshotSchema.parse(input);
  if (new Set(snapshot.entries.map((e) => e.run.runId)).size !== snapshot.entries.length ||
      snapshot.entries.filter((e) => !isTerminalRunState(e.run.state)).length > 1) throw new StoreFailure();
  for (const { receipt, run, records } of snapshot.entries) {
    if (receipt.runId !== run.runId || receipt.contextHash !== run.launchContext.contextHash ||
        receipt.admittedAt !== run.createdAt || !validHashes(run) ||
        run.transcript.lastRecord !== (records.at(-1)?.recordId ?? 0) ||
        run.transcript.bytes !== recordBytes(records) ||
        run.instructions.some((r) => r.expectedTurnId !== run.providerTurnId ||
          Date.parse(r.submittedAt) < Date.parse(run.createdAt) || Date.parse(r.submittedAt) > Date.parse(run.updatedAt) ||
          r.settledAt !== null && Date.parse(r.settledAt) > Date.parse(run.updatedAt)) ||
        records.some((record, i) => record.recordId !== i + 1 || utf8Bytes(JSON.stringify([record])) > AGENT_LIMITS.pageBytes)) throw new StoreFailure();
  }
  if (utf8Bytes(JSON.stringify(snapshot)) > AGENT_LIMITS.storeBytes) throw new StoreFailure("STORAGE_FULL");
  return snapshot;
}
function page(entry: Entry, afterRecord: number) {
  const records: TranscriptRecord[] = [];
  let bytes = 2;
  for (const record of entry.records) {
    if (record.recordId <= afterRecord) continue;
    const extra = utf8Bytes(JSON.stringify(record)) + (records.length ? 1 : 0);
    if (records.length >= AGENT_LIMITS.pageRecords || bytes + extra > AGENT_LIMITS.pageBytes) break;
    records.push(record); bytes += extra;
  }
  return TranscriptPageSchema.parse({ records, nextCursor: records.at(-1)?.recordId ?? afterRecord, truncated: entry.run.transcript.truncated });
}
function label(text: string): string {
  let result = "";
  for (const char of text) { if (utf8Bytes(result + char) > 256) break; result += char; }
  return result || "Agent run";
}
function settlement(old: InstructionReceipt, next: InstructionReceipt): boolean {
  const { status: _os, settledAt: _oa, error: _oe, ...oldIdentity } = old;
  const { status: _ns, settledAt: _na, error: _ne, ...newIdentity } = next;
  return same(oldIdentity, newIdentity) && (same(old, next) || old.status === "pending" && next.status !== "pending");
}
function uncertainInstructions(old: InstructionReceipt[], next: InstructionReceipt[]): boolean {
  return old.length === next.length && old.every((receipt, i) => {
    const updated = next[i]!;
    return same(receipt, updated) || receipt.status === "pending" && updated.status === "delivery-unknown" && settlement(receipt, updated);
  });
}
async function absent(path: string): Promise<boolean> {
  try { await lstat(path); return false; } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return true;
    throw cause;
  }
}
async function privateDirectory(directory: string): Promise<FileHandle> {
  if (!isAbsolute(directory) || resolve(directory) !== directory) throw new StoreFailure();
  // Check ancestors before mkdir so a preexisting link cannot redirect creation.
  const components: string[] = [];
  for (let cursor = directory; ; cursor = dirname(cursor)) { components.unshift(cursor); if (dirname(cursor) === cursor) break; }
  for (const component of components) {
    if (!(await absent(join(component, ".git")))) throw new StoreFailure();
    if (!(await absent(component)) && !(await lstat(component)).isDirectory()) throw new StoreFailure();
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const stat = await handle.stat();
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) { await handle.close(); throw new StoreFailure(); }
  return handle;
}
async function discardIncompleteSnapshots(dir: FileHandle): Promise<void> {
  const pinned = `/proc/self/fd/${dir.fd}`;
  const names: string[] = [];
  // Bound enumeration before removing anything. Unknown names are never ours
  // to delete; excessive directory contents require explicit operator action.
  for await (const entry of await opendir(pinned, { bufferSize: 32 })) {
    names.push(entry.name);
    if (names.length > 128) throw new StoreFailure();
  }
  const temporaryName = /^snapshot-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;
  const candidates: { path: string; ino: number; dev: number }[] = [];
  const privateFile = (info: Stats) => info.isFile() &&
    info.uid === process.getuid?.() && typeof info.mode === "number" && (info.mode & 0o777) === 0o600 && info.nlink === 1;
  for (const name of names.filter((name) => temporaryName.test(name))) {
    const path = join(pinned, name);
    const before = await lstat(path);
    if (!privateFile(before)) throw new StoreFailure();
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!privateFile(info) || info.ino !== before.ino || info.dev !== before.dev) throw new StoreFailure();
      candidates.push({ path, ino: info.ino, dev: info.dev });
    } finally { await file.close(); }
  }
  // Exclusive kernel lock and the private directory exclude cooperating core
  // writers; inode rechecks also refuse incidental replacement during startup.
  for (const candidate of candidates) {
    const current = await lstat(candidate.path);
    if (!privateFile(current) || current.ino !== candidate.ino || current.dev !== candidate.dev) throw new StoreFailure();
    await unlink(candidate.path);
  }
  if (candidates.length) await dir.sync();
}

export async function createFileRunStore(directory: string, options: FileRunStoreOptions = {}): Promise<FileRunStore> {
  let dir: FileHandle | undefined;
  let lock: Server | undefined;
  try {
    dir = await privateDirectory(directory);
    const stat = await dir.stat();
    lock = createServer((socket) => socket.destroy());
    const server = lock;
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(`\0swarm-agent-store-${digest(`${stat.uid}:${stat.dev}:${stat.ino}`)}`, () => {
        server.removeListener("error", reject); accept();
      });
    });
    lock.unref();
    await discardIncompleteSnapshots(dir);
    return await openStore(directory, dir, lock, options);
  } catch {
    if (lock?.listening) await new Promise<void>((done) => lock!.close(() => done()));
    await dir?.close();
    throw new Error("Agent history storage could not be safely opened.");
  }
}
async function openStore(directory: string, dir: FileHandle, lock: Server, options: FileRunStoreOptions): Promise<FileRunStore> {
  const pinned = `/proc/self/fd/${dir.fd}`;
  const path = join(pinned, "snapshot.json");
  const initialDirectory = await dir.stat();
  const now = () => options.now?.() ?? Date.now();
  let inode: number | null = null;
  let closed = false;
  let accepting = true;
  let closing: Promise<void> | undefined;
  let poisoned = false;
  let data: Snapshot = { version: 1, entries: [] };
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<AgentOperation<T>>): Promise<AgentOperation<T>> => {
    if (!accepting) return Promise.resolve(storageFailure(null));
    const operation = queue.then(async () => {
      if (closed || poisoned) return storageFailure(null);
      try { return structuredClone(await fn()); } catch (cause) { return storageFailure(cause); }
    });
    queue = operation.catch(() => {});
    return operation;
  };
  async function checkIdentity() {
    const current = await lstat(directory);
    if (!current.isDirectory() || current.ino !== initialDirectory.ino || current.dev !== initialDirectory.dev ||
        current.uid !== initialDirectory.uid || (current.mode & 0o777) !== 0o700) throw new StoreFailure();
    if (await absent(path)) { if (inode !== null) throw new StoreFailure(); }
    else {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.ino !== inode || stat.uid !== process.getuid?.() ||
          (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1) throw new StoreFailure();
    }
  }
  async function persist(next: Snapshot) {
    validate(next);
    await checkIdentity();
    const temp = join(pinned, `snapshot-${randomUUID()}.tmp`);
    let file: FileHandle | undefined;
    let replaced = false;
    try {
      file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await options.beforePersist?.("write");
      await file.writeFile(JSON.stringify(next));
      await file.sync();
      await file.close(); file = undefined;
      await checkIdentity();
      await options.beforePersist?.("rename");
      await rename(temp, path); replaced = true;
      await options.beforePersist?.("directory-sync");
      await dir.sync();
      inode = (await lstat(path)).ino;
      data = next;
    } catch (cause) {
      // Rename may have committed without durable directory metadata. Never
      // acknowledge or continue using the pre-write in-memory state afterward.
      if (replaced) poisoned = true;
      throw cause;
    } finally { await file?.close(); if (!replaced) await unlink(temp).catch(() => {}); }
  }
  if (!(await absent(path))) {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 ||
          stat.size > AGENT_LIMITS.storeBytes) throw new StoreFailure();
      const buffer = Buffer.alloc(stat.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const result = await file.read(buffer, count, buffer.length - count, count);
        if (!result.bytesRead) break;
        count += result.bytesRead;
      }
      const after = await file.stat();
      if (count !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new StoreFailure();
      data = validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, count))));
      if (data.entries.some(({ run }) => inside(resolve(run.launchContext.root), directory))) throw new StoreFailure();
      inode = stat.ino;
    } finally { await file.close(); }
    const recovered = structuredClone(data);
    let changed = false;
    for (const { run } of recovered.entries) {
      const at = new Date(Math.max(now(), Date.parse(run.updatedAt), ...run.instructions.map((r) => Date.parse(r.submittedAt)))).toISOString();
      for (const receipt of run.instructions) if (receipt.status === "pending") {
        receipt.status = "delivery-unknown"; receipt.settledAt = at;
        receipt.error = { code: "AGENT_OUTCOME_UNKNOWN", message: "The core stopped before instruction delivery was established; it will not be resent." };
        run.updatedAt = at; changed = true;
      }
      if (!isTerminalRunState(run.state)) {
        run.state = "unknown"; run.endedAt = at; run.updatedAt = at;
        run.terminalReason = "The core stopped before the run outcome was established.";
        run.transcript.tailMayBeLost = true;
        // Even durable not-started is not proof that a crash preceded dispatch.
        run.processState = "unknown"; run.exitCode = null;
        run.cleanup = { status: "unknown", observedAt: at, detail: "Previous owned-process cleanup has not been established." };
        changed = true;
      } else if (run.processState === "live" || run.cleanup.status === "pending") {
        if (run.processState === "live") { run.processState = "unknown"; run.exitCode = null; }
        run.updatedAt = at;
        run.cleanup = { status: "unknown", observedAt: at, detail: "Previous owned-process cleanup has not been established." };
        changed = true;
      }
    }
    if (changed) await persist(recovered);
  } else await persist(data);

  return {
    admit(context: PreparedAgentContext) {
      const parsed = PreparedAgentContextSchema.safeParse(context);
      return enqueue<{ receipt: AdmissionReceipt; existing: boolean }>(async () => {
        if (!parsed.success) return error("STALE_CONTEXT", "Prepared context is invalid.");
        const context = parsed.data;
        const existing = data.entries.find((e) => e.run.runId === context.runId);
        if (existing) return same(existing.run.launchContext, context.launchContext)
          ? { ok: true, value: { receipt: existing.receipt, existing: true } }
          : error("STALE_CONTEXT", "This run identity already belongs to different context.");
        if (data.entries.some((e) => !isTerminalRunState(e.run.state))) return error("BUSY", "An agent run is already active.");
        if (data.entries.some((e) => !["not-needed", "confirmed"].includes(e.run.cleanup.status))) return error("AGENT_OUTCOME_UNKNOWN", "Resolve previous owned-process cleanup before launching another run.");
        if (data.entries.length >= AGENT_LIMITS.history) return error("STORAGE_FULL", "Agent history is full; no history was removed.");
        const instant = now();
        if (instant < Date.parse(context.preparedAt) || instant >= Date.parse(context.expiresAt) ||
            !isAbsolute(context.launchContext.root) || inside(resolve(context.launchContext.root), directory)) return error("STALE_CONTEXT", "Prepared context expired or has an invalid storage boundary.");
        const at = new Date(instant).toISOString();
        const run: Run = {
          runId: context.runId, providerThreadId: null, providerTurnId: null, launchContext: context.launchContext,
          state: "starting", createdAt: at, updatedAt: at, startedAt: null, endedAt: null, terminalReason: null,
          providerOutcome: { kind: "none" }, providerObservation: null, processState: "not-started", exitCode: null,
          cleanup: { status: "not-needed", observedAt: at, detail: "No process dispatch has been recorded." },
          transcript: { lastRecord: 0, bytes: 0, truncated: false, tailMayBeLost: false }, instructions: [],
        };
        const receipt = { runId: context.runId, contextHash: context.contextHash, admittedAt: at, status: "admitted" as const };
        const next = structuredClone(data); next.entries.push({ receipt, run, records: [] });
        // Leave room for one final bounded record and receipt/state transitions.
        if (utf8Bytes(JSON.stringify(next)) > AGENT_LIMITS.storeBytes - finalReserve) throw new StoreFailure("STORAGE_FULL");
        await persist(next);
        return { ok: true, value: { receipt, existing: false } };
      });
    },
    update(input: Run) {
      const parsed = RunSchema.safeParse(input);
      return enqueue(async () => {
        if (!parsed.success) throw new StoreFailure();
        const run = parsed.data;
        const old = data.entries.find((e) => e.run.runId === run.runId)?.run;
        if (!old) return error("RUN_NOT_ACTIVE", "The run is not in local history.");
        if (!same(old.launchContext, run.launchContext) || old.createdAt !== run.createdAt ||
            !canTransitionRun(old.state, run.state) || Date.parse(run.updatedAt) < Date.parse(old.updatedAt) ||
            (old.startedAt !== null && old.startedAt !== run.startedAt) ||
            (old.providerThreadId !== null && old.providerThreadId !== run.providerThreadId) ||
            (old.providerTurnId !== null && old.providerTurnId !== run.providerTurnId) ||
            (old.providerObservation !== null && !same(old.providerObservation, run.providerObservation)) ||
            !uncertainInstructions(old.instructions, run.instructions) ||
            old.transcript.bytes !== run.transcript.bytes || old.transcript.lastRecord !== run.transcript.lastRecord ||
            old.transcript.truncated && !run.transcript.truncated || old.transcript.tailMayBeLost && !run.transcript.tailMayBeLost ||
            (isTerminalRunState(old.state) && (old.endedAt !== run.endedAt || old.terminalReason !== run.terminalReason || !same(old.providerOutcome, run.providerOutcome))) ||
            (["exited", "unknown"].includes(old.processState) && ["not-started", "live"].includes(run.processState)) ||
            (old.processState !== "not-started" && run.processState === "not-started") ||
            (old.cleanup.status === "confirmed" && !same(old.cleanup, run.cleanup))) throw new StoreFailure();
        const next = structuredClone(data); next.entries.find((e) => e.run.runId === run.runId)!.run = run;
        if (!isTerminalRunState(run.state) && utf8Bytes(JSON.stringify(next)) > AGENT_LIMITS.storeBytes - finalReserve) throw new StoreFailure("STORAGE_FULL");
        await persist(next); return { ok: true, value: run };
      });
    },
    snapshot() { return enqueue(async () => {
      const active = data.entries.find((e) => !isTerminalRunState(e.run.state));
      const tail = active?.records.slice(-AGENT_LIMITS.tailRecords) ?? [];
      while (utf8Bytes(JSON.stringify(tail)) > AGENT_LIMITS.tailBytes) tail.shift();
      return { ok: true, value: AgentSnapshotSchema.parse({ ...unavailableAgentSnapshot(),
        runs: [...data.entries].reverse().map(({ run }) => ({ runId: run.runId, state: run.state, createdAt: run.createdAt,
          updatedAt: run.updatedAt, endedAt: run.endedAt, taskLabel: label(run.launchContext.taskText),
          focusLabel: label(run.launchContext.focus.symbol ?? run.launchContext.focus.path ?? run.launchContext.focus.key) })),
        activeRunId: active?.run.runId ?? null, tail,
      }) };
    }); },
    read(runId: string, afterRecord: number) { return enqueue(async () => {
      const entry = data.entries.find((e) => e.run.runId === runId);
      if (!entry) return error("RUN_NOT_ACTIVE", "The run is not in local history.");
      if (!Number.isSafeInteger(afterRecord) || afterRecord < 0 || afterRecord > entry.run.transcript.lastRecord) return error("INVALID_CURSOR", "The requested transcript cursor is invalid.");
      return { ok: true, value: { run: entry.run, page: page(entry, afterRecord) } };
    }); },
    append(runId: string, input: TranscriptRecord) {
      const parsed = TranscriptRecordSchema.safeParse(input);
      return enqueue(async () => {
        if (!parsed.success || utf8Bytes(JSON.stringify([parsed.data])) > AGENT_LIMITS.pageBytes) return error("OUTPUT_LIMIT", "Transcript record exceeds the supported bounds.");
        const record = parsed.data;
        const entry = data.entries.find((e) => e.run.runId === runId);
        if (!entry) return error("RUN_NOT_ACTIVE", "The run is not in local history.");
        const existing = entry.records.find((r) => r.recordId === record.recordId);
        if (existing) return same(existing, record) ? { ok: true, value: page(entry, record.recordId - 1) } : error("OUTPUT_LIMIT", "A transcript identity cannot be reused with different content.");
        if (record.recordId !== entry.run.transcript.lastRecord + 1) return error("INVALID_CURSOR", "Transcript record IDs must be consecutive.");
        const next = structuredClone(data); const target = next.entries.find((e) => e.run.runId === runId)!;
        target.records.push(record);
        const bytes = recordBytes(target.records);
        const reserve = ["gap", "recap"].includes(record.kind) ? 0 : AGENT_LIMITS.pageBytes;
        if (bytes > AGENT_LIMITS.transcriptBytes - reserve) return error("OUTPUT_LIMIT", "Transcript quota reached; reserved final evidence remains available.");
        target.run.transcript.lastRecord = record.recordId; target.run.transcript.bytes = bytes;
        if (record.kind === "gap") target.run.transcript.truncated = true;
        target.run.updatedAt = new Date(Math.max(now(), Date.parse(target.run.updatedAt))).toISOString();
        const totalReserve = reserve === 0 ? AGENT_LIMITS.pageBytes : finalReserve;
        if (utf8Bytes(JSON.stringify(next)) > AGENT_LIMITS.storeBytes - totalReserve) return error("OUTPUT_LIMIT", "Global transcript quota reached; terminal metadata space remains reserved.");
        await persist(next); return { ok: true, value: page(target, record.recordId - 1) };
      });
    },
    instruction(runId: string, input: InstructionReceipt) {
      const parsed = InstructionReceiptSchema.safeParse(input);
      return enqueue(async () => {
        if (!parsed.success || digest(parsed.data.text) !== parsed.data.textHash) throw new StoreFailure();
        const receipt = parsed.data;
        const entry = data.entries.find((e) => e.run.runId === runId);
        if (!entry) return error("RUN_NOT_ACTIVE", "The run is not in local history.");
        const old = entry.run.instructions.find((r) => r.requestId === receipt.requestId);
        if (old) {
          const identity = (r: InstructionReceipt) => [r.requestId, r.expectedTurnId, r.text, r.textHash, r.submittedAt];
          if (!same(identity(old), identity(receipt))) return error("STALE_TURN", "This instruction identity already belongs to a different payload.");
          // A retried original pending intent reads its settled receipt, not a replay.
          if (receipt.status === "pending" || same(old, receipt)) return { ok: true, value: old };
          if (!settlement(old, receipt)) return error("STALE_TURN", "Settled instruction delivery cannot be rewritten.");
        } else {
          if (receipt.status !== "pending") return error("STALE_TURN", "Instruction intent must be recorded before its outcome.");
          if (entry.run.state !== "running") return error("RUN_NOT_ACTIVE", "Steering requires a running turn.");
          if (entry.run.providerTurnId !== receipt.expectedTurnId) return error("STALE_TURN", "The expected turn is no longer active.");
          if (entry.run.instructions.some((r) => r.status === "pending")) return error("BUSY", "Another instruction is awaiting acknowledgement.");
          if (entry.run.instructions.length >= AGENT_LIMITS.receipts) return error("INSTRUCTION_LIMIT", "Instruction history is full; no receipts were removed.");
        }
        const next = structuredClone(data); const target = next.entries.find((e) => e.run.runId === runId)!;
        const index = target.run.instructions.findIndex((r) => r.requestId === receipt.requestId);
        if (index < 0) target.run.instructions.push(receipt); else target.run.instructions[index] = receipt;
        target.run.updatedAt = new Date(Math.max(now(), Date.parse(target.run.updatedAt), Date.parse(receipt.settledAt ?? receipt.submittedAt))).toISOString();
        if (!old && utf8Bytes(JSON.stringify(next)) > AGENT_LIMITS.storeBytes - finalReserve) throw new StoreFailure("STORAGE_FULL");
        await persist(next); return { ok: true, value: receipt };
      });
    },
    close() {
      accepting = false;
      closing ??= queue.then(async () => {
        closed = true;
        try { await dir.close(); }
        finally { await new Promise<void>((done, reject) => lock.close((cause) => cause ? reject(cause) : done())); }
      });
      return closing;
    },
  };
}
