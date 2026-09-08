import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = async (executable, args) => (await exec(executable, args, {
  encoding: "utf8", timeout: 3000, maxBuffer: 65536, killSignal: "SIGKILL",
  env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
})).stdout;

export async function selectPanes(options, run = command) {
  const target = options.tmuxSocket ? ["-S", resolve(options.cwd, options.tmuxSocket)] : ["-L", options.tmuxServer];
  const selection = (await run("tmux", [...target, "display-message", "-p", "-t", `=${options.tmuxSession}`, "#{socket_path}\t#{session_id}"])).trimEnd().split("\t");
  if (selection.length !== 2 || !isAbsolute(selection[0]) || !/^\$\d+$/.test(selection[1])) throw new Error("The selected tmux session could not be identified.");
  const [socket, sessionId] = selection;
  const info = await lstat(socket);
  if (!info.isSocket() || info.uid !== process.getuid() || await realpath(socket) !== socket) throw new Error("Tmux socket must be canonical and owned by this user.");
  const output = await run("tmux", ["-S", socket, "list-panes", "-s", "-t", sessionId, "-F", "#{pane_id}"]);
  const panes = output.trimEnd().split("\n");
  if (!panes.length || panes.length > 64 || new Set(panes).size !== panes.length || panes.some((id) => !/^%\d+$/.test(id))) throw new Error("Tmux session has invalid or more than64 panes; choose a smaller session.");
  return { socket, sessionId, panes, socketDev: info.dev, socketIno: info.ino };
}

async function contextRoot(target) {
  const cwd = await realpath(await readlink(`/proc/${target.processPid}/cwd`));
  const root = (await command("git", ["-C", cwd, "rev-parse", "--show-toplevel"])).trimEnd();
  if (!isAbsolute(root)) throw new Error("Agent process is not in a Git worktree.");
  return await realpath(root);
}

export async function associateTmux(options, dependencies = {}) {
  const selected = await selectPanes(options, dependencies.command ?? command);
  const api = dependencies.api ?? await import("./registration.cjs");
  const stateRoot = dependencies.stateRoot ?? (process.env.XDG_STATE_HOME || join(homedir(), ".local/state"));
  if (!isAbsolute(stateRoot)) throw new Error("XDG_STATE_HOME must be absolute for tmux association.");
  // Internal storage identity only: keep one private registry per selected server
  // and session, without placing socket text into arbitrary filesystem names.
  const key = createHash("sha256").update(`${selected.socket}\0${selected.sessionId}`).digest("hex").slice(0, 24);
  const directory = join(stateRoot, "swarm-ide/fleets", key);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const registry = join(directory, "agents.json"), registered = [], skipped = [];
  const deadline = Date.now() + 30000;
  for (let start = 0; start < selected.panes.length; start += 4) {
    await Promise.all(selected.panes.slice(start, start + 4).map(async (pane) => {
      if (Date.now() > deadline) { skipped.push({ pane, reason: "Association time limit reached" }); return; }
      try {
        const found = await api.discover({ socket: selected.socket, pane });
        if (!found) { skipped.push({ pane, reason: "No unique live Codex owner" }); return; }
        const root = await (dependencies.contextRoot ?? contextRoot)(found.target);
        const currentSocket = await lstat(selected.socket);
        if (currentSocket.dev !== selected.socketDev || currentSocket.ino !== selected.socketIno) throw new Error("Selected tmux server changed");
        const receipt = await api.updateRegistry({ action: "register", registry,
          label: `${options.tmuxSession} ${pane}`, rollout: found.rollout,
          pane: { socket: selected.socket, pane, processPid: found.target.processPid, processStart: found.target.processStart },
          contextRoot: root, evidence: "local" });
        registered.push({ pane, contextRoot: root, ...receipt });
      } catch (error) { skipped.push({ pane, reason: error.message }); }
    }));
  }
  if (!registered.length) throw new Error(`No supported Codex sessions could be registered in ${options.tmuxSession}. ${skipped[0]?.reason ?? ""} Remove the tmux options to open only the project.`);
  return { registry, socket: selected.socket, sessionId: selected.sessionId, registered, skipped,
    terminalCommand: `tmux -S ${quote(selected.socket)} attach-session -t ${quote(selected.sessionId)}` };
}
