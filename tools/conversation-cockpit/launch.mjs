import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
const info = await lstat(owner);
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) ||
  (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const port = process.env.SWARM_DEV_PORT;
if (!/^[0-9]+$/.test(port ?? "") || port !== process.env.SWARM_VIRTUAL_DESKTOP_PORT || +port < 1 || +port > 65535) throw new Error("Owned port mismatch");
const evidence = process.env.SWARM_ARTIFACT_DIR, scratch = await mkdtemp(join(owner, "conversation-"));
const archive = join(scratch, "app"), root = join(scratch, "repo"), profile = join(scratch, "profile");
await mkdir(archive); await mkdir(root); await mkdir(profile);
const source = "# Conversation cockpit proof\nThis source is disposable; agent transcripts are real and read-only.\n";
await writeFile(join(root, "README.md"), source);
execFileSync("git", ["init", "-q", root]);
execFileSync("git", ["-C", root, "add", "README.md"]);
execFileSync("git", ["-C", root, "-c", "user.name=Conversation proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned conversation viewer source"]);
const inputRegistry = JSON.parse(await readFile(process.env.SWARM_FLEET_REGISTRY, "utf8"));
const rootId = "01a0702a-7b5e-71e0-bb62-287d55a7f9ba";
const registration = inputRegistry.sessions.find((session) => session.id === rootId && session.evidence === "local" && session.tmux);
if (!registration) throw new Error("Actual registered ROOT with terminal identity required");
const readMeta = async (session) => {
  const file = await open(session.rollout, "r");
  // Match the production observer's 64 KiB metadata cap. Codex embeds its
  // instructions in this record, so a valid header can exceed 16 KiB.
  try { const buffer = Buffer.alloc(65536); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, bytesRead).indexOf(10);
    if (newline < 0) throw new Error("Missing or oversized session metadata");
    return JSON.parse(buffer.subarray(0, newline).toString("utf8"));
  } finally { await file.close(); }
};
let child;
for (const candidate of inputRegistry.sessions) {
  if (candidate.id === rootId || candidate.evidence !== "local" || !candidate.tmux) continue;
  try {
    const meta = await readMeta(candidate);
    const stat = await readFile(`/proc/${candidate.tmux.processPid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
    if (meta.payload?.forked_from_id === rootId && start === candidate.tmux.processStart) { child = candidate; break; }
  } catch { /* A completed old registration is not an active proof target. */ }
}
if (!child) throw new Error("Actual registered direct child with current terminal process required");
const registry = join(scratch, "registry.json");
await writeFile(registry, JSON.stringify({ version: 1, sessions: [registration, child] }), { mode: 0o600 });
await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, source, sessions: [registration, child], realTranscripts: true, controlledSend: true }));
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
execFileSync("tar", ["-xzf", bundle, "-C", archive], { timeout: 30000 });
const server = createServer((_req, res) => res.end("Owned conversation proof"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(+port, "127.0.0.1", resolve); });
const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_CONVERSATION_PACKAGE: archive };
for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[key];
const desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
let killTimer;
const stop = () => { desktop.kill("SIGTERM"); killTimer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop);
try {
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (status) => resolve(status ?? 1)); });
  await writeFile(join(evidence, "postclose.json"), JSON.stringify({ desktopCode: code, noExternalProcessControl: true }));
  process.exitCode = code;
} finally {
  clearTimeout(killTimer); for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.removeListener(signal, stop);
  await new Promise((resolve) => server.close(resolve));
}
