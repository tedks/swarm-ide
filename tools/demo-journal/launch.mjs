import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";
const scripts = dirname(fileURLToPath(import.meta.url));
const owner = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!owner || !isAbsolute(owner) || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
const stat = await lstat(owner);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) ||
  (await readFile(join(owner, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid virtual owner");
const evidence = await realpath(process.env.SWARM_JOURNAL_EVIDENCE), authoring = await realpath(process.env.SWARM_JOURNAL_AUTHORING_PROOF);
const port = Number(process.env.SWARM_DEV_PORT);
if (port !== 55174) throw new Error("Owned journal proof requires port55174");
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron || !isAbsolute(electron)) throw new Error("Nix Electron required");
const runfiles = process.env.TEST_SRCDIR || process.env.RUNFILES_DIR;
const archive = runfiles ? join(runfiles, "_main/swarm-ide-foundation.tar.gz") : join(process.cwd(), "bazel-bin/swarm-ide-foundation.tar.gz");
await access(archive);
const scratch = await mkdtemp(join(owner, "journal-package-"));
let server, desktop, killTimer;
const handlers = new Map();
try {
  const extracted = join(scratch, "app"), profile = join(scratch, "profile"), root = join(scratch, "repository");
  await mkdir(extracted); await mkdir(profile, { mode: 0o700 });
  execFileSync("tar", ["-xzf", archive, "-C", extracted], { timeout: 30000 });
  const supplied = JSON.parse(await readFile(join(authoring, "proof-repo.json"), "utf8"));
  if (!isAbsolute(supplied.root) || !supplied.root.startsWith(`${authoring}/journal-real-repo-`)) throw new Error("Explicit owned authoring repository required");
  await cp(supplied.root, root, { recursive: true, dereference: false });
  await cp(join(authoring, "proof-first-bundle.json"), join(root, ".swarm/changelog-bundle.json"));
  await cp(join(authoring, "summary-proof-first.raw.json"), join(root, ".swarm/changelog-candidate.json"));
  const validation = execFileSync("bash", [join(scripts, "author.sh"), "validate", root], { cwd: process.cwd(), timeout: 15000, encoding: "utf8", env: process.env });
  await writeFile(join(evidence, "first-validation.txt"), validation);
  await writeFile(join(evidence, "fixture.json"), JSON.stringify({ root, ...Object.fromEntries(Object.entries(supplied).filter(([key]) => key !== "root")) }));
  server = createServer((_request, response) => { response.writeHead(200); response.end("owned packaged Journal proof"); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const environment = { ...process.env, NODE_PATH: "", SWARM_JOURNAL_PACKAGE: extracted, SWARM_JOURNAL_PROFILE: profile,
    SWARM_JOURNAL_SOURCE: process.cwd(), SWARM_JOURNAL_AUTHOR_SCRIPT: join(scripts, "author.sh") };
  for (const name of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "SWARM_WORKSPACE_ROOT", "SWARM_AGENT_STORE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
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
