import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolveDevWorkspace, checkDevPort } from "./dev-entry.mjs";

const scratch = await mkdtemp(join(tmpdir(), "swarm-dev-workspace-"));
after(() => rm(scratch, { recursive: true, force: true }));
const repo = join(scratch, "real repo"), sub = join(repo, "sub"), empty = join(scratch, "empty");
await mkdir(sub, { recursive: true }); await mkdir(empty);
const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
git("init", "-q"); git("-c", "user.name=Proof", "-c", "user.email=proof@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-qm", "Owned test root");
const link = join(scratch, "alias"); await symlink(repo, link);

test("default, absolute, invocation-relative and symlink roots identify the exact Git root", async () => {
  assert.equal(await resolveDevWorkspace([], repo, "/"), repo);
  assert.equal(await resolveDevWorkspace(["--workspace", repo], empty, "/"), repo);
  assert.equal(await resolveDevWorkspace(["--workspace", "real repo"], empty, scratch), repo);
  assert.equal(await resolveDevWorkspace(["--workspace", link], empty, scratch), repo);
});
test("missing, non-directory, non-Git, unborn, subdirectory and bare roots reject without fallback", async () => {
  const file = join(scratch, "file"); await writeFile(file, "not a repository");
  const unborn = join(scratch, "unborn"), bare = join(scratch, "bare");
  execFileSync("git", ["init", "-q", unborn]); execFileSync("git", ["init", "--bare", "-q", bare]);
  for (const path of [join(scratch, "absent"), file, empty, unborn, sub, bare])
    await assert.rejects(resolveDevWorkspace(["--workspace", path], repo, scratch), /Workspace must be/);
});
test("unknown, duplicate and incomplete arguments reject", async () => {
  for (const args of [["--workspace"], ["--workspace", ""], ["--workspace", repo, "extra"], ["--bad"], ["--workspace", "--help"]])
    await assert.rejects(resolveDevWorkspace(args, repo, scratch), /Usage:/);
});
test("ambient Git override cannot substitute another repository", async () => {
  await assert.rejects(resolveDevWorkspace(["--workspace", empty], repo, scratch, { ...process.env, GIT_DIR: join(repo, ".git"), GIT_WORK_TREE: empty }), /Git working-tree root/);
});
test("occupied port yields actionable error and leaves its listener alive; free port check releases its socket", async () => {
  const server = createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = { host: "127.0.0.1", port: server.address().port };
  try { await assert.rejects(checkDevPort(endpoint), /EADDRINUSE.*SWARM_DEV_PORT/); assert(server.listening); }
  finally { await new Promise((resolve) => server.close(resolve)); }
  await checkDevPort(endpoint);
  await checkDevPort(endpoint);
});
