// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openHandoff, TmuxTargetSchema, validateHandoff, type TmuxTarget } from "../core/external-agents-handoff";

// Entirely owned Unix sockets/tmux servers and synthetic file-holding processes.
// No physical desktop, real agent, model turn or inherited personal tmux server.
const roots: string[] = [], sockets: string[] = [], servers: Server[] = [], connections: Socket[] = [];
const environment = { PATH: process.env.PATH, LANG: "C.UTF-8" };
let tmuxAvailable = process.platform === "linux";
try { execFileSync("tmux", ["-V"], { timeout: 1000, stdio: "ignore", env: environment }); }
catch { tmuxAvailable = false; }

function command(socket: string, ...args: string[]): string {
  return execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 2000, env: environment });
}
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "swarm-handoff-test-")); roots.push(root); return root;
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 2500;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("Owned synthetic handoff process did not start");
    await new Promise((done) => setTimeout(done, 10));
  }
}
async function startTicks(pid: number): Promise<string> {
  const text = await readFile(`/proc/${pid}/stat`, "utf8");
  return text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
}

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  for (const socket of sockets.splice(0)) {
    // Only sockets allocated by this test are in this list. Never kill a target
    // merely because it was passed to the production observer.
    try { command(socket, "kill-server"); } catch { /* Already exited. */ }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: { descendants?: boolean; descriptors?: number } = {}) {
  const root = await directory(), socket = join(root, "owned.sock"), rollout = join(root, "rollout.jsonl");
  const ready = join(root, "ready.json"), script = join(root, "hold.cjs");
  await writeFile(rollout, '{"type":"session_meta","payload":{"id":"synthetic-owned-session"}}\n', { mode: 0o600 });
  await writeFile(script, `
const fs = require('node:fs');
if (${Boolean(options.descendants)} && process.argv[4] !== 'child') {
  require('node:child_process').spawn(process.execPath, [__filename, process.argv[2], process.argv[3], 'child'], { stdio: 'ignore' });
} else {
  for (let i = 0; i < ${options.descriptors ?? 1}; i++) fs.openSync(process.argv[2], 'r');
  fs.writeFileSync(process.argv[3], JSON.stringify({ pid: process.pid }));
}
setInterval(() => {}, 1000);
`);
  sockets.push(socket);
  const tuple = command(socket, "-f", "/dev/null", "new-session", "-d", "-s", "owned", "-n", "observed",
    "-P", "-F", "#{window_id}\t#{pane_id}\t#{pane_pid}", process.execPath, script, rollout, ready).trim().split("\t");
  await until(async () => { try { await readFile(ready); return true; } catch { return false; } });
  const processPid = (JSON.parse(await readFile(ready, "utf8")) as { pid: number }).pid;
  const target: TmuxTarget = { socket, windowId: tuple[0], paneId: tuple[1], panePid: Number(tuple[2]), processPid,
    processStart: await startTicks(processPid) };
  const other = command(socket, "new-window", "-d", "-t", "owned", "-n", "elsewhere", "-P", "-F", "#{window_id}",
    process.execPath, "-e", "setInterval(() => {}, 1000)").trim();
  command(socket, "select-window", "-t", other);
  const activeWindow = () => command(socket, "display-message", "-p", "-t", "owned", "#{window_id}").trim();
  return { root, rollout, ready, target, other, activeWindow };
}

it("reports optional tmux availability and supports an explicit required-positive gate", () => {
  if (process.env.SWARM_REQUIRE_EXTERNAL_HANDOFF === "1") expect(tmuxAvailable, "Linux and tmux required for actual handoff proof").toBe(true);
});

it("rejects arbitrary shell text, noncanonical paths, invalid IDs and extra registry authority", () => {
  const valid = { socket: "/tmp/owned.sock", windowId: "@1", paneId: "%2", panePid: 3, processPid: 4, processStart: "123" };
  expect(TmuxTargetSchema.safeParse(valid).success).toBe(true);
  for (const changed of [
    { socket: "relative.sock" }, { socket: "/tmp/../owned.sock" }, { socket: "/tmp/x\0.sock" }, { socket: "/tmp/x\n.sock" },
    { windowId: "@1;kill-server" }, { paneId: "-t" }, { panePid: -1 }, { processPid: 2147483648 }, { processStart: "12;3" },
    { command: "send-keys" },
  ]) expect(TmuxTargetSchema.safeParse({ ...valid, ...changed }).success).toBe(false);
});

