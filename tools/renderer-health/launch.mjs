import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), port = await resolveOwnedVirtualPort();
const owner = process.env.SWARM_X11_OWNERSHIP_DIR, electron = process.env.SWARM_ELECTRON_BIN;
if (!owner || !electron || !isAbsolute(electron)) throw Error("Owned Nix virtual desktop required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const output = runfiles ? join(runfiles, "_main") : join(process.cwd(), "bazel-bin");
const scratch = await mkdtemp(join(owner, "health-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile"), root = join(scratch, "project");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 }); await mkdir(root);
  execFileSync("tar", ["-xzf", join(output, "swarm-ide-foundation.tar.gz"), "-C", extracted], { timeout: 30000 });
  await writeFile(join(root, "source.ts"), "export const message = 'idle recovery proof';\n");
  execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "owned renderer proof"], { cwd: root });
  const js = await readFile(join(output, "tools/renderer-health/renderer-proof.js")), css = await readFile(join(output, "tools/renderer-health/renderer-proof.css"));
  server = createServer((request, response) => {
    if (request.url === "/proof.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(js); }
    else if (request.url === "/proof.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(css); }
    else { response.writeHead(200, { "Content-Type": "text/html" }); response.end('<!doctype html><html><head><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/proof.js"></script></body></html>'); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_HEALTH_PACKAGE: extracted, SWARM_HEALTH_FIXTURE: root, SWARM_RENDERER_URL: `http://127.0.0.1:${port}` };
  for (const name of ["SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
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
