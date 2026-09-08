// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedLocalService, type TrustedLocalOptions } from "../core/agents/trusted-local";
import { MemoryTrustedLocalStore, type TrustedLocalStore } from "../core/agents/trusted-local-store";
import { RegisteredAgentContextProvider } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { PROTOCOL_VERSION } from "../protocol/common";
import { TrustedRequestSchema, type TrustedActivity, type TrustedRequest } from "../protocol/trusted-local";
import { TrustedLocalSession, type TrustedLocalSessionSnapshot } from "../core/agents/trusted-local-session";
import type { CodexTransportSink } from "../core/agents/codex-app-server";
import type { AgentTaskReference } from "../protocol/agent-task";

const roots: string[] = [], owners: TrustedLocalService[] = [];
afterEach(async () => { await Promise.all(owners.splice(0).map((owner) => owner.shutdown())); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const command = (type: TrustedRequest["type"], fields = {}) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type, ...fields });
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function session(onChange: () => void) {
  const state: TrustedLocalSessionSnapshot = { status: "starting", threadId: randomUUID(), turnId: null, output: "", approvals: [], message: "Controlled session" };
  let activities: TrustedActivity[] = [];
  return { state, snapshot: () => structuredClone(state), activity: () => activities,
    emit(update: Partial<TrustedLocalSessionSnapshot>) { Object.assign(state, update); onChange(); },
    setActivities(value: TrustedActivity[]) { activities = value; onChange(); },
    start: vi.fn(async () => { state.status = "ready"; onChange(); }),
    send: vi.fn(async () => { state.status = "running"; state.turnId = randomUUID(); onChange(); }),
    decide: vi.fn(async () => { state.approvals = []; onChange(); }),
    stop: vi.fn(async () => { state.status = "closed"; state.approvals = []; onChange(); }),
  };
}
async function fixture(store: TrustedLocalStore = new MemoryTrustedLocalStore()) {
  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-fleet-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  await writeFile(join(root, "source.ts"), "const value = 1;\n"); git("add", "."); git("commit", "-qm", "fixture");
  const revision = await computeWorkingWorldFingerprint(root);
  const taskReference: AgentTaskReference = { version: 1, repositoryId: "repository:fixture", worldId: "world:working", provider: "ditz", taskId: "controlled-task",
    metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } };
  const task = { reference: taskReference, title: "Exact task λ", description: "Untrusted task data, retained exactly." };
  const context = await RegisteredAgentContextProvider.create({ root, repositoryId: "repository:fixture", worldId: "world:working",
    workingRevision: () => revision, resolveFocus: async (focus) => [{ attachmentPath: focus.path ?? null, sourcePaths: focus.path ? [focus.path] : [] }],
    provenance: async () => ({ instructions: [], configuration: [] }), taskResolver: {
      resolveTask: async () => structuredClone(task), checkRevision: async () => {},
    } });
  const input = { worldId: "world:working", focus: { worldId: "world:working", revisionKind: "working" as const, revisionId: revision,
    domain: "repo" as const, key: "file:source.ts", path: "source.ts" }, taskText: "Explain this source", model: null, effort: null,
    links: { parentRunId: null, task: null, spec: null } };
  const sessions: ReturnType<typeof session>[] = [];
  const createSession = vi.fn(async (onChange: () => void) => { const s = session(onChange); sessions.push(s); return s; });
  const options: TrustedLocalOptions = { root, context, store, createSession };
  const service = new TrustedLocalService(options); owners.push(service);
  const prepare = async () => (await service.request(command("trusted.prepare", { input }))).preparation!.token;
  const launch = async () => { const token = await prepare(); await service.request(command("trusted.launch", { token })); return token; };
  return { root, input, service, sessions, createSession, options, store, context, prepare, launch, taskReference, task };
}

