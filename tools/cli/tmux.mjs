import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = async (executable, args) => (await exec(executable, args, {
  encoding: "utf8", timeout: 3000, maxBuffer: 65536, killSignal: "SIGKILL",
  env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
})).stdout;

export async function currentTmux(environment, run = command) {
  if (!environment.TMUX) return undefined;
  const match = /^(.*),[0-9]+,[0-9]+$/.exec(environment.TMUX);
  if (!match || !isAbsolute(match[1]) || !/^%[0-9]+$/.test(environment.TMUX_PANE ?? "")) throw new Error("Current tmux pane is unavailable");
  const socket = await realpath(match[1]), info = await lstat(socket);
  if (!info.isSocket() || info.uid !== process.getuid()) throw new Error("Current tmux socket is not owned by this user");
  const fields = (await run("tmux", ["-S", socket, "display-message", "-p", "-t", environment.TMUX_PANE, "#{pane_id}\t#{session_id}\t#{session_name}"])).trimEnd().split("\t");
  if (fields.length !== 3 || fields[0] !== environment.TMUX_PANE || !/^\$[0-9]+$/.test(fields[1]) || !fields[2]) throw new Error("Current tmux pane changed");
  return { tmuxSocket: socket, tmuxSessionId: fields[1], tmuxSession: fields[2] };
}

export async function selectPanes(options, run = command) {
  const target = options.tmuxSocket ? ["-S", resolve(options.cwd, options.tmuxSocket)] : ["-L", options.tmuxServer];
  // display-message takes a pane target: the colon makes this an exact session
  // selection rather than an unresolved window/pane name.
  const selection = (await run("tmux", [...target, "display-message", "-p", "-t", options.tmuxSessionId ? `${options.tmuxSessionId}:` : `=${options.tmuxSession}:`, "#{socket_path}\t#{session_id}"])).trimEnd().split("\t");
  if (selection.length !== 2 || !isAbsolute(selection[0]) || !/^\$\d+$/.test(selection[1])) throw new Error("The selected tmux session could not be identified.");
  const [socket, sessionId] = selection;
  const info = await lstat(socket);
  if (!info.isSocket() || info.uid !== process.getuid() || await realpath(socket) !== socket) throw new Error("Tmux socket must be canonical and owned by this user.");
  const output = await run("tmux", ["-S", socket, "list-panes", "-s", "-t", sessionId, "-F", "#{pane_id}"]);
  const panes = output.trimEnd().split("\n");
  if (!panes.length || panes.length > 64 || new Set(panes).size !== panes.length || panes.some((id) => !/^%\d+$/.test(id))) throw new Error("Tmux session has invalid or more than 64 panes; choose a smaller session.");
  return { socket, sessionId, panes, socketDev: info.dev, socketIno: info.ino };
}

