// Explicit private JSONL inputs to unchanged production main/preload/core.
// No live agent, model messages, tmux target, or replacement bridge/provider.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

const inertGitPreferences = new Set(["GIT_EDITOR", "GIT_PAGER"]);
if (Object.keys(process.env).some((name) => name.startsWith("GIT_") && !inertGitPreferences.has(name)))
  throw new Error("Ambient Git environment is unsupported for the Activity proof");
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_ACTIVITY_USABILITY_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Pinned Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz")
  : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "activity-usability-"));
const root = join(scratch, "repository"), packaged = join(scratch, "app"), profile = join(scratch, "profile");
const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
  cwd: root, encoding: "utf8", timeout: 10000,
  env: { ...cleanEnvironment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
}).trim();
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const dir of [root, packaged, profile]) await mkdir(dir, { mode: 0o700 });
  const sourceText = "# Activity usability proof\n\nAn ordinary tracked README; no application fixture markers.\n";
  await writeFile(join(root, "README.md"), sourceText);
  git("init", "-b", "activity-proof"); git("add", "README.md");
  git("-c", "user.name=Swarm Activity proof", "-c", "user.email=activity-proof@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-m", "Ordinary source for Activity usability proof");
  const command = "git status --short", patch = "*** Begin Patch\n*** Update File: README.md\n@@\n-Old proof text\n+Recorded proof text\n*** End Patch";
  const sessions = [], events = [];
  for (let index = 1; index <= 2; index += 1) {
    const id = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const rollout = join(scratch, `proof-${index}.jsonl`), at = `2026-09-08T12:34:0${index}.000Z`;
    const payload = index === 1
      ? { type: "function_call", name: "exec_command", call_id: "proof-command", arguments: JSON.stringify({ cmd: command, workdir: root }) }
      : { type: "custom_tool_call", name: "apply_patch", call_id: "proof-edit", input: patch };
    await writeFile(rollout, [
      { type: "session_meta", payload: { id, timestamp: at, forked_from_id: null } },
      { timestamp: at, type: "response_item", payload },
    ].map((record) => JSON.stringify(record)).join("\n") + "\n", { mode: 0o600 });
    sessions.push({ id, label: `Proof fixture ${index}`, rollout, evidence: "local", role: "Controlled JSONL proof fixture",
      task: "Recorded operations only; no model or command executed", contextRoot: root, contextPaths: ["README.md"] });
    events.push({ sessionId: id, at, text: index === 1 ? `Ran ${command}` : "Edited README.md" });
  }
  const registry = join(scratch, "registry.json"), registryText = JSON.stringify({ version: 1, sessions });
  await writeFile(registry, registryText, { mode: 0o600 });
  await writeFile(join(evidence, "repository.json"), JSON.stringify({ root, sourcePath: "README.md", sourceText,
    registry, registryText, events, commit: git("rev-parse", "HEAD"), controlledFixture: true, modelMessages: 0 }, null, 2));
  execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged Activity usability proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...cleanEnvironment, XDG_CONFIG_HOME: profile, NODE_PATH: "",
    SWARM_ACTIVITY_USABILITY_PACKAGE: packaged, SWARM_ACTIVITY_USABILITY_PROFILE: profile };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT",
    "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
  environment.SWARM_EXTERNAL_AGENTS_REGISTRY = registry;
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"),
    `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
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
