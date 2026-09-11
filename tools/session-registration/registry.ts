import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative } from "node:path";
import { Registry, Registration, type Registered } from "../../core/external-agents-registry";
import { validateHandoff } from "../../core/external-agents-handoff";
import { ExternalSessionId } from "../../protocol/external-agents";
import { absolute, discover, LIMIT, metadata, ownedFile, type PaneInput } from "./identity";

export interface RegisterInput {
  action: "register"; registry: string; label: string; rollout?: string; pane?: PaneInput; sessionId?: string;
  role?: string; task?: string; contextRoot?: string; contextPaths?: string[]; evidence?: "local" | "synthetic";
  signal?: AbortSignal; workspaceRoot?: string;
}
export interface RetireInput { action: "retire"; registry: string; sessionId: string; signal?: AbortSignal; workspaceRoot?: string }
export interface Receipt { action: "register" | "retire"; sessionId: string; parentId?: string | null;
  changed: boolean; authority: "checked-live" | "historical-only"; message: string }
const within = (root: string, path: string) => { const p = relative(root, path); return !p || p !== ".." && !p.startsWith("../") && !isAbsolute(p); };

/** All cooperating writers use this permanent inode; never unlink the lock file.
 * flock locks the inherited open description, retained by our parent descriptor.
 * Process exit (including SIGKILL) releases it without stale-lock reclamation. */
async function lockRegistry(path: string, signal?: AbortSignal, workspaceRoot?: string) {
  if (signal?.aborted) throw new Error("Registry update stopped");
  absolute(path);
  const parent = dirname(path), dir = await lstat(parent);
  if (!dir.isDirectory() || dir.uid !== process.getuid!() || (dir.mode & 0o077) || await realpath(parent) !== parent)
    throw new Error("Registry requires an existing canonical owned mode-0700 directory");
  const workspace = workspaceRoot ?? await realpath(process.cwd());
  absolute(workspace);
  if (within(workspace, path)) throw new Error("Registry must be outside the current repository/workspace");
  const lock = await open(`${path}.lock`, constants.O_CREAT | constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await lock.stat();
    if (!info.isFile() || info.uid !== process.getuid!() || (info.mode & 0o077) || info.nlink !== 1)
      throw new Error("Registry lock must be an owned private regular file");
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const child = spawn("flock", ["--exclusive", "--timeout", "5", "3"],
        { timeout: 6000, killSignal: "SIGKILL", signal, stdio: ["ignore", "ignore", "ignore", lock.fd] });
      child.once("error", () => { failed = true; });
      child.once("close", (code) => !failed && code === 0 ? resolve()
        : reject(new Error(signal?.aborted ? "Registry update stopped" : "Registry writer lock unavailable within five seconds")));
    });
    return lock;
  } catch (error) { await lock.close(); throw error; }
}

async function readRegistry(path: string): Promise<{ raw: { version: 1; sessions: Registered[] }; existed: boolean }> {
  let file;
  try { file = await ownedFile(path, LIMIT, true); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { raw: { version: 1, sessions: [] }, existed: false }; throw error; }
  try {
    const b = Buffer.alloc(LIMIT + 1), result = await file.read(b, 0, b.length, 0);
    if (result.bytesRead > LIMIT) throw new Error("Registry exceeds 65536-byte observer limit");
    let raw;
    try { raw = JSON.parse(b.subarray(0, result.bytesRead).toString("utf8")); }
    catch { throw new Error("Malformed registry JSON; unchanged"); }
    if (!Registry.safeParse(raw).success) throw new Error("Registry schema invalid; unchanged");
    // Keep unrelated rows exactly as authored, including omitted default fields.
    return { raw, existed: true };
  } finally { await file.close(); }
}

