import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const stopped = (signal) => { if (signal?.aborted) throw new Error("Tmux reconciliation stopped"); };
const command = (executable, args, signal) => new Promise((resolve, reject) => {
  let result;
  const child = execFile(executable, args, {
    encoding: "utf8", timeout: 3000, maxBuffer: 65536, killSignal: "SIGKILL", signal,
    env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
  }, (error, stdout, stderr) => { result = { error, stdout, stderr }; });
  // The callback can run before close on abort. Resolve only after the owned
  // process is drained so launcher disposal never leaves a tmux/git child.
  child.once("close", () => {
    if (result && !result.error) resolve(result.stdout);
    else {
      const failure = result?.error ?? new Error("Command did not complete");
      failure.stderr = result?.stderr ?? "";
      reject(failure);
    }
  });
});

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

export async function selectPanes(options, run = command, signal) {
  stopped(signal);
  const target = options.tmuxSocket ? ["-S", resolve(options.cwd, options.tmuxSocket)] : ["-L", options.tmuxServer];
  // display-message takes a pane target: the colon makes this an exact session
  // selection rather than an unresolved window/pane name.
  const selection = (await run("tmux", [...target, "display-message", "-p", "-t", options.tmuxSessionId ? `${options.tmuxSessionId}:` : `=${options.tmuxSession}:`, "#{socket_path}\t#{session_id}"], signal)).trimEnd().split("\t");
  if (selection.length !== 2 || !isAbsolute(selection[0]) || !/^\$\d+$/.test(selection[1])) throw new Error("The selected tmux session could not be identified.");
  const [socket, sessionId] = selection;
  const info = await lstat(socket);
  if (!info.isSocket() || info.uid !== process.getuid() || await realpath(socket) !== socket) throw new Error("Tmux socket must be canonical and owned by this user.");
  const output = await run("tmux", ["-S", socket, "list-panes", "-s", "-t", sessionId, "-F", "#{pane_id}"], signal);
  const panes = output.trimEnd().split("\n");
  if (!panes.length || panes.length > 64 || new Set(panes).size !== panes.length || panes.some((id) => !/^%\d+$/.test(id))) throw new Error("Tmux session has invalid or more than 64 panes; choose a smaller session.");
  return { socket, sessionId, panes, socketDev: info.dev, socketIno: info.ino };
}

