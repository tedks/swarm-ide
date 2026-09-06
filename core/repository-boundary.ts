import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { isRepositoryPath } from "../protocol/repository";

export class RepositoryBoundaryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RepositoryBoundaryError";
  }
}

export interface GitQueryOptions {
  input?: Buffer;
  signal?: AbortSignal;
  maximumBytes?: number;
  timeoutMs?: number;
  allowNoMatches?: boolean;
  onBytes?: (bytes: number) => void;
}

/** Read-only Git plumbing. Bound both output streams and the complete process lifetime. */
export function queryRepositoryGit(root: string, args: string[], options: GitQueryOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("Repository query cancelled")); return; }
    const environment = { ...process.env };
    // The registered root, never inherited GIT_DIR/INDEX_FILE/config injection, owns this query.
    for (const key of Object.keys(environment)) if (key.startsWith("GIT_")) delete environment[key];
    const child = spawn("git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args], {
      cwd: root,
      env: { ...environment, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill("SIGKILL");
    };
    const cancel = () => stop("Repository query cancelled");
    const timer = setTimeout(() => stop("Repository Git query exceeded its deadline"), options.timeoutMs ?? 2_000);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const consume = (chunk: Buffer, retain: boolean) => {
      bytes += chunk.byteLength;
      options.onBytes?.(chunk.byteLength);
      if (bytes > (options.maximumBytes ?? 1024 * 1024)) stop("Repository Git output exceeded its bound");
      else if (retain && !failure) chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => consume(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, false));
    child.stdin.on("error", () => { /* A bounded child may close stdin before consuming the list. */ });
    child.once("error", () => { failure ??= new Error("Repository Git query could not start"); });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (failure || (code !== 0 && !(code === 1 && options.allowNoMatches))) reject(failure ?? new Error("Repository Git query failed"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(options.input);
  });
}

/** Positive pathspecs are literal; exclusions prevent directory operands expanding descendants. */
export function exactIndexArguments(paths: readonly string[], directories: readonly string[]): string[] {
  const escapeGlob = (path: string) => path.replace(/[\\*?\[\]]/g, "\\$&");
  return ["ls-files", "--stage", "-z", "--", ...paths.map((path) => `:(top,literal)${path}`),
    ...directories.map((path) => `:(top,exclude,glob)${escapeGlob(path)}/**`)];
}

export function parseIndexRecords(bytes: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  for (const raw of bytes.toString("utf8").split("\0")) {
    if (!raw) continue;
    const record = /^(\d{6}) [a-f0-9]{40,64} [0-3]\t([\s\S]+)$/.exec(raw);
    if (!record) throw new Error("Invalid bounded index record");
    // Stage conflicts cannot hide a gitlink behind a later regular-file entry.
    if (records.get(record[2]!) !== "160000") records.set(record[2]!, record[1]!);
  }
  return records;
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

/** No config interpretation: any .git marker (even a broken link) denotes an opaque boundary. */
export async function hasRepositoryMarker(directory: string): Promise<boolean> {
  if (await exists(join(directory, ".git"))) return true;
  // Bare repositories have no .git child. Be conservative without reading their config.
  return await exists(join(directory, "HEAD")) && await exists(join(directory, "objects")) && await exists(join(directory, "refs"));
}

/** Validate every directory prefix; the root's own Git administration is intentionally allowed. */
export async function assertRepositoryBoundary(root: string, path: string, directory = false, signal?: AbortSignal): Promise<void> {
  if (!isRepositoryPath(path, directory)) throw new RepositoryBoundaryError("INVALID_PATH", "A canonical repository path outside Git administration is required");
  const parts = path.split("/").filter(Boolean);
  if (!directory) parts.pop();
  const prefixes = parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
  for (const prefix of prefixes) {
    if (signal?.aborted) throw new RepositoryBoundaryError("REPOSITORY_CANCELLED", "Repository navigation was cancelled");
    if (await hasRepositoryMarker(join(root, prefix)))
      throw new RepositoryBoundaryError("REPOSITORY_BOUNDARY", "Nested repositories and submodules are not editable through this repository");
  }
  // File-broker tests and callers may use non-Git roots; marker enforcement still applies there.
  if (!prefixes.length || !(await exists(join(root, ".git")))) return;
  // Query prefixes separately: excluding outer/** must never hide outer/submodule.
  // The whole path has one deadline/output budget, not one fresh budget per ancestor.
  const deadline = Date.now() + 2_000;
  let remainingBytes = 1024 * 1024;
  for (const prefix of prefixes) {
    let index: Map<string, string>;
    try {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0 || remainingBytes <= 0) throw new Error("Boundary query exceeded its bound");
      const bytes = await queryRepositoryGit(root, exactIndexArguments([prefix], [prefix]), {
        signal, timeoutMs: remainingMs, maximumBytes: remainingBytes, onBytes: (count) => { remainingBytes -= count; },
      });
      index = parseIndexRecords(bytes);
    } catch { throw new RepositoryBoundaryError("REPOSITORY_BOUNDARY_UNAVAILABLE", "Repository boundary verification is unavailable; retry before opening this path"); }
    if (index.get(prefix) === "160000") throw new RepositoryBoundaryError("REPOSITORY_BOUNDARY", "Submodules are not editable through this repository");
  }
}
