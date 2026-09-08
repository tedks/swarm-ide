import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual display required");
const info = await lstat(owner);
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) ||
  (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid display owner");
const port = process.env.SWARM_DEV_PORT;
if (!/^[0-9]+$/.test(port ?? "") || port !== process.env.SWARM_VIRTUAL_DESKTOP_PORT) throw new Error("Owned port mismatch");
const evidence = process.env.SWARM_ARTIFACT_DIR, scratch = await mkdtemp(join(owner, "outbox-"));
const archive = join(scratch, "app"), root = join(scratch, "repo"), profile = join(scratch, "profile");
await Promise.all([mkdir(archive), mkdir(root), mkdir(profile)]);
await writeFile(join(root, "README.md"), "# Disposable outgoing-message proof\n");
execFileSync("git", ["init", "-q", root]);
execFileSync("git", ["-C", root, "add", "README.md"]);
execFileSync("git", ["-C", root, "-c", "user.name=Outbox proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Disposable source"]);
const input = JSON.parse(await readFile(process.env.SWARM_FLEET_REGISTRY, "utf8"));
const registration = input.sessions.find((row) => row.id === "01a0702a-7b5e-71e0-bb62-287d55a7f9ba" && row.evidence === "local" && row.tmux);
if (!registration) throw new Error("Registered ROOT required for read-only observation");
const registry = join(scratch, "registry.json");
await writeFile(registry, JSON.stringify({ version: 1, sessions: [registration] }), { mode: 0o600 });
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
execFileSync("tar", ["-xzf", runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz"), "-C", archive], { timeout: 30000 });
const server = createServer((_request, response) => response.end("Owned outbox proof"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(+port, "127.0.0.1", resolve); });
const env = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_OUTBOX_PACKAGE: archive };
for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete env[key];
const desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env, stdio: "inherit" });
let timer;
const stop = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop);
try {
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (value) => resolve(value ?? 1)); });
  await writeFile(join(evidence, "postclose.json"), JSON.stringify({ desktopCode: code })); process.exitCode = code;
} finally {
  clearTimeout(timer); for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, stop);
  await new Promise((resolve) => server.close(resolve));
}
