import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import {
  GitObjectIdSchema, TASK_LIMITS, TASK_METADATA_REF, TaskIdSchema,
  type GitObjectId, type TaskError,
} from "../../protocol/tasks";

/** Messages are fixed diagnostics, never Git stderr, paths or object contents. */
export class TaskReaderError extends Error {
  constructor(readonly code: TaskError["code"], message: string) {
    super(message);
    this.name = "TaskReaderError";
  }
}

type MetadataBlob = { id: string | null; blob: GitObjectId; bytes: Uint8Array };
type TreeEntry = { mode: string; type: string; oid: GitObjectId; name: string };
const malformed = () => new TaskReaderError("TASK_METADATA_MALFORMED", "Metadata Git structure is unsupported or malformed.");
const unavailable = () => new TaskReaderError("TASK_METADATA_UNAVAILABLE", "Required local metadata objects are unavailable.");
const limited = () => new TaskReaderError("TASK_LIMIT_EXCEEDED", "Metadata Git input exceeds the supported limit.");
const failed = () => new TaskReaderError("TASK_OBSERVATION_FAILED", "Metadata Git read failed or exceeded its deadline.");
const decoder = new TextDecoder("utf-8", { fatal: true });
const TREE_BYTES = 128 * 1024;
const STDERR_BYTES = 16 * 1024;
// Resolve once from the trusted core startup PATH, never a working-directory
// relative entry or a PATH subsequently supplied while handling a request.
const GIT_EXECUTABLE = (process.env.PATH ?? "").split(delimiter).filter(isAbsolute).map((directory) => {
  try {
    const candidate = realpathSync(join(directory, "git"));
    accessSync(candidate, constants.X_OK);
    return candidate;
  } catch { return null; }
}).find((candidate) => candidate !== null);

function text(bytes: Uint8Array): string {
  try { return decoder.decode(bytes); } catch { throw malformed(); }
}
function oid(hex: string): GitObjectId {
  const result = GitObjectIdSchema.safeParse({ algorithm: hex.length === 40 ? "sha1" : "sha256", hex });
  if (!result.success) throw malformed();
  return result.data;
}
function checkObject(bytes: Buffer, type: string, object: GitObjectId): void {
  const actual = createHash(object.algorithm).update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
  if (actual !== object.hex) throw malformed();
}
function treeEntries(bytes: Buffer, algorithm: GitObjectId["algorithm"]): TreeEntry[] {
  const names = new Set<string>();
  const entries: TreeEntry[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const end = bytes.indexOf(0, offset);
    if (end < 0) throw malformed();
    const match = /^(40000|100644|100755|120000|160000) (.+)$/u.exec(text(bytes.subarray(offset, end)));
    if (!match) throw malformed();
    const [, mode, name] = match;
    const hashLength = algorithm === "sha1" ? 20 : 32;
    offset = end + 1;
    if (offset + hashLength > bytes.length) throw malformed();
    const object = oid(bytes.subarray(offset, offset + hashLength).toString("hex"));
    offset += hashLength;
    if (names.has(name!) || /[/\\\p{Cc}\p{Cf}]/u.test(name!) ||
        name === "." || name === "..") throw malformed();
    names.add(name!);
    entries.push({ mode: mode!, type: mode === "40000" ? "tree" : mode === "160000" ? "commit" : "blob", oid: object, name: name! });
  }
  return entries;
}

/**
 * Only fixed read-only Git plumbing is used. Git still parses repository config:
 * malformed/blocked includes fail within the process deadline. These commands do
 * not request hooks, filters, textconv, external diff, credentials or maintenance.
 * The executable/PATH are trusted local-core installation authority, not metadata.
 */
export class TaskGitReader {
  constructor(private readonly root: string) {
    if (!isAbsolute(root) || root.includes("\0") || !GIT_EXECUTABLE) throw failed();
  }

