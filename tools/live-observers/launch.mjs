import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "../demo-agents/port.cjs";

const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const port = resolveOwnedPort(process.env), evidence = await realpath(process.env.SWARM_LIVE_EVIDENCE);
const scratch = await mkdtemp(join(owner, "live-observers-"));
let server, desktop, timer, code = 1;
const handlers = new Map();
try {
  const root = join(scratch, "repository"), archive = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(root); await mkdir(archive); await mkdir(profile);
  await writeFile(join(root, "README.md"), "# Controlled live observer proof\nThis actual source file stays independent of observed activity.\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Swarm proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned controlled source"]);
  const sessions = [];
  for (let i = 1; i <= 2; i++) {
    const id = `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`, rollout = join(scratch, `session-${i}.jsonl`);
    const lines = [
      { type: "session_meta", payload: { id, forked_from_id: i === 2 ? sessions[0].id : null } },
      { timestamp: "2026-09-07T12:00:00Z", type: "event_msg", payload: { type: "task_started" } },
      { timestamp: "2026-09-07T12:00:01Z", type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: `Controlled worker ${i}: initial bounded observation.` }] } },
    ];
    await writeFile(rollout, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", { mode: 0o600 });
    sessions.push({ id, label: `Controlled worker ${i}`, rollout, evidence: "synthetic", contextRoot: root, contextPaths: ["README.md"] });
  }
  const registry = join(scratch, "registry.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions }), { mode: 0o600 });
  await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, registry, sessions }));
  const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
  const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
  execFileSync("tar", ["-xzf", bundle, "-C", archive], { timeout: 30000 });
  server = createServer((_request, response) => response.end("owned live observer proof"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_LIVE_PACKAGE: archive };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
  desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) { const handler = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); }; handlers.set(signal, handler); process.on(signal, handler); }
  code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (status) => resolve(status ?? 1)); });
  process.exitCode = code;
} catch (error) {
  await writeFile(join(evidence, "failure.json"), JSON.stringify({ stage: "launcher", message: error.stack })); process.exitCode = 1;
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(timer);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
  await writeFile(join(evidence, "postclose.json"), JSON.stringify({ desktopCode: code, ownedScratchCleaned: true }));
}
