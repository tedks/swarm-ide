import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { isAbsolute, posix } from "node:path";

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_CHANGED_FILES = 10_000;
const MAX_CHANGED_BYTES = 64 * 1024 * 1024;

function gitStatus(workspaceRoot: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["status", "--porcelain=v2", "-z", "--branch", "--no-ahead-behind", "--untracked-files=all"],
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

export async function computeWorkingWorldFingerprint(workspaceRoot: string): Promise<string> {
  const output = await gitStatus(workspaceRoot);
  const records = output.toString("utf8").split("\0").filter(Boolean);
  const oidRecord = records.find((record) => record.startsWith("# branch.oid "));
  const head = oidRecord?.slice("# branch.oid ".length);
  if (!head || !/^[a-f0-9]{40,64}$/.test(head)) throw new Error("git status returned an invalid HEAD revision");

  const changes: Array<{ record: string; path: string; originalPath?: string }> = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.startsWith("# ")) continue;
    if (record.startsWith("1 ")) changes.push({ record, path: afterSpaces(record, 8) });
    else if (record.startsWith("2 ")) {
      const originalPath = records[++index];
      if (!originalPath) throw new Error("git status omitted the original rename path");
      changes.push({ record, path: afterSpaces(record, 9), originalPath });
    } else if (record.startsWith("u ")) changes.push({ record, path: afterSpaces(record, 10) });
    else if (record.startsWith("? ")) changes.push({ record, path: record.slice(2) });
    else throw new Error(`git status returned an unsupported record type: ${record.slice(0, 1)}`);
  }
  if (changes.length > MAX_CHANGED_FILES) throw new Error("working world has too many changed files to fingerprint safely");

  const hash = createHash("sha256");
  hash.update("swarm-working-world-v1\0");
  hash.update(head);
  const observedChanges = await Promise.all(changes.map(async (change) => {
    validateGitPath(change.path);
    if (change.originalPath) validateGitPath(change.originalPath);
    const absolutePath = `${workspaceRoot}/${change.path}`;
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { change, kind: "deleted", mode: "", bytes: Buffer.alloc(0) };
      throw error;
    }
    let bytes: Buffer;
    let kind: string;
    if (metadata.isSymbolicLink()) {
      kind = "symlink";
      bytes = Buffer.from(await readlink(absolutePath), "utf8");
    } else if (metadata.isFile()) {
      kind = "file";
      bytes = await readFile(absolutePath);
    } else {
      throw new Error(`changed path is not a regular file or symbolic link: ${change.path}`);
    }
    return { change, kind, mode: (metadata.mode & 0o777).toString(8), bytes };
  }));
  const totalBytes = observedChanges.reduce((total, item) => total + item.bytes.byteLength, 0);
  if (totalBytes > MAX_CHANGED_BYTES) throw new Error("changed working-world content exceeds the fingerprint bound");
  for (const { change, kind, mode, bytes } of observedChanges) {
    hash.update("\0status\0");
    hash.update(change.record);
    if (change.originalPath) { hash.update("\0rename-from\0"); hash.update(change.originalPath); }
    hash.update("\0");
    hash.update(kind);
    hash.update("\0");
    hash.update(mode);
    hash.update("\0");
    hash.update(bytes);
  }
  return hash.digest("hex");
}