describe("bounded trusted fleet routing and restart history", () => {
  it("keeps two conversations addressable; target send, approval and Stop do not affect its peer", async () => {
    const f = await fixture(), a = await f.launch(), b = await f.launch();
    expect(f.service.snapshot().runs).toHaveLength(2);
    expect((await f.service.request(command("trusted.snapshot", { token: a }))).runToken).toBe(a);
    const sent = await f.service.request(command("trusted.send", { token: a, expectedTurnId: null, text: "only A" }));
    expect(sent.runToken).toBe(a); expect(f.sessions[0]!.send).toHaveBeenCalledWith("only A"); expect(f.sessions[1]!.send).not.toHaveBeenCalled();
    await f.service.request(command("trusted.decide", { token: a, approvalId: "approval", choice: "accept" }));
    expect(f.sessions[0]!.decide).toHaveBeenCalledWith("approval", "accept"); expect(f.sessions[1]!.decide).not.toHaveBeenCalled();
    expect((await f.service.request(command("trusted.stop", { token: a }))).status).toBe("closed");
    expect(f.sessions[1]!.stop).not.toHaveBeenCalled(); expect(f.service.snapshot(b).status).toBe("ready");
    await expect(f.service.request(command("trusted.send", { token: a, text: "stopped" }))).rejects.toThrow("active");
    await expect(f.service.request(command("trusted.snapshot", { token: randomUUID() }))).rejects.toThrow("target");
  });
  it("rejects stale steering or next-turn expectation before any provider delivery", async () => {
    const f = await fixture(), token = await f.launch(), s = f.sessions[0]!;
    s.emit({ status: "running", turnId: "current" });
    for (const expectedTurnId of [null, "old"]) await expect(f.service.request(command("trusted.send", { token, expectedTurnId, text: "stale" }))).rejects.toThrow("stale");
    expect(s.send).not.toHaveBeenCalled();
    await f.service.request(command("trusted.send", { token, expectedTurnId: "current", text: "current" }));
    s.emit({ status: "ready", turnId: "completed" });
    await expect(f.service.request(command("trusted.send", { token, expectedTurnId: "completed", text: "old turn" }))).rejects.toThrow("stale");
    await f.service.request(command("trusted.send", { token, expectedTurnId: null, text: "new turn" }));
    expect(s.send).toHaveBeenCalledTimes(2);
  });
  it("reserves eight live slots before asynchronous launch setup and does not reuse a stopped pending slot", async () => {
    const f = await fixture();
    for (let n = 0; n < 7; n++) await f.launch();
    const gate = held<void>();
    const original = f.createSession.getMockImplementation()!;
    f.createSession.mockImplementation(async (notify) => { await gate.promise; return original(notify); });
    const token = await f.prepare(); const launching = f.service.request(command("trusted.launch", { token }));
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledTimes(8));
    const ninth = await f.prepare();
    await expect(f.service.request(command("trusted.launch", { token: ninth }))).rejects.toThrow("Eight");
    await f.service.request(command("trusted.stop", { token }));
    await expect(f.service.request(command("trusted.launch", { token: ninth }))).rejects.toThrow("Eight");
    gate.resolve(); await expect(launching).rejects.toThrow("cancelled");
    expect(f.sessions[7]!.start).not.toHaveBeenCalled(); expect(f.sessions[7]!.stop).toHaveBeenCalled();
    await f.service.request(command("trusted.launch", { token: ninth }));
    expect(f.service.snapshot().runs!.filter((run) => !run.archived)).toHaveLength(8);
  });
  it("consumes launch once and awaits durable admission before creating a provider", async () => {
    const store = new MemoryTrustedLocalStore(), gate = held<void>();
    const save = vi.spyOn(store, "save").mockImplementationOnce(async () => { await gate.promise; });
    const f = await fixture(store), token = await f.prepare();
    const launching = f.service.request(command("trusted.launch", { token }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(f.createSession).not.toHaveBeenCalled();
    await expect(f.service.request(command("trusted.launch", { token }))).rejects.toThrow("replaced");
    gate.resolve(); await launching;
    expect(f.createSession).toHaveBeenCalledOnce();
  });
  it("keeps unreadable history untouched, including during shutdown", async () => {
    const store = { load: vi.fn(async () => { throw new Error("corrupt"); }), save: vi.fn(async () => {}) };
    const f = await fixture(store);
    expect((await f.service.request(command("trusted.snapshot"))).message).toMatch(/could not be read/);
    await expect(f.prepare()).rejects.toThrow("could not be read");
    await f.service.shutdown(); expect(store.save).not.toHaveBeenCalled(); expect(f.createSession).not.toHaveBeenCalled();
  });
  it("failed durable admission never starts a provider or reuses its token", async () => {
    const store = new MemoryTrustedLocalStore();
    vi.spyOn(store, "save").mockRejectedValue(new Error("disk full"));
    const f = await fixture(store), token = await f.prepare();
    await expect(f.service.request(command("trusted.launch", { token }))).rejects.toThrow("could not be saved");
    expect(f.createSession).not.toHaveBeenCalled();
    await expect(f.service.request(command("trusted.launch", { token }))).rejects.toThrow("could not be saved");
    expect((await f.service.request(command("trusted.stop", { token }))).runToken).toBe(token);
  });
  it("archives interrupted observations on restart, creates no session and never replays commands", async () => {
    const f = await fixture(), token = await f.launch();
    f.sessions[0]!.emit({ status: "running", turnId: "turn", output: "Real-looking controlled output" });
    f.sessions[0]!.setActivities([{ id: "item", at: new Date().toISOString(), turnId: "turn", kind: "command", status: "running", summary: "Tests pending" }]);
    await vi.waitFor(async () => expect((await f.store.load())[0]!.activities).toHaveLength(1));
    const loaded = await f.store.load(); const recoveredStore = new MemoryTrustedLocalStore(); await recoveredStore.save(loaded);
    const createSession = vi.fn(async (notify: () => void) => f.createSession(notify));
    const recovered = new TrustedLocalService({ ...f.options, store: recoveredStore, createSession, context: { prepare: f.context.prepare.bind(f.context), dispose: async () => {} } }); owners.push(recovered);
    const snapshot = await recovered.request(command("trusted.snapshot", { token }));
    expect(snapshot).toMatchObject({ runToken: token, status: "failed", archived: true, output: "Real-looking controlled output", approvals: [] });
    expect(snapshot.message).toContain("unknown"); expect(snapshot.activities![0]!.status).toBe("failed");
    expect(createSession).not.toHaveBeenCalled();
    await expect(recovered.request(command("trusted.send", { token, text: "resume" }))).rejects.toThrow("active");
    await recovered.request(command("trusted.snapshot")); expect(createSession).not.toHaveBeenCalled();
  });
  it("retains at most twenty runs while preserving live runs and bounds stored output/activity", async () => {
    const f = await fixture(), live = await f.launch();
    for (let n = 0; n < 21; n++) { const token = await f.launch(); await f.service.request(command("trusted.stop", { token })); }
    const snapshot = f.service.snapshot(live); expect(snapshot.runs).toHaveLength(20); expect(snapshot.status).toBe("ready");
    f.sessions[0]!.emit({ output: "λ".repeat(131072) });
    f.sessions[0]!.setActivities(Array.from({ length: 100 }, (_, n) => ({ id: `item-${n}`, at: new Date().toISOString(), turnId: null, kind: "tool", status: "completed", summary: "x".repeat(4096) })));
    await vi.waitFor(async () => { const saved = (await f.store.load()).find((run) => run.summary.runToken === live)!;
      expect(Buffer.byteLength(saved.output)).toBeLessThanOrEqual(131072); expect(saved.activities).toHaveLength(50); });
    expect(f.service.snapshot(live).output).not.toContain("�");
  });
  it("awaits all late owners on shutdown and never starts them", async () => {
    const f = await fixture(), gate = held<void>();
    const original = f.createSession.getMockImplementation()!;
    f.createSession.mockImplementation(async (notify) => { await gate.promise; return original(notify); });
    const a = await f.prepare(); const launching = f.service.request(command("trusted.launch", { token: a }));
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledOnce());
    let drained = false; const shutdown = f.service.shutdown().then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false);
    gate.resolve(); await expect(launching).rejects.toThrow("cancelled"); await shutdown;
    expect(f.sessions[0]!.start).not.toHaveBeenCalled(); expect(f.sessions[0]!.stop).toHaveBeenCalled();
  });
  it("stores only the fixed materialized task and preserves exact task/source prompt through launch", async () => {
    const f = await fixture();
    const prepared = await f.service.request(command("trusted.prepare", { input: { ...f.input, taskReference: f.taskReference } }));
    const token = prepared.preparation!.token;
    const prompt = JSON.parse(prepared.preparation!.prompt);
    expect(prompt.repositoryTask.reference).toEqual(f.taskReference);
    expect(JSON.parse(prompt.repositoryTask.content).description).toBe(f.task.description);
    const launched = await f.service.request(command("trusted.launch", { token }));
    expect(f.sessions[0]!.start).toHaveBeenCalledWith(prepared.preparation!.prompt, null);
    expect(launched.taskReference).toEqual(f.taskReference);
    expect((await f.store.load())[0]!.summary.taskReference).toEqual(f.taskReference);
    // Editing the context object's task data after admission cannot rewrite history.
    f.task.description = "New description";
    expect(f.service.snapshot(token).taskReference).toEqual(f.taskReference);
    const fresh = await f.service.request(command("trusted.prepare", { input: { ...f.input, taskReference: f.taskReference } }));
    f.task.description = "Changed after preparation";
    await expect(f.service.request(command("trusted.launch", { token: fresh.preparation!.token }))).rejects.toThrow("changed");
    expect(f.createSession).toHaveBeenCalledOnce();
  });
  it("snapshot reads do not advance a conversation's update timestamp", async () => {
    const f = await fixture(), token = await f.launch();
    const before = f.service.snapshot(token).runs!.find((run) => run.runToken === token)!.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(f.service.snapshot(token).runs!.find((run) => run.runToken === token)!.updatedAt).toBe(before);
  });
  it("saves the final public observation arriving at writer completion before its barrier resolves", async () => {
    let saved: Awaited<ReturnType<TrustedLocalStore["load"]>> = [];
    let nextSave: Promise<void> | undefined;
    const store: TrustedLocalStore = {
      load: async () => structuredClone(saved),
      save(runs) { saved = structuredClone(runs); const wait = nextSave; nextSave = undefined; return wait ?? Promise.resolve(); },
    };
    const f = await fixture(store); await f.launch();
    const gate = held<void>(); nextSave = gate.promise;
    f.sessions[0]!.emit({ output: "before writer completion" });
    await Promise.resolve();
    gate.resolve();
    await Promise.resolve().then(() => f.sessions[0]!.emit({ output: "after writer completion" }));
    await Promise.resolve();
    expect((await store.load())[0]!.output).toBe("after writer completion");
  });
  it("publishes and persists the last 100 short activities from a larger accessor tail", async () => {
    const f = await fixture(), token = await f.launch();
    const activities: TrustedActivity[] = Array.from({ length: 128 }, (_, n) => ({ id: `event-${n}`, at: new Date().toISOString(),
      turnId: null, kind: "tool", status: "completed", summary: `Tool ${n}` }));
    f.sessions[0]!.setActivities(activities);
    expect(f.service.snapshot(token).activities).toEqual(activities.slice(-100));
    await vi.waitFor(async () => expect((await f.store.load())[0]!.activities).toEqual(activities.slice(-100)));
    expect(f.service.snapshot(token).status).toBe("ready");
  });
  it("joins real A2 session parsing/callbacks to service snapshots and stored activity without a provider process", async () => {
    const f = await fixture();
    let sink!: CodexTransportSink;
    const sent: Array<{ id?: number; method?: string }> = [];
    const receive = (value: unknown) => sink.stdout(Buffer.from(JSON.stringify(value) + "\n"));
    const close = vi.fn(async () => ({ status: "confirmed" as const, observedAt: new Date().toISOString(), detail: "Controlled transport only" }));
    let actual!: TrustedLocalSession;
    const service = new TrustedLocalService({ ...f.options, createSession: async (notify) => {
      actual = new TrustedLocalSession({ root: f.root, executable: "/controlled/codex", openTransport(callbacks) {
        sink = callbacks;
        return { close, write(line) {
          const request = JSON.parse(line); sent.push(request);
          if (request.method === "initialize") receive({ id: request.id, result: { userAgent: "controlled-codex" } });
          if (request.method === "thread/start") receive({ id: request.id, result: { thread: { id: "thread" }, cwd: f.root } });
          if (request.method === "turn/start") receive({ id: request.id, result: { turn: { id: "turn" } } });
        } };
      } }, notify);
      return actual;
    } }); owners.push(service);
    const prepared = await service.request(command("trusted.prepare", { input: f.input }));
    const token = prepared.preparation!.token;
    await service.request(command("trusted.launch", { token }));
    await vi.waitFor(() => expect(service.snapshot(token).turnId).toBe("turn"));
    for (let n = 0; n < 128; n++) receive({ method: "item/completed", params: { threadId: "thread", turnId: "turn",
      item: { type: "mcpToolCall", id: `tool-${n}`, status: "completed", tool: "not-a-published-name" } } });
    const expected = actual.activity(); expect(expected).toHaveLength(100);
    expect(service.snapshot(token).activities).toEqual(expected);
    await vi.waitFor(async () => expect((await f.store.load())[0]!.activities).toEqual(expected));
    receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed" } } });
    expect(service.snapshot(token).status).toBe("ready");
    await service.request(command("trusted.stop", { token }));
    expect(service.snapshot(token).status).toBe("closed");
    // The turn row was evicted by the bounded tail. Completion must not revive
    // old entries or reorder the retained provider evidence.
    expect(service.snapshot(token).activities).toEqual(expected);
    expect((await f.store.load())[0]!.activities).toEqual(expected);
    expect(sent.filter((request) => request.method === "turn/start")).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
  });
});
