import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { z } from "zod";
import { journalGit } from "./changelog";
import { GithubPrObservationSchema, GithubRepositorySchema, GITHUB_PR_LIMIT, GITHUB_PR_PATH_LIMIT, type GithubPrObservation } from "../protocol/github-prs";
import { createOwnedCodexTransport, type OwnedCodexTransportOptions } from "./agents/owner";
import { collectBuildQuery, BuildQueryCleanupError } from "./build-graph";

const MAX_BYTES = 512 * 1024;
export class GithubPrReadError extends Error {
  constructor(readonly code: "GITHUB_PR_ORIGIN" | "GITHUB_PR_OWNER" | "GITHUB_PR_TIMEOUT" | "GITHUB_PR_COMMAND" | "GITHUB_PR_MOVED" | "GITHUB_PR_DATA" | "GITHUB_PR_TOOLING" | "GITHUB_PR_STARTUP_HOOK" | "GITHUB_PR_OWNER_START" | "GITHUB_PR_COMMAND_EXIT") { super(code); }
}
export function githubOrigin(value: string): string {
  const remote = value.trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^\s?#]+)$/.exec(remote);
  if (!match) throw new Error("A single GitHub origin is required");
  return GithubRepositorySchema.parse(match[1].replace(/\.git$/, ""));
}

async function executable(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter((path) => path.startsWith("/"))) {
    try { const path = await realpath(join(directory, name)); await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; } catch { /* next normal installed tool path */ }
  }
  throw new Error("Required local GitHub tooling unavailable");
}
export async function githubOwnerOptions(root: string): Promise<Omit<OwnedCodexTransportOptions, "args">> {
  const [gh, node, unshare, setpriv] = await Promise.all(["gh", "node", "unshare", "setpriv"].map(executable));
  return { root, executable: gh!, nodeExecutable: node!, unshareExecutable: unshare!, setprivExecutable: setpriv!, ownerScript: join(__dirname, "agents/owner-process.js") };
}

/** Fixed gh read inside the existing parent-death-safe PID owner. This is process
 * lifetime ownership only: gh keeps normal network/filesystem/auth configuration. */
export async function githubPrCommand(root: string, repository: string, signal: AbortSignal,
  options: (root: string) => Promise<Omit<OwnedCodexTransportOptions, "args">> = githubOwnerOptions): Promise<string> {
  GithubRepositorySchema.parse(repository);
  if (signal.aborted) throw new Error("Cancelled");
  const config = await options(root);
  const bytes = await collectBuildQuery((sink) => createOwnedCodexTransport({ ...config, args: ["pr", "list", "--repo", `github.com/${repository}`, "--state", "all", "--limit", String(GITHUB_PR_LIMIT),
    "--json", "number,title,state,isDraft,author,updatedAt,url,changedFiles,files"] }, sink), signal);
  if (bytes.byteLength > MAX_BYTES) throw new Error("GitHub response exceeds bound");
  return new TextDecoder("utf8", { fatal: true }).decode(bytes);
}

const RawPullRequests = z.array(z.object({
  number: z.number(), title: z.string(), state: z.string(), isDraft: z.boolean(),
  author: z.object({ login: z.string() }).passthrough().nullable(), updatedAt: z.string(), url: z.string(),
  changedFiles: z.number(), files: z.array(z.object({ path: z.string() }).passthrough()).max(GITHUB_PR_PATH_LIMIT),
}).strict()).max(GITHUB_PR_LIMIT);
export function parseGithubPrs(bytes: string, repositoryId: string, worldId: string, githubRepository: string): GithubPrObservation {
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error("GitHub response exceeds bound");
  const rows = RawPullRequests.parse(JSON.parse(bytes));
  return GithubPrObservationSchema.parse({ repositoryId, worldId, githubRepository, observedAt: new Date().toISOString(),
    pullRequests: rows.map(({ files, author, ...pr }) => ({ ...pr, author: author?.login || "Deleted account", paths: files.map((file) => file.path) })) });
}

export class GithubPrProvider {
  private lifetime = new AbortController();
  private pending: Promise<GithubPrObservation> | null = null;
  private cleanupBlocked = false;
  constructor(private root: string, private repositoryId: string, private worldId: string,
    private command = githubPrCommand, private git = journalGit) {}
  refresh(): Promise<GithubPrObservation> {
    if (this.lifetime.signal.aborted || this.cleanupBlocked) return Promise.reject(new Error("Disposed or previous process cleanup unconfirmed"));
    if (this.pending) return this.pending;
    const request = new AbortController();
    const cancel = () => request.abort();
    this.lifetime.signal.addEventListener("abort", cancel, { once: true });
    // Fits the existing bridge's five-second deadline, including owned close/drain.
    const deadline = setTimeout(cancel, 4_000);
    let stage: "origin" | "command" | "revalidation" | "data" = "origin";
    this.pending = (async () => {
      const args = ["config", "--local", "--no-includes", "--get-all", "remote.origin.url"];
      const remote = await this.git(this.root, args, request.signal);
      const repository = githubOrigin(remote);
      stage = "command";
      const bytes = await this.command(this.root, repository, request.signal);
      stage = "revalidation";
      if (remote !== await this.git(this.root, args, request.signal) || request.signal.aborted) throw new Error("Origin changed or read expired");
      stage = "data";
      return parseGithubPrs(bytes, this.repositoryId, this.worldId, repository);
    })().catch((error) => {
      if (error instanceof BuildQueryCleanupError) { this.cleanupBlocked = true; throw new GithubPrReadError("GITHUB_PR_OWNER"); }
      // Fixed local diagnostic categories only; never forward gh stderr or parsed values.
      if (error?.message === "Required local GitHub tooling unavailable") throw new GithubPrReadError("GITHUB_PR_TOOLING");
      if (error?.message === "Core-owned process startup hooks are not permitted") throw new GithubPrReadError("GITHUB_PR_STARTUP_HOOK");
      if (error?.message === "Owned Bazel query could not start") throw new GithubPrReadError("GITHUB_PR_OWNER_START");
      if (error?.message === "Bazel query failed; dependencies or unsupported repository definitions may require setup.") throw new GithubPrReadError("GITHUB_PR_COMMAND_EXIT");
      throw new GithubPrReadError(request.signal.aborted ? "GITHUB_PR_TIMEOUT" : stage === "origin" ? "GITHUB_PR_ORIGIN" : stage === "command" ? "GITHUB_PR_COMMAND" : stage === "revalidation" ? "GITHUB_PR_MOVED" : "GITHUB_PR_DATA");
    })
      .finally(() => { clearTimeout(deadline); this.lifetime.signal.removeEventListener("abort", cancel); this.pending = null; });
    return this.pending;
  }
  async dispose(): Promise<void> {
    this.lifetime.abort(); await this.pending?.catch(() => {});
    if (this.cleanupBlocked) throw new BuildQueryCleanupError("GitHub command cleanup remains unconfirmed");
  }
}
