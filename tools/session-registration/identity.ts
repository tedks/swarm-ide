import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, opendir, readlink, realpath, type FileHandle } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { z } from "zod";
import { ExternalSessionId } from "../../protocol/external-agents";
import { TmuxTargetSchema, validateHandoff, type TmuxTarget } from "../../core/external-agents-handoff";

export const LIMIT = 65536;
export function absolute(path: string): string {
  if (!isAbsolute(path) || path.length > 4096 || normalize(path) !== path || /[\x00-\x1f\x7f]/.test(path))
    throw new Error("Expected a canonical absolute path");
  return path;
}
export async function ownedFile(path: string, max: number, privateFile = false): Promise<FileHandle> {
  absolute(path);
  const entry = await lstat(path);
  if (!entry.isFile()) throw new Error("Expected a regular file, not a symlink or special file");
  if (await realpath(path) !== path) throw new Error("File path must not traverse symlinks");
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const s = await file.stat();
    if (!s.isFile() || s.uid !== process.getuid!() || s.size > max || (privateFile && ((s.mode & 0o077) !== 0 || s.nlink !== 1)))
      throw new Error("Expected a bounded owned regular file with private registry permissions");
    return file;
  } catch (error) { await file.close(); throw error; }
}
const Meta = z.object({ type: z.literal("session_meta"), payload: z.object({
  id: ExternalSessionId, forked_from_id: ExternalSessionId.nullable().optional(),
}) });
export async function metadata(path: string) {
  if (!path.endsWith(".jsonl")) throw new Error("Expected an exact .jsonl rollout path");
  const file = await ownedFile(path, 2 ** 31);
  try {
    const stat = await file.stat(), bytes = Buffer.alloc(LIMIT);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const end = bytes.subarray(0, bytesRead).indexOf(10);
    if (end < 0) throw new Error("Missing complete bounded session header");
    let value;
    try { value = Meta.parse(JSON.parse(bytes.subarray(0, end).toString("utf8"))); }
    catch { throw new Error("Invalid session metadata header"); }
    const current = await lstat(path);
    if (current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) throw new Error("Rollout changed while reading");
    return { id: value.payload.id, parentId: value.payload.forked_from_id ?? null,
      dev: stat.dev, ino: stat.ino, header: bytes.subarray(0, end).toString("utf8") };
  } finally { await file.close(); }
}

/** Only an explicitly named pane's process tree and open descriptors are searched. */
export interface PaneInput { socket: string; pane: string; processPid?: number; processStart?: string }
type Candidate = { target: TmuxTarget; rollout: string };
const NativeParent = z.object({ subagent: z.object({ thread_spawn: z.object({ parent_thread_id: ExternalSessionId }) }) });

/** A CLI can keep its native children's rollouts open in the same process.
 * Header ancestry only disambiguates; it never replaces the live handoff check.
 * Deliberately support direct children, not inferred or partial lineage. */
async function interactiveCandidate(candidates: Candidate[], check: () => void): Promise<Candidate | undefined> {
  const first = candidates[0];
  if (!first || candidates.some(({ target }) => target.processPid !== first.target.processPid || target.processStart !== first.target.processStart)) return;
  const entries = [];
  for (const candidate of candidates) {
    check();
    const meta = await metadata(candidate.rollout);
    entries.push({ candidate, meta, source: JSON.parse(meta.header).payload.source as unknown });
  }
  check();
  if (new Set(entries.map(({ meta }) => meta.id)).size !== entries.length) return;
  const roots = entries.filter(({ source }) => source === "cli");
  if (roots.length !== 1) return;
  const root = roots[0];
  for (const entry of entries) {
    if (entry !== root) {
      const native = NativeParent.safeParse(entry.source);
      if (!native.success || native.data.subagent.thread_spawn.parent_thread_id !== root.meta.id) return;
    }
    // Reject an inode/header swap while classifying any participating identity.
    check();
    const current = await metadata(entry.candidate.rollout);
    if (current.dev !== entry.meta.dev || current.ino !== entry.meta.ino || current.header !== entry.meta.header) return;
  }
  check();
  return root.candidate;
}

