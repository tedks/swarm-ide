// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileRunStore, type FileRunStore } from "../core/agents/file-store";
import { createAgentService, type AgentService } from "../core/agents/service";
import type { AgentOperation } from "../core/agents/adapter";
import type { AgentContextProvider } from "../core/agents/context-provider";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import type { SwarmBridge } from "../app/electron/preload";
import { agentFixtureContext, AGENT_FIXTURE_AT } from "../fixtures/agents";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { AgentRequestSchema, type AdmissionReceipt, type AgentRequest, type AgentSnapshot, type Run } from "../protocol/agents";
import { CoreResponseSchema, PROTOCOL_VERSION, type CoreResponse } from "../protocol/schema";

// Real private store + real service + real renderer client. Only context and
// adapter are synthetic. No installed provider, process or policy is exercised.
const now = () => Date.parse(AGENT_FIXTURE_AT);
const good = <T>(value: T): AgentOperation<T> => ({ ok: true, value });
const fault = () => ({ ok: false as const, error: { code: "STORAGE_UNAVAILABLE" as const, message: "Injected storage failure." } });
const request = (type: "agent.launch", requestId = "launch"): Extract<AgentRequest, { type: "agent.launch" }> => ({
  protocolVersion: PROTOCOL_VERSION, requestId, type,
  runId: agentFixtureContext().runId, contextHash: agentFixtureContext().contextHash,
});
const roots: string[] = [];
const stores: FileRunStore[] = [];
const services: AgentService[] = [];
const disconnects: (() => void)[] = [];
afterEach(async () => {
  disconnects.splice(0).forEach((disconnect) => disconnect());
  vi.restoreAllMocks();
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "swarm-admission-audit-")); roots.push(directory);
  const controls: { storeNow?: number; fail?: "write" | "directory-sync"; code?: "EIO" | "ENOSPC"; holdLaunch?: (reply: CoreResponse) => Promise<CoreResponse> } = {};
  const store = await createFileRunStore(directory, { now: () => controls.storeNow ?? now(), beforePersist(phase) {
    if (phase === controls.fail) throw Object.assign(new Error("Injected I/O failure"), { code: controls.code ?? "EIO" });
  } }); stores.push(store);
  const prepared = agentFixtureContext();
  const context = { prepare: vi.fn<AgentContextProvider["prepare"]>(async () => good(prepared)),
    revalidate: vi.fn<AgentContextProvider["revalidate"]>(async () => good(prepared)) };
  const start = vi.fn(async () => ({
    steer: async () => good({ status: "accepted" as const }),
    interrupt: async () => good({ status: "requested" as const }),
    dispose: async () => ({ status: "confirmed" as const, observedAt: AGENT_FIXTURE_AT, detail: "No fixture processes exist." }),
  }));
  let sequence = 0;
  const observers = new Set<Parameters<SwarmBridge["onEvent"]>[0]>();
  const emitted: AgentSnapshot[] = [];
  const service = await createAgentService({ store, context, now, capabilities: async () => prepared.capabilities,
    adapter: { start, probe: async () => { throw new Error("No provider probe authorized"); } },
    emit(snapshot) {
      emitted.push(snapshot);
      const event = { protocolVersion: PROTOCOL_VERSION, type: "agent.changed" as const, sequence: ++sequence, emittedAt: AGENT_FIXTURE_AT, snapshot };
      observers.forEach((observer) => observer(event));
    },
  }); services.push(service);
  const calls: AgentRequest[] = [];
  const bridge: SwarmBridge = {
    onEvent(observer) { observers.add(observer); return () => { observers.delete(observer); }; },
    async request(input) {
      const parsed = AgentRequestSchema.parse(input); calls.push(parsed);
      const result = await service.request(parsed);
      const reply = CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: parsed.requestId,
        ...(result.ok ? { ok: true, snapshot: initialSnapshot(paymentsFileFocus), sequence: ++sequence, agent: result.value }
          : { ok: false, error: result.error }),
      });
      return parsed.type === "agent.launch" && controls.holdLaunch ? controls.holdLaunch(reply) : reply;
    },
  };
  const client = new AgentBridgeClient();
  const connect = () => { const disconnect = client.connect(bridge); disconnects.push(disconnect); return disconnect; };
  const disconnect = connect();
  await vi.waitFor(() => expect(client.getSnapshot().snapshot).not.toBeNull(), { interval: 5 });
  client.openDraft(prepared.launchContext.focus); client.editDraft({ task: prepared.launchContext.taskText });
  await client.prepare(); client.confirmDraft(true);
  expect(client.getSnapshot().draft?.prepared).toEqual(prepared);
  vi.spyOn(Date, "now").mockImplementation(now);
  const disk = async () => JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8")) as { entries: { run: Run; receipt: AdmissionReceipt }[] };
  const reopen = async () => {
    controls.fail = undefined;
    await service.shutdown(); await store.close();
    const recovered = await createFileRunStore(directory, { now }); stores.push(recovered);
    return recovered;
  };
  return { directory, controls, store, service, context, start, client, calls, prepared, disk, reopen, emitted, disconnect, connect };
}

