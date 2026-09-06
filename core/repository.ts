import { randomUUID } from "node:crypto";
import { constants, type Dir } from "node:fs";
import { lstat, open, opendir, realpath, stat, type FileHandle } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  REPOSITORY_CAPTURE_BYTES, REPOSITORY_CAPTURE_ENTRIES, REPOSITORY_PAGE_SIZE, REPOSITORY_STALE_MS,
  RepositoryRequestSchema, isRepositoryPath, repositoryEntryId,
  type RepositoryEntry, type RepositoryObservation, type RepositoryRequest,
} from "../protocol/repository";
import { assertRepositoryBoundary, exactIndexArguments, hasRepositoryMarker, parseIndexRecords, queryRepositoryGit } from "./repository-boundary";

export class RepositoryError extends Error {
  constructor(public readonly code: string, message: string) { super(message.slice(0, 512)); this.name = "RepositoryError"; }
}

export interface RepositoryReaderOptions {
  now?: () => number;
  /** Deterministic race testing only; production has no callback. */
  afterDirectoryOpen?: (directory: string) => Promise<void>;
  git?: typeof queryRepositoryGit;
}

interface Capture {
  directory: string;
  id: string;
  time: number;
  staleGeneration: number;
  complete: boolean;
  entries: RepositoryEntry[];
  notice?: string;
}

function directoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return new RepositoryError("REPOSITORY_NOT_FOUND", "The requested directory no longer exists; the previous listing is retained");
  if (code === "EACCES" || code === "EPERM") return new RepositoryError("REPOSITORY_PERMISSION_DENIED", "The requested directory cannot be read");
  if (code === "ELOOP" || code === "ENOTDIR") return new RepositoryError("REPOSITORY_UNSUPPORTED", "Only canonical directories can be browsed; links and special files are not traversable");
  if (code?.startsWith("REPOSITORY_") || code === "INVALID_PATH") return new RepositoryError(code, error instanceof Error ? error.message : "Repository path is unavailable");
  return new RepositoryError("REPOSITORY_UNAVAILABLE", "The directory could not be observed; retry or navigate Up");
}

export class RepositoryReader {
  private capture?: Capture;
  private generation = 0;
  private staleGeneration = 0;
  private disposed = false;
  private readonly pending = new Set<AbortController>();
  private readonly handles = new Set<FileHandle>();
  private readonly directories = new Set<Dir>();
  private readonly now: () => number;
  constructor(private readonly root: string, private readonly repositoryId: string, private readonly options: RepositoryReaderOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  markStale(): void { this.staleGeneration += 1; }
  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.capture = undefined;
    for (const pending of this.pending) pending.abort();
    for (const directory of this.directories) void directory.close().catch(() => undefined);
    for (const handle of this.handles) void handle.close().catch(() => undefined);
  }

