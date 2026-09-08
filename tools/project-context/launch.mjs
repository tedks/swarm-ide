// Test-only: ordinary local Node server, real Git project and packaged application.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedVirtualPort } from "../task-integration/owned-port.mjs";
const scripts = dirname(fileURLToPath(import.meta.url));
const awaitPort = await resolveOwnedVirtualPort();
const evidence = await realpath(process.env.SWARM_PROJECT_CONTEXT_EVIDENCE);
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(bundle);
const scratch = await mkdtemp(join(process.env.SWARM_X11_OWNERSHIP_DIR, "project-context-"));
const extracted = join(scratch, "app"), profile = join(scratch, "profile"), root = join(scratch, "project");
await Promise.all([mkdir(extracted), mkdir(profile, { mode: 0o700 }), mkdir(root)]);
execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
await writeFile(join(root, "package.json"), JSON.stringify({ name: "automatic-context-proof", private: true, dependencies: { react: "1" }, scripts: { build: "not-executed", test: "not-executed" } }));
await mkdir(join(root, "sites", "docs"), { recursive: true });
await writeFile(join(root, "sites", "docs", "hugo.toml"), 'baseURL = "https://docs.example.org/"\ntitle = "Proof documentation"\n');
await mkdir(join(root, "contracts", "library"), { recursive: true });
await mkdir(join(root, "contracts", "consumer"), { recursive: true });
await writeFile(join(root, "contracts", "library", "Move.toml"), '[package]\nname = "ProofLibrary"\n[addresses]\nProofLibrary = "0x0"\n');
await writeFile(join(root, "contracts", "consumer", "Move.toml"), '[package]\nname = "ProofConsumer"\n[dependencies]\nProofLibrary = { local = "../library" }\n');
await writeFile(join(root, "README.md"), "# Runtime context proof\n");
for (const args of [["init"], ["add", "."], ["-c", "user.name=Swarm proof", "-c", "user.email=proof@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Initial fixture"]]) execFileSync("git", args, { cwd: root, stdio: "pipe" });
const testServer = spawn(process.execPath, ["-e", "require('node:http').createServer((q,s)=>s.end('project context')).listen(0,'127.0.0.1',function(){console.log(this.address().port)})"], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
const serverExited = new Promise((resolve) => { testServer.once("exit", resolve); testServer.once("error", resolve); });
let desktop, timer;
const readiness = createServer((_request, response) => response.end("project context"));
const stop = () => { desktop?.kill("SIGTERM"); testServer.kill("SIGTERM"); timer ??= setTimeout(() => { desktop?.kill("SIGKILL"); testServer.kill("SIGKILL"); }, 2000); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
try {
  const serverPort = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Node server startup timeout")), 3000);
    testServer.once("error", reject); testServer.stdout.once("data", (data) => { clearTimeout(timeout); resolve(Number(String(data).trim())); });
  });
  await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, pid: testServer.pid, port: serverPort }));
  await new Promise((resolve, reject) => { readiness.once("error", reject); readiness.listen(awaitPort, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_CONTEXT_PACKAGE: extracted, SWARM_CONTEXT_PROFILE: profile };
  for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "SWARM_EXTERNAL_AGENTS_REGISTRY", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[key];
  desktop = spawn(electron, [...resolveElectronRuntimeArguments(), join(scripts, "acceptance.cjs"), `--user-data-dir=${profile}`, process.env.SWARM_RENDERER_PROCESS_ARGUMENT], { cwd: root, env: environment, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => { desktop.once("error", reject); desktop.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); clearTimeout(timer);
  if (testServer.exitCode === null && testServer.signalCode === null) testServer.kill("SIGTERM");
  await new Promise((resolve) => readiness.close(resolve));
  await serverExited;
}
