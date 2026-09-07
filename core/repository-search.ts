import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isRepositoryPath } from "../protocol/repository";
import { FILE_SEARCH_ENTRIES, FILE_SEARCH_NAME_BYTES, FILE_SEARCH_RESULTS, FILE_SEARCH_STALE_MS,
  RepositorySearchRequestSchema, RepositorySearchResultSchema, compareSearchPaths,
  type RepositorySearchRequest, type RepositorySearchResult } from "../protocol/repository-search";
import { hasRepositoryMarker, queryRepositoryGit } from "./repository-boundary";
import { RepositoryError } from "./repository";

interface Capture { id: string; time: number; generation: number; paths: string[]; complete: boolean; omitted: boolean }
export interface FileSearchOptions { now?: () => number; git?: typeof queryRepositoryGit; lstat?: (path: string) => Promise<Stats>; metadataTimeoutMs?: number }

/** Names only: one bounded capture per registered core lifetime, refreshed explicitly. */
export class RepositoryFileSearch {
  private capture?: Capture;
  private pending?: { controller: AbortController; promise: Promise<Capture> };
  private disposed = false;
  private generation = 0;
  private querySerial = 0;
  private failure = false;
  private queryController?: AbortController;
  private metadataWork?: Promise<unknown>;
  private readonly now: () => number;
  constructor(private readonly root: string, private readonly repositoryId: string, private readonly options: FileSearchOptions = {}) {
    this.now = options.now ?? Date.now;
  }
  markStale(): void { ++this.generation; }
  dispose(): void { this.disposed = true; ++this.querySerial; this.queryController?.abort(); this.pending?.controller.abort(); this.capture = undefined; }

  async search(input: RepositorySearchRequest): Promise<RepositorySearchResult> {
    const request = RepositorySearchRequestSchema.parse(input);
    if (request.repositoryId !== this.repositoryId) throw new RepositoryError("REPOSITORY_MISMATCH", "Search requires the registered repository");
    this.queryController?.abort();
    const queryController = new AbortController(); this.queryController = queryController;
    const serial = ++this.querySerial;
    const current = () => {
      if (this.disposed || serial !== this.querySerial) throw new RepositoryError("REPOSITORY_CANCELLED", "Search was superseded or its core disposed");
    };
    current();
    if (!this.capture && this.failure && !request.refresh)
      throw new RepositoryError("REPOSITORY_SEARCH_UNAVAILABLE", "Filename capture is unavailable. Use explicit Refresh to retry, or exact Open path.");
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
    const deadline = Date.now() + (this.options.metadataTimeoutMs ?? 2_000);
    // A kernel metadata operation cannot be cancelled by Node. Keep at most one
    // actual metadata chain alive; timing out callers never starts more chains
    // behind a stalled mount. The local-core process owns its final lifetime.
    if (this.metadataWork) await this.waitMetadata(this.metadataWork.catch(() => undefined), deadline, queryController.signal);
    current();
    const metadata = (async () => {
      const paths: string[] = [], directories = new Map<string, boolean>();
      let checked = 0;
      for (const path of candidates) {
        current();
        if (checked >= 160 || paths.length >= FILE_SEARCH_RESULTS || Date.now() >= deadline) break;
        ++checked;
        if (await this.eligible(path, directories, deadline, current)) paths.push(path);
      }
      return { paths, matchesComplete: checked === candidates.length && Date.now() < deadline };
    })();
    this.metadataWork = metadata;
    void metadata.finally(() => { if (this.metadataWork === metadata) this.metadataWork = undefined; }).catch(() => undefined);
    const { paths, matchesComplete } = await this.waitMetadata(metadata, deadline, queryController.signal);
    current();
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

  private waitMetadata<T>(work: Promise<T>, deadline: number, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener("abort", cancel);
        if (ok) resolve(value as T); else reject(value);
      };
      const cancel = () => finish(false, new RepositoryError("REPOSITORY_CANCELLED", "Filename query superseded or disposed"));
      const timer = setTimeout(() => finish(false, new RepositoryError("REPOSITORY_SEARCH_UNAVAILABLE", "Filename metadata checks exceeded their deadline; no new metadata work starts behind a stalled check. Retry explicitly or use exact Open path.")), Math.max(0, deadline - Date.now()));
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      void work.then((value) => finish(true, value), (error) => finish(false, error));
    });
  }

  private async captureNames(signal: AbortSignal): Promise<Capture> {
    const time = this.now(), generation = this.generation;
    const bytes = await (this.options.git ?? queryRepositoryGit)(this.root,
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { signal, maximumBytes: 2 * 1024 * 1024, timeoutMs: 2_000 });
    if (signal.aborted || this.disposed) throw new Error("Disposed capture");
    if (bytes.length && bytes[bytes.length - 1] !== 0) throw new Error("Incomplete Git name record");
    const paths = new Set<string>();
    let size = 0, complete = true, omitted = false;
    for (const raw of bytes.toString("latin1").split("\0")) {
      if (!raw) continue;
      let record: string;
      try { record = new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(Buffer.from(raw, "latin1")); }
      catch { omitted = true; continue; }
      // A names-only stream has no ambiguous stage header. In particular an
      // untracked tab-containing name is rejected, never parsed into an alias.
      const path = record;
      if (!isRepositoryPath(path)) { omitted = true; continue; }
      if (paths.has(path)) continue;
      const count = Buffer.byteLength(path);
      if (paths.size >= FILE_SEARCH_ENTRIES || size + count > FILE_SEARCH_NAME_BYTES) { complete = false; continue; }
      size += count; paths.add(path);
    }
    return { id: `filenames:${randomUUID()}`, time, generation, paths: [...paths], complete, omitted };
  }

  private async eligible(path: string, directories: Map<string, boolean>, deadline: number, current: () => void): Promise<boolean> {
    const parts = path.split("/");
    try {
      for (let index = 1; index < parts.length; ++index) {
        current(); if (Date.now() >= deadline) return false;
        const prefix = parts.slice(0, index).join("/");
        if (!directories.has(prefix)) {
          const absolute = join(this.root, prefix);
          const metadata = await (this.options.lstat ?? lstat)(absolute); current();
          let eligible = metadata.isDirectory() && !metadata.isSymbolicLink();
          if (eligible) { eligible = await realpath(absolute) === absolute; current(); }
          if (eligible) { eligible = !await hasRepositoryMarker(absolute); current(); }
          directories.set(prefix, eligible);
        }
        if (!directories.get(prefix)) return false;
      }
      current(); if (Date.now() >= deadline) return false;
      const absolute = join(this.root, path);
      const file = await (this.options.lstat ?? lstat)(absolute); current();
      if (!file.isFile()) return false;
      const canonical = await realpath(absolute); current();
      return canonical === absolute;
    } catch (error) {
      current();
      const code = (error as NodeJS.ErrnoException).code;
      if (["ENOENT", "ENOTDIR", "ELOOP"].includes(code ?? "")) return false;
      throw new RepositoryError("REPOSITORY_SEARCH_UNAVAILABLE", "Search metadata could not be checked; use Refresh or exact Open path");
    }
  }
}
