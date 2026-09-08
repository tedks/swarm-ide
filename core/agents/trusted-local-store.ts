import { constants, type Stats } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { utf8Bytes } from "../../protocol/agents";
import {
  TrustedActivitySchema, TrustedRunSummarySchema,
  type TrustedActivity, type TrustedRunSummary,
} from "../../protocol/trusted-local";

export type TrustedStoredRun = {
  summary: TrustedRunSummary;
  threadId: string | null;
  turnId: string | null;
  output: string;
  activities: TrustedActivity[];
};
export interface TrustedLocalStore {
  load(): Promise<TrustedStoredRun[]>;
  save(runs: TrustedStoredRun[], admittedTokens?: string[]): Promise<void>;
  /** Retired identities survive history eviction, preventing restart replay. */
  admittedTokens?(): readonly string[];
  close?(): Promise<void>;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const text = (max: number) => z.string().max(max).refine((value) => utf8Bytes(value) <= max);
const RunSchema = z.object({
  summary: TrustedRunSummarySchema,
  threadId: text(256).min(1).nullable(),
  turnId: text(256).min(1).nullable(),
  output: text(262144),
  activities: z.array(TrustedActivitySchema).max(100),
}).strict();
const SnapshotSchema = z.object({ version: z.literal(1), runs: z.array(RunSchema).max(20),
  admittedTokens: z.array(z.string().uuid()).optional() }).strict();

function validate(input: unknown): z.infer<typeof SnapshotSchema> {
  // Reject large collections before Zod accumulates errors for every item.
  const runs = input && typeof input === "object" && "runs" in input ? input.runs : undefined;
  if (!Array.isArray(runs) || runs.length > 20 || runs.some((run) =>
    !run || typeof run !== "object" || !Array.isArray(run.activities) || run.activities.length > 100)) {
    throw new Error("Invalid bounded trusted history.");
  }
  const parsed = SnapshotSchema.parse(input);
  if (new Set(parsed.runs.map((run) => run.summary.runToken)).size !== parsed.runs.length ||
      parsed.runs.some((run) =>
        (run.turnId !== null && run.threadId === null) ||
        (run.summary.fork !== undefined && (run.summary.fork.parentRunToken === run.summary.runToken ||
          run.summary.taskReference !== null || (run.summary.fork.confirmed && (run.threadId === null || run.threadId === run.summary.fork.parentThreadId)))) ||
        Date.parse(run.summary.updatedAt) < Date.parse(run.summary.createdAt) ||
        new Set(run.activities.map((activity) => activity.id)).size !== run.activities.length)) {
    throw new Error("Invalid trusted history identity or correlation.");
  }
  if (utf8Bytes(JSON.stringify(parsed)) > MAX_FILE_BYTES) throw new Error("Trusted history exceeds its storage bound.");
  return parsed;
}

/** Every operation shares a recovering serial queue;
 * callers receive detached snapshots, and inputs are captured before queuing.
 * The service, not storage, decides how a previous process's state is archived.
 */
class SerialStore {
  private queue: Promise<unknown> = Promise.resolve();
  protected enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
}

export class MemoryTrustedLocalStore extends SerialStore implements TrustedLocalStore {
  private runs: TrustedStoredRun[] = [];
  private tokens: string[] = [];
  admittedTokens(): readonly string[] { return [...this.tokens]; }
  load(): Promise<TrustedStoredRun[]> { return this.enqueue(() => structuredClone(this.runs)); }
  async save(runs: TrustedStoredRun[], admittedTokens?: string[]): Promise<void> {
    const captured = validate({ version: 1, runs, ...(admittedTokens ? { admittedTokens } : {}) });
    await this.enqueue(() => { this.runs = captured.runs; this.tokens = captured.admittedTokens ?? this.tokens; });
  }
}

function privateFile(info: Stats): boolean {
  return info.isFile() && info.uid === process.getuid?.() && (info.mode & 0o777) === 0o600 && info.nlink === 1;
}
function missing(cause: unknown): boolean {
  return cause !== null && typeof cause === "object" && "code" in cause && cause.code === "ENOENT";
}

/** flock(2) belongs to the shared open-file-description, not the short-lived
 * utility PID. Inheriting this descriptor as stdin leaves the parent holding
 * the lock after the utility exits. Never unlink the lock inode.
 */
async function lockExclusive(file: FileHandle): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("flock", ["--exclusive", "--nonblock", "0"], { stdio: [file.fd, "ignore", "ignore"] });
    let failure: Error | undefined;
    const timeout = setTimeout(() => {
      failure = new Error("Trusted history writer-lock acquisition timed out.");
      child.kill("SIGKILL");
    }, 5000);
    child.once("error", (cause) => { failure = cause; });
    // Even an error/timeout settles only after this exact child's close event.
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(code === 1 ? "Trusted history already has an active writer." : "Trusted history writer-lock acquisition failed."));
      else resolve();
    });
  });
}

/** Linux local-core storage, using a core-selected private path outside the
 * repository. A pinned directory and no-follow/nonblocking file open reject
 * accidental links, special files and replacement of the selected directory.
 * A lifetime advisory lock excludes other cooperating core owners before any
 * history read or write. Closing drains accepted work and releases ownership;
 * process exit also releases it without a stale PID-file recovery protocol.
 */