  async list(input: RepositoryRequest): Promise<RepositoryObservation> {
    let request: RepositoryRequest;
    try { request = RepositoryRequestSchema.parse(input); }
    catch { throw new RepositoryError("INVALID_PATH", "Repository navigation requires a valid canonical directory and bounded page"); }
    if (this.disposed) throw new RepositoryError("REPOSITORY_CANCELLED", "This repository reader is disposed");
    const generation = ++this.generation;
    for (const pending of this.pending) pending.abort();
    if (!request.refresh && request.observationId &&
        (!this.capture || this.capture.id !== request.observationId || this.capture.directory !== request.directory))
      throw new RepositoryError("REPOSITORY_STALE", "That directory observation is no longer retained; Refresh to capture it again");
    let capture = this.capture;
    if (request.refresh || !capture || capture.directory !== request.directory || !request.observationId) {
      const controller = new AbortController();
      this.pending.add(controller);
      try {
        const observed = await this.readCapture(request.directory, controller.signal);
        if (this.disposed || generation !== this.generation || controller.signal.aborted)
          throw new RepositoryError("REPOSITORY_CANCELLED", "A newer navigation request superseded this observation");
        capture = observed;
      } catch (error) {
        if (this.disposed || generation !== this.generation || controller.signal.aborted)
          throw new RepositoryError("REPOSITORY_CANCELLED", "A newer navigation or disposal superseded this observation");
        throw directoryError(error);
      }
      finally { this.pending.delete(controller); }
    }
    // Do not replace the retained observation until the entire requested page/reveal is valid.
    if (!capture) throw new RepositoryError("REPOSITORY_UNAVAILABLE", "No directory observation is retained");
    let filter = request.filter;
    let page = request.page;
    let reveal: RepositoryObservation["reveal"];
    if (request.revealPath) {
      filter = "";
      const index = capture.entries.findIndex((entry) => entry.path === request.revealPath);
      if (index >= 0) {
        page = Math.floor(index / REPOSITORY_PAGE_SIZE);
        const entry = capture.entries[index]!;
        reveal = { path: request.revealPath, status: entry.actionable && entry.kind === "file" ? "selected" : "unsupported" };
      } else {
        page = 0;
        reveal = { path: request.revealPath, status: capture.complete ? "absent" : "outside-capture" };
      }
    }
    const entries = filter ? capture.entries.filter((entry) => entry.label.toLowerCase().includes(filter.toLowerCase())) : capture.entries;
    const pageCount = Math.max(1, Math.ceil(entries.length / REPOSITORY_PAGE_SIZE));
    if (page >= pageCount) throw new RepositoryError("REPOSITORY_PAGE_UNAVAILABLE", "That page does not exist in this captured directory");
    const notices = [capture.notice, reveal?.status === "outside-capture" ? "The requested file is outside this partial directory capture; exact Open path remains available." : undefined].filter(Boolean);
    this.capture = capture;
    return {
      directory: capture.directory, observationId: capture.id, capturedAt: new Date(capture.time).toISOString(),
      state: capture.staleGeneration !== this.staleGeneration || this.now() - capture.time >= REPOSITORY_STALE_MS ? "stale" : "observed",
      complete: capture.complete, capturedCount: capture.entries.length, filteredCount: entries.length,
      page, pageCount, filter, entries: entries.slice(page * REPOSITORY_PAGE_SIZE, (page + 1) * REPOSITORY_PAGE_SIZE).map((entry) => ({ ...entry })),
      ...(notices.length ? { notice: notices.join(" ").slice(0, 1_024) } : {}), ...(reveal ? { reveal } : {}),
    };
  }

  private async validateDescriptor(handle: FileHandle, directory: string): Promise<void> {
    const actual = await realpath(`/proc/self/fd/${handle.fd}`);
    const expected = resolve(this.root, directory);
    if (actual !== expected || relative(this.root, actual).split(sep).join("/") !== directory)
      throw new RepositoryError("REPOSITORY_PATH_CHANGED", "The directory is no longer its canonical repository path");
    const [opened, current, canonical] = await Promise.all([handle.stat(), stat(expected), realpath(expected)]);
    if (canonical !== expected || current.dev !== opened.dev || current.ino !== opened.ino)
      throw new RepositoryError("REPOSITORY_PATH_CHANGED", "The directory changed identity during observation");
  }

