import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "./port.cjs";
const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
const info = await lstat(owner);
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) ||
  (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = process.env.SWARM_ARTIFACT_DIR, scratch = await mkdtemp(join(owner, "fleet-"));
const archive = join(scratch, "app"), root = join(scratch, "repo"), profile = join(scratch, "profile");
await mkdir(archive); await mkdir(root); await mkdir(profile);
if (process.env.SWARM_STATUS_PROOF === "1") {
  const workLog = await readFile(process.env.SWARM_STATUS_WORK_LOG);
  if (workLog.length > 2 * 1024 * 1024) throw new Error("Saved Work Log exceeds proof bound");
  await mkdir(join(root, ".swarm"));
  await writeFile(join(root, ".swarm", "work-log.json"), workLog);
}
await writeFile(join(root, "README.md"), "# Read-only real swarm observation\n");
execFileSync("git", ["init", "-q", root]);
execFileSync("git", ["-C", root, "add", "README.md"]);
execFileSync("git", ["-C", root, "-c", "user.name=Fleet proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned fleet viewer workspace"]);
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
execFileSync("tar", ["-xzf", bundle, "-C", archive], { timeout: 30000 });
const server = createServer((_req, res) => res.end("owned fleet proof"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(resolveOwnedPort(process.env), "127.0.0.1", resolve); });
const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: process.env.SWARM_FLEET_REGISTRY, SWARM_FLEET_PACKAGE: archive };
for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[key];
const desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, process.env.SWARM_STATUS_PROOF === "1" ? "status-proof.cjs" : "fleet-proof.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
let killTimer;
const stop = () => { desktop.kill("SIGTERM"); killTimer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop);
try {
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
  await writeFile(join(evidence, "postclose.json"), JSON.stringify({ desktopCode: code, observedProcessesUnmodified: true }));
  process.exitCode = code;
} finally {
  clearTimeout(killTimer); for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, stop);
  await new Promise((resolve) => server.close(resolve));
}
