// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCoreRequest, PROTOCOL_VERSION } from "../protocol/schema";
import { ExternalAgentService } from "../core/external-agents";
import { queueExternalMessage } from "../core/external-agents-send";
import { validateHandoff } from "../core/external-agents-handoff";
import { parseExternalResult, type ExternalRequest } from "../protocol/external-agents";
vi.mock("../core/external-agents-handoff", async (original) => ({ ...await original<object>(), validateHandoff: vi.fn(async () => true) }));
const id = "10000000-0000-4000-8000-000000000001";
const input = { protocolVersion: PROTOCOL_VERSION, requestId: "steer-1", type: "externalAgents.send", sessionId: id, observationId: "a".repeat(64), text: "Please summarize your current boundary." };
const dirs: string[] = [], services: ExternalAgentService[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.dispose(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); vi.mocked(validateHandoff).mockReset().mockResolvedValue(true); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), "swarm-steering-")); dirs.push(dir); return dir; }
const pending = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
async function setup() {
  const dir = await directory(), root = join(dir, "repo"), registry = join(dir, "registry.json"), rollout = join(dir, "session.jsonl");
  await mkdir(root); await writeFile(rollout, JSON.stringify({ type: "session_meta", payload: { id } }) + "\n");
  const row = { id, label: "Own agent", rollout, evidence: "local", tmux: { socket: "/tmp/owned.sock", windowId: "@1", paneId: "%2", panePid: 3, processPid: 4, processStart: "5" } };
  const registration = (changed = {}) => writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, ...changed }] }), { mode: 0o600 });
  await registration();
  const queue = vi.fn<typeof queueExternalMessage>(async (_exe, sessionId) => ({ kind: "send", sessionId, receiptId: crypto.randomUUID(), status: "queued", message: "Queued only" }));
  const executable = vi.fn(async () => "/pinned/codex");
  const service = new ExternalAgentService(root, registry, { queue, executable }); services.push(service);
  const detail = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "read", type: "externalAgents.read", sessionId: id });
  if (detail.kind !== "read") throw new Error("No detail");
  const request = parseCoreRequest({ ...input, observationId: detail.detail.session.observationId }) as ExternalRequest;
  return { dir, root, registry, rollout, registration, queue, executable, service, request };
}
describe("explicit external send contract", () => {
  it("admits only bounded text and exact observed target", () => {
    expect(parseCoreRequest(input)).toEqual(input);
    for (const change of [{ text: "" }, { text: "  " }, { text: "x\0y" }, { text: "界".repeat(1334) }, { sessionId: "--help" }, { observationId: "" }, { executable: "/tmp/codex" }, { cwd: "/tmp" }])
      expect(() => parseCoreRequest({ ...input, ...change })).toThrow();
  });
  it("correlates exact send response session and rejects extra authority", () => {
    const request = parseCoreRequest(input) as ExternalRequest;
    const receipt = { kind: "send", sessionId: id, receiptId: crypto.randomUUID(), status: "queued", message: "Queued only" };
    expect(parseExternalResult(receipt, request)).toEqual(receipt);
    for (const changed of [{ sessionId: "10000000-0000-4000-8000-000000000099" }, { receiptId: "wrong" }, { status: "consumed" }, { executable: "/tmp/x" }])
      expect(() => parseExternalResult({ ...receipt, ...changed }, request)).toThrow();
  });
  it("uses fixed sender after exact revalidation, blocks duplicate attempts and never stops observed sessions", async () => {
    const f = await setup();
    expect(await f.service.request(f.request)).toMatchObject({ kind: "send", sessionId: id, status: "queued" });
    expect(f.queue).toHaveBeenCalledExactlyOnceWith("/pinned/codex", id, input.text, expect.any(AbortSignal));
    expect(await f.service.request(f.request)).toMatchObject({ status: "delivery-unknown" });
    expect(f.queue).toHaveBeenCalledTimes(1);
  });
  it.each(["synthetic", "removed", "wrong-header", "stale-observation", "closed-pane"])("rejects %s before queue dispatch", async (mode) => {
    const f = await setup();
    if (mode === "synthetic") await f.registration({ evidence: "synthetic" });
    if (mode === "removed") await writeFile(f.registry, '{"version":1,"sessions":[]}');
    if (mode === "wrong-header") await writeFile(f.rollout, JSON.stringify({ type: "session_meta", payload: { id: "10000000-0000-4000-8000-000000000099" } }) + "\n");
    if (mode === "stale-observation") Object.assign(f.request, { observationId: "f".repeat(64) });
    if (mode === "closed-pane") vi.mocked(validateHandoff).mockResolvedValue(false);
    expect(await f.service.request(f.request)).toMatchObject({ status: "rejected" }); expect(f.queue).not.toHaveBeenCalled();
  });
  it("re-reads registration after held executable resolution and again after held target validation", async () => {
    const f = await setup(), held = pending<string>(); f.executable.mockReturnValueOnce(held.promise);
    const send = f.service.request(f.request); await f.registration({ evidence: "synthetic" }); held.resolve("/pinned/codex");
    expect(await send).toMatchObject({ status: "rejected" }); expect(f.queue).not.toHaveBeenCalled();
    await f.registration();
    vi.mocked(validateHandoff).mockImplementationOnce(async () => { await writeFile(f.registry, '{"version":1,"sessions":[]}'); return true; });
    expect(await f.service.request({ ...f.request, requestId: "second" })).toMatchObject({ status: "rejected" }); expect(f.queue).not.toHaveBeenCalled();
  });
  it.each([1, 2])("rejects metadata rewritten during handoff validation %s", async (call) => {
    const f = await setup(); let count = 0;
    vi.mocked(validateHandoff).mockImplementation(async () => {
      if (++count === call) await writeFile(f.rollout, JSON.stringify({ type: "session_meta", payload: { id: "10000000-0000-4000-8000-000000000099" } }) + "\n");
      return true;
    });
    expect(await f.service.request(f.request)).toMatchObject({ status: "rejected" }); expect(f.queue).not.toHaveBeenCalled();
  });
  it("reserves the per-session slot before awaits and drains disposal through the sender", async () => {
    const f = await setup(), entered = pending<void>(), close = pending<void>();
    f.queue.mockImplementationOnce(async (_exe, sessionId, _text, signal) => { entered.resolve(); await close.promise;
      expect(signal?.aborted).toBe(true); return { kind: "send", sessionId, receiptId: crypto.randomUUID(), status: "delivery-unknown", message: "cancelled" }; });
    const first = f.service.request(f.request); await entered.promise;
    expect(await f.service.request({ ...f.request, requestId: "second" })).toMatchObject({ status: "rejected" });
    let disposed = false; const dispose = f.service.dispose().then(() => { disposed = true; }); await Promise.resolve(); expect(disposed).toBe(false);
    close.resolve(); expect(await first).toMatchObject({ status: "delivery-unknown" }); await dispose; expect(disposed).toBe(true); expect(f.queue).toHaveBeenCalledTimes(1);
  });
  it("reports thrown post-dispatch failure as unknown without retry", async () => {
    const f = await setup(); f.queue.mockRejectedValueOnce(new Error("unknown"));
    expect(await f.service.request(f.request)).toMatchObject({ status: "delivery-unknown" }); expect(f.queue).toHaveBeenCalledTimes(1);
  });
});

