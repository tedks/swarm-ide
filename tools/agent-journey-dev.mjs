// Fixed TEST-ONLY entry. Never imported or selected by tools/dev.mjs.
import { build } from "esbuild";
import { createServer } from "vite";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveDevEndpoint } from "./dev-port.mjs";
import { resolveElectronRuntimeArguments } from "./electron-runtime.mjs";

const workspace = process.cwd();
const ownership = process.env.SWARM_X11_OWNERSHIP_DIR;
if (!ownership || !process.env.SWARM_X11_TOKEN || process.env.DISPLAY !== process.env.SWARM_X11_DISPLAY || process.env.DISPLAY === ":0") {
  throw new Error("Run the separate fixture through the owned virtual-X11 Bazel target");
}
const outputRoot = resolve(dirname(ownership), "journey-build");
// The legacy renderer-only rehearsal must not masquerade as this real bridge.
process.env.VITE_SWARM_AGENT_DEMO = "0";
await mkdir(outputRoot, { recursive: true, mode: 0o700 });
const endpoint = resolveDevEndpoint();
const runtimeArgs = resolveElectronRuntimeArguments();
const electron = process.env.SWARM_ELECTRON_BIN;
if (!electron) throw new Error("Enter through the Nix/Bazel fixture target");
const packageVersion = JSON.parse(await readFile("node_modules/electron/package.json", "utf8")).version;
if (execFileSync(electron, [...runtimeArgs, "--version"], { encoding: "utf8" }).trim().replace(/^v/, "") !== packageVersion) throw new Error("Electron version mismatch");
await build({
  entryPoints: {
    "app/electron/main": "tests/support/agent-journey-main.ts",
    "app/electron/preload": "app/electron/preload.ts",
    "core/worker": "tests/support/agent-journey-worker.ts",
  },
  bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"], outdir: outputRoot,
  plugins: [{ name: "fixed-test-core-observer", setup(builder) {
    builder.onResolve({ filter: /^\.\/core-launch$/ }, (args) => {
      if (args.importer === resolve(workspace, "app/electron/main.ts")) return { path: resolve(workspace, "tests/support/agent-journey-launch.ts") };
    });
  } }],
});
const vite = await createServer({ configFile: resolve(workspace, "vite.config.mts"), clearScreen: false,
  server: { host: endpoint.host, port: endpoint.port } });
await vite.listen();
const desktop = spawn(electron, [...runtimeArgs, resolve(outputRoot, "app/electron/main.js"), endpoint.rendererProcessArgument], {
  cwd: workspace, stdio: "inherit", env: { ...process.env, SWARM_RENDERER_URL: endpoint.rendererUrl, SWARM_DEV_CONTROL: "", VITE_SWARM_AGENT_DEMO: "0" },
});
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true; desktop.kill("SIGTERM"); await vite.close(); process.exit(code);
}
desktop.on("exit", (code) => { void shutdown(code ?? 1); });
process.on("SIGINT", () => { void shutdown(130); });
process.on("SIGTERM", () => { void shutdown(143); });
