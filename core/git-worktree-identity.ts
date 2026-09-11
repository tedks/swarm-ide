import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { queryRepositoryGit } from "./repository-boundary";

export interface GitWorktreeIdentity {
  root: string;
  projectId: string;
  branch: string | null;
  defaultBranch: string | null;
}

const boundedLine = (bytes: Buffer): string => {
  const value = new TextDecoder("utf8", { fatal: true }).decode(bytes);
  if (!value.endsWith("\n") || value.slice(0, -1).includes("\n")) throw new Error("Git identity is unavailable.");
  const line = value.slice(0, -1);
  if (!line || line.length > 4096 || /[\p{Cc}\p{Cf}]/u.test(line)) throw new Error("Git identity is unavailable.");
  return line;
};

const symbolic = async (root: string, ref: string, signal?: AbortSignal): Promise<string | null> => {
  try {
    const value = boundedLine(await queryRepositoryGit(root, ["symbolic-ref", ref], { signal, maximumBytes: 8192 }));
    return value.startsWith("refs/heads/") ? value.slice("refs/heads/".length)
      : value.startsWith("refs/remotes/origin/") ? value.slice("refs/remotes/origin/".length) : null;
  } catch {
    if (signal?.aborted) throw new Error("Git identity observation stopped.");
    return null;
  }
};

/** Checked Git-family identity for renderer equality only. The opaque digest is
 * not repository authority; every file operation remains rooted separately. */
export async function gitWorktreeIdentity(root: string, signal?: AbortSignal): Promise<GitWorktreeIdentity> {
  const canonicalRoot = await realpath(root);
  const top = boundedLine(await queryRepositoryGit(canonicalRoot, ["rev-parse", "--path-format=absolute", "--show-toplevel"], { signal, maximumBytes: 16384 }));
  if (await realpath(top) !== canonicalRoot) throw new Error("Git worktree root is unavailable.");
  const commonPath = boundedLine(await queryRepositoryGit(canonicalRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"], { signal, maximumBytes: 16384 }));
  const common = await realpath(commonPath);
  const [branch, remoteDefault] = await Promise.all([
    symbolic(canonicalRoot, "HEAD", signal),
    symbolic(canonicalRoot, "refs/remotes/origin/HEAD", signal),
  ]);
  const localDefault = remoteDefault ? null : await symbolic(common, "HEAD", signal);
  return { root: canonicalRoot, projectId: createHash("sha256").update(common).digest("hex"), branch, defaultBranch: remoteDefault ?? localDefault };
}
