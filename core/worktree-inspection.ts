import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { Registry } from "./external-agents-registry";
import { readWorkspaceFile, WorkspaceFileError } from "./files";
import { queryRepositoryGit } from "./repository-boundary";
import { RepositoryReader } from "./repository";
import { isRepositoryPath } from "../protocol/repository";
import { WorktreeBrowseRequestSchema, WorktreeBrowseResultSchema, type WorktreeBrowseRequest, type WorktreeBrowseResult, type WorktreeChange,
  WorktreeInspectionRequestSchema, WorktreeInspectionResultSchema,
  type WorktreeInspectionRequest, type WorktreeInspectionResult } from "../protocol/worktree-inspection";

const REGISTRY_BYTES = 65_536;
const inside = (root: string, path: string) => {
  const child = relative(root, path);
  return child === "" || !isAbsolute(child) && child !== ".." && !child.startsWith("../");
};

/** Read-only inspection of the operator's registered worktree, never a renderer-selected root.
 * The diff is current HEAD-to-worktree state, not attribution to a particular agent turn. */
async function registeredWorktree(
  workspaceRoot: string,
  registryPath: string | undefined,
  sessionId: string,
  signal?: AbortSignal,
) {
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
  const row = registrations.sessions.find((candidate) => candidate.id === sessionId);
  if (!row?.contextRoot || !isAbsolute(row.contextRoot) || row.contextRoot.includes("\0"))
    throw new Error("This agent has no registered worktree. Refresh the agent registration.");
  const root = await realpath(row.contextRoot);
  if (root !== row.contextRoot || inside(root, registryPath))
    throw new Error("The registered worktree changed. Refresh the agent registration.");
  check();
  return { root, row, check };
}

/** Resolve only local refs. A remote-tracking master is preferred because the
 * user's master checkout may deliberately lag the integration branch. */
