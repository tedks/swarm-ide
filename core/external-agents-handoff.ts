import { execFile } from "node:child_process";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, opendir, readlink, realpath, stat } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { z } from "zod";

const canonicalPath = z.string().min(2).max(4096).refine((value) =>
  isAbsolute(value) && normalize(value) === value && !/[\x00-\x1f\x7f]/.test(value) && !value.endsWith("/"));
const pid = z.number().int().min(1).max(2147483647);

/** Operator-supplied only; never accept this object from a renderer request. */
export const TmuxTargetSchema = z.object({
  socket: canonicalPath,
  windowId: z.string().regex(/^@\d{1,12}$/),
  paneId: z.string().regex(/^%\d{1,12}$/),
  panePid: pid,
  processPid: pid,
  processStart: z.string().regex(/^\d{1,24}$/),
}).strict();
export type TmuxTarget = z.infer<typeof TmuxTargetSchema>;

/** Commands are display-only and originate from an already validated target.
 * Shell-quote even operator paths: a socket may legally contain apostrophes. */
export function terminalCommands(target: TmuxTarget) {
  const row = TmuxTargetSchema.parse(target);
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const prefix = `tmux -S ${quote(row.socket)}`;
  return {
    attach: `${prefix} attach-session -t ${quote(row.paneId)}`,
    switch: `${prefix} switch-client -t ${quote(row.paneId)}`,
    location: `${row.windowId} / ${row.paneId}`,
  };
}

const PANE_FORMAT = "#{window_id}\t#{pane_id}\t#{pane_pid}";
const MAX_ANCESTORS = 32;
const MAX_DESCRIPTORS = 256;
const MAX_PROC_BYTES = 16 * 1024;
type Check = () => void;

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

async function ownedPath(path: string, socket: boolean, check: Check): Promise<BigIntStats> {
  check();
  const info = await lstat(path, { bigint: true });
  if (info.uid !== BigInt(process.getuid!()) || !(socket ? info.isSocket() : info.isFile()) || await realpath(path) !== path) {
    throw new Error("Untrusted handoff path");
  }
  check();
  return info;
}

/** Only fixed kernel-generated proc files are opened, never a transcript. */
async function procText(path: string, check: Check): Promise<string> {
  check();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const bytes = Buffer.alloc(MAX_PROC_BYTES + 1);
    const result = await handle.read(bytes, 0, bytes.length, 0);
    check();
    if (result.bytesRead > MAX_PROC_BYTES) throw new Error("Oversized process identity");
    return bytes.subarray(0, result.bytesRead).toString("utf8");
  } finally { await handle.close(); }
}

async function processIdentity(processPid: number, check: Check): Promise<{ start: string; parent: number }> {
  const text = await procText(`/proc/${processPid}/stat`, check);
  const close = text.lastIndexOf(")");
  if (!text.startsWith(`${processPid} (`) || close < 0) throw new Error("Invalid process identity");
  const fields = text.slice(close + 2).trim().split(/\s+/);
  if (["Z", "X", "x"].includes(fields[0]) || !/^\d+$/.test(fields[1] ?? "") || !/^\d+$/.test(fields[19] ?? "")) {
    throw new Error("Exited or invalid process");
  }
  const status = await procText(`/proc/${processPid}/status`, check);
  const owner = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m);
  const parent = status.match(/^PPid:\s+(\d+)$/m);
  if (!owner || owner.slice(1).some((value) => value !== String(process.getuid!())) || !parent || parent[1] !== fields[1]) {
    throw new Error("Process owner or parent changed");
  }
  return { start: fields[19], parent: Number(fields[1]) };
}

async function tmux(args: readonly string[], signal: AbortSignal | undefined, check: Check): Promise<string> {
  check();
  return new Promise<string>((resolve, reject) => {
    // Fixed executable/argv, no shell, no inherited TMUX target, no transcript or
    // registry-controlled command. Timeout/abort kills this owned CLI only.
    let result: { error: Error | null; stdout: string } | undefined;
    const command = execFile("tmux", [...args], {
      encoding: "utf8", timeout: 1000, maxBuffer: 64 * 1024, killSignal: "SIGKILL", signal,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
    }, (error, stdout) => { result = { error, stdout }; });
    // AbortError may arrive before the process's close event. Disposal must
    // await the owned CLI, not just the error callback, before reporting done.
    command.once("close", () => {
      if (!result || result.error) reject(result?.error ?? new Error("Missing tmux completion"));
      else { try { check(); resolve(result.stdout); } catch (failure) { reject(failure); } }
    });
  });
}