  private command(args: readonly string[], signal: AbortSignal, deadline: number,
    maximum: number, input?: string): Promise<{ code: number | null; stdout: Buffer }> {
    if (signal.aborted || !Number.isFinite(deadline) || deadline <= Date.now()) return Promise.reject(failed());
    return new Promise((resolve, reject) => {
      // Do not inherit GIT_DIR/WORK_TREE/CONFIG_COUNT, alternate databases,
      // trace targets, SSH/askpass, proxy settings, or caller-supplied config.
      const child = spawn(GIT_EXECUTABLE!, ["--no-pager", "--no-replace-objects", "--no-lazy-fetch",
        "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
        "-c", "core.askPass=", "-c", "credential.helper=", "-c", "protocol.allow=never",
        "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], {
        cwd: this.root, detached: true, stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: "/dev/null", LANG: "C", LC_ALL: "C", HOME: "/dev/null", XDG_CONFIG_HOME: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1",
          GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_PROTOCOL_FROM_USER: "0" },
      });
      let error: TaskReaderError | undefined;
      let length = 0;
      let stderrLength = 0;
      const chunks: Buffer[] = [];
      const kill = (reason: TaskReaderError) => {
        error ??= reason;
        if (child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
      };
      const abort = () => kill(failed());
      const timer = setTimeout(abort, Math.min(TASK_LIMITS.commandMs, deadline - Date.now()));
      signal.addEventListener("abort", abort, { once: true });
      child.on("error", () => { error ??= failed(); });
      child.stdout.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > maximum) kill(limited());
        else if (!error) chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrLength += chunk.length;
        if (stderrLength > STDERR_BYTES) kill(limited());
      });
      child.stdin.on("error", () => { /* close/error carries process outcome */ });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error || signal.aborted || Date.now() > deadline) reject(error ?? failed());
        else resolve({ code, stdout: Buffer.concat(chunks, length) });
      });
      child.stdin.end(input);
      if (signal.aborted) abort();
    });
  }

  async resolve(signal: AbortSignal, deadline: number): Promise<GitObjectId | null> {
    deadline = Math.min(deadline, Date.now() + TASK_LIMITS.observationMs);
    const result = await this.command(["rev-parse", "--verify", "--quiet", "--end-of-options", TASK_METADATA_REF], signal, deadline, 128);
    if (result.code === 1 && result.stdout.length === 0) return null;
    if (result.code !== 0) throw failed();
    return oid(text(result.stdout).replace(/\n$/, ""));
  }

  async scan(commit: GitObjectId, signal: AbortSignal, deadline: number): Promise<MetadataBlob[]> {
    deadline = Math.min(deadline, Date.now() + TASK_LIMITS.observationMs);
    if (!GitObjectIdSchema.safeParse(commit).success) throw malformed();
    const kind = await this.command(["cat-file", "-t", commit.hex], signal, deadline, 32);
    if (kind.code !== 0 || text(kind.stdout) !== "commit\n") throw unavailable();
    const object = async (type: "commit" | "tree", id: GitObjectId): Promise<Buffer> => {
      const size = await this.command(["cat-file", "-s", id.hex], signal, deadline, 32);
      if (size.code !== 0) throw unavailable();
      const sizeText = text(size.stdout);
      if (!/^(0|[1-9][0-9]*)\n$/.test(sizeText)) throw malformed();
      if (!Number.isSafeInteger(Number(sizeText)) || Number(sizeText) > TREE_BYTES) throw limited();
      const result = await this.command(["cat-file", type, id.hex], signal, deadline, TREE_BYTES);
      if (result.code !== 0) throw unavailable();
      if (result.stdout.length !== Number(sizeText)) throw malformed();
      checkObject(result.stdout, type, id);
      return result.stdout;
    };
    const commitBytes = await object("commit", commit);
    const firstNewline = commitBytes.indexOf(10);
    if (firstNewline < 0) throw malformed();
    const firstLine = text(commitBytes.subarray(0, firstNewline));
    const tree = /^tree ([a-f0-9]+)$/.exec(firstLine);
    if (!tree) throw malformed();
    const rootId = oid(tree[1]!);
    if (rootId.algorithm !== commit.algorithm) throw malformed();
    const rootEntries = treeEntries(await object("tree", rootId), commit.algorithm);
    const directory = rootEntries.find((entry) => entry.name === ".ditz");
    if (!directory) throw unavailable();
    if (directory.type !== "tree" || directory.mode !== "40000") throw malformed();
    const entries = treeEntries(await object("tree", directory.oid), commit.algorithm);
    const project = entries.find((entry) => entry.name === "project.yaml");
    if (!project) throw unavailable();
    const selected: Array<{ id: string | null; blob: GitObjectId }> = [];
    for (const entry of entries) {
      // No nested metadata or special entries, even where not selected as issues.
      if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw malformed();
      if (entry.name === "project.yaml") selected.push({ id: null, blob: entry.oid });
      else if (entry.name.startsWith("issue-")) {
        const match = /^issue-([A-Za-z0-9_-]+)\.yaml$/.exec(entry.name);
        if (!match || !TaskIdSchema.safeParse(match[1]).success) throw malformed();
        selected.push({ id: match[1]!, blob: entry.oid });
      }
    }
    if (selected.length > TASK_LIMITS.issues + 1) throw limited();
    selected.sort((a, b) => a.id === null ? -1 : b.id === null ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const input = selected.map((entry) => `${entry.blob.hex}\n`).join("");
    const sizes = await this.command(["cat-file", "--batch-check"], signal, deadline, 32 * 1024, input);
    if (sizes.code !== 0) throw unavailable();
    const lines = text(sizes.stdout).split("\n");
    if (lines.pop() !== "" || lines.length !== selected.length) throw malformed();
    let total = 0;
    const lengths = lines.map((line, index) => {
      const match = /^([a-f0-9]+) blob (0|[1-9][0-9]*)$/.exec(line);
      if (!match || match[1] !== selected[index]!.blob.hex) throw unavailable();
      const length = Number(match[2]);
      if (!Number.isSafeInteger(length) || length > TASK_LIMITS.blobBytes) throw limited();
      total += length;
      if (total > TASK_LIMITS.inputBytes) throw limited();
      return length;
    });
    const data = await this.command(["cat-file", "--batch"], signal, deadline, total + 32 * 1024, input);
    if (data.code !== 0) throw unavailable();
    let offset = 0;
    const result = selected.map((entry, index) => {
      const header = Buffer.from(`${entry.blob.hex} blob ${lengths[index]}\n`);
      if (!data.stdout.subarray(offset, offset + header.length).equals(header)) throw unavailable();
      offset += header.length;
      const end = offset + lengths[index]!;
      if (end >= data.stdout.length || data.stdout[end] !== 10) throw malformed();
      const bytes = data.stdout.subarray(offset, end);
      checkObject(bytes, "blob", entry.blob);
      offset = end + 1;
      return { ...entry, bytes };
    });
    if (offset !== data.stdout.length) throw malformed();
    return result;
  }
}
