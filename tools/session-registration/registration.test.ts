// @vitest-environment node
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { ExternalAgentService } from "../../core/external-agents";
import { Registry } from "../../core/external-agents-registry";
import { PROTOCOL_VERSION } from "../../protocol/common";
import { parseArgs } from "./cli";
import { discover } from "./identity";
import { updateRegistry, type RegisterInput } from "./registry";

const dirs: string[] = [], sockets: string[] = [], holders: ChildProcess[] = [];
const cli = process.env.SWARM_REGISTRATION_CLI;
const parentId = "10000000-0000-4000-8000-000000000001";
const header = (id: string, parent: string | null = parentId) => JSON.stringify({ type: "session_meta", payload: { id, forked_from_id: parent } }) + "\n";
const environment = { PATH: process.env.PATH, LANG: "C.UTF-8" };
const tmux = (socket: string, ...args: string[]) => execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 2500, env: environment });
async function stopHolder(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) { const closed = once(child, "close"); child.kill("SIGKILL"); await closed; }
}
afterEach(async () => {
  for (const holder of holders.splice(0)) await stopHolder(holder);
  for (const socket of sockets.splice(0)) { try { tmux(socket, "kill-server"); } catch { /* Already closed owned server. */ } }
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "swarm-registration-")); dirs.push(dir);
  const root = join(dir, "repo"); await mkdir(root);
  const id = randomUUID(), rollout = join(dir, "session.jsonl"), registry = join(dir, "registry.json");
  await writeFile(rollout, header(id) + JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant",
    content: [{ type: "output_text", text: "Controlled holder report" }] } }) + "\n", { mode: 0o600 });
  const input: RegisterInput = { action: "register", registry, rollout, label: "Worker", contextRoot: root, contextPaths: ["src/index.ts"] };
  return { dir, root, id, rollout, registry, input };
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!await check()) { if (Date.now() > deadline) throw new Error("Owned fixture startup expired"); await new Promise((done) => setTimeout(done, 10)); }
}
async function paneFixture(ambiguous = false, threaded = false) {
  const f = await fixture(), socket = join(f.dir, "owned.sock"), ready = join(f.dir, "ready.json"), script = join(f.dir, "holder.cjs");
  const other = join(f.dir, "other.jsonl"); await writeFile(other, header(randomUUID()), { mode: 0o600 });
  // A wrapper plus one child mirrors a tmux shell/agent relationship, without
  // running Codex or sending any model request. Only this server is ever killed.
  await writeFile(script, `
const fs = require('node:fs');
if (process.argv[2] !== 'child') {
  ${threaded ? `new (require('node:worker_threads').Worker)(\`require('node:child_process').spawn(process.execPath, [\${JSON.stringify(__filename)}, 'child'], { stdio: 'inherit' }); setInterval(() => {}, 1000);\`, { eval: true });`
    : `require('node:child_process').spawn(process.execPath, [__filename, 'child'], { stdio: 'inherit' });`}
} else {
  fs.openSync(${JSON.stringify(f.rollout)}, 'r');
  ${ambiguous ? `fs.openSync(${JSON.stringify(other)}, 'r');` : ""}
  fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid }));
}
setInterval(() => {}, 1000);
`);
  sockets.push(socket);
  const tuple = tmux(socket, "-f", "/dev/null", "new-session", "-d", "-s", "owned", "-n", "holder", "-P", "-F",
    "#{window_id}\t#{pane_id}\t#{pane_pid}", process.execPath, script).trim().split("\t");
  await until(async () => { try { await readFile(ready); return true; } catch { return false; } });
  const pid = (JSON.parse(await readFile(ready, "utf8")) as { pid: number }).pid;
  const stat = await readFile(`/proc/${pid}/stat`, "utf8"), start = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
  return { ...f, pane: { socket, pane: tuple[1], processPid: pid, processStart: start }, pid, other };
}
async function command(args: string[]) {
  if (!cli) throw new Error("Bazel registration CLI bundle required");
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 14000, maxBuffer: 131072 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) || 1 : 0, stdout, stderr });
    });
  });
}
const args = (f: Awaited<ReturnType<typeof fixture>>) => ["register", "--registry", f.registry, "--rollout", f.rollout, "--label", "Worker"];
async function lockHolder(f: Awaited<ReturnType<typeof fixture>>) {
  const path = `${f.registry}.lock`; await writeFile(path, "", { mode: 0o600 });
  const holder = spawn(process.execPath, ["-e", `