describe("admission failure classification through real service and renderer", () => {
  it("admits atomically, dispatches once, and deduplicates the run across command identities", async () => {
    const f = await fixture(); await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("accepted");
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledTimes(1), { interval: 5 });
    for (const id of ["launch", "launch", "new-transport-id"]) expect(await f.service.request(request("agent.launch", id))).toMatchObject({ ok: true, value: { receipt: { status: "admitted" } } });
    expect(await f.service.request({ ...request("agent.launch"), contextHash: "f".repeat(64) })).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    const entries = (await f.disk()).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ receipt: { runId: f.prepared.runId, status: "admitted" }, run: { runId: f.prepared.runId, state: "starting", processState: "live", providerOutcome: { kind: "none" } } });
    expect(f.start).toHaveBeenCalledTimes(1);
  });

  it("keeps definite pre-admission validation rejection distinct from unknown", async () => {
    const f = await fixture(); const admit = vi.spyOn(f.store, "admit");
    f.context.revalidate.mockResolvedValue({ ok: false, error: { code: "STALE_CONTEXT", message: "Source changed before admission." } });
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("rejected");
    expect(admit).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
    expect((await f.disk()).entries).toEqual([]);
  });

  it("keeps context expiry at the actual store pre-write check a definite rejection", async () => {
    const f = await fixture();
    // Time can cross expiry between the service check and the queued store
    // check. This is a genuine FileRunStore rejection, not an I/O failure.
    f.controls.storeNow = Date.parse(f.prepared.expiresAt);
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]).toMatchObject({ status: "rejected", message: expect.stringContaining("STALE_CONTEXT") });
    expect((await f.disk()).entries).toEqual([]); expect(f.start).not.toHaveBeenCalled();
    await f.client.refresh();
    expect(f.client.getSnapshot().snapshot?.capabilities.controls.launch).toBe(true);
    expect(f.calls.filter((call) => call.type === "agent.launch")).toHaveLength(1);
  });

  it("preserves a store's definite BUSY rejection without creating a storage latch", async () => {
    const f = await fixture();
    // A contract-conforming custom store may reject busy before writing. A
    // store that writes and then reports BUSY violates that semantic contract.
    vi.spyOn(f.store, "admit").mockResolvedValue({ ok: false, error: { code: "BUSY", message: "No admission; store is busy." } });
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("rejected");
    expect((await f.disk()).entries).toEqual([]); expect(f.start).not.toHaveBeenCalled();
    await f.client.refresh();
    expect(f.client.getSnapshot().snapshot?.capabilities.controls.launch).toBe(true);
    expect(f.calls.filter((call) => call.type === "agent.launch")).toHaveLength(1);
  });

  it.each([
    ["write", "EIO"], ["directory-sync", "EIO"], ["write", "ENOSPC"], ["directory-sync", "ENOSPC"],
  ] as const)("keeps %s/%s failures unknown without interpreting a storage code as no admission", async (phase, code) => {
    const f = await fixture(); f.controls.fail = phase; f.controls.code = code;
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    expect(f.client.getSnapshot().operations[0]?.message).toContain("AGENT_OUTCOME_UNKNOWN");
    const entries = (await f.disk()).entries;
    expect(entries).toHaveLength(phase === "directory-sync" ? 1 : 0);
    if (phase === "directory-sync") expect(entries[0]).toMatchObject({ receipt: { status: "admitted" }, run: { processState: "not-started", providerOutcome: { kind: "none" } } });
    await f.client.reconcileOperation(f.client.getSnapshot().operations[0]!.requestId);
    expect(f.client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    await f.client.launch();
    expect(f.calls.filter((call) => call.type === "agent.launch")).toHaveLength(1);
    expect(await f.service.request(request("agent.launch"))).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(f.start).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(f.emitted.at(-1)?.capabilities.controls.launch).toBe(false), { interval: 5 });
    const recovered = await f.reopen();
    const read = await recovered.read(f.prepared.runId, 0);
    if (phase === "write") expect(read).toMatchObject({ ok: false, error: { code: "RUN_NOT_ACTIVE" } });
    else {
      // Recovery conservatively marks even an admitted-but-not-dispatched run
      // unknown; the original receipt survives without claiming process cleanup.
      expect(read).toMatchObject({ ok: true, value: { run: { state: "unknown", processState: "unknown", providerOutcome: { kind: "none" } } } });
      expect(await recovered.admit(f.prepared)).toMatchObject({ ok: true, value: { existing: true, receipt: entries[0]!.receipt } });
    }
  });

  it.each(["typed", "typed-busy", "thrown"] as const)("retains committed admission across a %s read failure and reconciles only by reading", async (kind) => {
    const f = await fixture();
    const read = vi.spyOn(f.store, "read");
    if (kind === "typed") read.mockResolvedValue(fault());
    else if (kind === "typed-busy") read.mockResolvedValue({ ok: false, error: { code: "BUSY", message: "Custom-store read is busy, after admission." } });
    else read.mockRejectedValue(new Error("Injected custom-store read failure"));
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    expect((await f.disk()).entries).toHaveLength(1);
    expect(f.start).not.toHaveBeenCalled();
    expect(await f.service.request(request("agent.launch"))).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    read.mockRestore();
    await f.client.reconcileOperation(f.client.getSnapshot().operations[0]!.requestId);
    expect(f.client.getSnapshot().operations[0]).toMatchObject({ status: "accepted", message: "Durable admission observed; not turn completion." });
    expect((await f.disk()).entries[0]!.run).toMatchObject({ state: "starting", processState: "not-started", providerOutcome: { kind: "none" } });
    await f.client.launch(); expect(f.calls.filter((call) => call.type === "agent.launch")).toHaveLength(1);
    expect(f.start).not.toHaveBeenCalled();
  });

  it("retains known admission after a publication exception without redispatching or mislabelling it a store admission failure", async () => {
    const f = await fixture();
    vi.spyOn(f.store, "snapshot").mockRejectedValueOnce(new Error("Custom-store observation failed"));
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    expect((await f.disk()).entries[0]!.run).toMatchObject({ state: "starting", processState: "not-started" });
    expect(await f.service.request(request("agent.launch"))).toMatchObject({ ok: true, value: { receipt: { status: "admitted" } } });
    await f.client.reconcileOperation(f.client.getSnapshot().operations[0]!.requestId);
    expect(f.client.getSnapshot().operations[0]?.status).toBe("accepted");
    await f.client.refresh();
    expect(f.client.getSnapshot().snapshot?.capabilities.controls.launch).toBe(true);
    expect(f.client.getSnapshot().snapshot?.activeRunId).toBe(f.prepared.runId);
    expect(f.start).not.toHaveBeenCalled();
  });

  it.each([false, true])("latches thrown admit failures, including committed=%s, without retry", async (committed) => {
    const f = await fixture(); const admit = f.store.admit.bind(f.store);
    vi.spyOn(f.store, "admit").mockImplementation(async (context) => {
      if (committed) expect(await admit(context)).toMatchObject({ ok: true });
      throw new Error("Custom-store response failure");
    });
    await f.client.launch();
    expect(f.client.getSnapshot().operations[0]?.status).toBe("delivery-unknown");
    expect(await f.service.request(request("agent.launch"))).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(f.store.admit).toHaveBeenCalledTimes(1);
    expect((await f.disk()).entries).toHaveLength(committed ? 1 : 0);
    expect(f.start).not.toHaveBeenCalled();
  });

  it("lets read-proven admission outrank an old connection's late failure without replay", async () => {
    const f = await fixture();
    let release!: (reply: CoreResponse) => void;
    let held: CoreResponse | undefined;
    f.controls.holdLaunch = async (reply) => { held = reply; return new Promise((resolve) => { release = resolve; }); };
    vi.spyOn(f.store, "read").mockResolvedValueOnce(fault());
    const launch = f.client.launch();
    await vi.waitFor(() => expect(held).toBeDefined(), { interval: 5 });
    f.disconnect(); f.connect();
    await f.client.reconcileOperation(f.client.getSnapshot().operations[0]!.requestId);
    expect(f.client.getSnapshot().operations[0]?.status).toBe("accepted");
    release(held!); await launch;
    expect(f.client.getSnapshot().operations[0]?.status).toBe("accepted");
    await f.client.launch();
    expect(f.calls.filter((call) => call.type === "agent.launch")).toHaveLength(1);
    expect(f.start).not.toHaveBeenCalled();
  });
});
