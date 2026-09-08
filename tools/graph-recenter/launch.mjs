import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";

const scripts = dirname(fileURLToPath(import.meta.url)), port = await resolveOwnedVirtualPort();
const owner = process.env.SWARM_X11_OWNERSHIP_DIR, evidence = await realpath(process.env.SWARM_RECENTER_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!owner || !electron || !isAbsolute(electron)) throw new Error("Owned Nix desktop required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main", "swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(bundle);
const scratch = await mkdtemp(join(owner, "recenter-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile"), root = join(scratch, "project");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 }); await mkdir(root);
  execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
  await writeFile(join(root, "worker.ts"), "export const worker = 'graph camera proof';\n");
  await writeFile(join(root, "MODULE.bazel"), 'module(name="camera_proof")\n');
  await writeFile(join(root, "BUILD.bazel"), Array.from({ length: 24 }, (_, index) => `filegroup(name="target${index}", srcs=["worker.ts"])`).join("\n"));
  for (let index = 0; index < 20; index++) {
    const directory = join(root, `service${String(index).padStart(2, "0")}`); await mkdir(directory);
    await writeFile(join(directory, "service.swarm.json"), JSON.stringify({ schemaVersion: 1,
      service: { id: `service:${index}`, displayName: `Worker ${index}` }, implementationPaths: index === 19 ? ["worker.ts"] : [],
      providedInterfaces: [], requiredInterfaces: [], interfaceDeclarationPaths: [] }));
  }
  execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "disposable camera graph"], { cwd: root });
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned graph reveal proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_RECENTER_PACKAGE: extracted, SWARM_RECENTER_FIXTURE: root };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
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
