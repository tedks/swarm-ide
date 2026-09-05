import { context } from "esbuild";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const workspace = process.cwd();
const outputRoot = resolve(workspace, ".swarm-dev");
const electronBinary = process.env.SWARM_ELECTRON_BIN;

if (!electronBinary) {
  throw new Error("SWARM_ELECTRON_BIN is unset; enter through `nix develop`");
}

await mkdir(outputRoot, { recursive: true });

let desktop = null;
let shuttingDown = false;
let restartingDesktop = false;
let restartTimer = null;
let watchersReady = false;

function launchDesktop() {
  if (shuttingDown) return;
  desktop = spawn(electronBinary, [resolve(outputRoot, "app/electron/main.js")], {
    cwd: workspace,
    env: {
      ...process.env,
      SWARM_RENDERER_URL: "http://127.0.0.1:5173",
    },
    stdio: "inherit",
  });
  desktop.on("exit", (code, signal) => {
    desktop = null;
    if (restartingDesktop) {
      restartingDesktop = false;
      return;
    }
    if (!shuttingDown && restartTimer === null) {
      console.error(`Electron exited unexpectedly (${signal ?? code ?? "unknown"})`);
      void shutdown(1);
    }
  });
}

function requestDesktopRestart() {
  if (!watchersReady || shuttingDown) return;
  if (restartTimer !== null) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!desktop) {
      launchDesktop();
      return;
    }
    restartingDesktop = true;
    desktop.once("exit", launchDesktop);
    desktop.kill("SIGTERM");
  }, 120);
}

function restartPlugin(name) {
  return {
    name: `restart-electron-${name}`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) requestDesktopRestart();
      });
    },
  };
}

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: "inline",
  logLevel: "info",
  external: ["electron"],
};

const builds = [
  await context({
    ...common,
    entryPoints: [resolve(workspace, "app/electron/main.ts")],
    outfile: resolve(outputRoot, "app/electron/main.js"),
    plugins: [restartPlugin("main")],
  }),
  await context({
    ...common,
    entryPoints: [resolve(workspace, "app/electron/preload.ts")],
    outfile: resolve(outputRoot, "app/electron/preload.js"),
    plugins: [restartPlugin("preload")],
  }),
  await context({
    ...common,
    entryPoints: [resolve(workspace, "core/worker.ts")],
    outfile: resolve(outputRoot, "core/worker.js"),
    plugins: [restartPlugin("core")],
  }),
];

for (const build of builds) await build.rebuild();
for (const build of builds) await build.watch();

const vite = await createServer({
  configFile: resolve(workspace, "vite.config.mts"),
  clearScreen: false,
});
await vite.listen();
vite.printUrls();

watchersReady = true;
launchDesktop();

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer !== null) clearTimeout(restartTimer);
  desktop?.kill("SIGTERM");
  await Promise.all(builds.map((build) => build.dispose()));
  await vite.close();
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