export async function discover(input: PaneInput, knownRollout?: string): Promise<{ target: TmuxTarget; rollout: string } | undefined> {
  const until = Date.now() + 3500;
  const check = () => { if (Date.now() > until) throw new Error("Pane discovery exceeded bound"); };
  try {
    absolute(input.socket);
    if (!/^%\d{1,12}$/.test(input.pane)) return;
    const socket = await lstat(input.socket);
    if (!socket.isSocket() || socket.uid !== process.getuid!() || await realpath(input.socket) !== input.socket) return;
    const output = await new Promise<string>((resolve, reject) => {
      let result: { error: Error | null; stdout: string } | undefined;
      const child = execFile("tmux", ["-S", input.socket, "list-panes", "-a", "-F", "#{window_id}\t#{pane_id}\t#{pane_pid}"],
        { encoding: "utf8", timeout: 1000, maxBuffer: LIMIT, killSignal: "SIGKILL", env: { PATH: process.env.PATH, LANG: "C.UTF-8" } },
        (error, stdout) => { result = { error, stdout }; });
      child.once("close", () => result && !result.error ? resolve(result.stdout) : reject(new Error("Exact tmux pane unavailable")));
    });
    check();
    const rows = output.trimEnd().split("\n").map((row) => row.split("\t")).filter((row) => row[1] === input.pane);
    if (rows.length !== 1 || rows[0].length !== 3 || !/^\d+$/.test(rows[0][2])) return;
    const [windowId, paneId, panePidText] = rows[0], panePid = Number(panePidText);
    // An explicit PID needs no discovery: validateHandoff independently proves
    // its complete ancestry back to this pane. Otherwise enumerate all tasks,
    // since Linux children lists belong to threads, not the thread group.
    const queue = [input.processPid ?? panePid], seen = new Set<number>(), candidates: { target: TmuxTarget; rollout: string }[] = [];
    let tasks = 0;
    while (queue.length) {
      check();
      const pid = queue.shift()!;
      if (seen.has(pid)) continue;
      if (seen.size >= 32) return;
      seen.add(pid);
      try {
        const proc = async (name: string) => {
          const file = await open(`/proc/${pid}/${name}`, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
          try {
            const b = Buffer.alloc(16385), r = await file.read(b, 0, b.length, 0); check();
            if (r.bytesRead > 16384) throw new Error("Process metadata exceeded bound");
            return b.subarray(0, r.bytesRead).toString("utf8");
          } finally { await file.close(); }
        };
        const stat = await proc("stat"), fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
        if (input.processPid === undefined) {
          for await (const task of await opendir(`/proc/${pid}/task`)) {
            check(); if (++tasks > 256 || !/^\d+$/.test(task.name)) return;
            const children = (await proc(`task/${task.name}/children`)).trim();
            if (children && !/^\d+( \d+)*$/.test(children)) return;
            queue.push(...(children ? children.split(" ").map(Number) : []));
            if (queue.length > 32) return;
          }
        }
        if (input.processPid !== undefined && input.processPid !== pid) continue;
        if (input.processStart !== undefined && input.processStart !== fields[19]) continue;
        const parsed = TmuxTargetSchema.safeParse({ socket: input.socket, windowId, paneId, panePid, processPid: pid, processStart: fields[19] });
        if (!parsed.success) continue;
        let count = 0;
        const paths = new Set<string>();
        for await (const fd of await opendir(`/proc/${pid}/fd`)) {
          check(); if (++count > 256) return;
          if (!/^\d+$/.test(fd.name)) continue;
          try {
            const path = await readlink(`/proc/${pid}/fd/${fd.name}`);
            if (path.endsWith(".jsonl") && (knownRollout === undefined || path === knownRollout)) paths.add(path);
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        for (const rollout of paths) candidates.push({ target: parsed.data, rollout });
      } catch { return undefined; } // A disappearing task makes discovery incomplete.
    }
    const selected = candidates.length === 1 ? candidates[0]
      : knownRollout === undefined ? await interactiveCandidate(candidates, check) : undefined;
    if (!selected) return;
    check();
    return await validateHandoff(selected.target, selected.rollout) ? selected : undefined;
  } catch { return undefined; }
}
