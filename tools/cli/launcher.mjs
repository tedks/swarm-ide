import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { prepareProject } from "./project.mjs";

export const usage = `Usage: swarm-ide [--workspace PATH] [--user-data-dir PATH]
             [--tmux-server NAME | --tmux-socket PATH] --tmux-session NAME
             [--agent-registry PATH]

Open Swarm IDE using the installed application, without a development server.
  --workspace PATH      Project/worktree (default: discover from current directory)
  --user-data-dir PATH  Separate Swarm window/history profile (optional)
  --tmux-server NAME    Observe Codex owners in this named tmux server
  --tmux-socket PATH    Observe this exact tmux socket instead
  --tmux-session NAME   Exact session to associate (requires server/socket)
  --agent-registry PATH Use an existing private registry instead of tmux discovery
  -h, --help            Show this help

Relative paths are resolved from the directory where you invoke this command.
Bare repositories select an existing worktree; settings are created outside source.
Inside tmux, current-session owners in this project are associated automatically.
The swarm command remains an equivalent alias.
The project and your normal local tools are trusted. No agent is started by this command.
`;

export function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    const keys = new Map([["--workspace", "workspace"], ["--user-data-dir", "userDataDir"], ["--tmux-server", "tmuxServer"], ["--tmux-socket", "tmuxSocket"], ["--tmux-session", "tmuxSession"], ["--agent-registry", "agentRegistry"]]);
    const key = keys.get(arg);
    if (!key) throw new Error(`Unknown argument: ${arg}. Use swarm --help.`);
    if (options[key] !== undefined) throw new Error(`${arg} may be specified only once.`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path.`);
    options[key] = value;
  }
  if (options.tmuxServer && options.tmuxSocket) throw new Error("Choose --tmux-server or --tmux-socket, not both.");
  if (Boolean(options.tmuxServer || options.tmuxSocket) !== Boolean(options.tmuxSession)) throw new Error("Tmux association requires --tmux-session and one server/socket.");
  if (options.tmuxServer && (!/^[A-Za-z0-9_.-]{1,100}$/.test(options.tmuxServer) || [".", ".."].includes(options.tmuxServer))) throw new Error("Invalid tmux server name.");
  if (options.tmuxSession && (options.tmuxSession.length > 128 || /[\x00-\x1f\x7f:.]/.test(options.tmuxSession))) throw new Error("Invalid tmux session name.");
  if (options.agentRegistry && options.tmuxSession) throw new Error("Choose an existing registry or a tmux session, not both.");
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
  // A shell entered through a Git hook/alias can carry another repository's
  // selection or command-line config. Do not let it redirect core/agent Git.
  // SSH/askpass and ordinary host credentials remain available.
  for (const name of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|PREFIX|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_.*|CONFIG_VALUE_.*)$/.test(name)) delete env[name];
  }
  // Installed launches must not inherit a development renderer or reload watcher.
  delete env.SWARM_RENDERER_URL;
  delete env.SWARM_DEV_CONTROL;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SWARM_CLI_USER_DATA_DIR;
  if (options.agentRegistry !== undefined) env.SWARM_EXTERNAL_AGENTS_REGISTRY = realpathSync(resolve(cwd, options.agentRegistry));
  const args = [bundleRoot];
  // Existing owned-X11 harness identity marker; never an arbitrary Electron flag.
  const marker = env.SWARM_RENDERER_PROCESS_ARGUMENT;
  if (marker !== undefined) {
    if (!/^--swarm-window-marker=http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/.test(marker)) throw new Error("Invalid owned-window marker.");
    args.push(marker);
  }
  if (options.userDataDir !== undefined) env.SWARM_CLI_USER_DATA_DIR = resolve(cwd, options.userDataDir);
  if (env.SWARM_ELECTRON_NO_SANDBOX !== undefined) {
    if (env.SWARM_ELECTRON_NO_SANDBOX !== "1") throw new Error("SWARM_ELECTRON_NO_SANDBOX must be exactly '1' when set.");
    args.push("--no-sandbox");
  }
  return { executable: electron, args, cwd: workspace, env };
}

export function associationProjectOptions(project, automatic) {
  return { project: { git: project.git, identity: project.identity, workspace: project.workspace, worktrees: project.worktrees },
    ...(automatic ? { allowedRoots: project.worktrees.map((row) => row.path) } : {}) };
}

export async function launch(args, runtime) {
  const options = parseArguments(args);
  if (options.help) { process.stdout.write(usage); return 0; }
  const context = { cwd: process.cwd(), environment: process.env, ...runtime };
  const project = prepareProject(options, context);
  const config = launchConfiguration({ ...options, workspace: project.workspace, userDataDir: project.profile, agentRegistry: project.registry }, context);
  console.log(`swarm-ide: opening ${JSON.stringify(project.workspace)}`);
  console.log(`swarm-ide: settings ${JSON.stringify(project.configPath)}`);
  const { associateTmux, currentTmux } = await import("./tmux.mjs");
  let associationOptions = options.tmuxSession ? options : undefined;
  const automatic = !associationOptions && !options.agentRegistry && !context.environment.SWARM_EXTERNAL_AGENTS_REGISTRY;
  if (automatic) {
    try { associationOptions = await currentTmux(context.environment); }
    catch { console.log("swarm-ide: terminal association unavailable; opening the project without new terminal owners"); }
  }
  if (associationOptions) {
    const invocationDirectory = process.cwd();
    let association;
    // The reused registry writer excludes its current workspace. Use the chosen
    // project, not an invocation directory such as the operator's whole home.
    try {
      process.chdir(config.cwd);
      association = await associateTmux({ ...associationOptions, cwd: context.cwd,
        ...associationProjectOptions(project, automatic) }, { stateRoot: project.stateDirectory });
    } catch (error) {
      if (!automatic) throw error;
      console.log("swarm-ide: no current project agents to associate; opening the project");
    } finally { process.chdir(invocationDirectory); }
    if (association) {
      config.env.SWARM_EXTERNAL_AGENTS_REGISTRY = association.registry;
      project.rememberRegistry(association.registry);
      console.log(`swarm: observing ${association.registered.length} agent(s) from ${associationOptions.tmuxSession}; ${association.skipped.length} pane(s) skipped`);
      console.log(`swarm: registry ${association.registry}`);
      console.log(`swarm: terminal ${association.terminalCommand}`);
    }
  }
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
