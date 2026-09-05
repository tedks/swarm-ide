import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_CHANGED_FILES = 10_000;
const MAX_CHANGED_BYTES = 64 * 1024 * 1024;

function gitStatus(workspaceRoot: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["status", "--porcelain=v2", "-z", "--branch", "--no-ahead-behind", "--untracked-files=all", "--no-renames"],
      { cwd: workspaceRoot, encoding: "buffer", maxBuffer: MAX_GIT_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git status failed: ${Buffer.from(stderr).toString("utf8").trim() || error.message}`));
          return;
        }
        resolve(Buffer.from(stdout));
      },
    );
  });
}

function validateGitPath(path: string): void {
  if (!path || isAbsolute(path) || path.includes("\0") || path.includes("\\") || posix.normalize(path) !== path || path.split("/").includes("..")) {
    throw new Error(`git reported a non-canonical workspace path: ${JSON.stringify(path)}`);
  }
}

function afterSpaces(record: string, count: number): string {
  let cursor = -1;
  for (let index = 0; index < count; index += 1) {
    cursor = record.indexOf(" ", cursor + 1);
    if (cursor < 0) throw new Error("git status returned a truncated record");
  }
  return record.slice(cursor + 1);
}

function framed(hash: ReturnType<typeof createHash>, value: string | Buffer): void {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

async function readCanonicalWorkspaceBytes(workspaceRoot: string, path: string, maximumBytes: number): Promise<Buffer> {
  const root = await realpath(workspaceRoot);
  const expected = resolve(root, path);
  const handle = await open(expected, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await realpath(`/proc/self/fd/${handle.fd}`);
    const actualRelative = relative(root, actual).split(sep).join("/");
    if (actualRelative !== path || isAbsolute(actualRelative) || actualRelative.startsWith("../")) {
      throw new Error(`changed file escaped its canonical workspace path: ${path}`);
    }
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) throw new Error("changed working-world content exceeds the fingerprint bound");
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset <= maximumBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, offset);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (offset > maximumBytes) throw new Error("changed working-world content exceeds the fingerprint bound");
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error(`changed file mutated while fingerprinting: ${path}`);
    }
    return Buffer.concat(chunks, offset);
  } finally {
    await handle.close();
  }
}

export async function computeWorkingWorldFingerprint(workspaceRoot: string): Promise<string> {
  const output = await gitStatus(workspaceRoot);
  let statusText: string;
  try {
    statusText = new TextDecoder("utf8", { fatal: true }).decode(output);
  } catch {
    throw new Error("git status returned a path that is not valid UTF-8");
  }
  const records = statusText.split("\0").filter(Boolean);
  const oidRecord = records.find((record) => record.startsWith("# branch.oid "));
  const head = oidRecord?.slice("# branch.oid ".length);
  if (!head || !/^[a-f0-9]{40,64}$/.test(head)) throw new Error("git status returned an invalid HEAD revision");

  const changes: Array<{ record: string; path: string; originalPath?: string }> = [];
  let index = 0;
  while (index < records.length) {
    const record = records[index]!;
    index += 1;
    if (record.startsWith("# ")) continue;
    if (record.startsWith("1 ")) changes.push({ record, path: afterSpaces(record, 8) });
    else if (record.startsWith("2 ")) {
      const originalPath = records[index];
      if (!originalPath) throw new Error("git status omitted the original rename path");
      index += 1;
      changes.push({ record, path: afterSpaces(record, 9), originalPath });
    } else if (record.startsWith("u ")) changes.push({ record, path: afterSpaces(record, 10) });
    else if (record.startsWith("? ")) changes.push({ record, path: record.slice(2) });
    else throw new Error(`git status returned an unsupported record type: ${record.slice(0, 1)}`);
  }
  if (changes.length > MAX_CHANGED_FILES) throw new Error("working world has too many changed files to fingerprint safely");

  const hash = createHash("sha256");
  hash.update("swarm-working-world-v2\0");
  framed(hash, head);
  const observedChanges: Array<{ change: (typeof changes)[number]; kind: string; mode: string; bytes: Buffer }> = [];
  let totalBytes = 0;
  for (const change of changes) {
    validateGitPath(change.path);
    if (change.originalPath) validateGitPath(change.originalPath);
    const absolutePath = `${workspaceRoot}/${change.path}`;
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        observedChanges.push({ change, kind: "deleted", mode: "", bytes: Buffer.alloc(0) });
        continue;
      }
      throw error;
    }
    let bytes: Buffer;
    let kind: string;
    if (metadata.isSymbolicLink()) {
      kind = "symlink";
      bytes = Buffer.from(await readlink(absolutePath), "utf8");
    } else if (metadata.isFile()) {
      kind = "file";
      if (metadata.size > MAX_CHANGED_BYTES - totalBytes) throw new Error("changed working-world content exceeds the fingerprint bound");
      bytes = await readCanonicalWorkspaceBytes(workspaceRoot, change.path, MAX_CHANGED_BYTES - totalBytes);
    } else {
      throw new Error(`changed path is not a regular file or symbolic link: ${change.path}`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_CHANGED_BYTES) throw new Error("changed working-world content exceeds the fingerprint bound");
    observedChanges.push({ change, kind, mode: (metadata.mode & 0o777).toString(8), bytes });
  }
  for (const { change, kind, mode, bytes } of observedChanges) {
    framed(hash, "status");
    framed(hash, change.record);
    framed(hash, change.originalPath ?? "");
    framed(hash, kind);
    framed(hash, mode);
    framed(hash, bytes);
  }
  return hash.digest("hex");
}