export class FileTrustedLocalStore extends SerialStore implements TrustedLocalStore {
  private readonly directory: string;
  private readonly name: string;
  private lock: { file: FileHandle; directory: Stats; inode: Stats } | undefined;
  private closing: Promise<void> | undefined;
  private tokens: string[] = [];
  admittedTokens(): readonly string[] { return [...this.tokens]; }
  constructor(filePath: string) {
    super();
    if (!isAbsolute(filePath) || resolve(filePath) !== filePath || dirname(filePath) === filePath) {
      throw new Error("Trusted history requires an absolute normalized file path.");
    }
    this.directory = dirname(filePath);
    this.name = basename(filePath);
  }

  private async withDirectory<T>(operation: (directory: FileHandle, path: string) => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const before = await lstat(this.directory);
    if (!before.isDirectory() || before.uid !== process.getuid?.() || (before.mode & 0o777) !== 0o700) {
      throw new Error("Trusted history directory must be private and owned.");
    }
    const directory = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const current = await directory.stat();
      if (current.ino !== before.ino || current.dev !== before.dev || current.uid !== before.uid || (current.mode & 0o777) !== 0o700) {
        throw new Error("Trusted history directory changed while opening.");
      }
      await this.ensureLock(directory, current);
      return await operation(directory, join(`/proc/self/fd/${directory.fd}`, this.name));
    } finally { await directory.close(); }
  }

  private async ensureLock(directory: FileHandle, current: Stats): Promise<void> {
    const path = join(`/proc/self/fd/${directory.fd}`, `.${this.name}.lock`);
    if (this.lock) {
      const named = await lstat(path), held = await this.lock.file.stat();
      if (current.dev !== this.lock.directory.dev || current.ino !== this.lock.directory.ino ||
          !privateFile(named) || !privateFile(held) || named.dev !== this.lock.inode.dev || named.ino !== this.lock.inode.ino) {
        throw new Error("Trusted history writer-lock or directory changed while owned.");
      }
      return;
    }
    const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      const inode = await file.stat();
      if (!privateFile(inode)) throw new Error("Trusted history writer-lock must be a private regular file.");
      await lockExclusive(file);
      const named = await lstat(path);
      if (!privateFile(named) || named.dev !== inode.dev || named.ino !== inode.ino) {
        throw new Error("Trusted history writer-lock changed during acquisition.");
      }
      this.lock = { file, directory: current, inode };
    } catch (cause) { await file.close(); throw cause; }
  }

  close(): Promise<void> {
    this.closing ??= this.enqueue(async () => {
      const lock = this.lock;
      this.lock = undefined;
      await lock?.file.close();
    });
    return this.closing;
  }

  load(): Promise<TrustedStoredRun[]> {
    if (this.closing) return Promise.reject(new Error("Trusted history store is closed."));
    return this.enqueue(() => this.withDirectory(async (_directory, path) => {
      let file: FileHandle;
      try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
      catch (cause) { if (missing(cause)) return []; throw cause; }
      try {
        const info = await file.stat();
        if (!privateFile(info) || info.size > MAX_FILE_BYTES) throw new Error("Invalid private trusted history file.");
        const chunks: Buffer[] = [];
        const buffer = Buffer.alloc(65536);
        let total = 0;
        for (;;) {
          const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, MAX_FILE_BYTES + 1 - total), null);
          if (bytesRead === 0) break;
          total += bytesRead;
          if (total > MAX_FILE_BYTES) throw new Error("Trusted history exceeds its storage bound.");
          chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
        const saved = validate(JSON.parse(text));
        this.tokens = saved.admittedTokens ?? [];
        return saved.runs;
      } finally { await file.close(); }
    }));
  }

  async save(runs: TrustedStoredRun[], admittedTokens?: string[]): Promise<void> {
    if (this.closing) throw new Error("Trusted history store is closed.");
    const captured = validate({ version: 1, runs, ...(admittedTokens ? { admittedTokens } : {}) });
    const serialized = JSON.stringify(captured);
    await this.enqueue(() => this.withDirectory(async (directory, path) => {
      // Do not replace a suspicious destination, even though rename itself
      // would not follow a link. Preserve the unexpected entry for inspection.
      try { if (!privateFile(await lstat(path))) throw new Error("Invalid private trusted history destination."); }
      catch (cause) { if (!missing(cause)) throw cause; }
      const temporary = join(`/proc/self/fd/${directory.fd}`, `.${this.name}.${randomUUID()}.tmp`);
      let file: FileHandle | undefined;
      let renamed = false;
      try {
        file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await file.writeFile(serialized, "utf8");
        await file.sync();
        await file.close(); file = undefined;
        await rename(temporary, path); renamed = true;
        await directory.sync();
        this.tokens = captured.admittedTokens ?? this.tokens;
      } finally {
        try { await file?.close(); }
        finally { if (!renamed) await unlink(temporary).catch((cause) => { if (!missing(cause)) throw cause; }); }
      }
    }));
  }
}
