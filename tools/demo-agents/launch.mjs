import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "./port.cjs";

const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const port = resolveOwnedPort(process.env);
const evidence = await realpath(process.env.SWARM_EXTERNAL_EVIDENCE), scratch = await mkdtemp(join(owner, "external-agents-"));
const socket = join(scratch, "owned.sock"), tmux = (...args) => execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 2000, env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
let server, desktop, timer, target, tmuxCreated = false;
const handlers = new Map();
try {
  const root = join(scratch, "repository"), archive = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(root); await mkdir(archive); await mkdir(profile);
  await writeFile(join(root, "README.md"), "# Synthetic observer proof\nThis is an actual source file, not agent output.\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Swarm proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned synthetic source"]);
  const sessions = [];
  // The original eight-level chain plus a sibling branch, independent root,
  // unknown parent and cycle. All files are explicitly authored synthetic data.
  const parents = [null, 1, 2, 3, 4, 5, 6, 7, 1, null, 10, 99, 14, 13];
  for (let i = 1; i <= parents.length; i++) {
    const id = `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, parent = parents[i - 1] === null ? null : `10000000-0000-4000-8000-${String(parents[i - 1]).padStart(12, "0")}`;
    const rollout = join(scratch, `session-${i}.jsonl`), timestamp = "2026-09-07T12:00:00Z";
    const lines = [
      { type: "session_meta", payload: { id, forked_from_id: parent } },
      { timestamp, type: "event_msg", payload: { type: "task_started" } },
      { timestamp, type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "PRIVATE_INPUT_MUST_NOT_SURFACE" }] } },
      { timestamp, type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: `Synthetic worker ${i}: I am checking the parser contract. This is a recorded assistant message, not a live run.` }] } },
      { timestamp, type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "PRIVATE_ARGUMENT_MUST_NOT_SURFACE" } },
      { timestamp, type: "response_item", payload: { type: "function_call_output", output: "PRIVATE_OUTPUT_MUST_NOT_SURFACE" } },
      { timestamp, type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: `Synthetic worker ${i}: I report that the parser change is ready. Commit and test status are not independently verified.` }] } },
      { timestamp, type: "event_msg", payload: { type: "task_complete" } },
    ];
    await writeFile(rollout, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", { mode: 0o600 });
    sessions.push({ id, label: `Synthetic worker ${i}`, rollout, evidence: "synthetic", role: i === 1 ? "Coordinator" : "Implementation", task: "Parser contract example", contextRoot: root, contextPaths: ["README.md"] });
  }
  const held = sessions[7], holding = join(scratch, "hold.cjs"), ready = join(scratch, "holder.json");
  await writeFile(holding, "const fs=require('node:fs');fs.openSync(process.argv[2],'r');fs.writeFileSync(process.argv[3],JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);\n");
  const tuple = tmux("-f", "/dev/null", "new-session", "-d", "-s", "owned", "-n", "conversation", "-P", "-F", "#{window_id}\t#{pane_id}\t#{pane_pid}", process.execPath, holding, held.rollout, ready).trim().split("\t");
  tmuxCreated = true;
  const deadline = Date.now() + 3000;
  let holder;
  while (!holder) { try { holder = JSON.parse(await readFile(ready, "utf8")); } catch { if (Date.now() > deadline) throw new Error("Owned holder unavailable"); await new Promise((done) => setTimeout(done, 20)); } }
  const proc = await readFile(`/proc/${holder.pid}/stat`, "utf8"), start = proc.slice(proc.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
  target = { socket, windowId: tuple[0], paneId: tuple[1], panePid: Number(tuple[2]), processPid: holder.pid, processStart: start };
  held.tmux = target;
  const other = tmux("new-window", "-d", "-t", "owned", "-n", "elsewhere", "-P", "-F", "#{window_id}", process.execPath, "-e", "setInterval(()=>{},1000)").trim();
  tmux("select-window", "-t", other);
  const registry = join(scratch, "registry.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions }), { mode: 0o600 });
  await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, target, other, selected: held.id, sessions: sessions.map(({ id, label }) => ({ id, label })) }));
  const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
  const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
  execFileSync("tar", ["-xzf", bundle, "-C", archive], { timeout: 30000 });
  server = createServer((_request, response) => response.end("owned external observer proof"));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: registry, SWARM_EXTERNAL_PACKAGE: archive };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
  desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) { const handler = () => { desktop.kill("SIGTERM"); timer ??= setTimeout(() => desktop.kill("SIGKILL"), 2000); }; handlers.set(signal, handler); process.on(signal, handler); }
  const code = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (status) => resolve(status ?? 1)); });
  const after = await readFile(`/proc/${holder.pid}/stat`, "utf8");
  if (after.slice(after.lastIndexOf(")") + 2).trim().split(/\s+/)[19] !== start) throw new Error("Observer disposed external process");
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
