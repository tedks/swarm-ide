import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { accessSync, constants, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedCodexTransport, type OwnedCodexTransportOptions } from "../core/agents/owner";
import type { CodexTransport } from "../core/agents/codex-app-server";

// Real deterministic OS children, never Codex/auth/model calls. Each fixture's
// paths and process handles belong to this test. No saved PID is ever signalled.
const transports: CodexTransport[] = [], children: ChildProcess[] = [], directories: string[] = [];
const startupHooks = ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_AUDIT"] as const;
const fixtureEnvironment = { ...process.env, ...Object.fromEntries(startupHooks.map((name) => [name, ""])) };
function executable(name: string) {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (!directory.startsWith("/")) continue;
    const path = join(directory, name);
    try { accessSync(path, constants.X_OK); return path; } catch { /* next registered PATH entry */ }
  }
  throw new Error(`Missing test dependency ${name}`);
}
const unshare = executable("unshare"), setpriv = executable("setpriv");
let namespacesAvailable = true;
try { execFileSync(unshare, ["--user", "--map-current-user", "--pid", "--fork", "--kill-child=SIGKILL", "--mount-proc", "--", executable("true")], { timeout: 3000, stdio: "ignore", env: fixtureEnvironment }); }
catch { namespacesAvailable = false; }

