import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { MAX_EDITABLE_FILE_BYTES, type FileResult } from "../protocol/schema";
import { computeWorkingWorldFingerprint } from "./fingerprint";

export class WorkspaceFileError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "WorkspaceFileError";
  }
}

interface OpenedWorkspaceFile {
  handle: FileHandle;
  absolutePath: string;
  path: string;
}

export interface WorkspaceReadHooks {
  afterValidatedOpen?(): Promise<void>;
}

const saveQueues = new Map<string, Promise<void>>();

function revision(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function rejectBinaryControlBytes(bytes: Buffer): void {
  if (bytes.includes(0) || bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
    throw new WorkspaceFileError("BINARY_FILE", "Binary control bytes are not allowed in the source observatory");
  }
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

function contained(root: string, candidate: string, allowRoot = false): boolean {
  const fromRoot = relative(root, candidate);
  if (fromRoot === "") return allowRoot;
  return !fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot);
}

function missingFile(path: string, error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new WorkspaceFileError("FILE_NOT_FOUND", `No workspace file exists at ${path}`);
  if (code === "ELOOP") throw new WorkspaceFileError("SYMLINK_ESCAPE", "Symbolic links are not source-observatory files");
  throw error;
}

async function descriptorPath(handle: FileHandle): Promise<string> {
  return realpath(`/proc/self/fd/${handle.fd}`);
}

async function readBoundedHandle(handle: FileHandle, maximumBytes: number, tooLargeMessage: string): Promise<Buffer> {
  const before = await handle.stat({ bigint: true });
  if (!before.isFile()) throw new WorkspaceFileError("NOT_REGULAR_FILE", "Only regular files can be opened");
  if (before.size > BigInt(maximumBytes)) throw new WorkspaceFileError("FILE_TOO_LARGE", tooLargeMessage);
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset <= maximumBytes) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - offset));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, offset);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    offset += bytesRead;
  }
  if (offset > maximumBytes) throw new WorkspaceFileError("FILE_TOO_LARGE", tooLargeMessage);
  const after = await handle.stat({ bigint: true });
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new WorkspaceFileError("FILE_CHANGED", "The file changed while it was being read; retry the operation");
  }
  return Buffer.concat(chunks, offset);
}

