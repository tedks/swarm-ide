import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, cp, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_ACTIVITY_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "activity-package-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile"), root = join(scratch, "repository");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", archive, "-C", extracted], { timeout: 30000 });
  execFileSync("git", ["clone", "--local", "--no-hardlinks", "--no-checkout", process.cwd(), root], { timeout: 15000, stdio: "pipe" });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--detach", "HEAD"], { cwd: root, timeout: 15000, stdio: "pipe" });
  const origin = execFileSync("git", ["config", "--local", "--no-includes", "--get", "remote.origin.url"], { cwd: process.cwd(), encoding: "utf8", timeout: 2000 }).trim();
  if (!/^(?:git@github\.com:|https:\/\/github\.com\/)[A-Za-z0-9_.\/-]+$/.test(origin)) throw new Error("Proof requires an explicit GitHub origin");
  execFileSync("git", ["remote", "set-url", "origin", origin], { cwd: root, timeout: 2000 });
  // Only the current authored summary pair is copied from this worktree, not session material.
  await cp(join(process.cwd(), ".swarm/changelog.json"), join(root, ".swarm/changelog.json"));
  await cp(join(process.cwd(), ".swarm/changelog-bundle.json"), join(root, ".swarm/changelog-bundle.json"));
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged Activity proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const env = { ...process.env, NODE_PATH: "", SWARM_ACTIVITY_PACKAGE: extracted, SWARM_ACTIVITY_PROFILE: profile, SWARM_ACTIVITY_ROOT: root };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete env[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) { const handler = () => { desktop.kill("SIGTERM"); killTimer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); }; handlers.set(signal, handler); process.on(signal, handler); }
  process.exitCode = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(killTimer); if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
