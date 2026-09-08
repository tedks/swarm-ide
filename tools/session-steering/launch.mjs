import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const rawPort = process.env.SWARM_DEV_PORT, expectedPort = process.env.SWARM_VIRTUAL_DESKTOP_PORT;
if (!/^[0-9]+$/.test(rawPort ?? "") || !/^[0-9]+$/.test(expectedPort ?? "") ||
    Number(rawPort) !== Number(expectedPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error("Owned port mismatch");
const evidence = await realpath(process.env.SWARM_STEERING_EVIDENCE);
const scratch = await mkdtemp(join(owner, "session-steering-")), socket = join(scratch, "owned.sock");
const tmux = (...args) => execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 2000, env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
const startTime = (proc) => proc.slice(proc.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
let server, desktop, timer, tmuxCreated = false;
const handlers = new Map();
try {
  const root = join(scratch, "repository"), archive = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(root); await mkdir(archive); await mkdir(profile);
  await writeFile(join(root, "README.md"), "# Controlled synthetic steering proof\nNot a live agent run.\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Swarm proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned synthetic source"]);
  const holding = join(scratch, "hold.cjs"), capture = join(evidence, "queue-argv.jsonl"), queue = join(scratch, "controlled-codex");
  await writeFile(holding, "const fs=require('node:fs');fs.openSync(process.argv[2],'r');fs.writeFileSync(process.argv[3],JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);\n");
  const receipt = "20000000-0000-4000-8000-000000000001";
  await writeFile(queue, `#!${process.execPath}\nconst fs=require('node:fs'),assert=require('node:assert/strict');const args=process.argv.slice(2);assert.equal(args.length,5);assert.equal(args[0],'queue');assert.equal(args[1],'--thread');assert.equal(args[3],'--message');fs.appendFileSync(${JSON.stringify(capture)},JSON.stringify(args)+'\\n');process.stdout.write('Queued message ${receipt} for thread '+args[2]+'\\n');\n`, { mode: 0o700 });
  const sessions = [];
  for (let i = 1; i <= 2; i++) {
    const id = `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const rollout = join(scratch, `session-${i}.jsonl`), ready = join(scratch, `holder-${i}.json`);
    await writeFile(rollout, [
      { type: "session_meta", payload: { id, forked_from_id: null } },
      { timestamp: "2026-09-07T12:00:00Z", type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Controlled synthetic fixture. No model or account is running. Queue acceptance is not consumption." }] } },
    ].map((record) => JSON.stringify(record)).join("\n") + "\n", { mode: 0o600 });
    const args = i === 1 ? ["-f", "/dev/null", "new-session", "-d", "-s", "owned"] : ["new-window", "-d", "-t", "owned"];
    const tuple = tmux(...args, "-n", `controlled-${i}`, "-P", "-F", "#{window_id}\t#{pane_id}\t#{pane_pid}", process.execPath, holding, rollout, ready).trim().split("\t");
    tmuxCreated = true;
    const deadline = Date.now() + 3000;
    let holder;
    while (!holder) { try { holder = JSON.parse(await readFile(ready, "utf8")); } catch { if (Date.now() > deadline) throw new Error("Owned holder unavailable"); await new Promise((done) => setTimeout(done, 20)); } }
    const target = { socket, windowId: tuple[0], paneId: tuple[1], panePid: Number(tuple[2]), processPid: holder.pid, processStart: startTime(await readFile(`/proc/${holder.pid}/stat`, "utf8")) };
    sessions.push({ id, label: `Controlled synthetic worker ${i}`, rollout, evidence: "local", role: "Controlled synthetic fixture", task: "No model; fixed queue acknowledgement only", contextRoot: root, contextPaths: ["README.md"], tmux: target });
  }
  const registry = join(scratch, "registry.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions }), { mode: 0o600 });
  await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, sessions, receipt, capture, controlledSynthetic: true }));
  const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
  const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
  execFileSync("tar", ["-xzf", bundle, "-C", archive], { timeout: 30000 });
  server = createServer((_request, response) => response.end("owned controlled synthetic steering proof"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(Number(rawPort), "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_STEERING_PACKAGE: archive, SWARM_CODEX_BIN: queue };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
  desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); };
    handlers.set(signal, handler); process.on(signal, handler);
  }
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (status) => resolve(status ?? 1)); });
  const survivor = sessions[0].tmux;
  if (startTime(await readFile(`/proc/${survivor.processPid}/stat`, "utf8")) !== survivor.processStart) throw new Error("Observer disposed external process");
  tmux("kill-server"); tmuxCreated = false;
  await writeFile(join(evidence, "postclose.json"), JSON.stringify({ observedProcessSurvivedAppClose: true, ownedTmuxCleaned: true, desktopCode: code }));
  process.exitCode = code;
} catch (error) {
  await writeFile(join(evidence, "failure.json"), JSON.stringify({ stage: "launcher", message: error.stack })); process.exitCode = 1;
} finally {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  clearTimeout(timer);
  if (tmuxCreated) { try { tmux("kill-server"); } catch {} }
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