describe.skipIf(!tmuxAvailable)("identity-checked external conversation handoff", () => {
  it("validates a real owned pane/process/open rollout without changing selection, then explicitly selects it", async () => {
    const f = await fixture();
    expect(f.activeWindow()).toBe(f.other);
    expect(await validateHandoff(f.target, f.rollout)).toBe(true);
    expect(f.activeWindow()).toBe(f.other);
    expect(await openHandoff(f.target, f.rollout)).toBe(true);
    expect(f.activeWindow()).toBe(f.target.windowId);
    expect(command(f.target.socket, "display-message", "-p", "-t", f.target.windowId, "#{pane_id}").trim()).toBe(f.target.paneId);
    expect(await startTicks(f.target.processPid)).toBe(f.target.processStart);
  });

  it("follows a bounded real descendant chain rather than assuming the agent is the pane process", async () => {
    const f = await fixture({ descendants: true });
    expect(f.target.processPid).not.toBe(f.target.panePid);
    expect(await validateHandoff(f.target, f.rollout)).toBe(true);
    expect(await openHandoff(f.target, f.rollout)).toBe(true);
  });

  it("rejects stale start time, wrong pane/window/parent and unrelated registered process without switching", async () => {
    const f = await fixture();
    for (const changed of [
      { processStart: String(BigInt(f.target.processStart) + 1n) }, { paneId: "%999999999" }, { windowId: f.other },
      { panePid: process.pid }, { processPid: process.pid, processStart: await startTicks(process.pid) },
      { processPid: 2147483647 },
    ]) {
      expect(await openHandoff({ ...f.target, ...changed }, f.rollout)).toBe(false);
      expect(f.activeWindow()).toBe(f.other);
    }
    expect(await startTicks(f.target.processPid)).toBe(f.target.processStart);
  });

  it("rejects socket aliases, regular-file sockets and noncanonical or symlinked rollout paths", async () => {
    const f = await fixture(), alias = join(f.root, "alias.sock"), transcriptAlias = join(f.root, "alias.jsonl");
    await symlink(f.target.socket, alias); await symlink(f.rollout, transcriptAlias);
    expect(await openHandoff({ ...f.target, socket: alias }, f.rollout)).toBe(false);
    expect(await openHandoff({ ...f.target, socket: f.rollout }, f.rollout)).toBe(false);
    expect(await openHandoff(f.target, transcriptAlias)).toBe(false);
    expect(await openHandoff(f.target, `${f.root}/../${f.root.split("/").at(-1)}/rollout.jsonl`)).toBe(false);
    expect(f.activeWindow()).toBe(f.other);
  });

  it("rejects a rotated replacement inode even while the original rollout is still held open", async () => {
    const f = await fixture();
    await rename(f.rollout, join(f.root, "rotated.jsonl"));
    await writeFile(f.rollout, "replacement", { mode: 0o600 });
    expect(await validateHandoff(f.target, f.rollout)).toBe(false);
    expect(await openHandoff(f.target, f.rollout)).toBe(false);
    expect(f.activeWindow()).toBe(f.other);
  });

  it("does not equate an arbitrary existing regular file with the process's open rollout", async () => {
    const f = await fixture(), other = join(f.root, "not-open.jsonl");
    await writeFile(other, "synthetic unrelated", { mode: 0o600 });
    expect(await openHandoff(f.target, other)).toBe(false);
    await rm(f.rollout);
    expect(await openHandoff(f.target, f.rollout)).toBe(false);
    expect(f.activeWindow()).toBe(f.other);
  });

  it("caps descriptor enumeration rather than discovering arbitrary process state", async () => {
    const f = await fixture({ descriptors: 260 });
    expect(await validateHandoff(f.target, f.rollout)).toBe(false);
    expect(f.activeWindow()).toBe(f.other);
  });

  it("pre-cancellation leaves the owned observed process and current window untouched", async () => {
    const f = await fixture(), controller = new AbortController();
    controller.abort();
    expect(await validateHandoff(f.target, f.rollout, controller.signal)).toBe(false);
    expect(await openHandoff(f.target, f.rollout, controller.signal)).toBe(false);
    expect(f.activeWindow()).toBe(f.other);
    expect(await startTicks(f.target.processPid)).toBe(f.target.processStart);
  });

  it("aborts a stalled owned CLI connection, without disposing the observed process or socket server", async () => {
    const f = await fixture(), socket = join(f.root, "stalled.sock"), controller = new AbortController();
    const server = createServer((connection) => { connections.push(connection); controller.abort(); });
    servers.push(server);
    await new Promise<void>((done) => server.listen(socket, done));
    const started = Date.now();
    expect(await openHandoff({ ...f.target, socket }, f.rollout, controller.signal)).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(server.listening).toBe(true);
    expect(f.activeWindow()).toBe(f.other);
    expect(await startTicks(f.target.processPid)).toBe(f.target.processStart);
  });
});
