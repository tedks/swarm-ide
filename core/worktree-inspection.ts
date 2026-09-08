import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { Registry } from "./external-agents-registry";
import { readWorkspaceFile, WorkspaceFileError } from "./files";
import { queryRepositoryGit } from "./repository-boundary";
import { WorktreeInspectionRequestSchema, WorktreeInspectionResultSchema,
  type WorktreeInspectionRequest, type WorktreeInspectionResult } from "../protocol/worktree-inspection";

const REGISTRY_BYTES = 65_536;
const inside = (root: string, path: string) => {
  const child = relative(root, path);
  return child === "" || !isAbsolute(child) && child !== ".." && !child.startsWith("../");
};

/** Read-only inspection of the operator's registered worktree, never a renderer-selected root.
 * The diff is current HEAD-to-worktree state, not attribution to a particular agent turn. */
export async function inspectRegisteredWorktree(
  workspaceRoot: string,
  registryPath: string | undefined,
  input: WorktreeInspectionRequest,
  signal?: AbortSignal,
): Promise<WorktreeInspectionResult> {
  const request = WorktreeInspectionRequestSchema.parse(input);
  const check = () => { if (signal?.aborted) throw new Error("Worktree inspection stopped."); };
  check();
  if (!registryPath || !isAbsolute(registryPath) || registryPath.includes("\0"))
    throw new Error("Register the agent's worktree before opening its files.");
  const workspace = await realpath(workspaceRoot);
  if (inside(workspace, registryPath) || await realpath(registryPath) !== registryPath)
    throw new Error("Use the private agent registry outside the repository.");
  check();
  const file = await open(registryPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let registrations;
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.uid !== process.getuid?.() || metadata.mode & 0o077 || metadata.size > REGISTRY_BYTES)
      throw new Error("The agent registry must be an owner-only regular file.");
    const bytes = Buffer.alloc(REGISTRY_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > REGISTRY_BYTES) throw new Error("The agent registry is too large.");
    registrations = Registry.parse(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
  } finally { await file.close(); }
  check();
  const row = registrations.sessions.find((candidate) => candidate.id === request.sessionId);
  if (!row?.contextRoot || !isAbsolute(row.contextRoot) || row.contextRoot.includes("\0"))
    throw new Error("This agent has no registered worktree. Refresh the agent registration.");
  const root = await realpath(row.contextRoot);
  if (root !== row.contextRoot || inside(root, registryPath))
    throw new Error("The registered worktree changed. Refresh the agent registration.");
  check();
  let content: string | null = null;
  try { content = (await readWorkspaceFile(root, request.path)).content; }
  catch (error) {
    if (!(error instanceof WorkspaceFileError && error.code === "FILE_NOT_FOUND")) throw error;
  }
  check();
  let diff = "", diffNotice: string | undefined;
  try {
    const bytes = await queryRepositoryGit(root, ["--no-pager", "--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv",
      "--no-color", "HEAD", "--", request.path], { signal, maximumBytes: 256 * 1024, timeoutMs: 2_000 });
    diff = bytes.toString("utf8");
  } catch {
    check();
    diffNotice = "Worktree diff unavailable; the repository may have no commit or the diff exceeded its limit.";
  }
  check();
  if (content === null && !diff) throw new Error("This file is missing and no worktree diff is available.");
  return WorktreeInspectionResultSchema.parse({ sessionId: request.sessionId, path: request.path,
    label: row.label, worktree: root, content, diff, ...(diffNotice ? { diffNotice } : {}) });
}
