// Manual proof over unchanged production main/preload/core. The repository is
// ordinary disposable Git input, never a replacement transport or job provider.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

// A redirected Git worktree/index could escape scratch. Permit only harmless
// operator preferences, then clear Git settings before every scratch command.
const inertGitPreferences = new Set(["GIT_EDITOR", "GIT_PAGER"]);
if (Object.keys(process.env).some((name) => name.startsWith("GIT_") && !inertGitPreferences.has(name)))
  throw new Error("Ambient Git environment is unsupported for the resource proof");
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_RESOURCES_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Pinned Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz")
  : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "build-resources-"));
const root = join(scratch, "repository"), packaged = join(scratch, "app"), profile = join(scratch, "profile");
const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
  cwd: root, encoding: "utf8", timeout: 10000,
  env: { ...cleanEnvironment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
}).trim();
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const dir of [root, packaged, profile]) await mkdir(dir, { mode: 0o700 });
  const sourceText = "# Build resource instrument proof\n\nThis is an ordinary tracked source document.\nKeep this unsaved editor buffer while inspecting an illustrative profile.\n";
  await writeFile(join(root, "README.md"), sourceText);
  git("init", "-b", "resource-proof");
  git("add", "README.md");
  git("-c", "user.name=Swarm resource proof", "-c", "user.email=resource-proof@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-m", "Ordinary source for resource instrument acceptance");
  await writeFile(join(evidence, "repository.json"), JSON.stringify({ root, sourcePath: "README.md", sourceText,
    commit: git("rev-parse", "HEAD"), telemetry: "absent; example remains illustrative" }, null, 2));
  execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged build resource proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...cleanEnvironment, XDG_CONFIG_HOME: profile, NODE_PATH: "",
    SWARM_RESOURCES_PACKAGE: packaged, SWARM_RESOURCES_PROFILE: profile };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT",
    "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
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