async function bareParentBrowsingRoot(cwd, project) {
  if (project?.git !== true) throw new Error("Agent process is not in a Git worktree.");
  let bare;
  try { bare = (await command("git", ["-C", cwd, "rev-parse", "--is-bare-repository"])).trimEnd(); }
  catch { throw new Error("Agent process is not in a Git worktree."); }
  if (bare !== "true") throw new Error("Agent process is not in a Git worktree.");

  if (!isAbsolute(project.identity) || !isAbsolute(project.workspace)
    || !project.worktrees?.some((row) => row.path === project.workspace)) throw new Error("Selected project worktree is invalid.");
  let expectedIdentity, selectedRoot;
  try { expectedIdentity = await realpath(project.identity); selectedRoot = await realpath(project.workspace); }
  catch { throw new Error("Selected project paths are unavailable."); }
  if (expectedIdentity !== project.identity || selectedRoot !== project.workspace) throw new Error("Selected project paths are not canonical.");
  if (cwd !== expectedIdentity && join(cwd, ".git") !== expectedIdentity) throw new Error("Agent process is not at the project's bare repository parent.");

  let commonText, commonRoot;
  try {
    commonText = (await command("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"])).trimEnd();
    commonRoot = isAbsolute(commonText) ? await realpath(commonText) : undefined;
  } catch { throw new Error("Owner bare repository identity is unavailable."); }
  if (commonRoot !== expectedIdentity) throw new Error("Owner bare repository belongs to another project.");

  let selectedTop, selectedCommon, canonicalTop, canonicalCommon;
  try {
    selectedTop = (await command("git", ["-C", selectedRoot, "rev-parse", "--show-toplevel"])).trimEnd();
    selectedCommon = (await command("git", ["-C", selectedRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"])).trimEnd();
    canonicalTop = isAbsolute(selectedTop) ? await realpath(selectedTop) : undefined;
    canonicalCommon = isAbsolute(selectedCommon) ? await realpath(selectedCommon) : undefined;
  } catch { throw new Error("Selected project worktree no longer belongs to the project."); }
  if (canonicalTop !== selectedRoot || canonicalCommon !== expectedIdentity) throw new Error("Selected project worktree no longer belongs to the project.");
  return selectedRoot;
}

async function contextRoot(target, project) {
  const cwd = await realpath(await readlink(`/proc/${target.processPid}/cwd`));
  let root;
  try { root = (await command("git", ["-C", cwd, "rev-parse", "--show-toplevel"])).trimEnd(); }
  catch { return await bareParentBrowsingRoot(cwd, project); }
  if (!isAbsolute(root)) throw new Error("Agent process is not in a Git worktree.");
  return await realpath(root);
}

export async function associateTmux(options, dependencies = {}) {
  const selected = await selectPanes(options, dependencies.command ?? command);
  const api = dependencies.api ?? await import("./registration.cjs");
  const stateRoot = dependencies.stateRoot ?? (process.env.XDG_STATE_HOME || join(homedir(), ".local/state"));
  if (!isAbsolute(stateRoot)) throw new Error("XDG_STATE_HOME must be absolute for tmux association.");
  // A fresh bounded generation cannot mix an old server's sessions or fill up
  // with lifetime agent IDs. Prior private registries remain available explicitly.
  const parent = join(stateRoot, "swarm-ide/fleets");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(parent, "association-"));
  const registry = join(directory, "agents.json"), registered = [], skipped = [];
  const deadline = Date.now() + 30000;
  for (let start = 0; start < selected.panes.length; start += 4) {
    await Promise.all(selected.panes.slice(start, start + 4).map(async (pane) => {
      if (Date.now() > deadline) { skipped.push({ pane, reason: "Association time limit reached" }); return; }
      try {
        const found = await api.discover({ socket: selected.socket, pane });
        if (!found) { skipped.push({ pane, reason: "No unique live Codex owner" }); return; }
        const root = await (dependencies.contextRoot ?? contextRoot)(found.target, options.project);
        if (options.allowedRoots && !options.allowedRoots.includes(root)) { skipped.push({ pane, reason: "Owner belongs to another project" }); return; }
        const currentSocket = await lstat(selected.socket);
        if (currentSocket.dev !== selected.socketDev || currentSocket.ino !== selected.socketIno) throw new Error("Selected tmux server changed");
        let windowName = "";
        try { windowName = (await (dependencies.command ?? command)("tmux", ["-S", selected.socket, "display-message", "-p", "-t", pane, "#{window_name}"])).replace(/[\x00-\x1f\x7f]/g, "").trim(); } catch { /* Labels do not confer authority. */ }
        const label = `${options.tmuxSession}:${windowName || pane}`.slice(0, 120);
        const receipt = await api.updateRegistry({ action: "register", registry,
          label, rollout: found.rollout,
          pane: { socket: selected.socket, pane, processPid: found.target.processPid, processStart: found.target.processStart },
          contextRoot: root, evidence: "local" });
        registered.push({ pane, label, contextRoot: root, ...receipt });
      } catch (error) { skipped.push({ pane, reason: error.message }); }
    }));
  }
  if (!registered.length) throw new Error(`No supported Codex sessions could be registered in ${options.tmuxSession}. ${skipped[0]?.reason ?? ""} Remove the tmux options to open only the project.`);
  return { registry, socket: selected.socket, sessionId: selected.sessionId, registered, skipped,
    terminalCommand: `tmux -S ${quote(selected.socket)} attach-session -t ${quote(selected.sessionId)}` };
}
