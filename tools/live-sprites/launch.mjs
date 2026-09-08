import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { lstat, realpath, readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "../demo-agents/port.cjs";
const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual display required");
const info = await lstat(owner);
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || info.mode & 0o077 || (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid owner");
const registryFile = process.env.SWARM_SPRITE_REGISTRY, registryStat = await lstat(registryFile);
if (!registryStat.isFile() || registryStat.uid !== process.getuid() || registryStat.mode & 0o077 || registryStat.size > 65536 || await realpath(registryFile) !== registryFile) throw new Error("Private canonical registry required");
const registry = JSON.parse(await readFile(registryFile, "utf8"));
const row = registry.sessions.find((session) => session.id === process.env.SWARM_SPRITE_SESSION);
if (!row || row.evidence !== "local" || !isAbsolute(row.contextRoot ?? "") || await realpath(row.contextRoot) !== row.contextRoot) throw new Error("Existing canonical registered worktree required");
const scratch = await mkdtemp(join(owner, "sprites-")), packaged = join(scratch, "app"), profile = join(scratch, "profile");
await mkdir(packaged); await mkdir(profile);
const privateRegistry = join(scratch, "registry.json");
await writeFile(privateRegistry, JSON.stringify({ version: 1, sessions: [row] }), { mode: 0o600 });
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
const server = createServer((_request, response) => response.end("owned sprite proof"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(resolveOwnedPort(process.env), "127.0.0.1", resolve); });
const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: privateRegistry, SWARM_SPRITE_PACKAGE: packaged };
for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
const desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "proof.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: row.contextRoot, env: environment, stdio: "inherit" });
let timer;
const stop = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop);
try {
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
  await writeFile(join(process.env.SWARM_ARTIFACT_DIR, "postclose.json"), JSON.stringify({ desktopCode: code, modelTurns: 0 }));
  process.exitCode = code;
} finally {
  clearTimeout(timer); for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, stop);
  await new Promise((resolve) => server.close(resolve));
}
