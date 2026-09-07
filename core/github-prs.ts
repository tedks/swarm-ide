import { spawn } from "node:child_process";
import { z } from "zod";
import { journalGit } from "./changelog";
import { GithubPrObservationSchema, GithubRepositorySchema, GITHUB_PR_LIMIT, GITHUB_PR_PATH_LIMIT, type GithubPrObservation } from "../protocol/github-prs";

const MAX_BYTES = 512 * 1024;
export function githubOrigin(value: string): string {
  const remote = value.trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^\s?#]+)$/.exec(remote);
  if (!match) throw new Error("A single GitHub origin is required");
  return GithubRepositorySchema.parse(match[1].replace(/\.git$/, ""));
}

/** Fixed read-only gh command, bounded output; credentials remain in gh's normal environment. */
export function githubPrCommand(root: string, repository: string, signal: AbortSignal): Promise<string> {
  GithubRepositorySchema.parse(repository);
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    const env = { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", GH_PAGER: "cat", NO_COLOR: "1" };
    delete (env as NodeJS.ProcessEnv).GH_DEBUG;
    delete (env as NodeJS.ProcessEnv).DEBUG;
    const child = spawn("gh", ["pr", "list", "--repo", `github.com/${repository}`, "--state", "all", "--limit", String(GITHUB_PR_LIMIT),
      "--json", "number,title,state,isDraft,author,updatedAt,url,changedFiles,files"], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let failed = false, stopped = false, bytes = 0, stderrBytes = 0;
    const chunks: Buffer[] = [];
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch { /* Already exited. */ } } };
    const stop = () => { if (stopped) return; stopped = true; kill("SIGTERM"); escalation = setTimeout(() => kill("SIGKILL"), 100); };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_BYTES) stop(); else chunks.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > MAX_BYTES) stop(); });
    child.once("error", () => { failed = true; });
    child.once("close", (code) => {
      clearTimeout(escalation); signal.removeEventListener("abort", stop);
      // No gh descendant belongs beyond this one read, even if it closed its pipes early.
      kill("SIGKILL");
      if (stopped || failed || code !== 0) { reject(new Error("GitHub read unavailable")); return; }
      try { resolve(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { reject(new Error("Invalid GitHub output")); }
    });
  });
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
  constructor(private root: string, private repositoryId: string, private worldId: string,
    private command = githubPrCommand, private git = journalGit) {}
  refresh(): Promise<GithubPrObservation> {
    if (this.lifetime.signal.aborted) return Promise.reject(new Error("Disposed"));
    if (this.pending) return this.pending;
    const request = new AbortController();
    const cancel = () => request.abort();
    this.lifetime.signal.addEventListener("abort", cancel, { once: true });
    // Fits the existing bridge's five-second deadline, including owned close/drain.
    const deadline = setTimeout(cancel, 4_000);
    this.pending = (async () => {
      const args = ["config", "--local", "--no-includes", "--get-all", "remote.origin.url"];
      const remote = await this.git(this.root, args, request.signal);
      const repository = githubOrigin(remote);
      const bytes = await this.command(this.root, repository, request.signal);
      if (remote !== await this.git(this.root, args, request.signal) || request.signal.aborted) throw new Error("Origin changed or read expired");
      return parseGithubPrs(bytes, this.repositoryId, this.worldId, repository);
    })().finally(() => { clearTimeout(deadline); this.lifetime.signal.removeEventListener("abort", cancel); this.pending = null; });
    return this.pending;
  }
  async dispose(): Promise<void> { this.lifetime.abort(); await this.pending?.catch(() => {}); }
}