async function openWorkspaceFile(
  workspaceRoot: string,
  path: string,
  maximumBytes = MAX_EDITABLE_FILE_BYTES,
): Promise<OpenedWorkspaceFile> {
  validateRelativePath(path);
  const root = await realpath(workspaceRoot);
  const requested = resolve(root, path);
  if (!contained(root, requested)) throw new WorkspaceFileError("PATH_ESCAPE", "The file path escapes the opened workspace");
  let handle: FileHandle;
  try {
    handle = await open(requested, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    missingFile(path, error);
  }
  try {
    const canonical = await descriptorPath(handle);
    if (!contained(root, canonical)) throw new WorkspaceFileError("SYMLINK_ESCAPE", "The opened file resolves outside the workspace");
    const canonicalRelative = relative(root, canonical).split(sep).join("/");
    if (canonicalRelative !== path) throw new WorkspaceFileError("NON_CANONICAL_PATH", "Symbolic-link aliases are not source-observatory files");
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new WorkspaceFileError("NOT_REGULAR_FILE", "Only canonical regular files can be opened");
    if (metadata.size > maximumBytes) throw new WorkspaceFileError("FILE_TOO_LARGE", `Files larger than ${maximumBytes} bytes cannot be opened`);
    return { handle, absolutePath: canonical, path: canonicalRelative };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readUtf8(handle: FileHandle): Promise<{ bytes: Buffer; content: string }> {
  const bytes = await readBoundedHandle(handle, MAX_EDITABLE_FILE_BYTES, `Files larger than ${MAX_EDITABLE_FILE_BYTES} bytes cannot be opened`);
  rejectBinaryControlBytes(bytes);
  try {
    return { bytes, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    throw new WorkspaceFileError("INVALID_UTF8", "The file is not valid UTF-8 text");
  }
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = saveQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  saveQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (saveQueues.get(key) === current) saveQueues.delete(key);
  }
}

export async function resolveWorkspaceFile(workspaceRoot: string, path: string): Promise<{ absolutePath: string; path: string }> {
  const opened = await openWorkspaceFile(workspaceRoot, path);
  try {
    return { absolutePath: opened.absolutePath, path: opened.path };
  } finally {
    await opened.handle.close();
  }
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  path: string,
  hooks: WorkspaceReadHooks = {},
): Promise<Extract<FileResult, { kind: "read" }>> {
  const opened = await openWorkspaceFile(workspaceRoot, path);
  try {
    await hooks.afterValidatedOpen?.();
    const { bytes, content } = await readUtf8(opened.handle);
    return { kind: "read", path: opened.path, content, revision: revision(bytes), size: bytes.byteLength };
  } finally {
    await opened.handle.close();
  }
}

export async function readCanonicalWorkspaceBytes(workspaceRoot: string, path: string, maximumBytes: number): Promise<Buffer> {
  const opened = await openWorkspaceFile(workspaceRoot, path, maximumBytes);
  try {
    return await readBoundedHandle(opened.handle, maximumBytes, `Files larger than ${maximumBytes} bytes cannot be read`);
  } finally {
    await opened.handle.close();
  }
}

export async function readBoundedRegularFile(path: string, maximumBytes: number, description: string): Promise<Buffer> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") throw new Error(`${description} must not be a symbolic link`);
    throw error;
  }
  try {
    return await readBoundedHandle(handle, maximumBytes, `${description} exceeds ${maximumBytes} bytes`);
  } finally {
    await handle.close();
  }
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  path: string,
  expectedRevision: string,
  content: string,
): Promise<Extract<FileResult, { kind: "write" }>> {
  const contentBytes = Buffer.from(content, "utf8");
  if (contentBytes.byteLength > MAX_EDITABLE_FILE_BYTES) throw new WorkspaceFileError("FILE_TOO_LARGE", `Files larger than ${MAX_EDITABLE_FILE_BYTES} bytes cannot be saved`);
  rejectBinaryControlBytes(contentBytes);
  if (contentBytes.toString("utf8") !== content) throw new WorkspaceFileError("INVALID_UTF8", "The source buffer contains invalid Unicode text");
  validateRelativePath(path);
  const root = await realpath(workspaceRoot);
  const requested = resolve(root, path);
  if (!contained(root, requested)) throw new WorkspaceFileError("PATH_ESCAPE", "The file path escapes the opened workspace");

  return serialized(requested, async () => {
    const requestedParent = dirname(requested);
    let directory: FileHandle;
    try {
      directory = await open(requestedParent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    } catch (error) {
      missingFile(path, error);
    }
    const descriptorDirectory = `/proc/self/fd/${directory.fd}`;
    const temporaryName = `.${basename(path)}.swarm-save-${randomUUID()}`;
    const temporary = `${descriptorDirectory}/${temporaryName}`;
    let temporaryCreated = false;
    try {
      const canonicalParent = await descriptorPath(directory);
      const expectedParent = dirname(path) === "." ? "" : dirname(path);
      if (!contained(root, canonicalParent, true) || relative(root, canonicalParent).split(sep).join("/") !== expectedParent) {
        throw new WorkspaceFileError("PATH_CHANGED", "The file's parent is no longer its canonical workspace directory");
      }
      const currentPath = `${descriptorDirectory}/${basename(path)}`;
      const current = await open(currentPath, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error) => missingFile(path, error));
      let mode = 0;
      try {
        const actual = await descriptorPath(current);
        if (actual !== resolve(canonicalParent, basename(path))) throw new WorkspaceFileError("PATH_CHANGED", "The opened file is no longer the requested canonical file");
        mode = (await current.stat()).mode & 0o777;
        const before = await readUtf8(current);
        if (revision(before.bytes) !== expectedRevision) throw new WorkspaceFileError("REVISION_CONFLICT", "The file changed outside this editor; your buffer was preserved");
      } finally {
        await current.close();
      }

      const temporaryHandle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        mode,
      );
      temporaryCreated = true;
      try {
        await temporaryHandle.writeFile(contentBytes);
        await temporaryHandle.chmod(mode);
        await temporaryHandle.sync();
      } finally {
        await temporaryHandle.close();
      }

      const latest = await open(currentPath, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error) => missingFile(path, error));
      try {
        const actual = await descriptorPath(latest);
        if (actual !== resolve(canonicalParent, basename(path))) throw new WorkspaceFileError("PATH_CHANGED", "The target changed identity during save");
        const currentContent = await readUtf8(latest);
        if (revision(currentContent.bytes) !== expectedRevision) throw new WorkspaceFileError("REVISION_CONFLICT", "The file changed while it was being saved; your buffer was preserved");
      } finally {
        await latest.close();
      }
      await rename(temporary, currentPath);
      temporaryCreated = false;
      await directory.sync();
      let workingFingerprint: string | null = null;
      let fingerprintError: string | undefined;
      try {
        workingFingerprint = await computeWorkingWorldFingerprint(workspaceRoot);
      } catch (error) {
        fingerprintError = `The file was saved, but its working-world fingerprint could not be refreshed: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 512);
      }
      return {
        kind: "write",
        path,
        revision: revision(contentBytes),
        workingFingerprint,
        ...(fingerprintError ? { fingerprintError } : {}),
      };
    } finally {
      if (temporaryCreated) await unlink(temporary).catch(() => undefined);
      await directory.close();
    }
  });
}
