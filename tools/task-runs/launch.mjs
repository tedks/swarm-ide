import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_TASK_RUNS_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/tools/task-runs/controlled.tar.gz") : join(process.cwd(), "bazel-bin/tools/task-runs/controlled.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "task-runs-controlled-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "view"), profile = join(scratch, "profile");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", archive, "-C", extracted], { timeout: 30000 });
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned controlled task-runs view"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const env = { ...process.env, SWARM_TASK_RUNS_VIEW: extracted, SWARM_TASK_RUNS_PROFILE: profile, SWARM_TASK_RUNS_EVIDENCE: evidence };
  for (const name of ["NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "SWARM_RENDERER_URL", "SWARM_DEV_CONTROL"]) delete env[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`,
    process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: scratch, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => { desktop.kill("SIGTERM"); killTimer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
    handlers.set(signal, handler); process.on(signal, handler);
  }
  process.exitCode = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(killTimer);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