  private async readCapture(directory: string, signal: AbortSignal): Promise<Capture> {
    const time = this.now();
    const staleGeneration = this.staleGeneration;
    await assertRepositoryBoundary(this.root, directory, true, signal);
    const handle = await open(resolve(this.root, directory), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    this.handles.add(handle);
    let stream: Dir | undefined;
    try {
      await this.validateDescriptor(handle, directory);
      await this.options.afterDirectoryOpen?.(directory);
      if (signal.aborted) throw new RepositoryError("REPOSITORY_CANCELLED", "Repository observation was cancelled");
      // Node supports raw Buffer names here; its Dir typings omit this encoding overload.
      stream = await opendir(`/proc/self/fd/${handle.fd}`, { encoding: "buffer" as BufferEncoding, bufferSize: 32 });
      this.directories.add(stream);
      const entries: RepositoryEntry[] = [];
      const rawNames = new Map<RepositoryEntry, Buffer>();
      let bytes = 0;
      let complete = true;
      for (;;) {
        if (signal.aborted) throw new RepositoryError("REPOSITORY_CANCELLED", "Repository observation was cancelled");
        const dirent = await stream.read();
        if (!dirent) break;
        // Node returns Buffer names for encoding:buffer, although @types/node's Dir is not generic.
        const name = dirent.name as unknown;
        if (!Buffer.isBuffer(name)) throw new RepositoryError("REPOSITORY_UNAVAILABLE", "Raw directory names are unavailable");
        if (name.equals(Buffer.from(".git"))) continue;
        if (entries.length >= REPOSITORY_CAPTURE_ENTRIES) { complete = false; break; }
        let label: string;
        try { label = new TextDecoder("utf8", { fatal: true }).decode(name); }
        catch { label = ""; }
        const path = directory ? `${directory}/${label}` : label;
        const supported = isRepositoryPath(path) && label.length > 0;
        let entry: RepositoryEntry;
        if (!supported) {
          const escaped = Array.from(name, (byte) => byte >= 32 && byte < 127 && byte !== 92 ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, "0")}`).join("").slice(0, 1_024);
          entry = { id: repositoryEntryId(this.repositoryId, "unsupported", `${directory}/${name.toString("hex")}`), path: null, label: escaped,
            kind: "unsupported", git: "unknown", actionable: false, reason: "Unsupported filename bytes or non-canonical path; no lossy alias can be opened" };
        } else {
          const metadata = await lstat(Buffer.concat([Buffer.from(`/proc/self/fd/${handle.fd}/`), name]));
          const kind = metadata.isSymbolicLink() ? "symlink" : metadata.isDirectory() ?
            await hasRepositoryMarker(`/proc/self/fd/${handle.fd}/${label}`) ? "repository" : "directory" : metadata.isFile() ? "file" : "special";
          const actionable = kind === "directory" || kind === "file";
          entry = { id: repositoryEntryId(this.repositoryId, kind, path), path, label, kind, git: "unknown", actionable,
            ...(!actionable ? { reason: kind === "symlink" ? "Symbolic links are not followed" : kind === "repository" ? "Nested repository or submodule; open it separately" : "Special files cannot be opened" } : {}) };
        }
        // Reserve bounded classification growth (untracked label; possible gitlink reason).
        const entryBytes = Buffer.byteLength(JSON.stringify(entry)) + name.byteLength + (entry.kind === "directory" ? 80 : 2);
        if (bytes + entryBytes > REPOSITORY_CAPTURE_BYTES) { complete = false; break; }
        bytes += entryBytes;
        entries.push(entry);
        rawNames.set(entry, name);
      }
      const gitKnown = await this.classify(entries, signal);
      await this.validateDescriptor(handle, directory);
      await assertRepositoryBoundary(this.root, directory, true, signal);
      entries.sort((left, right) => Number(right.kind === "directory") - Number(left.kind === "directory") || Buffer.compare(rawNames.get(left)!, rawNames.get(right)!));
      const notices = [!complete ? "Partial directory: the capture reached its bounded entry or metadata limit. Filtering and sorting cover only captured entries." : undefined,
        !gitKnown ? "Git classification is unavailable; filesystem entries remain visible with unknown status." : undefined].filter(Boolean);
      return { directory, id: `directory:${randomUUID()}`, time, staleGeneration, complete, entries, ...(notices.length ? { notice: notices.join(" ") } : {}) };
    } finally {
      if (stream) { this.directories.delete(stream); await stream.close().catch(() => undefined); }
      this.handles.delete(handle);
      await handle.close().catch(() => undefined);
    }
  }

  private async classify(entries: RepositoryEntry[], signal: AbortSignal): Promise<boolean> {
    const paths = entries.flatMap((entry) => entry.path ? [entry.path] : []);
    if (!paths.length) return true;
    const directories = entries.filter((entry) => entry.kind === "directory" || entry.kind === "repository").map((entry) => entry.path!);
    const query = this.options.git ?? queryRepositoryGit;
    const deadline = Date.now() + 2_000;
    let remainingBytes = REPOSITORY_CAPTURE_BYTES;
    const onBytes = (count: number) => { remainingBytes -= count; };
    try {
      const indexed = await query(this.root, exactIndexArguments(paths, directories), { signal, timeoutMs: 2_000, maximumBytes: remainingBytes, onBytes });
      const index = parseIndexRecords(indexed);
      const untracked = paths.filter((path) => !index.has(path));
      const remaining = deadline - Date.now();
      if (remaining <= 0 || remainingBytes <= 0) return false;
      const ignoredBytes = untracked.length ? await query(this.root, ["check-ignore", "--no-index", "-z", "--stdin"], {
        signal, timeoutMs: remaining, maximumBytes: remainingBytes, onBytes,
        input: Buffer.from(`${untracked.join("\0")}\0`), allowNoMatches: true,
      }) : Buffer.alloc(0);
      const ignored = new Set(ignoredBytes.toString("utf8").split("\0"));
      for (const entry of entries) {
        if (!entry.path) continue;
        if (index.get(entry.path) === "160000") {
          entry.kind = "repository";
          entry.id = repositoryEntryId(this.repositoryId, "repository", entry.path);
          entry.actionable = false;
          entry.reason = "Submodule; open its repository separately";
        }
        entry.git = index.has(entry.path) ? "tracked" : ignored.has(entry.path) ? "ignored" : entry.kind === "directory" || entry.kind === "repository" ? "unknown" : "untracked";
      }
      return true;
    } catch { return false; }
  }
}