async function comparisonBase(root: string, signal?: AbortSignal) {
  for (const ref of ["refs/remotes/origin/master", "refs/heads/master", "refs/remotes/origin/main", "refs/heads/main"]) {
    if (signal?.aborted) throw new Error("Worktree inspection stopped.");
    try {
      const oid = (await queryRepositoryGit(root, ["rev-parse", "--verify", `${ref}^{commit}`], { signal, maximumBytes: 1024 })).toString("utf8").trim();
      if (/^[a-f0-9]{40,64}$/.test(oid)) return { oid, label: ref.replace(/^refs\/(heads|remotes)\//, "") };
    } catch { if (signal?.aborted) throw new Error("Worktree inspection stopped."); }
  }
  return null;
}

export async function inspectRegisteredWorktree(
  workspaceRoot: string, registryPath: string | undefined, input: WorktreeInspectionRequest, signal?: AbortSignal,
): Promise<WorktreeInspectionResult> {
  const request = WorktreeInspectionRequestSchema.parse(input);
  const { root, row, check } = await registeredWorktree(workspaceRoot, registryPath, request.sessionId, signal);
  const base = request.comparison ? await comparisonBase(root, signal) : null;
  let content: string | null = null;
  let contentNotice: string | undefined;
  try { content = (await readWorkspaceFile(root, request.path)).content; }
  catch (error) {
    if (error instanceof WorkspaceFileError && ["BINARY_FILE", "FILE_TOO_LARGE"].includes(error.code)) contentNotice = "Binary or large file; source preview unavailable.";
    else if (!(error instanceof WorkspaceFileError && error.code === "FILE_NOT_FOUND")) throw error;
  }
  check();
  let diff = "", diffNotice: string | undefined;
  try {
    if (request.comparison && !base) throw new Error("No base");
    const bytes = await queryRepositoryGit(root, ["--no-pager", "--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv",
      "--no-color", base?.oid ?? "HEAD", "--", request.path], { signal, maximumBytes: 256 * 1024, timeoutMs: 2_000 });
    diff = bytes.toString("utf8");
  } catch {
    check();
    diffNotice = request.comparison && !base ? "No local master or main reference is available. Source browsing still works." : "Worktree diff unavailable; the repository may have no commit or the diff exceeded its limit.";
  }
  check();
  if (content === null && !diff && !contentNotice) throw new Error("This file is missing and no worktree diff is available.");
  return WorktreeInspectionResultSchema.parse({ sessionId: request.sessionId, path: request.path,
    label: row.label, worktree: root, content, diff, ...(diffNotice ? { diffNotice } : {}),
    ...(contentNotice ? { contentNotice } : {}), ...(request.comparison ? { comparison: request.comparison, base: base?.label ?? null } : {}) });
}

export function parseWorktreeChanges(bytes: Buffer): { changes: WorktreeChange[]; skipped: number } {
  const parts = new TextDecoder("utf8", { fatal: true }).decode(bytes).split("\0");
  const changes: WorktreeChange[] = [];
  let skipped = 0;
  const statuses = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "type-changed", U: "unmerged" } as const;
  for (let index = 0; index < parts.length - 1;) {
    const status = parts[index++]!;
    const first = parts[index++] ?? "";
    const pair = status.startsWith("R") || status.startsWith("C");
    const path = pair ? parts[index++] ?? "" : first;
    const kind = statuses[status[0] as keyof typeof statuses];
    if (!kind || !isRepositoryPath(path) || pair && !isRepositoryPath(first)) { skipped++; continue; }
    changes.push({ path, status: kind, ...(pair ? { previousPath: first } : {}) });
  }
  return { changes, skipped };
}

export async function browseRegisteredWorktree(
  workspaceRoot: string, registryPath: string | undefined, input: WorktreeBrowseRequest, signal?: AbortSignal,
): Promise<WorktreeBrowseResult> {
  const request = WorktreeBrowseRequestSchema.parse(input);
  const { root, row, check } = await registeredWorktree(workspaceRoot, registryPath, request.sessionId, signal);
  const reader = new RepositoryReader(root, request.sessionId);
  const cancel = () => reader.dispose();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    check();
    const directory = await reader.list({ protocolVersion: request.protocolVersion, requestId: request.requestId, type: "repo.list",
      directory: request.directory, page: request.page, filter: "", refresh: true });
    check();
    const base = await comparisonBase(root, signal);
    let branch: string | null = null;
    try { branch = (await queryRepositoryGit(root, ["symbolic-ref", "--short", "HEAD"], { signal, maximumBytes: 1024 })).toString("utf8").trim(); } catch { check(); }
    const changes: WorktreeChange[] = [];
    const notices: string[] = [];
    let complete = true;
    if (!base) { notices.push("No local master or main reference. Tracked comparison unavailable."); complete = false; }
    else try {
      const parsed = parseWorktreeChanges(await queryRepositoryGit(root, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames", base.oid, "--"], { signal, maximumBytes: 512 * 1024 }));
      changes.push(...parsed.changes);
      if (parsed.skipped) { complete = false; notices.push("Some changed paths cannot be displayed."); }
    } catch { check(); complete = false; notices.push("Tracked changes unavailable or exceed the read limit."); }
    try {
      const bytes = await queryRepositoryGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], { signal, maximumBytes: 256 * 1024 });
      for (const path of new TextDecoder("utf8", { fatal: true }).decode(bytes).split("\0").filter(Boolean)) {
        if (isRepositoryPath(path)) changes.push({ path, status: "untracked" });
        else complete = false;
      }
    } catch { check(); complete = false; notices.push("Untracked file list unavailable or exceeds the read limit."); }
    check();
    if (changes.length > 400) { complete = false; notices.push("Showing the first 400 changes. Browse directories for other files."); }
    return WorktreeBrowseResultSchema.parse({ sessionId: request.sessionId, label: row.label, worktree: root, branch,
      base: base?.label ?? null, directory, changes: changes.slice(0, 400), changesComplete: complete,
      ...(notices.length ? { notice: notices.join(" ").slice(0, 512) } : {}) });
  } finally { signal?.removeEventListener("abort", cancel); reader.dispose(); }
}
