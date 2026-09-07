import { execFileSync } from "node:child_process";
import { access, realpath, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { resolveDevEndpoint } from "./dev-port.mjs";

export const DEV_USAGE = "Usage: nix develop --command bazel run --jobs=3 //:dev -- [--workspace <Git-root>]\n" +
  "Defaults to the IDE checkout. Relative workspace paths resolve from your invocation directory.\n" +
  "Set SWARM_DEV_PORT=55173 to choose a free loopback port. A committed Git HEAD is required.";

/** Operator CLI only. The renderer and target repository do not supply launch code. */
export async function resolveDevWorkspace(args, ideRoot, invokedFrom, environment = process.env) {
  let input = ideRoot;
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--workspace" || !args[1] || args[1].startsWith("--"))
      throw new Error(DEV_USAGE);
    input = resolve(invokedFrom, args[1]);
  }
  let root;
  try {
    root = await realpath(input);
    if (!(await stat(root)).isDirectory()) throw new Error("Not a directory");
  } catch { throw new Error(`Workspace must be an existing directory: ${JSON.stringify(input)}`); }
  const env = { ...environment };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
  const query = (args) => {
    const bytes = execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args],
      { cwd: root, env, timeout: 2000, killSignal: "SIGKILL", maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"] });
    const text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n")) throw new Error("Missing Git terminator");
    return text.slice(0, -1);
  };
  try {
    if (await realpath(query(["rev-parse", "--show-toplevel"])) !== root ||
        !/^[a-f0-9]{40,64}$/.test(query(["rev-parse", "--verify", "HEAD^{commit}"]))) throw new Error("Not a committed Git root");
  } catch { throw new Error(`Workspace must be the Git working-tree root with a committed HEAD: ${JSON.stringify(root)}. Pass --workspace /path/to/repo (not a subdirectory or bare repository).`); }
  return root;
}

/** Early diagnostic only; Vite's strictPort remains the final race-safe check. */
export function checkDevPort(endpoint) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => reject(new Error(
      `Cannot listen on ${endpoint.host}:${endpoint.port} (${error.code ?? error.message}). ` +
      "Choose an unused port with SWARM_DEV_PORT; no existing process was stopped.",
    )));
    server.listen({ host: endpoint.host, port: endpoint.port, exclusive: true }, () => server.close(resolve));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { console.log(DEV_USAGE); return; }
  const ideRoot = process.cwd();
  const root = await resolveDevWorkspace(args, ideRoot, process.env.SWARM_DEV_INVOKED_FROM ?? ideRoot);
  const endpoint = resolveDevEndpoint();
  await checkDevPort(endpoint);
  if (!process.env.SWARM_ELECTRON_BIN) throw new Error("Nix Electron is unavailable. Run this command through `nix develop --command`.");
  if (!process.env.DISPLAY) throw new Error("No X11 DISPLAY is set. Run from a Linux X11/XWayland desktop terminal; automated checks use the owned virtual-desktop harness.");
  try { await access(resolve(ideRoot, "node_modules/esbuild/package.json")); }
  catch { throw new Error("Dependencies are missing. In the IDE checkout run: nix develop --command pnpm install --frozen-lockfile"); }
  process.env.SWARM_WORKSPACE_ROOT = root;
  console.log(`[dev] IDE checkout: ${JSON.stringify(ideRoot)}; registered workspace: ${JSON.stringify(root)}`);
  await import("./dev.mjs");
}

let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url)); } catch { /* Imported by a non-file test runner. */ }
if (isMain) main().catch((error) => { console.error(`[dev] ${error.message}`); process.exitCode = 2; });
