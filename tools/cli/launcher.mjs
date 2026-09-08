import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export const usage = `Usage: swarm [--workspace PATH] [--user-data-dir PATH]

Open Swarm IDE using the installed application, without a development server.
  --workspace PATH      Project directory (default: the current directory)
  --user-data-dir PATH  Separate Swarm window/history profile (optional)
  -h, --help            Show this help

Relative paths are resolved from the directory where you invoke this command.
The project and your normal local tools are trusted. No agent is started by this command.
`;

export function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    const key = arg === "--workspace" ? "workspace" : arg === "--user-data-dir" ? "userDataDir" : undefined;
    if (!key) throw new Error(`Unknown argument: ${arg}. Use swarm --help.`);
    if (options[key] !== undefined) throw new Error(`${arg} may be specified only once.`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path.`);
    options[key] = value;
  }
  return options;
}

export function launchConfiguration(options, { cwd, environment, bundleRoot, electron }) {
  const requestedRoot = resolve(cwd, options.workspace ?? ".");
  let workspace;
  try {
    workspace = realpathSync(requestedRoot);
    if (!statSync(workspace).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Workspace is not an accessible directory: ${requestedRoot}`);
  }
  const env = { ...environment, SWARM_WORKSPACE_ROOT: workspace };
  // Installed launches must not inherit a development renderer or reload watcher.
  delete env.SWARM_RENDERER_URL;
  delete env.SWARM_DEV_CONTROL;
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [bundleRoot];
  // Existing owned-X11 harness identity marker; never an arbitrary Electron flag.
  const marker = env.SWARM_RENDERER_PROCESS_ARGUMENT;
  if (marker !== undefined) {
    if (!/^--swarm-window-marker=http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/.test(marker)) throw new Error("Invalid owned-window marker.");
    args.push(marker);
  }
  if (options.userDataDir !== undefined) args.push(`--user-data-dir=${resolve(cwd, options.userDataDir)}`);
  if (env.SWARM_ELECTRON_NO_SANDBOX !== undefined) {
    if (env.SWARM_ELECTRON_NO_SANDBOX !== "1") throw new Error("SWARM_ELECTRON_NO_SANDBOX must be exactly '1' when set.");
    args.push("--no-sandbox");
  }
  return { executable: electron, args, cwd: workspace, env };
}

export async function launch(args, runtime) {
  const options = parseArguments(args);
  if (options.help) { process.stdout.write(usage); return 0; }
  const config = launchConfiguration(options, { cwd: process.cwd(), environment: process.env, ...runtime });
  const child = spawn(config.executable, config.args, { cwd: config.cwd, env: config.env, stdio: "inherit", shell: false });
  const forward = (signal) => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
  const onInt = () => forward("SIGINT"), onTerm = () => forward("SIGTERM"), onHup = () => forward("SIGHUP");
  process.on("SIGINT", onInt); process.on("SIGTERM", onTerm); process.on("SIGHUP", onHup);
  try {
    return await new Promise((resolveResult, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolveResult(code ?? ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal] ?? 1)));
    });
  } finally {
    process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); process.off("SIGHUP", onHup);
  }
}
