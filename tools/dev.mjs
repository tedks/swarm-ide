import { context } from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { createServer } from "vite";
import { resolveDevEndpoint } from "./dev-port.mjs";
import { resolveElectronRuntimeArguments } from "./electron-runtime.mjs";
import { classifyUpdate } from "./dev-update.mjs";

const workspace = process.cwd();
const outputRoot = resolve(workspace, ".swarm-dev");
const electronBinary = process.env.SWARM_ELECTRON_BIN;
const devEndpoint = resolveDevEndpoint();
const electronRuntimeArguments = resolveElectronRuntimeArguments();

if (!electronBinary) {
  throw new Error("SWARM_ELECTRON_BIN is unset; enter through `nix develop`");
}

const electronPackage = JSON.parse(
  await readFile(resolve(workspace, "node_modules/electron/package.json"), "utf8"),
);
const runtimeElectronVersion = execFileSync(electronBinary, [...electronRuntimeArguments, "--version"], {
  encoding: "utf8",
})
  .trim()
  .replace(/^v/, "");
if (runtimeElectronVersion !== electronPackage.version) {
  throw new Error(
    `Electron version mismatch: Nix runtime ${runtimeElectronVersion}, package types ${electronPackage.version}`,
  );
}

await mkdir(outputRoot, { recursive: true });

let desktop = null;
let shuttingDown = false;
let watchersReady = false;
const controlPath = resolve(outputRoot, `control-${process.pid}.json`);
let serial = 0;
let coreRevision = 0;
let preloadRevision = 0;
let previousOutputs = null;
let restartRequired = false;
async function notify(action, message) {
  console.log(`[dev] ${action}: ${message}`);
  await writeFile(`${controlPath}.tmp`, JSON.stringify({ serial: ++serial, coreRevision, preloadRevision, action, message: message.slice(0, 2_000) }));
  await rename(`${controlPath}.tmp`, controlPath);
}

function launchDesktop() {
  if (shuttingDown) return;
  desktop = spawn(
    electronBinary,
    // Electron clears its procfs environment and flattens cmdline into one
    // process-title string. This inert, slash-terminated marker lets the X11
    // verification tools identify the exact window without configuring it.
    [
      ...electronRuntimeArguments,
      resolve(outputRoot, "app/electron/main.js"),
      devEndpoint.rendererProcessArgument,
    ],
    {
      cwd: workspace,
      env: {
        ...process.env,
        SWARM_RENDERER_URL: devEndpoint.rendererUrl,
        SWARM_DEV_CONTROL: controlPath,
      },
      stdio: "inherit",
    },
  );
  desktop.on("exit", (code, signal) => {
    desktop = null;
    if (!shuttingDown) {
      console.error(`Electron exited unexpectedly (${signal ?? code ?? "unknown"})`);
      void shutdown(1);
    }
  });
}

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: "external",
  logLevel: "info",
  external: ["electron"],
};

const build = await context({
  ...common,
  entryPoints: ["app/electron/main.ts", "app/electron/preload.ts", "core/worker.ts", "core/agents/owner-process.mjs"].map((path) => resolve(workspace, path)),
  outbase: workspace,
  outdir: outputRoot,
  write: false,
  plugins: [{ name: "minimal-live-update", setup(builder) {
    builder.onEnd(async (result) => {
      if (shuttingDown) return;
      if (result.errors.length) {
        if (watchersReady) await notify("build-failed", `Build failed; last usable code retained. ${result.errors[0].text}`);
        return;
      }
      const next = new Map(result.outputFiles.filter((file) => file.path.endsWith(".js")).map((file) => [relative(outputRoot, file.path), file.text]));
      const action = classifyUpdate(previousOutputs, next);
      // Once the shell is incompatible, don't install a partially newer world.
      // Renderer HMR and data observation continue; adopting the shell is manual.
      if (watchersReady && (restartRequired || action === "restart-required")) {
        restartRequired = true;
        await notify("restart-required", "Main process changed — deliberate app restart required; current window retained.");
        return;
      }
      for (const file of result.outputFiles) {
        await mkdir(dirname(file.path), { recursive: true });
        await writeFile(`${file.path}.tmp`, file.contents);
        await rename(`${file.path}.tmp`, file.path);
      }
      previousOutputs = next;
      if (action === "core" || action === "core-preload") coreRevision += 1;
      if (action === "preload" || action === "core-preload") preloadRevision += 1;
      if (watchersReady) await notify(action, action === "unchanged" ? "Build current; executable code unchanged" : `Applying ${action} update without replacing the native window`);
    });
  } }],
});
let vite;
try {
  await build.rebuild();
  await build.watch();
  vite = await createServer({
    configFile: resolve(workspace, "vite.config.mts"),
    clearScreen: false,
    server: {
      host: devEndpoint.host,
      port: devEndpoint.port,
    },
  });
  await vite.listen();
} catch (error) {
  // A port can be claimed after the early diagnostic. Strict Vite failure must
  // release watchers as well as reject, rather than leaving a headless process.
  await build.dispose();
  await vite?.close();
  throw error;
}
vite.printUrls();

watchersReady = true;
launchDesktop();

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  desktop?.kill("SIGTERM");
  await build.dispose();
  await vite.close();
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