beforeEach(() => {
  // The test runner may legitimately use startup configuration; a deterministic
  // owned-process fixture must not inherit it. Product rejection is unchanged.
  for (const name of startupHooks) vi.stubEnv(name, "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const transport of transports.splice(0)) await transport.close();
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise<void>((resolve) => child.once("close", () => resolve()));
      child.kill("SIGKILL"); await ended;
    }
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function options(source: string, extra: Partial<OwnedCodexTransportOptions> = {}) {
  const root = await mkdtemp(join(tmpdir(), "swarm-owned-agent-")); directories.push(root);
  return { root, executable: process.execPath, nodeExecutable: process.execPath,
    unshareExecutable: unshare, setprivExecutable: setpriv,
    ownerScript: resolve("core/agents/owner-process.mjs"), args: ["-e", source], graceMs: 80, ...extra };
}
function fixture(config: OwnedCodexTransportOptions) {
  let stdout = "", stderr = "", errors = 0, ended = false;
  const exits: (number | null)[] = [];
  const transport = createOwnedCodexTransport(config, {
    stdout: (bytes) => { stdout += Buffer.from(bytes).toString(); },
    stderr: (bytes) => { stderr += Buffer.from(bytes).toString(); },
    end: () => { ended = true; }, exit: (code) => { exits.push(code); }, error: () => { errors++; },
  });
  transports.push(transport);
  return { transport, get stdout() { return stdout; }, get stderr() { return stderr; },
    get errors() { return errors; }, get ended() { return ended; }, exits };
}
async function until(predicate: () => boolean, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Owned-process fixture deadline exceeded");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
function namespaceMembers(namespace: string): number[] {
  return readdirSync("/proc").filter((name) => /^\d+$/.test(name)).flatMap((name) => {
    try { return readlinkSync(`/proc/${name}/ns/pid`) === namespace ? [Number(name)] : []; }
    catch { return []; }
  });
}
function isRunning(pid: number) {
  try { const stat = readFileSync(`/proc/${pid}/stat`, "utf8"); return !["Z", "X"].includes(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]!); }
  catch { return false; }
}
const announce = `const fs=require('node:fs'); console.log(JSON.stringify({namespace:fs.readlinkSync('/proc/self/ns/pid')}));`;
const live = `${announce} process.stdin.on('data',b=>process.stdout.write(b)); setInterval(()=>{},1000);`;
const detached = `${announce}
const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); console.log('detached-ready'); setInterval(()=>{},1000)"],{detached:true,stdio:['ignore','inherit','inherit']});
process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`;

describe("owned transport fails closed", () => {
  it("rejects inherited startup hooks before any guardian/provider process", async () => {
    const config = await options("require('node:fs').writeFileSync('SHOULD_NOT_EXIST','bad')");
    for (const name of startupHooks) {
      vi.stubEnv(name, "test-only-pre-exec-hook");
      expect(() => fixture(config)).toThrow("startup hooks are not permitted");
      vi.stubEnv(name, "");
    }
    expect(readdirSync(config.root)).toEqual([]);
  });
  it("rejects invalid privileged configuration before spawning", async () => {
    const config = await options(live);
    for (const change of [{ root: "relative" }, { graceMs: 0 }, { graceMs: 5001 },
      { ownerScript: "/some/../script" }, { args: ["bad\0argument"] }, { args: ["x".repeat(16385)] }]) {
      expect(() => fixture({ ...config, ...change })).toThrow("Invalid core-owned");
    }
  });
  it("missing namespace tool never starts the target or claims cleanup confirmed", async () => {
    const config = await options("require('node:fs').writeFileSync('SHOULD_NOT_EXIST','bad')", { unshareExecutable: "/missing/swarm-unshare" });
    const f = fixture(config);
    expect(await f.transport.close()).toMatchObject({ status: "unknown" });
    expect(readdirSync(config.root)).toEqual([]);
  });
  it("ordinary namespace-init invocation refuses to spawn outside PID1", async () => {
    const config = await options("require('node:fs').writeFileSync('SHOULD_NOT_EXIST','bad')");
    const result = spawn(process.execPath, [config.ownerScript, "init", JSON.stringify({ ...config, parentNamespace: readlinkSync("/proc/self/ns/pid") })],
      { cwd: config.root, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    children.push(result);
    const code = await new Promise((resolve) => result.once("exit", resolve));
    expect(code).toBe(78); expect(readdirSync(config.root)).toEqual([]);
  });
  it("wrapper exit zero or a forged cleanup line without namespace readiness is unknown", async () => {
    const config = await options(live);
    const impostor = join(config.root, "not-an-owner.mjs");
    await writeFile(impostor, "import {writeSync} from 'node:fs'; writeSync(4,JSON.stringify({type:'cleanup',status:'confirmed'})+'\\n');");
    const f = fixture({ ...config, ownerScript: impostor });
    expect(await f.transport.close()).toMatchObject({ status: "unknown" });
    expect(f.errors).toBe(1);
  });
  it("unsupported real Linux namespace policy remains a fail-closed result", async () => {
    if (namespacesAvailable) return;
    const config = await options("require('node:fs').writeFileSync('SHOULD_NOT_EXIST','bad')");
    const f = fixture(config);
    expect(await f.transport.close()).toMatchObject({ status: "unknown" });
    expect(readdirSync(config.root)).toEqual([]);
  });
});

// A host forbidding user/PID namespaces exercises the unavailable case above;
// it cannot claim these positive lifetime proofs. Local Linux evidence requires
// this suite to execute, not skip. Hosted restriction is recorded, not concealed.
describe.skipIf(!namespacesAvailable)("Linux private namespace lifetime evidence", () => {
  it("forwards provider bytes and confirms teardown only after namespace disappearance", async () => {
    const f = fixture(await options(live));
    await until(() => f.stdout.includes("namespace"));
    const namespace = JSON.parse(f.stdout.split("\n")[0]!).namespace;
    expect(namespace).not.toBe(readlinkSync("/proc/self/ns/pid"));
    expect(namespaceMembers(namespace).length).toBeGreaterThanOrEqual(2);
    f.transport.write("provider-input\n");
    await until(() => f.stdout.includes("provider-input"));
    const result = await f.transport.close();
    expect(result.status).toBe("confirmed");
    expect(await f.transport.close()).toEqual(result);
    expect(namespaceMembers(namespace)).toEqual([]);
    expect(f.ended).toBe(true);
    expect(f.exits).toHaveLength(1);
    expect(() => f.transport.write("not replayed\n")).toThrow("unavailable");
  });
  it("kills SIGTERM-resistant detached descendants while an unrelated child survives", async () => {
    const canary = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); children.push(canary);
    const f = fixture(await options(detached));
    await until(() => f.stdout.includes("detached-ready"));
    const namespace = JSON.parse(f.stdout.split("\n")[0]!).namespace;
    expect(namespaceMembers(namespace).length).toBeGreaterThanOrEqual(3);
    expect((await f.transport.close()).status).toBe("confirmed");
    expect(namespaceMembers(namespace)).toEqual([]);
    expect(isRunning(canary.pid!)).toBe(true);
  });
  it("closing before namespace readiness does not dispatch the provider", async () => {
    const config = await options("require('node:fs').writeFileSync('SHOULD_NOT_EXIST','bad')");
    const f = fixture(config);
    expect((await f.transport.close()).status).toBe("confirmed");
    expect(readdirSync(config.root)).toEqual([]);
  });
  it("server exit zero is observed separately from descendant cleanup", async () => {
    const source = `${announce} const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'}); c.unref();`;
    const f = fixture(await options(source));
    await until(() => f.stdout.includes("namespace"));
    const namespace = JSON.parse(f.stdout.split("\n")[0]!).namespace;
    await until(() => f.exits.length > 0);
    expect(f.exits).toEqual([0]);
    expect((await f.transport.close()).status).toBe("confirmed");
    expect(namespaceMembers(namespace)).toEqual([]);
  });
  it("guardian escalates an unresponsive PID1 but reports unknown rather than assuming reap", async () => {
    const config = await options(live);
    const blockedInit = join(config.root, "blocked-init.mjs");
    // Linux PID1 ignores a descendant's SIGSTOP; that is not a hung-init test.
    // Keep the genuine guardian, but block the init fixture's JS event loop
    // after a real namespace-ready handshake. No host/saved PID is signalled.
    await writeFile(blockedInit, `import {readlinkSync,writeSync} from 'node:fs';
if(process.argv[2]==='init') {
  if(process.pid!==1) process.exit(78);
  const namespace=readlinkSync('/proc/self/ns/pid');
  writeSync(1,JSON.stringify({namespace})+'\\n');
  writeSync(4,JSON.stringify({type:'ready',namespace})+'\\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
} else await import(${JSON.stringify(pathToFileURL(config.ownerScript).href)});`);
    const f = fixture({ ...config, ownerScript: blockedInit });
    await until(() => f.stdout.includes("namespace"));
    const namespace = JSON.parse(f.stdout.split("\n")[0]!).namespace;
    expect((await f.transport.close()).status).toBe("unknown");
    await until(() => namespaceMembers(namespace).every((pid) => !isRunning(pid)));
  });
  it("a hard core SIGKILL closes control and kills detached descendants without exit hooks", async () => {
    const config = await options(detached);
    // A disposable core boundary uses the same guardian/control descriptors as
    // the TS facade. Killing it bypasses all JS exit/close handlers entirely.
    const coreSource = `const {spawn}=require('node:child_process'); const c=JSON.parse(process.argv[1]);
const owner=spawn(c.nodeExecutable,[c.ownerScript,'guardian',JSON.stringify({...c,parentNamespace:require('node:fs').readlinkSync('/proc/self/ns/pid')})],{cwd:c.root,stdio:['ignore','pipe','pipe','pipe','pipe']});
owner.stdout.pipe(process.stdout); owner.stderr.pipe(process.stderr); let b='';
owner.stdio[4].on('data',x=>{b+=x; let p; while((p=b.indexOf('\\n'))>=0){const v=JSON.parse(b.slice(0,p)); b=b.slice(p+1); if(v.type==='ready')owner.stdio[3].write('start\\n');}});`;
    const core = spawn(process.execPath, ["-e", coreSource, JSON.stringify(config)], { stdio: ["ignore", "pipe", "pipe"] }); children.push(core);
    let output = ""; core.stdout!.on("data", (bytes) => { output += bytes; });
    await until(() => output.includes("detached-ready"));
    const namespace = JSON.parse(output.split("\n")[0]!).namespace;
    const owned = namespaceMembers(namespace);
    expect(owned.length).toBeGreaterThanOrEqual(3);
    core.kill("SIGKILL");
    await until(() => namespaceMembers(namespace).every((pid) => !isRunning(pid)));
    expect(owned.every((pid) => !isRunning(pid))).toBe(true);
  });
});
