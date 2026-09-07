// Fixed TEST-ONLY task rehearsal launcher. No production selector or model.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createTaskFixture } from "../task-integration/fixture.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { rehearsalBundlePath } from "./artifact.mjs";

const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 ||
  (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = await realpath(process.env.SWARM_TASK_REHEARSAL_EVIDENCE);
const port = Number(process.env.SWARM_DEV_PORT), electron = process.env.SWARM_ELECTRON_BIN;
if (port !== 55174 || !electron || !isAbsolute(electron)) throw new Error("Owned port55174 and Nix Electron required");
const bundle = rehearsalBundlePath(process.env, process.cwd());
await access(bundle);
const scratch = await mkdtemp(join(owner, "task-rehearsal-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
  if (createRequire(join(extracted, "core/worker.js")).resolve("yaml") !== join(extracted, "core/node_modules/yaml/index.js"))
    throw new Error("Task rehearsal YAML escaped its archive");
  const fixture = await createTaskFixture(scratch);
  await writeFile(join(evidence, "fixture.json"), JSON.stringify(fixture));
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned deterministic task rehearsal"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", VITE_SWARM_AGENT_DEMO: "0", SWARM_TASK_REHEARSAL_SCRATCH: scratch };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
    delete environment[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(extracted, "app/electron/task-main.js"),
    `--swarm-task-rehearsal-profile=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT],
  { cwd: fixture.root, env: environment, stdio: "inherit" });
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
