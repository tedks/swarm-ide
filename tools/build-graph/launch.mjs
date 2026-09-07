import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuildGraphFixture } from "./fixture.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const ownerStat = await lstat(owner);
if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink() || ownerStat.uid !== process.getuid() || (ownerStat.mode & 0o077) !== 0 ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = await realpath(process.env.SWARM_BUILD_GRAPH_EVIDENCE);
if (Number(process.env.SWARM_DEV_PORT) !== 55174) throw new Error("BuildGraph proof requires owned test port 55174");
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main", "swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(bundle);
const scratch = await mkdtemp(join(owner, "swarm-build-graph-package-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
  const html = await readFile(join(extracted, "renderer/index.html"), "utf8");
  if (/\b(?:src|href)=["']\/assets\//.test(html)) throw new Error("Packaged file URL has absolute asset references");
  const fixture = await createBuildGraphFixture(scratch, process.env.SWARM_BUILD_GRAPH_CASE, process.cwd());
  await writeFile(join(evidence, "fixture.json"), JSON.stringify(fixture));
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged build-graph proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(55174, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_BUILD_GRAPH_PACKAGE: extracted, SWARM_BUILD_GRAPH_PROFILE: profile };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
    delete environment[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"),
    `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: fixture.root, env: environment, stdio: "inherit" });
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
