import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { createDesignTestFixture } from "./fixture.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const port = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_DESIGN_TESTS_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Pinned Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(bundle);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "design-tests-"));
const packaged = join(scratch, "app"), profile = join(scratch, "profile"), fixtureHome = join(scratch, "home"), state = join(scratch, "state");
let server, desktop, killTimer;
const handlers = new Map();
try {
  for (const directory of [packaged, profile, fixtureHome, state]) await mkdir(directory, { mode: 0o700 });
  const environment = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    HOME: fixtureHome, XDG_CONFIG_HOME: profile, XDG_STATE_HOME: state, NODE_PATH: "", SWARM_DESIGN_TESTS_PACKAGE: packaged, SWARM_DESIGN_TESTS_PROFILE: profile };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT",
    "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE", "TMUX", "TMUX_PANE"])
    delete environment[name];
  const fixture = await createDesignTestFixture(scratch, environment);
  await writeFile(join(evidence, "fixture.json"), JSON.stringify(fixture, null, 2));
  execFileSync("tar", ["-xzf", bundle, "-C", packaged], { timeout: 30000 });
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged component test proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"),
    `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: fixture.root, env: environment, stdio: "inherit" });
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
