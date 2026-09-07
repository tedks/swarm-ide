// TEST ONLY: existing disposable real Git/Ditz fixture, unchanged packaged app.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlanFixture } from "../demo-plans/fixture.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
import { resolveOwnedPort } from "../demo-plans/port.cjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY)
  throw new Error("Owned virtual X11 required");
const ownerStat = await lstat(owner);
if (!ownerStat.isDirectory() || ownerStat.isSymbolicLink() || ownerStat.uid !== process.getuid() || (ownerStat.mode & 0o077) !== 0 ||
    (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = await realpath(process.env.SWARM_PLANS_EVIDENCE);
const port = resolveOwnedPort(process.env), electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const bundle = runfiles ? join(runfiles, "_main", "swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin", "swarm-ide-foundation.tar.gz");
await access(bundle);
const scratch = await mkdtemp(join(owner, "swarm-plan-actions-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
  const fixture = await createPlanFixture(scratch);
  // Deliberately authored layout pressure in the private working index, not
  // inferred architecture or metadata injection into a renderer/provider.
  const root = fixture.index.nodes.find((node) => node.parentId === null);
  root.contextRefs = Array.from({ length: 12 }, (_, index) => ({ kind: "doctrine", path: "docs/doctrine.md",
    note: `Disposable authored briefing note ${index + 1}. Keep selected actions visible while reading supporting guidance. This is layout-test input, not observed live architecture.` }));
  await writeFile(join(fixture.root, ".swarm/plans.json"), `${JSON.stringify(fixture.index, null, 2)}\n`);
  await writeFile(join(evidence, "fixture.json"), JSON.stringify(fixture));
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged plan actions proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_PLANS_PACKAGE: extracted, SWARM_PLANS_PROFILE: profile,
    SWARM_PLANS_EVIDENCE: evidence, SWARM_PLANS_SCRATCH: scratch };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"])
    delete environment[name];
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
