// Manual proof only: copy committed Swarm source and its actual local metadata.
// Never imports a provider fixture, private observer registry or user profile.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

// Git environment overrides ignore cwd and can redirect init/fetch/checkout
// outside scratch. This manual proof accepts none, including empty overrides.
// Reject before invoking Git or performing owned launch/setup work; do not echo
// caller-controlled paths or injected configuration values.
if (Object.keys(process.env).some((name) => name.startsWith("GIT_")))
  throw new Error("Ambient Git environment is unsupported for the disposable tour");

const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
const evidence = await realpath(process.env.SWARM_TOUR_EVIDENCE);
const source = await realpath(process.cwd());
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Pinned Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(source, "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(owner, "connected-tour-"));
const root = join(scratch, "swarm-tour"), packaged = join(scratch, "app"), profile = join(scratch, "profile"), privateHome = join(scratch, "home");
const command = (exe, args, cwd = source) => execFileSync(exe, args, { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" } }).trim();
const git = (cwd, ...args) => command("git", ["-c", "core.hooksPath=/dev/null", ...args], cwd);
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const dir of [root, packaged, profile, privateHome]) await mkdir(dir, { mode: 0o700 });
  const sourceCommit = git(source, "rev-parse", "HEAD");
  const metadataCommit = git(source, "rev-parse", "--verify", "refs/heads/ditz-metadata");
  git(root, "init", "-b", "proof-bootstrap");
  // Explicit trusted local source only; no remote/network fetch or metadata edits.
  git(root, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", "fetch", "--no-tags", source,
    `${sourceCommit}:refs/heads/tour`, `${metadataCommit}:refs/heads/ditz-metadata`);
  git(root, "checkout", "tour");
  command("tar", ["-xzf", archive, "-C", packaged]);
  const index = JSON.parse(await readFile(join(root, ".swarm/plans.json"), "utf8"));
  if (!index.nodes.find((node) => node.id === "component:task-context")?.taskIds.includes("repo-task-context-core-d4"))
    throw new Error("Commit the tour associations before running the proof");
  await writeFile(join(evidence, "repository.json"), JSON.stringify({ root, sourceCommit, metadataCommit,
    actualTaskMetadata: true, sourcePath: "core/tasks/draft-context.ts" }, null, 2));
  server = createServer((_req, res) => { res.writeHead(200); res.end("owned connected tour"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, HOME: privateHome, XDG_CONFIG_HOME: profile, NODE_PATH: "",
    SWARM_TOUR_PACKAGE: packaged, SWARM_TOUR_PROFILE: profile };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT",
    "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "CODEX_HOME", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"])
    delete environment[name];
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
