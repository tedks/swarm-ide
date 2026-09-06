import { execFileSync, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { preview } from "vite";
import { parseRehearsalArguments, rehearsalHelp } from "./options.mjs";
import { resolveDevEndpoint } from "../dev-port.mjs";
import { resolveElectronRuntimeArguments } from "../electron-runtime.mjs";

async function main() {
  const options = parseRehearsalArguments(process.argv.slice(2));
  if (options.help) { console.log(rehearsalHelp); return; }
  const workspace = await realpath(options.workspace);
  // This prototype provider exposes this fixed registered example, not arbitrary repos.
  await access(join(workspace, "examples/checkout-world/services/fraudcheck/fraudcheck.ts"), constants.R_OK);
  execFileSync("git", ["-C", workspace, "rev-parse", "--verify", "HEAD"], { stdio: "ignore", timeout: 5000 });
  const virtual = options.mode === "owned-acceptance";
  if (virtual) {
    const owned = process.env.SWARM_X11_OWNERSHIP_DIR;
    if (!owned || !isAbsolute(owned) || !process.env.SWARM_X11_TOKEN || process.env.DISPLAY === ":0" || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY) throw new Error("Owned virtual X11 required");
    const stat = await lstat(owned);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 ||
        (await readFile(join(owned, "token"), "utf8")).trim() !== process.env.SWARM_X11_TOKEN) throw new Error("Invalid X11 owner");
  } else if (!process.env.DISPLAY) throw new Error("An explicitly selected X11 DISPLAY is required for interactive desktop mode");
  const electron = process.env.SWARM_ELECTRON_BIN;
  if (!electron || !isAbsolute(electron)) throw new Error("Run through nix develop and Bazel (SWARM_ELECTRON_BIN required)");
  const runtimeArguments = resolveElectronRuntimeArguments();
  const version = JSON.parse(await readFile("node_modules/electron/package.json", "utf8")).version;
  if (execFileSync(electron, [...runtimeArguments, "--version"], { encoding: "utf8", timeout: 10000 }).trim().replace(/^v/, "") !== version) throw new Error("Electron version mismatch");
  const bundle = resolve("bazel-bin/tools/agent-rehearsal.tar.gz");
  await access(bundle, constants.R_OK);
  const profileParent = virtual ? process.env.SWARM_X11_OWNERSHIP_DIR : join(homedir(), ".local", "state", "swarm-ide-rehearsals");
  await mkdir(profileParent, { recursive: true, mode: 0o700 });
  const parentStat = await lstat(profileParent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || parentStat.uid !== process.getuid?.() || (parentStat.mode & 0o077) !== 0) throw new Error("Rehearsal profile parent must be owner-private");
  const profile = await mkdtemp(join(profileParent, "session-"));
  await chmod(profile, 0o700);
  console.log(`${rehearsalHelp}\nWorkspace: ${workspace}\nPrivate profile: ${profile}\nHistory is retained on normal human close. No transcript is exported by this launcher.`);
  const extracted = await mkdtemp(join(tmpdir(), "swarm-rehearsal-artifact-"));
  let server;
  let desktop;
  let terminating = false;
  let killTimer;
  const signals = new Map();
  try {
    execFileSync("tar", ["-xzf", bundle, "-C", extracted], { timeout: 30000 });
    const endpoint = virtual ? resolveDevEndpoint() : null;
    if (endpoint && [5173, 55173].includes(endpoint.port)) throw new Error("Watched/unrelated development ports are forbidden for rehearsal tests");
    if (endpoint) server = await preview({ configFile: false, root: extracted, build: { outDir: "renderer" },
      preview: { host: endpoint.host, port: endpoint.port, strictPort: true, allowedHosts: [endpoint.host], cors: false } });
    const environment = { ...process.env, SWARM_DEV_CONTROL: "", VITE_SWARM_AGENT_DEMO: "0" };
    delete environment.SWARM_RENDERER_URL;
    delete environment.SWARM_AGENT_STORE_ROOT;
    // Both modes exercise the same compiled file:// renderer path. The virtual
    // harness's loopback preview only proves artifact readiness for its existing
    // port/window ownership protocol; human mode opens no listener at all.
    const args = [...runtimeArguments, join(extracted, "app/electron/main.js"), `--swarm-rehearsal-profile=${profile}`, `--swarm-rehearsal-mode=${options.mode}`];
    if (endpoint) args.push(endpoint.rendererProcessArgument);
    desktop = spawn(electron, args, { cwd: workspace, env: environment, stdio: "inherit" });
    const completed = new Promise((resolveExit, reject) => {
      desktop.once("error", reject);
      desktop.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      const handler = () => { if (terminating) return; terminating = true; desktop.kill("SIGTERM"); killTimer = setTimeout(() => desktop.kill("SIGKILL"), 3000); };
      signals.set(signal, handler); process.on(signal, handler);
    }
    process.exitCode = await completed;
  } finally {
    for (const [signal, handler] of signals) process.removeListener(signal, handler);
    if (killTimer) clearTimeout(killTimer);
    if (server) await new Promise((done) => server.httpServer.close(done));
    // Only generated executable assets are removed; user-entered profile data stays.
    await rm(extracted, { recursive: true, force: true });
    if (virtual) console.log(`Owned synthetic profile remains inside X11 cleanup boundary: ${profile}`);
    else console.log(`Retained private rehearsal history: ${profile}`);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Rehearsal failed"); process.exitCode = 2; });