async function panesMatch(target: TmuxTarget, signal: AbortSignal | undefined, check: Check): Promise<boolean> {
  const output = await tmux(["-S", target.socket, "list-panes", "-a", "-F", PANE_FORMAT], signal, check);
  const matches = output.trimEnd().split("\n").filter((line) => line === `${target.windowId}\t${target.paneId}\t${target.panePid}`);
  return matches.length === 1;
}

async function hasRollout(target: TmuxTarget, rolloutPath: string, expected: BigIntStats, check: Check): Promise<boolean> {
  check();
  const directory = await opendir(`/proc/${target.processPid}/fd`, { bufferSize: 16 });
  let count = 0, matches = false;
  for await (const entry of directory) {
    check();
    if (++count > MAX_DESCRIPTORS) return false;
    if (!/^\d+$/.test(entry.name)) continue;
    const descriptor = `/proc/${target.processPid}/fd/${entry.name}`;
    try {
      if (await readlink(descriptor) === rolloutPath) {
        const info = await stat(descriptor, { bigint: true });
        if (info.isFile() && sameFile(info, expected)) matches = true;
      }
    } catch (error) {
      // A descriptor can close naturally while being observed. Never broaden
      // the search to another PID or infer identity from its filename alone.
      if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  return matches;
}

async function validate(target: TmuxTarget, rolloutPath: string, signal: AbortSignal | undefined, check: Check): Promise<boolean> {
  const socket = await ownedPath(target.socket, true, check);
  const rollout = await ownedPath(rolloutPath, false, check);
  if (!await panesMatch(target, signal, check)) return false;
  let current = target.processPid, reachedPane = false;
  const visited = new Set<number>();
  for (let depth = 0; depth < MAX_ANCESTORS; depth++) {
    check();
    if (current < 1 || visited.has(current)) return false;
    visited.add(current);
    const identity = await processIdentity(current, check);
    if (current === target.processPid && identity.start !== target.processStart) return false;
    if (current === target.panePid) { reachedPane = true; break; }
    current = identity.parent;
  }
  if (!reachedPane || !await hasRollout(target, rolloutPath, rollout, check)) return false;
  if ((await processIdentity(target.processPid, check)).start !== target.processStart) return false;
  if (!sameFile(socket, await ownedPath(target.socket, true, check)) || !sameFile(rollout, await ownedPath(rolloutPath, false, check))) return false;
  return panesMatch(target, signal, check);
}

async function perform(target: TmuxTarget, rolloutPath: string, signal: AbortSignal | undefined, select: boolean): Promise<boolean> {
  const deadline = Date.now() + 3500;
  const check = () => { if (signal?.aborted || Date.now() > deadline) throw new Error("Handoff cancelled or expired"); };
  try {
    check();
    if (process.platform !== "linux" || !process.getuid || !canonicalPath.safeParse(rolloutPath).success) return false;
    const parsed = TmuxTargetSchema.safeParse(target);
    if (!parsed.success || !await validate(parsed.data, rolloutPath, signal, check)) return false;
    if (select) {
      // tmux has no atomic process-identity + select operation. This last check
      // narrows a remaining visual-only TOCTOU gap; success proves selection
      // was accepted, not that a live agent received a message. No input is sent.
      check();
      await tmux(["-S", parsed.data.socket, "select-window", "-t", parsed.data.windowId,
        ";", "select-pane", "-t", parsed.data.paneId], signal, check);
    }
    return true;
  } catch { return false; }
}

export async function validateHandoff(target: TmuxTarget, rolloutPath: string, signal?: AbortSignal): Promise<boolean> {
  return perform(target, rolloutPath, signal, false);
}

export async function openHandoff(target: TmuxTarget, rolloutPath: string, signal?: AbortSignal): Promise<boolean> {
  return perform(target, rolloutPath, signal, true);
}
