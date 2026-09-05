import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_EDITABLE_FILE_BYTES, type FileResult } from "../protocol/schema";
import { computeWorkingWorldFingerprint } from "./fingerprint";

export class WorkspaceFileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "WorkspaceFileError";
  }
}

function revision(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function validateRelativePath(path: string): void {
  if (
    !path ||
    path.includes("\0") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path === "." ||
    path.startsWith(`.${sep}`) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new WorkspaceFileError("INVALID_PATH", "The file path must be a canonical workspace-relative path");
  }
}

function contained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot !== "" && !fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot);
}

export async function resolveWorkspaceFile(workspaceRoot: string, path: string): Promise<{ absolutePath: string; path: string }> {
  validateRelativePath(path);
  const root = await realpath(workspaceRoot);
  const requested = resolve(root, path);
  if (!contained(root, requested)) throw new WorkspaceFileError("PATH_ESCAPE", "The file path escapes the opened workspace");
  let canonical: string;
  try {
    canonical = await realpath(requested);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceFileError("FILE_NOT_FOUND", `No workspace file exists at ${path}`);
    throw error;
  }
  if (!contained(root, canonical)) throw new WorkspaceFileError("SYMLINK_ESCAPE", "The file resolves outside the opened workspace");
  const canonicalRelative = relative(root, canonical).split(sep).join("/");
  if (canonicalRelative !== path) throw new WorkspaceFileError("NON_CANONICAL_PATH", "Symbolic-link aliases are not editable workspace files");
  const metadata = await lstat(canonical);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new WorkspaceFileError("NOT_REGULAR_FILE", "Only canonical regular files can be opened");
  if (metadata.size > MAX_EDITABLE_FILE_BYTES) throw new WorkspaceFileError("FILE_TOO_LARGE", `Files larger than ${MAX_EDITABLE_FILE_BYTES} bytes cannot be opened`);
  return { absolutePath: canonical, path: canonicalRelative };
}

async function readUtf8(absolutePath: string): Promise<{ bytes: Buffer; content: string }> {
  const bytes = await readFile(absolutePath);
  if (bytes.byteLength > MAX_EDITABLE_FILE_BYTES) throw new WorkspaceFileError("FILE_TOO_LARGE", `Files larger than ${MAX_EDITABLE_FILE_BYTES} bytes cannot be opened`);
  if (bytes.includes(0)) throw new WorkspaceFileError("BINARY_FILE", "Binary files cannot be opened in the source observatory");
  try {
    return { bytes, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    throw new WorkspaceFileError("INVALID_UTF8", "The file is not valid UTF-8 text");
  }
}

export async function readWorkspaceFile(workspaceRoot: string, path: string): Promise<Extract<FileResult, { kind: "read" }>> {
  const resolved = await resolveWorkspaceFile(workspaceRoot, path);
  const { bytes, content } = await readUtf8(resolved.absolutePath);
  return { kind: "read", path: resolved.path, content, revision: revision(bytes), size: bytes.byteLength };
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  path: string,
  expectedRevision: string,
  content: string,
): Promise<Extract<FileResult, { kind: "write" }>> {
  const contentBytes = Buffer.from(content, "utf8");
  if (contentBytes.byteLength > MAX_EDITABLE_FILE_BYTES) throw new WorkspaceFileError("FILE_TOO_LARGE", `Files larger than ${MAX_EDITABLE_FILE_BYTES} bytes cannot be saved`);
  if (content.includes("\0")) throw new WorkspaceFileError("BINARY_FILE", "NUL bytes are not allowed in source text");
  const resolved = await resolveWorkspaceFile(workspaceRoot, path);
  const before = await readUtf8(resolved.absolutePath);
  if (revision(before.bytes) !== expectedRevision) throw new WorkspaceFileError("REVISION_CONFLICT", "The file changed outside this editor; your buffer was preserved");
  const metadata = await stat(resolved.absolutePath);
  const parent = dirname(resolved.absolutePath);
  const temporary = `${resolved.absolutePath}.swarm-save-${randomUUID()}`;
  let temporaryCreated = false;
  try {
    const handle = await open(temporary, "wx", metadata.mode & 0o777);
    temporaryCreated = true;
    try {
      await handle.writeFile(contentBytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, metadata.mode & 0o777);

    const current = await readUtf8(resolved.absolutePath);
    if (revision(current.bytes) !== expectedRevision) throw new WorkspaceFileError("REVISION_CONFLICT", "The file changed while it was being saved; your buffer was preserved");
    const parentCanonical = await realpath(parent);
    if (parentCanonical !== parent) throw new WorkspaceFileError("PATH_CHANGED", "The file's parent path changed during save");
    await rename(temporary, resolved.absolutePath);
    temporaryCreated = false;
    const directory = await open(parent, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    if (temporaryCreated) await unlink(temporary).catch(() => undefined);
  }
  return {
    kind: "write",
    path: resolved.path,
    revision: revision(contentBytes),
    workingFingerprint: await computeWorkingWorldFingerprint(workspaceRoot),
  };
}
