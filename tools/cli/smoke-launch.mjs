// Test launcher: the installed CLI and production Electron entry are unmodified.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";

const port = await resolveOwnedVirtualPort();
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "installed-cli-"));
const repo = join(scratch, "chosen repository"), caller = join(scratch, "caller");
const evidence = process.env.SWARM_ARTIFACT_DIR;
let server, desktop;
const handlers = new Map();
try {
  await mkdir(repo); await mkdir(caller);
  await writeFile(join(repo, "install-proof.txt"), "Opened from the installed Swarm CLI, not its source checkout.\n");
  const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "pipe", timeout: 5000 });
  git(["init", "-b", "master"]); git(["add", "."]);
  git(["-c", "user.name=Swarm CLI test", "-c", "user.email=cli-test@example.invalid", "commit", "-m", "Create chosen repository"]);
  // This only satisfies the owned harness's readiness handshake. The installed
  // renderer loads file:// assets; this server never serves application code.
  server = createServer((_request, response) => response.end("Owned CLI readiness"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const env = { ...process.env, PATH: "/usr/bin:/bin" };
  // Do not let the test's development shell supply the installed app's tools.
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "IN_NIX_SHELL", "SWARM_EXTERNAL_AGENTS_REGISTRY", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_BAZEL_BIN", "SWARM_BAZEL_JAVA_HOME", "SWARM_ELECTRON_BIN", "SWARM_SOURCE_WORKSPACE", "BUILD_WORKSPACE_DIRECTORY"]) delete env[key];
  const args = ["--workspace", "../chosen repository", "--user-data-dir", "../profile"];
  if (process.env.SWARM_CLI_TEST_TMUX_SESSION) {
    if (!process.env.SWARM_CLI_TEST_TMUX_SERVER) throw new Error("Explicit test tmux server is required");
    args.push("--tmux-server", process.env.SWARM_CLI_TEST_TMUX_SERVER, "--tmux-session", process.env.SWARM_CLI_TEST_TMUX_SESSION);
    env.XDG_STATE_HOME = join(scratch, "state");
  }
  desktop = spawn(process.env.SWARM_INSTALLED_CLI, args, { cwd: caller, env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    const handler = () => { if (desktop.exitCode === null) desktop.kill(signal); };
    handlers.set(signal, handler); process.on(signal, handler);
  }
  await writeFile(join(evidence, "launch.json"), JSON.stringify({ installedCommand: process.env.SWARM_INSTALLED_CLI, caller, workspace: repo, profile: join(scratch, "profile"), sourceText: await readFile(join(repo, "install-proof.txt"), "utf8"), productionEntry: true, devToolPathRemoved: true }));
  process.exitCode = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  for (const [signal, handler] of handlers) process.off(signal, handler);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