export async function updateRegistry(input: RegisterInput | RetireInput): Promise<Receipt> {
  if (process.platform !== "linux" || !process.getuid) throw new Error("Registration requires Linux process identity and flock");
  const lock = await lockRegistry(input.registry, input.signal, input.workspaceRoot);
  try {
    if (input.signal?.aborted) throw new Error("Registry update stopped");
    const { raw, existed } = await readRegistry(input.registry);
    const before = JSON.stringify(raw);
    let sessionId: string, parentId: string | null | undefined;
    let authority: Receipt["authority"] = "historical-only";
    if (input.action === "retire") {
      sessionId = ExternalSessionId.parse(input.sessionId);
      const index = raw.sessions.findIndex((row) => row.id === sessionId);
      if (index < 0) throw new Error("Cannot retire an unregistered session");
      const { tmux: _tmux, ...history } = raw.sessions[index];
      raw.sessions[index] = history as Registered;
    } else {
      const found = input.pane ? await discover(input.pane, input.rollout) : undefined;
      const path = input.rollout ?? found?.rollout;
      if (!path) throw new Error("Provide an exact rollout or a pane with one uniquely open rollout");
      const initial = await metadata(path);
      sessionId = initial.id; parentId = initial.parentId;
      if (input.sessionId !== undefined && input.sessionId !== sessionId) throw new Error("Rollout session does not match the expected session ID; unchanged");
      const index = raw.sessions.findIndex((row) => row.id === sessionId), old = index < 0 ? undefined : raw.sessions[index];
      if (old && old.rollout !== path) throw new Error("Session already registered at a different rollout; unchanged");
      const { tmux: _oldTarget, ...oldMetadata } = old ?? {};
      const row = { ...oldMetadata, id: sessionId, label: input.label, rollout: path,
        ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}), ...(input.task !== undefined ? { task: input.task } : {}),
        ...(input.contextRoot !== undefined ? { contextRoot: input.contextRoot } : {}),
        ...(input.contextPaths !== undefined ? { contextPaths: input.contextPaths } : {}),
      };
      const parsed = Registration.safeParse(row);
      if (!parsed.success) throw new Error("Invalid registration fields or bounds; unchanged");
      if (parsed.data.contextRoot) {
        absolute(parsed.data.contextRoot);
        if (await realpath(parsed.data.contextRoot) !== parsed.data.contextRoot || !(await lstat(parsed.data.contextRoot)).isDirectory())
          throw new Error("Context root must be a canonical directory");
        if (within(parsed.data.contextRoot, input.registry)) throw new Error("Registry must be outside the context repository");
      } else if (parsed.data.contextPaths.length) throw new Error("Context paths require an explicit context root");
      if (found && parsed.data.evidence === "local" && await validateHandoff(found.target, path, input.signal)) {
        parsed.data.tmux = found.target; authority = "checked-live";
      }
      const final = await metadata(path);
      if (initial.dev !== final.dev || initial.ino !== final.ino || initial.header !== final.header)
        throw new Error("Session header changed during registration; unchanged");
      if (index < 0) raw.sessions.push(parsed.data); else raw.sessions[index] = parsed.data;
    }
    if (!Registry.safeParse(raw).success) throw new Error("Update exceeds registry bounds or duplicates an identity; unchanged");
    const changed = !existed || before !== JSON.stringify(raw);
    const bytes = JSON.stringify(raw, null, 2) + "\n";
    if (Buffer.byteLength(bytes) > LIMIT) throw new Error("Update exceeds 65536-byte observer limit; unchanged");
    if (changed) {
      if (input.signal?.aborted) throw new Error("Registry update stopped");
      const temp = `${dirname(input.registry)}/.${basename(input.registry)}.${randomUUID()}.tmp`;
      const output = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      let published = false;
      try {
        await output.writeFile(bytes); await output.sync(); await output.close();
        if (input.signal?.aborted) throw new Error("Registry update stopped");
        await rename(temp, input.registry); published = true;
        const directory = await open(dirname(input.registry), constants.O_RDONLY | constants.O_DIRECTORY);
        try { await directory.sync(); } finally { await directory.close(); }
      } catch (error) {
        if (published) throw new Error("Registry published but durability confirmation failed; inspect before retrying");
        throw error;
      } finally { await output.close().catch(() => {}); if (!published) await unlink(temp).catch(() => {}); }
    }
    return { action: input.action, sessionId, ...(parentId !== undefined ? { parentId } : {}), changed, authority,
      message: authority === "checked-live" ? "Exact live target checked at registration; the IDE rechecks before steering. No message sent."
        : "Historical registration only; no live tmux authority. No agent launched or message sent." };
  } finally { await lock.close(); }
}