async function executable(body: string) {
  const dir = await directory(), path = join(dir, "codex-fixture");
  await writeFile(path, `#!${process.execPath}\n${body}\n`, { mode: 0o700 }); return { dir, path };
}
describe("owned fixed-argv queue transport (controlled CLI, no model)", () => {
  it("passes literal shell characters as one argument and accepts only a correlated queue receipt", async () => {
    const f = await executable(`const fs=require('node:fs');fs.writeFileSync(__filename+'.args',JSON.stringify(process.argv.slice(2)));console.log('Queued message 20000000-0000-4000-8000-000000000001 for thread '+process.argv[4]);`);
    const text = "$(touch /tmp/should-not-run); --thread other\n'quoted'";
    expect(await queueExternalMessage(f.path, id, text)).toMatchObject({ status: "queued", receiptId: "20000000-0000-4000-8000-000000000001" });
    expect(JSON.parse(await readFile(f.path + ".args", "utf8"))).toEqual(["queue", "--thread", id, "--message", text]);
  });
  it.each(["console.log('not a receipt')", "console.log('Queued message 20000000-0000-4000-8000-000000000001 for thread 10000000-0000-4000-8000-000000000099')", "process.exit(1)", "process.stdout.write('x'.repeat(20000));setInterval(()=>{},1000)"])("ambiguous output or exit is unknown and not retried: %s", async (body) => {
    const f = await executable(body); expect(await queueExternalMessage(f.path, id, "message", undefined, 1000)).toMatchObject({ status: "delivery-unknown" });
  });
  it("rejects absent executable and pre-cancellation without dispatch", async () => {
    expect(await queueExternalMessage("/no-such-steering-executable", id, "message")).toMatchObject({ status: "rejected" });
    const f = await executable("throw Error('must not run')"), controller = new AbortController(); controller.abort();
    expect(await queueExternalMessage(f.path, id, "message", controller.signal)).toMatchObject({ status: "rejected" });
  });
  it("timeout kills only the owned queue process group and waits for close", async () => {
    const f = await executable(`require('node:fs').writeFileSync(__filename+'.pid',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
    expect(await queueExternalMessage(f.path, id, "message", undefined, 300)).toMatchObject({ status: "delivery-unknown" });
    const pid = Number(await readFile(f.path + ".pid", "utf8")); await expect(access(`/proc/${pid}`)).rejects.toThrow();
  });
  it("aborts after spawn, drains the queue CLI, and never retries", async () => {
    const f = await executable(`require('node:fs').writeFileSync(__filename+'.pid',String(process.pid));setInterval(()=>{},1000);`), controller = new AbortController();
    const sent = queueExternalMessage(f.path, id, "message", controller.signal);
    const deadline = Date.now() + 2000; while (true) { try { await access(f.path + ".pid"); break; } catch { if (Date.now() > deadline) throw new Error("Fixture did not start"); await new Promise((done) => setTimeout(done, 10)); } }
    controller.abort(); expect(await sent).toMatchObject({ status: "delivery-unknown" });
    const pid = Number(await readFile(f.path + ".pid", "utf8")); await expect(access(`/proc/${pid}`)).rejects.toThrow();
  });
});
