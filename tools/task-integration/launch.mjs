import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { access, lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const ownerStat = await lstat(owner);
if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink() || ownerStat.uid !== process.getuid() || (ownerStat.mode & 0o077) !== 0 ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = await realpath(process.env.SWARM_TASK_EVIDENCE);
const port = Number(process.env.SWARM_DEV_PORT);
if (!Number.isInteger(port) || port !== 55174) throw new Error("Task proof requires the owned test port 55174");
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main", "swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin", "swarm-ide-foundation.tar.gz");
await access(bundle);
// Artifact and repository share a fresh /tmp parent, outside source dependency ancestors.
const scratch = await mkdtemp(join(tmpdir(), "swarm-task-package-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const { mkdir } = await import("node:fs/promises");
  const extracted = join(scratch, "app");
  const profile = join(scratch, "profile");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
  const yaml = createRequire(join(extracted, "core/worker.js")).resolve("yaml");
  if (yaml !== join(extracted, "core/node_modules/yaml/index.js")) throw new Error("YAML escaped the actual archive");
  const html = await readFile(join(extracted, "renderer/index.html"), "utf8");
  if (/\b(?:src|href)=["']\/assets\//.test(html)) throw new Error("Packaged file URL has absolute asset references");
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged task proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_TASK_PACKAGE: extracted, SWARM_TASK_PROFILE: profile,
    SWARM_TASK_EVIDENCE: evidence, SWARM_TASK_FIXTURE_MODULE: join(scripts, "fixture.mjs"), SWARM_TASK_SCRATCH: scratch };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
    delete environment[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"),
    `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: scratch, env: environment, stdio: "inherit" });
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
