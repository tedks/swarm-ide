import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "design-"));
const packaged = join(scratch, "app"), profile = join(scratch, "profile");
let server, desktop, timer;
const handlers = new Map();
try {
  await mkdir(packaged); await mkdir(profile);
  const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
  const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
  execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
  server = createServer((_request, response) => response.end("Owned living-design proof"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const env = { ...process.env, NODE_PATH: "", XDG_CONFIG_HOME: profile, SWARM_DESIGN_PACKAGE: packaged };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete env[name];
  desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "unified.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: process.cwd(), env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) { const handler = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); }; handlers.set(signal, handler); process.on(signal, handler); }
  process.exitCode = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(timer);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
