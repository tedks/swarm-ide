import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isRepositoryPath } from "../protocol/repository";
import { FILE_SEARCH_ENTRIES, FILE_SEARCH_NAME_BYTES, FILE_SEARCH_RESULTS, FILE_SEARCH_STALE_MS,
  RepositorySearchRequestSchema, RepositorySearchResultSchema, compareSearchPaths,
  type RepositorySearchRequest, type RepositorySearchResult } from "../protocol/repository-search";
import { hasRepositoryMarker, queryRepositoryGit } from "./repository-boundary";
import { RepositoryError } from "./repository";

interface Capture { id: string; time: number; generation: number; paths: string[]; gitlinks: Set<string>; complete: boolean; omitted: boolean }
export interface FileSearchOptions { now?: () => number; git?: typeof queryRepositoryGit }

/** Names only: one bounded capture per registered core lifetime, refreshed explicitly. */
export class RepositoryFileSearch {
  private capture?: Capture;
  private pending?: { controller: AbortController; promise: Promise<Capture> };
  private disposed = false;
  private generation = 0;
  private querySerial = 0;
  private failure = false;
  private readonly now: () => number;
  constructor(private readonly root: string, private readonly repositoryId: string, private readonly options: FileSearchOptions = {}) {
    this.now = options.now ?? Date.now;
  }
  markStale(): void { ++this.generation; }
  dispose(): void { this.disposed = true; ++this.querySerial; this.pending?.controller.abort(); this.capture = undefined; }

  async search(input: RepositorySearchRequest): Promise<RepositorySearchResult> {
    const request = RepositorySearchRequestSchema.parse(input);
    if (request.repositoryId !== this.repositoryId) throw new RepositoryError("REPOSITORY_MISMATCH", "Search requires the registered repository");
    const serial = ++this.querySerial;
    const current = () => {
      if (this.disposed || serial !== this.querySerial) throw new RepositoryError("REPOSITORY_CANCELLED", "Search was superseded or its core disposed");
    };
    current();
    if (request.refresh || !this.capture || this.pending) {
      if (request.refresh) { this.pending?.controller.abort(); this.pending = undefined; }
      if (!this.pending) {
        const controller = new AbortController();
        const pending = { controller, promise: this.captureNames(controller.signal) };
        this.pending = pending;
        void pending.promise.finally(() => { if (this.pending === pending) this.pending = undefined; }).catch(() => undefined);
      }
      try {
        const capture = await this.pending.promise;
        current(); this.capture = capture; this.failure = false;
      } catch {
        current(); this.failure = true;
        if (!this.capture) throw new RepositoryError("REPOSITORY_SEARCH_UNAVAILABLE", "Filename capture failed or exceeded its 2-second / 2-MiB Git limit. Retry Refresh or use exact Open path.");
      }
    }
    current();
    const capture = this.capture!;
    const needle = request.query.toLowerCase();
    const candidates = capture.paths.filter((path) => path.toLowerCase().includes(needle)).sort((a, b) => compareSearchPaths(request.query, a, b));
    const paths: string[] = [];
    const directories = new Map<string, boolean>();
    const deadline = Date.now() + 2_000;
    let checked = 0;
    // Metadata checks are bounded and advisory, never read bytes or grant open authority.
    for (const path of candidates) {
      current();
      if (checked >= 160 || paths.length >= FILE_SEARCH_RESULTS || Date.now() >= deadline) break;
      ++checked;
      if (await this.eligible(path, capture.gitlinks, directories, deadline, current)) paths.push(path);
    }
    current();
    const matchesComplete = checked === candidates.length;
    const stale = this.failure || capture.generation !== this.generation || this.now() - capture.time >= FILE_SEARCH_STALE_MS;
    return RepositorySearchResultSchema.parse({ kind: "search", repositoryId: this.repositoryId, query: request.query,
      captureId: capture.id, capturedAt: new Date(capture.time).toISOString(), state: stale ? "stale" : "observed",
      complete: capture.complete, capturedCount: capture.paths.length, matchesComplete, paths,
      notice: ["Names only: tracked + non-ignored untracked, including dotfiles. Ignored untracked paths are excluded. Opening revalidates current source.",
        !capture.complete ? "Partial capture: only the bounded captured subset is searched." : "Complete bounded Git name capture (not an atomic filesystem snapshot).",
        capture.omitted ? "Unsupported names and repository/link entries omitted." : "",
        !matchesComplete ? "Match checks/results are limited; narrow the fragment or use exact Open path." : "",
        this.failure ? "Refresh failed; retained capture is stale. Retry explicitly." : stale ? "Capture is stale; Refresh explicitly to observe new names." : ""].filter(Boolean).join(" ") });
  }

  private async captureNames(signal: AbortSignal): Promise<Capture> {
    const time = this.now(), generation = this.generation;
    const bytes = await (this.options.git ?? queryRepositoryGit)(this.root,
      ["ls-files", "--cached", "--others", "--exclude-standard", "--stage", "-z"],
      { signal, maximumBytes: 2 * 1024 * 1024, timeoutMs: 2_000 });
    if (signal.aborted || this.disposed) throw new Error("Disposed capture");
    if (bytes.length && bytes[bytes.length - 1] !== 0) throw new Error("Incomplete Git name record");
    const paths = new Set<string>(), gitlinks = new Set<string>();
    let size = 0, complete = true, omitted = false;
    for (const raw of bytes.toString("latin1").split("\0")) {
      if (!raw) continue;
      let record: string;
      try { record = new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(raw, "latin1")); }
      catch { omitted = true; continue; }
      const indexed = /^(\d{6}) [a-f0-9]{40,64} [0-3]\t([\s\S]+)$/.exec(record);
      const path = indexed ? indexed[2]! : record;
      if (!isRepositoryPath(path)) { omitted = true; continue; }
      if (indexed && indexed[1] === "160000") { gitlinks.add(path); omitted = true; continue; }
      if (indexed && !["100644", "100755"].includes(indexed[1]!)) { omitted = true; continue; }
      if (paths.has(path)) continue;
      const count = Buffer.byteLength(path);
      if (paths.size >= FILE_SEARCH_ENTRIES || size + count > FILE_SEARCH_NAME_BYTES) { complete = false; continue; }
      size += count; paths.add(path);
    }
    return { id: `filenames:${randomUUID()}`, time, generation, paths: [...paths], gitlinks, complete, omitted };
  }

  private async eligible(path: string, gitlinks: Set<string>, directories: Map<string, boolean>, deadline: number, current: () => void): Promise<boolean> {
    const parts = path.split("/");
    try {
      for (let index = 1; index < parts.length; ++index) {
        current(); if (Date.now() >= deadline) return false;
        const prefix = parts.slice(0, index).join("/");
        if (!directories.has(prefix)) {
          const absolute = join(this.root, prefix);
          const metadata = await lstat(absolute);
          directories.set(prefix, !gitlinks.has(prefix) && metadata.isDirectory() && !metadata.isSymbolicLink() &&
            await realpath(absolute) === absolute && !await hasRepositoryMarker(absolute));
        }
        if (!directories.get(prefix)) return false;
      }
      current(); if (Date.now() >= deadline || gitlinks.has(path)) return false;
      return (await lstat(join(this.root, path))).isFile();
    } catch (error) {
      current();
      const code = (error as NodeJS.ErrnoException).code;
      if (["ENOENT", "ENOTDIR", "ELOOP"].includes(code ?? "")) return false;
      throw new RepositoryError("REPOSITORY_SEARCH_UNAVAILABLE", "Search metadata could not be checked; use Refresh or exact Open path");
    }
  }
}
