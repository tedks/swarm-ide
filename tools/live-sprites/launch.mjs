import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { lstat, readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "../demo-agents/port.cjs";
const scripts = dirname(fileURLToPath(import.meta.url)), owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual display required");
const info = await lstat(owner);
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || info.mode & 0o077 || (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid owner");
const scratch = await mkdtemp(join(owner, "sprites-")), packaged = join(scratch, "app"), profile = join(scratch, "profile");
await mkdir(packaged); await mkdir(profile);
const primary = join(scratch, "primary"), feature = join(scratch, "feature-agent"), unrelated = join(scratch, "unrelated");
const ditzHome = join(scratch, "ditz-home");
await mkdir(primary); await mkdir(unrelated); await mkdir(ditzHome);
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
for (const root of [primary, unrelated]) git(root, "init", "--quiet", "--initial-branch=master");
await mkdir(join(primary, "src"), { recursive: true });
await mkdir(join(primary, "docs"), { recursive: true });
await mkdir(join(primary, "services/api"), { recursive: true });
await mkdir(join(primary, ".swarm"), { recursive: true });
await writeFile(join(primary, "README.md"), "# Owned project sprite walkthrough\n");
await writeFile(join(primary, ".gitignore"), ".ditz-worktree/\n");
await writeFile(join(primary, "src/shared.ts"), "export const shared = true;\n");
await writeFile(join(primary, "docs/system.md"), "# Owned system\n\nA sanitized graph-sprite walkthrough.\n");
await writeFile(join(primary, "services/api/service.swarm.json"), JSON.stringify({ schemaVersion: 1,
  service: { id: "service:api", displayName: "Owned API" }, implementationPaths: ["src/shared.ts"] }));
await writeFile(join(primary, ".swarm/plans.json"), JSON.stringify({ version: 1, nodes: [{ id: "owned:system", kind: "plan",
  title: "Owned system", parentId: null, docs: ["docs/system.md"], sourcePaths: ["src/shared.ts"], taskIds: ["sprite-layout-task"], contextRefs: [],
  design: { summary: "Owned component projection for project-wide agent visibility.", state: "implemented", connections: [], buildTargets: [] } }] }));
git(primary, "add", ".");
git(primary, "-c", "user.name=Sprite proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Owned sprite project");
const ditzEnvironment = { ...process.env, HOME: ditzHome, XDG_CONFIG_HOME: ditzHome,
  DITZ_USER: "Sprite proof", DITZ_EMAIL: "proof@example.invalid",
  GIT_AUTHOR_NAME: "Sprite proof", GIT_AUTHOR_EMAIL: "proof@example.invalid",
  GIT_COMMITTER_NAME: "Sprite proof", GIT_COMMITTER_EMAIL: "proof@example.invalid" };
const ditz = (...args) => execFileSync("ditz", args, { cwd: primary, env: ditzEnvironment, stdio: "ignore" });
ditz("init", "--no-onboarding");
ditz("add", "Sprite layout task", "--id", "sprite-layout-task", "--type", "task", "--desc", "Owned task-node sprite geometry proof.");
git(primary, "worktree", "add", "--quiet", "-b", "feature/agent", feature);
await writeFile(join(unrelated, "src.txt"), "unrelated\n");
git(unrelated, "add", ".");
git(unrelated, "-c", "user.name=Sprite proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "Unrelated project");
const ids = { primary: "10000000-0000-4000-8000-000000000001", feature: "20000000-0000-4000-8000-000000000002",
  pathless: "30000000-0000-4000-8000-000000000003", unrelated: "40000000-0000-4000-8000-000000000004",
  task: "50000000-0000-4000-8000-000000000005" };
const heavyIds = Array.from({ length: 20 }, (_, index) => `${(index + 6).toString(16).padStart(8, "0")}-0000-4000-8000-${String(index + 6).padStart(12, "0")}`);
const rollout = async (id, path) => {
  const file = join(scratch, `${id}.jsonl`);
  const records = [
    { type: "session_meta", payload: { id } },
    { type: "event_msg", timestamp: "2026-09-10T16:00:00Z", payload: { type: "task_started", turn_id: `owned-${id}` } },
    ...(path ? [{ type: "response_item", timestamp: "2026-09-10T16:00:01Z", payload: { type: "custom_tool_call", name: "apply_patch",
      input: `*** Begin Patch\n*** Update File: ${path}\n@@\n-owned\n+owned proof\n*** End Patch` } }] : []),
    { type: "response_item", timestamp: "2026-09-10T16:00:02Z", payload: { type: "message", role: "assistant",
      content: [{ type: "output_text", text: path ? "Working in the owned fixture." : "Branch-only work with no typed file event." }] } },
  ];
  await writeFile(file, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  return file;
};
const sessions = [
  { id: ids.primary, label: "Primary agent", rollout: await rollout(ids.primary, "src/shared.ts"), evidence: "local", contextRoot: primary },
  { id: ids.feature, label: "Feature agent", rollout: await rollout(ids.feature, "src/shared.ts"), evidence: "local", contextRoot: feature },
  { id: ids.pathless, label: "Branch-only agent", rollout: await rollout(ids.pathless), evidence: "local", contextRoot: feature },
  { id: ids.unrelated, label: "Unrelated agent", rollout: await rollout(ids.unrelated, "src.txt"), evidence: "local", contextRoot: unrelated },
  { id: ids.task, label: "Task agent", rollout: await rollout(ids.task, "src/shared.ts"), evidence: "local", contextRoot: feature, task: "sprite-layout-task" },
  ...await Promise.all(heavyIds.map(async (id, index) => ({ id, label: `Unplaced ${index + 1}`, rollout: await rollout(id), evidence: "local", contextRoot: feature }))),
];
const privateRegistry = join(scratch, "registry.json");
await writeFile(privateRegistry, JSON.stringify({ version: 1, sessions }), { mode: 0o600 });
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
const server = createServer((_request, response) => response.end("owned sprite proof"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(resolveOwnedPort(process.env), "127.0.0.1", resolve); });
const environment = { ...process.env, NODE_PATH: "", SWARM_EXTERNAL_AGENTS_REGISTRY: privateRegistry, SWARM_SPRITE_PACKAGE: packaged,
  SWARM_SPRITE_PRIMARY_SESSION: ids.primary, SWARM_SPRITE_FEATURE_SESSION: ids.feature,
  SWARM_SPRITE_PATHLESS_SESSION: ids.pathless, SWARM_SPRITE_UNRELATED_SESSION: ids.unrelated,
  SWARM_SPRITE_TASK_SESSION: ids.task, SWARM_SPRITE_HEAVY_SESSIONS: JSON.stringify(heavyIds) };
for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
const desktop = spawn(process.env.SWARM_ELECTRON_BIN, [...resolveElectronRuntimeArguments(), join(scripts, "proof.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: primary, env: environment, stdio: "inherit" });
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
