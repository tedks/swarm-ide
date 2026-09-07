// Own the repository, profile, display, and port; load the unmodified package.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

// Git redirection must never turn scratch setup into a write to another repo.
const inertGitPreferences = new Set(["GIT_EDITOR", "GIT_PAGER"]);
if (Object.keys(process.env).some((name) => name.startsWith("GIT_") && !inertGitPreferences.has(name)))
  throw new Error("Ambient Git environment is unsupported for the disposable syntax proof");
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_SYNTAX_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Pinned Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "syntax-"));
const root = join(scratch, "syntax-proof"), packaged = join(scratch, "app"), profile = join(scratch, "profile"), privateHome = join(scratch, "home");
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const dir of [root, packaged, profile, privateHome]) await mkdir(dir, { mode: 0o700 });
  const files = {
    "syntax.ts": '// Syntax acceptance source\nexport const greeting: string = "hello";\nexport function double(value: number): number {\n  return value * 2;\n}\n',
    "settings.json": '{\n  "enabled": true,\n  "message": "hello",\n  "count": 42\n}\n',
    "README.md": '# Syntax proof\n\nA **retained** buffer with `inline code`.\n\n- Plain repository source\n',
  };
  for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content);
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
    cwd: root, encoding: "utf8", timeout: 10000,
    env: { ...cleanEnvironment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Syntax proof", GIT_AUTHOR_EMAIL: "syntax@example.invalid", GIT_COMMITTER_NAME: "Syntax proof",
      GIT_COMMITTER_EMAIL: "syntax@example.invalid", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" },
  }).trim();
  git("init", "-b", "syntax-proof"); git("add", "--", ...Object.keys(files)); git("commit", "-m", "Deterministic syntax acceptance source");
  await writeFile(join(evidence, "repository.json"), JSON.stringify({ root, files, commit: git("rev-parse", "HEAD") }, null, 2));
  execFileSync("tar", ["-xzf", archive, "-C", packaged], { timeout: 30000 });
  server = createServer((_req, res) => { res.writeHead(200); res.end("owned syntax proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...cleanEnvironment, HOME: privateHome, XDG_CONFIG_HOME: profile, NODE_PATH: "",
    SWARM_SYNTAX_PACKAGE: packaged, SWARM_SYNTAX_PROFILE: profile };
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
