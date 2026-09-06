// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileRunStore, type FileRunStore, type FileRunStoreOptions } from "../core/agents/file-store";
import { createAgentService, type AgentService } from "../core/agents/service";
import type { AdapterEvent, AgentAdapter, AgentHandle, AgentOperation, CleanupEvidence } from "../core/agents/adapter";
import type { AgentContextProvider } from "../core/agents/context-provider";
import { AGENT_LIMITS, type AgentCapabilities, type AgentPrepareInput, type AgentRequest, type PreparedAgentContext, type Run } from "../protocol/agents";
import { PROTOCOL_VERSION } from "../protocol/schema";

// These capabilities belong only to this deterministic core-side fixture.
// They do not attest any installed provider or allow a real model request.
const capabilities: AgentCapabilities = { availability: "available", reason: null, provider: "fixture-only", version: "test",
  controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only" };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const clock = Date.parse("2026-09-01T00:00:00.000Z");
const now = () => clock;
const at = () => new Date(clock).toISOString();
const good = <T>(value: T): AgentOperation<T> => ({ ok: true, value });
function value<T>(result: AgentOperation<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
const roots: string[] = [];
const stores: FileRunStore[] = [];
const services: AgentService[] = [];
const base = (requestId: string = randomUUID()) => ({ protocolVersion: PROTOCOL_VERSION, requestId });
const input: AgentPrepareInput = {
  worldId: "local", focus: { worldId: "local", revisionKind: "working", revisionId: "working", domain: "repo", key: "source:source.ts", path: "source.ts" },
  taskText: "Explain the contract.", model: null, effort: null, links: { parentRunId: null, task: null, spec: null },
};
function draft(root: string, request: AgentPrepareInput): PreparedAgentContext {
  const timestamp = at(); const prompt = request.taskText; const digest = hash(prompt);
  return { runId: randomUUID(), contextHash: digest, preparedAt: timestamp, expiresAt: new Date(Date.parse(timestamp) + AGENT_LIMITS.draftMs).toISOString(),
    capabilities, launchContext: {
      worldId: request.worldId, repositoryId: "repo", root, head: "a".repeat(40), workingFingerprint: "a".repeat(64), focus: request.focus,
      taskText: request.taskText, links: request.links, requested: { model: request.model, effort: request.effort },
      attachments: [{ path: "source.ts", content: "export {};", digest: hash("export {};"), startLine: 1, endLine: 1 }],
      instructionSources: [], configurationSources: [], submittedPrompt: prompt, contextHash: digest, diskOnly: true,
      access: { policy: "read-only", toolNetwork: false, approvals: "never", hostConfidentiality: false, sendsSelectedContentToProvider: true },
    } };
}
async function openStore(directory: string, options: FileRunStoreOptions = {}) {
  const store = await createFileRunStore(directory, { now, ...options }); stores.push(store); return store;
}
async function fixture(options: { store?: FileRunStoreOptions; cancelGraceMs?: number; deadlineMs?: number; capabilities?: AgentCapabilities } = {}) {
  const root = await mkdtemp(join(tmpdir(), "swarm-agent-service-")); roots.push(root);
  const sourceRoot = join(root, "repo"); await mkdir(sourceRoot);
  const directory = join(root, "private"); const store = await openStore(directory, options.store);
  let emit: ((event: AdapterEvent) => void) | undefined;
  const controls: { startResult?: Promise<AgentHandle>; beforeStart?: () => Promise<void> } = {};
  const handle = {
    steer: vi.fn(async (): Promise<AgentOperation<{ status: "accepted" }>> => good({ status: "accepted" })),
    interrupt: vi.fn(async (): Promise<AgentOperation<{ status: "requested" }>> => good({ status: "requested" })),
    dispose: vi.fn(async (): Promise<CleanupEvidence> => ({ status: "confirmed", observedAt: at(), detail: "Fixture-owned processes are gone." })),
  };
  const adapter = {
    probe: vi.fn(async () => ({ provider: "fixture-only", version: "test", executable: "/fixture/not-executed", available: true,
      reason: null, supports: { steer: true, interrupt: true, readOnly: true } })),
    start: vi.fn(async (_context: PreparedAgentContext, observer: (event: AdapterEvent) => void) => {
      emit = observer; await controls.beforeStart?.(); return controls.startResult ?? handle;
    }),
  } satisfies AgentAdapter;
  const context = {
    prepare: vi.fn(async (request: AgentPrepareInput): Promise<AgentOperation<PreparedAgentContext>> => good(draft(sourceRoot, request))),
    revalidate: vi.fn(async (prepared: PreparedAgentContext): Promise<AgentOperation<PreparedAgentContext>> => good(prepared)),
  } satisfies AgentContextProvider;
  const serviceOptions = { store, adapter, context, now, capabilities: async () => options.capabilities ?? capabilities,
    cancelGraceMs: options.cancelGraceMs ?? 40, deadlineMs: options.deadlineMs };
  const service = await createAgentService(serviceOptions); services.push(service);
  const prepare = async () => {
    const result = value(await service.request({ ...base(), type: "agent.prepare", ...input }));
    if (result.kind !== "prepare") throw new Error("Expected draft"); return result.draft;
  };
  const launchRequest = (prepared: PreparedAgentContext): AgentRequest => ({ ...base(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash });
  const launch = async () => { const prepared = await prepare(); value(await service.request(launchRequest(prepared))); return prepared; };
  const read = async (runId: string) => {
    const result = value(await service.request({ ...base(), type: "agent.read", runId, afterRecord: 0 }));
    if (result.kind !== "read") throw new Error("Expected run detail"); return result;
  };
  const disk = async (): Promise<Run[]> => {
    const snapshot = JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8")) as { entries: { run: Run }[] };
    return snapshot.entries.map((entry) => entry.run);
  };
  const event = (event: AdapterEvent) => { if (!emit) throw new Error("Provider has not started"); emit(event); };
  const running = async (prepared?: PreparedAgentContext) => {
    const selected = prepared ?? await launch();
    await vi.waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1), { interval: 5 });
    event({ type: "started", threadId: "thread", model: "fixture", cwd: sourceRoot, policy: "read-only", instructionPaths: [], at: at() });
    event({ type: "turn-started", threadId: "thread", turnId: "turn", at: at() });
    await vi.waitFor(async () => expect((await read(selected.runId)).run.state).toBe("running"), { interval: 5 });
    return selected;
  };
  const steer = (runId: string, requestId = "steer", text = "Explain failure modes."): AgentRequest => ({ ...base(requestId), type: "agent.steer", runId, expectedTurnId: "turn", text });
  const cancel = (runId: string) => service.request({ ...base(), type: "agent.cancel", runId });
  const terminal = (status: "completed" | "failed" | "interrupted" = "completed") => event({ type: "terminal", at: at(),
    outcome: { kind: "turn", threadId: "thread", turnId: "turn", status, observedAt: at() } });
  return { root: sourceRoot, directory, store, service, serviceOptions, adapter, context, controls, handle, prepare, launch, launchRequest, read, disk, event, running, steer, cancel, terminal };
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("durable agent service", () => {
  it("persists admission and dispatch uncertainty before any adapter call, and deduplicates run IDs", async () => {
    const f = await fixture();
    const observed = deferred<Run>();
    f.controls.beforeStart = async () => { observed.resolve((await f.disk())[0]!); };
    const prepared = await f.launch();
    const prior = await observed.promise;
    expect(prior).toMatchObject({ runId: prepared.runId, state: "starting", processState: "live", cleanup: { status: "pending" } });
    const first = value(await f.service.request(f.launchRequest(prepared)));
    expect(first).toMatchObject({ kind: "launch", receipt: { runId: prepared.runId, status: "admitted" } });
    expect(f.adapter.start).toHaveBeenCalledTimes(1);
    expect(await f.service.request({ ...f.launchRequest(prepared), contextHash: "b".repeat(64) } as AgentRequest)).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    expect(await f.service.request({ ...base(), type: "agent.prepare", ...input })).toMatchObject({ error: { code: "BUSY" } });
  });

  it("rejects stale, replaced and expired context without admission or adapter dispatch", async () => {
    const f = await fixture(); const old = await f.prepare(); const fresh = await f.prepare();
    expect(await f.service.request(f.launchRequest(old))).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    f.context.revalidate.mockResolvedValue({ ok: false, error: { code: "STALE_CONTEXT", message: "Fixture source changed." } });
    expect(await f.service.request(f.launchRequest(fresh))).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    f.context.revalidate.mockImplementation(async (prepared) => good(prepared));
    f.context.prepare.mockImplementation(async (request) => good({ ...draft(f.root, request),
      preparedAt: new Date(clock - AGENT_LIMITS.draftMs).toISOString(), expiresAt: at() }));
    const expired = await f.prepare();
    expect(await f.service.request(f.launchRequest(expired))).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    expect(f.adapter.start).not.toHaveBeenCalled(); expect(await f.disk()).toEqual([]);
  });

  it("keeps unavailable production policy non-launchable while allowing explicit preparation", async () => {
    const unavailable: AgentCapabilities = { ...capabilities, availability: "unavailable", policy: "unverified",
      reason: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Effective policy not established." }, controls: { launch: false, steer: false, cancel: false } };
    const f = await fixture({ capabilities: unavailable }); const prepared = await f.prepare();
    expect(await f.service.request(f.launchRequest(prepared))).toMatchObject({ error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    expect(f.adapter.start).not.toHaveBeenCalled(); expect(await f.disk()).toEqual([]);
  });

  it("persists steering intent before send, accepts only its reply, and never resends reused IDs", async () => {
    const f = await fixture(); const prepared = await f.running(); const reply = deferred<AgentOperation<{ status: "accepted" }>>();
    const observed = deferred<Run>();
    f.handle.steer.mockImplementation(async () => { observed.resolve((await f.disk())[0]!); return reply.promise; });
    const request = f.steer(prepared.runId); const pending = f.service.request(request);
    expect((await observed.promise).instructions).toMatchObject([{ status: "pending", requestId: "steer", textHash: hash("Explain failure modes.") }]);
    expect(value(await f.service.request(request))).toMatchObject({ kind: "steer", receipt: { status: "pending" } });
    expect(await f.service.request(f.steer(prepared.runId, "steer", "Changed text"))).toMatchObject({ error: { code: "STALE_TURN" } });
    expect(await f.service.request(f.steer(prepared.runId, "other"))).toMatchObject({ error: { code: "BUSY" } });
    reply.resolve(good({ status: "accepted" }));
    expect(value(await pending)).toMatchObject({ kind: "steer", receipt: { status: "accepted" } });
    expect((await f.disk())[0]!.instructions[0]!.status).toBe("accepted");
    expect(value(await f.service.request(request))).toMatchObject({ receipt: { status: "accepted" } });
    expect(f.handle.steer).toHaveBeenCalledTimes(1);
  });

  it("preserves matching terminal completion against a later process exit and Stop", async () => {
    const f = await fixture(); const prepared = await f.running(); f.terminal();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "completed", cleanup: { status: "confirmed" } }), { interval: 5 });
    f.event({ type: "process-exit", exitCode: 0, at: at() });
    const finished = (await f.read(prepared.runId)).run;
    expect(finished).toMatchObject({ state: "completed", processState: "exited", exitCode: 0, providerOutcome: { kind: "turn", status: "completed" } });
    expect((await f.disk())[0]!.state).toBe("completed");
    expect(await f.cancel(prepared.runId)).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    f.terminal("interrupted"); expect((await f.read(prepared.runId)).run.state).toBe("completed");
    expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("never converts exit zero without terminal evidence into success", async () => {
    const f = await fixture(); const prepared = await f.running();
    f.event({ type: "process-exit", exitCode: 0, at: at() });
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", processState: "exited", cleanup: { status: "confirmed" } }), { interval: 5 });
    f.terminal(); expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", providerOutcome: { kind: "none" } });
  });

  it("treats an interrupt acknowledgement as pending cancellation, with a racing completed turn winning", async () => {
    const f = await fixture({ cancelGraceMs: 200 }); const prepared = await f.running();
    expect(value(await f.cancel(prepared.runId))).toMatchObject({ kind: "cancel", receipt: { status: "requested" } });
    expect(f.handle.interrupt).toHaveBeenCalledTimes(1);
    expect((await f.read(prepared.runId)).run.state).toBe("cancelling");
    f.terminal();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "completed", cleanup: { status: "confirmed" } }), { interval: 5 });
    expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("escalates Stop only after its grace and records confirmed owned termination independently", async () => {
    const f = await fixture({ cancelGraceMs: 20 }); const prepared = await f.running();
    value(await f.cancel(prepared.runId));
    expect(f.handle.dispose).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "cancelled", processState: "exited",
      providerOutcome: { kind: "owned-termination", afterCancellation: true }, cleanup: { status: "confirmed" } }), { interval: 5 });
    expect(f.handle.interrupt).toHaveBeenCalledTimes(1); expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("prevents dispatch when Stop follows admission before the adapter begins", async () => {
    const f = await fixture(); const prepared = await f.launch();
    value(await f.cancel(prepared.runId));
    expect((await f.read(prepared.runId)).run).toMatchObject({ state: "cancelled", processState: "not-started", providerOutcome: { kind: "dispatch-prevented" } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(f.adapter.start).not.toHaveBeenCalled();
  });

  it("marks delayed-start Stop unknown, then disposes a late handle without dispatch replay", async () => {
    const f = await fixture({ cancelGraceMs: 15 }); const started = deferred<AgentHandle>(); f.controls.startResult = started.promise;
    const prepared = await f.launch(); await vi.waitFor(() => expect(f.adapter.start).toHaveBeenCalledTimes(1), { interval: 5 });
    value(await f.cancel(prepared.runId));
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run.state).toBe("unknown"), { interval: 5 });
    expect(f.handle.dispose).not.toHaveBeenCalled();
    started.resolve(f.handle);
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", cleanup: { status: "confirmed" } }), { interval: 5 });
    expect(f.handle.dispose).toHaveBeenCalledTimes(1); expect(f.handle.interrupt).not.toHaveBeenCalled();
    expect(f.adapter.start).toHaveBeenCalledTimes(1);
  });

  it("closes admission during delayed setup and cleans its late handle after shutdown", async () => {
    const f = await fixture(); const started = deferred<AgentHandle>(); f.controls.startResult = started.promise;
    const prepared = await f.launch(); await vi.waitFor(() => expect(f.adapter.start).toHaveBeenCalledTimes(1), { interval: 5 });
    await f.service.shutdown();
    expect((await f.read(prepared.runId)).run.state).toBe("unknown");
    expect(await f.service.request({ ...base(), type: "agent.prepare", ...input })).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    started.resolve(f.handle);
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run.cleanup.status).toBe("confirmed"), { interval: 5 });
    expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("retains pending instruction text as delivery-unknown through shutdown and reopening, with no replay", async () => {
    const f = await fixture(); const prepared = await f.running(); const reply = deferred<AgentOperation<{ status: "accepted" }>>();
    f.handle.steer.mockReturnValue(reply.promise); const request = f.steer(prepared.runId); const pending = f.service.request(request);
    await vi.waitFor(() => expect(f.handle.steer).toHaveBeenCalledTimes(1), { interval: 5 });
    await f.service.shutdown(); reply.resolve(good({ status: "accepted" }));
    expect(value(await pending)).toMatchObject({ receipt: { status: "delivery-unknown", text: "Explain failure modes." } });
    await f.store.close(); const store = await openStore(f.directory);
    const service = await createAgentService({ ...f.serviceOptions, store }); services.push(service);
    expect(value(await service.request(request))).toMatchObject({ receipt: { status: "delivery-unknown" } });
    expect(value(await service.request(f.launchRequest(prepared)))).toMatchObject({ kind: "launch", receipt: { status: "admitted" } });
    expect(f.adapter.start).toHaveBeenCalledTimes(1); expect(f.handle.steer).toHaveBeenCalledTimes(1);
  });

  it("does not send steering when shutdown races its pending intent persistence", async () => {
    let pause = false;
    const entered = deferred<void>(); const release = deferred<void>();
    const f = await fixture({ store: { beforePersist: async (phase) => {
      if (pause && phase === "write") { pause = false; entered.resolve(); await release.promise; }
    } } });
    const prepared = await f.running(); pause = true;
    const request = f.steer(prepared.runId); const pending = f.service.request(request);
    await entered.promise;
    const closing = f.service.shutdown();
    release.resolve();
    await closing;
    expect(value(await pending)).toMatchObject({ kind: "steer", receipt: { status: "delivery-unknown" } });
    expect(f.handle.steer).not.toHaveBeenCalled();
    expect((await f.disk())[0]!.instructions).toMatchObject([{ status: "delivery-unknown", text: "Explain failure modes." }]);
    expect(value(await f.service.request(request))).toMatchObject({ receipt: { status: "delivery-unknown" } });
    expect(f.handle.steer).not.toHaveBeenCalled(); expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("blocks a new launch if owned cleanup cannot be established, including after reopen", async () => {
    const f = await fixture(); f.handle.dispose.mockResolvedValue({ status: "unknown", observedAt: at(), detail: "Fixture cleanup unavailable." });
    const prepared = await f.running(); f.terminal();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run.cleanup.status).toBe("unknown"), { interval: 5 });
    expect(await f.service.request({ ...base(), type: "agent.prepare", ...input })).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    await f.service.shutdown(); await f.store.close(); const store = await openStore(f.directory);
    const service = await createAgentService({ ...f.serviceOptions, store }); services.push(service);
    expect(await service.request({ ...base(), type: "agent.prepare", ...input })).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
  });

  it("refuses disk-full admission without spawning or silently retrying once storage recovers", async () => {
    let fail = false;
    const f = await fixture({ store: { beforePersist: () => { if (fail) throw Object.assign(new Error("private path"), { code: "ENOSPC" }); } } });
    const prepared = await f.prepare(); fail = true;
    expect(await f.service.request(f.launchRequest(prepared))).toMatchObject({ error: { code: "STORAGE_FULL" } });
    fail = false;
    expect(await f.service.request(f.launchRequest(prepared))).toMatchObject({ error: { code: "STORAGE_FULL" } });
    expect(await f.disk()).toEqual([]); expect(f.adapter.start).not.toHaveBeenCalled();
  });

  it("does not send steering if durable intent persistence fails", async () => {
    let fail = false;
    const f = await fixture({ store: { beforePersist: () => { if (fail) throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); } } });
    const prepared = await f.running(); fail = true;
    expect(await f.service.request(f.steer(prepared.runId))).toMatchObject({ error: { code: "STORAGE_FULL" } });
    expect(f.handle.steer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(f.handle.dispose).toHaveBeenCalledTimes(1), { interval: 5 });
    fail = false;
  });

  it("does not acknowledge accepted steering as durable when its receipt write fails", async () => {
    let fail = false;
    const f = await fixture({ store: { beforePersist: () => { if (fail) throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); } } });
    const prepared = await f.running(); const reply = deferred<AgentOperation<{ status: "accepted" }>>();
    f.handle.steer.mockReturnValue(reply.promise);
    const pending = f.service.request(f.steer(prepared.runId));
    await vi.waitFor(() => expect(f.handle.steer).toHaveBeenCalledTimes(1), { interval: 5 });
    fail = true; reply.resolve(good({ status: "accepted" }));
    expect(await pending).toMatchObject({ error: { code: "STORAGE_FULL" } });
    expect((await f.disk())[0]!.instructions[0]!.status).toBe("pending");
    expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", instructions: [{ status: "delivery-unknown" }] });
    await vi.waitFor(() => expect(f.handle.dispose).toHaveBeenCalledTimes(1), { interval: 5 });
    fail = false;
  });

  it("expires the bounded run deadline without treating cleanup as successful completion", async () => {
    const f = await fixture({ deadlineMs: 250 }); const prepared = await f.running();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", processState: "exited",
      cleanup: { status: "confirmed" }, providerOutcome: { kind: "none" }, terminalReason: expect.stringContaining("deadline") }), { interval: 5 });
    expect(f.handle.dispose).toHaveBeenCalledTimes(1);
    f.terminal(); expect((await f.read(prepared.runId)).run.state).toBe("unknown");
  });

  it("bounds oversized normalized events and ignores later output without inventing completion", async () => {
    const f = await fixture(); const prepared = await f.running();
    f.event({ type: "item", itemId: "too-large", kind: "message", text: "λ".repeat(AGENT_LIMITS.recordBytes), at: at() });
    f.event({ type: "item", itemId: "late", kind: "message", text: "Must not be appended", at: at() });
    f.terminal();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run).toMatchObject({ state: "unknown", cleanup: { status: "confirmed" } }), { interval: 5 });
    const detail = await f.read(prepared.runId);
    expect(detail.page.records).toEqual([]); expect(detail.run.providerOutcome.kind).toBe("none");
    expect(f.handle.dispose).toHaveBeenCalledTimes(1);
  });

  it("retains bounded visible records and does not append late terminal output", async () => {
    const f = await fixture(); const prepared = await f.running();
    f.event({ type: "item", itemId: "commentary", kind: "message", text: "Visible commentary", at: at() });
    f.terminal();
    await vi.waitFor(async () => expect((await f.read(prepared.runId)).run.cleanup.status).toBe("confirmed"), { interval: 5 });
    f.event({ type: "item", itemId: "late", kind: "message", text: "Late output", at: at() });
    expect((await f.read(prepared.runId)).page.records.map((record) => record.text)).toEqual(["Visible commentary"]);
  });
});