async function selectedSessionGone(selected, run, signal) {
  stopped(signal);
  try {
    const info = await lstat(selected.socket);
    if (!info.isSocket() || info.uid !== process.getuid() || info.dev !== selected.socketDev || info.ino !== selected.socketIno) return true;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
  let output;
  try { output = await run("tmux", ["-S", selected.socket, "list-sessions", "-F", "#{session_id}"], signal); }
  catch (error) {
    // LANG is fixed for the production command. These messages mean tmux
    // itself reached no listener; other failures remain inconclusive.
    if (/(?:^|\n)(?:no server running on |error connecting to .* \(Connection refused\))(?:.|\n)*$/.test(error.stderr ?? "")) return true;
    // A command failure alone is inconclusive. A socket removed during that
    // failure is authoritative evidence that the selected server is gone.
    try {
      const info = await lstat(selected.socket);
      if (!info.isSocket() || info.uid !== process.getuid() || info.dev !== selected.socketDev || info.ino !== selected.socketIno) return true;
    } catch (checkError) { if (checkError.code === "ENOENT") return true; }
    throw error;
  }
  const ids = output.trimEnd() ? output.trimEnd().split("\n") : [];
  if (ids.some((id) => !/^\$\d+$/.test(id)) || new Set(ids).size !== ids.length) return false;
  return !ids.includes(selected.sessionId);
}

async function bareParentBrowsingRoot(cwd, project, signal) {
  stopped(signal);
  if (project?.git !== true) throw new Error("Agent process is not in a Git worktree.");
  let bare;
  try { bare = (await command("git", ["-C", cwd, "rev-parse", "--is-bare-repository"], signal)).trimEnd(); }
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
    commonText = (await command("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], signal)).trimEnd();
    commonRoot = isAbsolute(commonText) ? await realpath(commonText) : undefined;
  } catch { throw new Error("Owner bare repository identity is unavailable."); }
  if (commonRoot !== expectedIdentity) throw new Error("Owner bare repository belongs to another project.");

  let selectedTop, selectedCommon, canonicalTop, canonicalCommon;
  try {
    selectedTop = (await command("git", ["-C", selectedRoot, "rev-parse", "--show-toplevel"], signal)).trimEnd();
    selectedCommon = (await command("git", ["-C", selectedRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], signal)).trimEnd();
    canonicalTop = isAbsolute(selectedTop) ? await realpath(selectedTop) : undefined;
    canonicalCommon = isAbsolute(selectedCommon) ? await realpath(selectedCommon) : undefined;
  } catch { throw new Error("Selected project worktree no longer belongs to the project."); }
  if (canonicalTop !== selectedRoot || canonicalCommon !== expectedIdentity) throw new Error("Selected project worktree no longer belongs to the project.");
  return selectedRoot;
}

async function contextRoot(target, project, signal) {
  stopped(signal);
  const cwd = await realpath(await readlink(`/proc/${target.processPid}/cwd`));
  let root;
  try { root = (await command("git", ["-C", cwd, "rev-parse", "--show-toplevel"], signal)).trimEnd(); }
  catch { stopped(signal); return await bareParentBrowsingRoot(cwd, project, signal); }
  if (!isAbsolute(root)) throw new Error("Agent process is not in a Git worktree.");
  return await realpath(root);
}

async function createRegistry(stateRoot) {
  if (!isAbsolute(stateRoot)) throw new Error("XDG_STATE_HOME must be absolute for tmux association.");
  // A fresh bounded generation cannot mix an old server's sessions or fill up
  // with lifetime agent IDs. Prior private registries remain available explicitly.
  const parent = join(stateRoot, "swarm-ide/fleets");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(parent, "association-"));
  const registry = join(directory, "agents.json");
  const file = await open(registry, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile('{"version":1,"sessions":[]}\n'); await file.sync(); }
  finally { await file.close(); }
  return registry;
}

function reconciler(options, dependencies, selected, registry, api) {
  const run = dependencies.command ?? command;
  const originalProjectIdentity = options.project?.identity;
  const exact = { ...options, tmuxSocket: selected.socket, tmuxServer: undefined, tmuxSessionId: selected.sessionId };
  let active = new Map(), pendingRetire = new Set(), disposed = false, inFlight, controller, timer, watching = false, cancelTimer = clearTimeout;

  const inspect = async (pane, scope, signal, deadline) => {
    if (Date.now() > deadline) return { pane, kind: "inconclusive", reason: "Association time limit reached" };
    try {
      stopped(signal);
      const found = await api.discover({ socket: selected.socket, pane, signal });
      stopped(signal);
      if (!found) return { pane, kind: "inconclusive", reason: "No unique live Codex owner" };
      const root = await (dependencies.contextRoot ?? contextRoot)(found.target, scope.project, signal);
      stopped(signal);
      if (scope.allowedRoots && !scope.allowedRoots.includes(root)) return { pane, kind: "rejected", reason: "Owner belongs to another project" };
      const identity = api.metadata ? await api.metadata(found.rollout) : undefined;
      stopped(signal);
      let windowName = "";
      try { windowName = (await run("tmux", ["-S", selected.socket, "display-message", "-p", "-t", pane, "#{window_name}"], signal)).replace(/[\x00-\x1f\x7f]/g, "").trim(); }
      catch { stopped(signal); /* Labels do not confer authority. */ }
      return { pane, kind: "candidate", found, root, identity, label: `${options.tmuxSession}:${windowName || pane}`.slice(0, 120) };
    } catch (error) {
      stopped(signal);
      return { pane, kind: "inconclusive", reason: error.message };
    }
  };

  const runScan = async (signal, initialSelection) => {
    stopped(signal);
    let current, selectionGone = false;
    try { current = initialSelection ?? await selectPanes(exact, run, signal); }
    catch (error) {
      if (!await selectedSessionGone(selected, run, signal)) throw error;
      selectionGone = true; current = { ...selected, panes: [] };
    }
    // Defensive parser invariant: exact -S/$id queries cannot legitimately
    // answer for a different socket/session, so never transfer that scope.
    if (current.socket !== selected.socket || current.sessionId !== selected.sessionId)
      throw new Error("Selected tmux server/session changed; retaining prior history without adopting it");
    if (current.socketDev !== selected.socketDev || current.socketIno !== selected.socketIno) {
      selectionGone = true; current = { ...selected, panes: [] };
    }
    // Startup already has a synchronously validated project. Later scans alone
    // refresh membership, and confirmed teardown does not depend on Git health.
    const refreshed = !initialSelection && !selectionGone && dependencies.refreshProject ? await dependencies.refreshProject(signal) : undefined;
    stopped(signal);
    const scope = refreshed ?? { project: options.project, allowedRoots: options.allowedRoots };
    if (originalProjectIdentity !== undefined && scope.project?.identity !== originalProjectIdentity)
      throw new Error("Selected project identity changed; retaining prior history");
    const deadline = Date.now() + 30000, observations = [];
    for (let start = 0; start < current.panes.length; start += 4) {
      observations.push(...await Promise.all(current.panes.slice(start, start + 4).map((pane) => inspect(pane, scope, signal, deadline))));
      stopped(signal);
    }

    // The production bundle exposes rollout metadata so duplicate session IDs
    // can be rejected before any authority write. Older injected test adapters
    // without metadata remain deterministic because writes below are serial.
    const duplicateIds = new Set();
    const identities = new Map();
    for (const row of observations) if (row.kind === "candidate" && row.identity) {
      if (identities.has(row.identity.id)) duplicateIds.add(row.identity.id);
      else identities.set(row.identity.id, row.pane);
    }
    const next = new Map(), currentIds = new Set(), registered = [], skipped = [], retired = [];
    for (const row of observations) {
      if (row.kind !== "candidate") { skipped.push({ pane: row.pane, reason: row.reason }); continue; }
      if (row.identity && duplicateIds.has(row.identity.id)) {
        skipped.push({ pane: row.pane, reason: "Session is open in more than one selected pane" });
        row.kind = "rejected";
        continue;
      }
      try {
        stopped(signal);
        const receipt = await api.updateRegistry({ action: "register", registry, workspaceRoot: options.project?.workspace,
          label: row.label, rollout: row.found.rollout, signal,
          pane: { socket: selected.socket, pane: row.pane, processPid: row.found.target.processPid,
            processStart: row.found.target.processStart, signal },
          contextRoot: row.root, evidence: "local" });
        stopped(signal);
        if (currentIds.has(receipt.sessionId)) {
          await api.updateRegistry({ action: "retire", registry, sessionId: receipt.sessionId, signal, workspaceRoot: options.project?.workspace });
          for (const [pane, value] of next) if (value.sessionId === receipt.sessionId) next.delete(pane);
          for (let index = registered.length - 1; index >= 0; index--) if (registered[index].sessionId === receipt.sessionId) registered.splice(index, 1);
          currentIds.delete(receipt.sessionId);
          row.kind = "rejected";
          skipped.push({ pane: row.pane, reason: "Session is open in more than one selected pane" });
        } else if (receipt.authority === "checked-live") {
          currentIds.add(receipt.sessionId); next.set(row.pane, { sessionId: receipt.sessionId, misses: 0 });
          registered.push({ pane: row.pane, label: row.label, contextRoot: row.root, ...receipt });
        } else {
          row.kind = "rejected";
          skipped.push({ pane: row.pane, reason: "Exact owner changed before registration completed" });
        }
      } catch (error) {
        stopped(signal);
        row.kind = "inconclusive";
        skipped.push({ pane: row.pane, reason: error.message });
      }
    }

    const panes = new Set(current.panes), byPane = new Map(observations.map((row) => [row.pane, row]));
    const retireIds = new Set(pendingRetire);
    for (const [pane, previous] of active) {
      if (currentIds.has(previous.sessionId)) continue;
      const observation = byPane.get(pane);
      if (!panes.has(pane) || observation?.kind === "rejected" || next.has(pane)) retireIds.add(previous.sessionId);
      else {
        const misses = previous.misses + 1;
        if (misses >= 2) retireIds.add(previous.sessionId);
        else { next.set(pane, { ...previous, misses }); currentIds.add(previous.sessionId); }
      }
    }
    for (const sessionId of currentIds) { retireIds.delete(sessionId); pendingRetire.delete(sessionId); }
    for (const sessionId of retireIds) {
      try {
        stopped(signal);
        const receipt = await api.updateRegistry({ action: "retire", registry, sessionId, signal, workspaceRoot: options.project?.workspace });
        stopped(signal); retired.push(receipt); pendingRetire.delete(sessionId);
      } catch (error) {
        stopped(signal);
        const previous = [...active.entries()].find(([, value]) => value.sessionId === sessionId);
        pendingRetire.add(sessionId);
        skipped.push({ pane: previous?.[0] ?? "unknown", reason: `Could not retire stale authority: ${error.message}` });
      }
    }
    active = next;
    return { registry, registered, skipped, retired };
  };

  const scan = (initialSelection) => {
    if (disposed) return Promise.reject(new Error("Tmux reconciliation is disposed"));
    if (inFlight) return inFlight;
    controller = new AbortController();
    const current = runScan(controller.signal, initialSelection).finally(() => {
      if (inFlight === current) { inFlight = undefined; controller = undefined; }
    });
    inFlight = current;
    return current;
  };
  const watch = ({ intervalMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, onError = () => {} } = {}) => {
    if (disposed) throw new Error("Tmux reconciliation is disposed");
    if (watching) return;
    watching = true; cancelTimer = clearTimer;
    let lastReport;
    const schedule = () => { if (!disposed && watching) timer = setTimer(tick, intervalMs); };
    const tick = async () => {
      timer = undefined;
      try { await scan(); }
      catch (error) {
        if (!disposed) {
          const timestamp = now();
          if (lastReport === undefined || timestamp - lastReport >= 60000) { lastReport = timestamp; onError(error); }
        }
      } finally { schedule(); }
    };
    schedule();
    return () => { watching = false; if (timer !== undefined) clearTimer(timer); timer = undefined; };
  };
  const dispose = async () => {
    if (disposed) return;
    disposed = true; watching = false;
    if (timer !== undefined) cancelTimer(timer); timer = undefined;
    controller?.abort();
    await inFlight?.catch(() => {});
  };
  return { scan, watch, dispose };
}

export async function associateTmux(options, dependencies = {}) {
  const selected = await selectPanes(options, dependencies.command ?? command);
  const api = dependencies.api ?? await import("./registration.cjs");
  const stateRoot = dependencies.stateRoot ?? (process.env.XDG_STATE_HOME || join(homedir(), ".local/state"));
  const registry = await createRegistry(stateRoot);
  const live = reconciler(options, dependencies, selected, registry, api);
  const initial = await live.scan(selected);
  return { registry, socket: selected.socket, sessionId: selected.sessionId, registered: initial.registered, skipped: initial.skipped,
    reconcile: live.scan, watch: live.watch, dispose: live.dispose,
    terminalCommand: `tmux -S ${quote(selected.socket)} attach-session -t ${quote(selected.sessionId)}` };
}
