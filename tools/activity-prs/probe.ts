// Manual, read-only diagnostic of the same command owner; no credential output.
import { resolve } from "node:path";
import { GithubPrProvider, githubPrCommand, githubOwnerOptions } from "../../core/github-prs";
const root = process.cwd();
const provider = new GithubPrProvider(root, "probe", "probe", (cwd, repo, signal) => githubPrCommand(cwd, repo, signal,
  async (cwd) => ({ ...await githubOwnerOptions(cwd), ownerScript: resolve(root, "core/agents/owner-process.mjs") })));
void provider.refresh().then((value) => console.log(JSON.stringify({ ok: true, repository: value.githubRepository, count: value.pullRequests.length })),
  (error) => { console.log(JSON.stringify({ ok: false, kind: error.constructor.name,
    // Library errors can quote untrusted input. Print only these fixed local diagnostics.
    reason: ["Build query cancelled", "Required local GitHub tooling unavailable", "Core-owned process startup hooks are not permitted", "Origin changed or read expired"].includes(error.message) ? error.message : "Read or owned cleanup failed" })); process.exitCode = 1; })
  .finally(() => provider.dispose().catch(() => {}));