const fs = require('node:fs'), cp = require('node:child_process');
const fd = fs.openSync(process.argv[1], 'r+');
cp.execFileSync('flock', ['--exclusive', '3'], { stdio: ['ignore', 'ignore', 'ignore', fd] });
process.stdout.write('locked\\n'); setInterval(() => {}, 1000);
`, path], { stdio: ["ignore", "pipe", "pipe"] });
  holders.push(holder); await once(holder.stdout!, "data"); return holder;
}

describe("known worker registration", () => {
  it("registers idempotently, preserves omitted peer defaults and metadata, retires without losing history", async () => {
    const f = await fixture(), peer = { id: randomUUID(), label: "untouched", rollout: join(f.dir, "peer.jsonl") };
    await writeFile(f.registry, JSON.stringify({ version: 1, sessions: [peer] }), { mode: 0o600 });
    expect(await updateRegistry({ ...f.input, role: "Implementation", task: "G1" })).toMatchObject({ changed: true, authority: "historical-only", parentId });
    expect(await updateRegistry({ ...f.input, role: "Implementation", task: "G1" })).toMatchObject({ changed: false });
    await updateRegistry({ ...f.input, label: "Updated" });
    const raw = JSON.parse(await readFile(f.registry, "utf8"));
    expect(raw.sessions).toHaveLength(2); expect(raw.sessions[0]).toEqual(peer);
    expect(raw.sessions[1]).toMatchObject({ label: "Updated", task: "G1", role: "Implementation" });
    expect(await updateRegistry({ action: "retire", registry: f.registry, sessionId: f.id })).toMatchObject({ changed: false, authority: "historical-only" });
    expect((await lstat(f.registry)).mode & 0o777).toBe(0o600);
    expect((await lstat(`${f.registry}.lock`)).mode & 0o777).toBe(0o600);
    expect(await readFile(f.registry, "utf8")).not.toContain("Controlled holder report");
  });

  it("never accepts claimed parentage, invalid flags, paths or field limits", async () => {
    const f = await fixture();
    for (const extra of [["--parent", parentId], ["--label", "again"], ["--socket", "/tmp/s"], ["--process-start", "123"], ["--evidence", "live"]])
      expect(() => parseArgs([...args(f), ...extra])).toThrow();
    await expect(updateRegistry({ ...f.input, label: "x".repeat(121) })).rejects.toThrow("Invalid registration");
    await expect(updateRegistry({ ...f.input, contextPaths: ["../escape"] })).rejects.toThrow("Invalid registration");
    await expect(updateRegistry({ ...f.input, sessionId: randomUUID() })).rejects.toThrow("expected session");
    await expect(updateRegistry({ ...f.input, contextRoot: undefined })).rejects.toThrow("explicit context root");
    await expect(updateRegistry({ ...f.input, registry: join(f.root, "registry.json"), contextRoot: f.root })).rejects.toThrow();
    await expect(lstat(f.registry)).rejects.toThrow();
  });

  it("rejects malformed/oversized registry and metadata without replacing registry bytes", async () => {
    const f = await fixture();
    for (const invalid of ["{unfinished", JSON.stringify({ version: 2, sessions: [] }), "x".repeat(65537)]) {
      await writeFile(f.registry, invalid, { mode: 0o600 });
      await expect(updateRegistry(f.input)).rejects.toThrow();
      expect(await readFile(f.registry, "utf8")).toBe(invalid);
    }
    const empty = '{"version":1,"sessions":[]}'; await writeFile(f.registry, empty);
    for (const invalid of ["{}\n", header("not-uuid"), "x".repeat(65536), '{"type":"session_meta"']) {
      await writeFile(f.rollout, invalid); await expect(updateRegistry(f.input)).rejects.toThrow();
      expect(await readFile(f.registry, "utf8")).toBe(empty);
    }
  });

  it("rejects symlinks, FIFO, public directories/files and conflicting rollout identities", async () => {
    const f = await fixture(), other = join(f.dir, "other.json");
    await writeFile(other, '{"version":1,"sessions":[]}', { mode: 0o600 });
    await symlink(other, f.registry); await expect(updateRegistry(f.input)).rejects.toThrow("regular file");
    expect((await lstat(f.registry)).isSymbolicLink()).toBe(true); await rm(f.registry);
    await symlink(join(f.dir, "missing"), f.registry); await expect(updateRegistry(f.input)).rejects.toThrow("regular file"); await rm(f.registry);
    execFileSync("mkfifo", [f.registry]); await expect(updateRegistry(f.input)).rejects.toThrow("regular file"); await rm(f.registry);
    await updateRegistry(f.input); await chmod(f.registry, 0o644);
    await expect(updateRegistry(f.input)).rejects.toThrow("private registry"); await chmod(f.registry, 0o600);
    await chmod(f.dir, 0o755); await expect(updateRegistry(f.input)).rejects.toThrow("0700"); await chmod(f.dir, 0o700);
    const alias = join(f.dir, "same-id.jsonl"); await writeFile(alias, header(f.id));
    await expect(updateRegistry({ ...f.input, rollout: alias })).rejects.toThrow("different rollout");
    const second = await fixture(); await writeFile(f.registry, JSON.stringify({ version: 1, sessions: [{ id: second.id, label: "Other", rollout: f.rollout }] }));
    await expect(updateRegistry(f.input)).rejects.toThrow("duplicates");
  });

  it("rejects 65th row and valid-schema UTF-8 aggregate overflow without dropping peers", async () => {
    const f = await fixture();
    const peers = Array.from({ length: 64 }, (_, i) => ({ id: randomUUID(), label: `P${i}`, rollout: `${f.dir}/${i}.jsonl` }));
    await writeFile(f.registry, JSON.stringify({ version: 1, sessions: peers }), { mode: 0o600 });
    await expect(updateRegistry(f.input)).rejects.toThrow("bounds");
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions).toHaveLength(64);
    const longPeers = peers.slice(0, 40).map((p) => ({ ...p, task: "📚".repeat(100) }));
    // Valid individual rows, but aggregate update must still fit the observer's bytes.
    const row = { ...f.input, contextPaths: Array.from({ length: 12 }, (_, i) => `${i}/` + "📚".repeat(200)) };
    await writeFile(f.registry, JSON.stringify({ version: 1, sessions: longPeers }), { mode: 0o600 });
    // Large unicode paths remain bounded in characters but can exceed total bytes.
    const huge = longPeers.map((p) => ({ ...p, contextPaths: ["📚".repeat(250)] }));
    const bytes = JSON.stringify({ version: 1, sessions: huge });
    expect(Registry.safeParse(JSON.parse(bytes)).success).toBe(true);
    await writeFile(f.registry, bytes);
    await expect(updateRegistry(row)).rejects.toThrow();
    expect(await readFile(f.registry, "utf8")).toBe(bytes);
  });

  it("checks actual owned descendant/open-rollout identity and the existing observer reads ancestry/activity", async () => {
    const f = await paneFixture();
    const found = await discover(f.pane, f.rollout);
    expect(found?.target.processPid).toBe(f.pid); expect(found?.target.panePid).not.toBe(f.pid);
    const result = await updateRegistry({ ...f.input, pane: f.pane });
    expect(result).toMatchObject({ authority: "checked-live", parentId });
    const service = new ExternalAgentService(f.root, f.registry);
    try {
      const observed = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "g1-read", type: "externalAgents.read", sessionId: f.id });
      expect(observed).toMatchObject({ kind: "read", detail: { handoff: "available", session: { parentId, status: "observed", contextPaths: ["src/index.ts"] },
        entries: [{ kind: "assistant", text: "Controlled holder report" }] } });
      expect(await updateRegistry({ ...f.input, rollout: undefined, pane: f.pane })).toMatchObject({ changed: false, authority: "checked-live" });
      expect(await updateRegistry({ action: "retire", registry: f.registry, sessionId: f.id })).toMatchObject({ changed: true });
      expect(await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "g1-retired", type: "externalAgents.read", sessionId: f.id }))
        .toMatchObject({ detail: { handoff: "unconfigured", session: { status: "observed", parentId } } });
      expect((await readFile(`/proc/${f.pid}/stat`, "utf8")).startsWith(`${f.pid} (`)).toBe(true);
    } finally { await service.dispose(); }
  });

  it("finds a holder spawned by a non-leader thread in the exact pane", async () => {
    const f = await paneFixture(false, true);
    expect((await discover(f.pane, f.rollout))?.target.processPid).toBe(f.pid);
  });

  it("removes old authority on wrong process/start/pane and closed target, without inventing identity", async () => {
    const f = await paneFixture();
    for (const changed of [{ processStart: "1" }, { processPid: process.pid }, { pane: "%99999999" }]) {
      await updateRegistry({ ...f.input, pane: f.pane });
      expect(await updateRegistry({ ...f.input, pane: { ...f.pane, ...changed } })).toMatchObject({ authority: "historical-only" });
      expect(JSON.parse(await readFile(f.registry, "utf8")).sessions[0].tmux).toBeUndefined();
    }
    tmux(f.pane.socket, "kill-server");
    expect(await updateRegistry({ ...f.input, pane: f.pane })).toMatchObject({ authority: "historical-only" });
    await expect(updateRegistry({ ...f.input, rollout: undefined, pane: f.pane })).rejects.toThrow("uniquely");
  });

  it("does not infer a unique rollout from an ambiguous pane or give synthetic rows steering authority", async () => {
    const f = await paneFixture(true);
    await expect(updateRegistry({ ...f.input, rollout: undefined, pane: f.pane })).rejects.toThrow("uniquely");
    expect(await updateRegistry({ ...f.input, pane: f.pane })).toMatchObject({ authority: "checked-live" });
    expect(await updateRegistry({ ...f.input, pane: f.pane, evidence: "synthetic" })).toMatchObject({ authority: "historical-only" });
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions[0].tmux).toBeUndefined();
  });
});

describe.skipIf(!cli)("actual bundled CLI and kernel writer lock", () => {
  it("runs help and two concurrent registrations without losing rows, then retires idempotently", async () => {
    const f = await fixture(), other = await fixture();
    expect((await command(["--help"])).stdout).toContain("No launch");
    const held = await lockHolder(f);
    const a = command(args(f)), b = command([...args(other).slice(0, 2), f.registry, ...args(other).slice(3)]);
    await new Promise((done) => setTimeout(done, 150)); await stopHolder(held);
    const results = await Promise.all([a, b]); expect(results.map((r) => r.code)).toEqual([0, 0]);
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions.map((s: { id: string }) => s.id).sort()).toEqual([f.id, other.id].sort());
    expect(JSON.parse((await command(args(f))).stdout).changed).toBe(false);
    for (let i = 0; i < 2; i++) expect((await command(["retire", "--registry", f.registry, "--session-id", f.id])).code).toBe(0);
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions).toHaveLength(2);
  });

  it("bounds contention, leaves bytes unchanged and recovers after lock-owner SIGKILL", async () => {
    const f = await fixture(); await updateRegistry(f.input);
    const before = await readFile(f.registry, "utf8"), holder = await lockHolder(f), start = Date.now();
    const result = await command(args(f));
    expect(result.code).toBe(1); expect(result.stderr).toContain("lock unavailable");
    expect(Date.now() - start).toBeLessThan(7500); expect(await readFile(f.registry, "utf8")).toBe(before);
    await stopHolder(holder); expect((await command(args(f))).code).toBe(0);
  }, 10000);

  it("registers from actual CLI pane flags and retirement keeps observer history", async () => {
    const f = await paneFixture();
    const result = await command([...args(f), "--socket", f.pane.socket, "--pane", f.pane.pane, "--process-pid", String(f.pid), "--process-start", f.pane.processStart, "--session-id", f.id]);
    expect(result.code, result.stderr).toBe(0); expect(JSON.parse(result.stdout).authority).toBe("checked-live");
    expect(result.stdout).not.toContain("Controlled holder report");
    expect((await command(["retire", "--registry", f.registry, "--session-id", f.id])).code).toBe(0);
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions[0]).toMatchObject({ id: f.id, rollout: f.rollout });
    expect(JSON.parse(await readFile(f.registry, "utf8")).sessions[0].tmux).toBeUndefined();
  });
});
