// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealWorkspaceProvider } from "../core/provider";
import { AGENT_LIMITS, utf8Bytes, type AgentRequest, type AgentResult, type Run } from "../protocol/agents";
import { PROTOCOL_VERSION } from "../protocol/common";
import { createRehearsalAgentService, REHEARSAL_LIMITS, type RehearsalAgentService } from "./support/agent-rehearsal-service";

const roots: string[] = [], services: RehearsalAgentService[] = [];
const base = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID() });
const path = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const source = "export const evaluate = () => 'actual disk 🧪';\n";
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function result(service: RehearsalAgentService, request: AgentRequest): Promise<AgentResult> {
  const outcome = await service.request(request);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
  return outcome.value;
}
async function detail(service: RehearsalAgentService, runId: string, afterRecord = 0) {
  const read = await result(service, { ...base(), type: "agent.read", runId, afterRecord });
  if (read.kind !== "read") throw new Error("Expected durable detail");
  return read;
}
async function fixture(taskText = "REHEARSAL: <img src=x onerror=alert('literal')> réponse 🧪") {
  const directory = await mkdtemp(join(tmpdir(), "swarm-agent-rehearsal-service-")); roots.push(directory);
  const root = join(directory, "repo"), storeRoot = join(directory, "private");
  await mkdir(join(root, "examples/checkout-world/services/fraudcheck"), { recursive: true });
  await writeFile(join(root, path), source);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: {
    ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  } });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-qm", "fixture");
  const provider = await RealWorkspaceProvider.create(root);
  const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === path)!.focus;
  const options = { root, storeRoot, snapshot: () => provider.snapshot(), emit() {} };
  const service = await createRehearsalAgentService(options); services.push(service);
  const prepare: AgentRequest = { ...base(), type: "agent.prepare", worldId: focus.worldId, focus,
    taskText, model: null, effort: null, links: { parentRunId: null, task: null, spec: null } };
  const draft = async () => {
    const prepared = await result(service, prepare);
    if (prepared.kind !== "prepare") throw new Error("Expected current disk draft");
    return prepared.draft;
  };
  const launch = async () => {
    const prepared = await draft();
    const request: AgentRequest = { ...base(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash };
    const receipt = await result(service, request);
    return { prepared, request, receipt };
  };
  const running = async () => {
    const launched = await launch();
    await vi.waitFor(async () => expect((await detail(service, launched.prepared.runId)).run.state).toBe("running"), { interval: 10 });
    return launched;
  };
  const storeDirectory = join(storeRoot, createHash("sha256").update(root).digest("hex"));
  const disk = async () => JSON.parse(await readFile(join(storeDirectory, "snapshot.json"), "utf8")) as { entries: { run: Run }[] };
  const steer = async (runId: string, text: string): Promise<AgentRequest> => ({ ...base(), type: "agent.steer", runId,
    expectedTurnId: (await detail(service, runId)).run.providerTurnId!, text });
  return { directory, root, storeRoot, storeDirectory, options, service, prepare, draft, launch, running, disk, steer };
}

describe("human-paced in-process rehearsal over real context and durable lifecycle", () => {
  it("autonomously starts from real disk context and records literal inputs without private controls", async () => {
    const f = await fixture(); const { prepared, request, receipt } = await f.running();
    expect(prepared).toMatchObject({ capabilities: { provider: "deterministic-rehearsal", version: "test-only" },
      launchContext: { root: f.root, diskOnly: true, attachments: [{ path, content: source }] } });
    expect(receipt).toMatchObject({ kind: "launch", receipt: { status: "admitted" } });
    expect((await f.disk()).entries[0]!.run).toMatchObject({ state: "running", processState: "live", cleanup: { status: "pending" } });
    expect(await result(f.service, request)).toEqual(receipt);
    const text = (await detail(f.service, prepared.runId)).page.records.map((record) => record.text).join("");
    expect(text).toContain("<img src=x onerror=alert('literal')>"); expect(text).toContain("réponse 🧪");
    expect(text).toContain("REHEARSAL");
    expect(f.service).not.toHaveProperty("control");
    expect(f.service.diagnostics()).toMatchObject({ externalProcesses: 0, totals: { start: 1 } });
    expect(await readFile(join(f.root, path), "utf8")).toBe(source);
    expect(JSON.stringify(f.service.diagnostics())).not.toContain("literal");
    expect(JSON.stringify(f.service.diagnostics())).not.toContain(f.root);
  });

  it("persists normal steering once; a read-only reconnect neither starts nor steers again", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    const request = await f.steer(prepared.runId, "<script>literal 🧪</script>");
    const pending = f.service.request(request);
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true));
    expect((await f.disk()).entries[0]!.run.instructions).toMatchObject([{ status: "pending" }]);
    expect(await pending).toMatchObject({ value: { receipt: { status: "accepted" } } });
    const before = f.service.diagnostics().totals;
    await result(f.service, { ...base(), type: "agent.snapshot" });
    const read = await detail(f.service, prepared.runId);
    expect(read.run.instructions).toMatchObject([{ text: "<script>literal 🧪</script>", status: "accepted" }]);
    expect(read.page.records.some((record) => record.text.includes("Steer accepted (deterministic echo): <script>literal 🧪</script>"))).toBe(true);
    expect(await result(f.service, request)).toMatchObject({ receipt: { status: "accepted" } });
    expect(f.service.diagnostics().totals).toEqual(before);
  });

  it("distinguishes Stop request, interrupt acknowledgment, terminal evidence, and cleanup", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    expect(await result(f.service, { ...base(), type: "agent.cancel", runId: prepared.runId })).toMatchObject({ receipt: { status: "requested" } });
    expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "cancelling", processState: "live", cleanup: { status: "pending" } });
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.interruptAcknowledged).toBe(true), { interval: 5 });
    expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "cancelling", cleanup: { status: "pending" } });
    await vi.waitFor(async () => expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "cancelled",
      providerOutcome: { kind: "turn", status: "interrupted" }, processState: "live", cleanup: { status: "pending" } }), { interval: 5 });
    await vi.waitFor(async () => expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "cancelled",
      processState: "exited", exitCode: null, cleanup: { status: "confirmed", detail: expect.stringContaining("no external process existed") } }), { interval: 5 });
    expect(f.service.diagnostics()).toMatchObject({ totals: { start: 1, interrupt: 1, dispose: 1 }, runs: [{ activeTimers: 0 }] });
  });

  it("settles delayed Stop-racing steering conservatively and cancels all responder timers", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    const request = await f.steer(prepared.runId, "[delay] race with Stop 🧪");
    const pending = f.service.request(request);
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true));
    expect(await f.service.request(await f.steer(prepared.runId, "second outstanding"))).toMatchObject({ error: { code: "BUSY" } });
    await result(f.service, { ...base(), type: "agent.cancel", runId: prepared.runId });
    expect(await pending).toMatchObject({ value: { receipt: { status: "delivery-unknown" } } });
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.cleanupSettled).toBe(true));
    const read = await detail(f.service, prepared.runId);
    expect(read.run.instructions).toMatchObject([{ status: "delivery-unknown" }]);
    expect(read.page.records.some((record) => record.text.includes("Steer accepted"))).toBe(false);
    expect(f.service.diagnostics().runs[0]!.activeTimers).toBe(0);
  });

  it("finishes paced bounded output with actual multi-page transcript and safe UTF-8 previews", async () => {
    const f = await fixture("🧪".repeat(300)); const { prepared } = await f.running();
    await vi.waitFor(async () => expect((await detail(f.service, prepared.runId)).run.cleanup.status).toBe("confirmed"), { interval: 100, timeout: 25_000 });
    const first = await detail(f.service, prepared.runId);
    expect(first.run).toMatchObject({ state: "completed", providerOutcome: { kind: "turn", status: "completed" }, exitCode: null });
    expect(first.run.transcript.bytes).toBeGreaterThan(AGENT_LIMITS.pageBytes);
    expect(utf8Bytes(JSON.stringify(first.page.records))).toBeLessThanOrEqual(AGENT_LIMITS.pageBytes);
    expect(first.page.nextCursor).toBeLessThan(first.run.transcript.lastRecord);
    const second = await detail(f.service, prepared.runId, first.page.nextCursor);
    expect(second.page.nextCursor).toBe(first.run.transcript.lastRecord);
    const text = [...first.page.records, ...second.page.records].map((record) => record.text).join("");
    expect(text).not.toContain("�"); expect(text).toContain("🧪".repeat(64)); expect(text).not.toContain("🧪".repeat(65));
    const diagnostics = f.service.diagnostics().runs[0]!;
    expect(diagnostics.emittedBytes).toBeLessThanOrEqual(REHEARSAL_LIMITS.outputBytes);
    expect(diagnostics.emittedRecords).toBeLessThanOrEqual(100);
    expect(diagnostics.peakTimers).toBeLessThanOrEqual(REHEARSAL_LIMITS.timers);
    expect(diagnostics.activeTimers).toBe(0);
  }, 30_000);

  it("rejects changed source before dispatch and leaves source untouched", async () => {
    const f = await fixture(); const prepared = await f.draft();
    const changed = `${source}// user edit\n`; await writeFile(join(f.root, path), changed);
    expect(await f.service.request({ ...base(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash })).toMatchObject({ error: { code: "STALE_CONTEXT" } });
    expect(f.service.diagnostics().totals.start).toBe(0);
    expect(await readFile(join(f.root, path), "utf8")).toBe(changed);
  });

  it("retains twenty durable runs and refuses overflow without dispatch or history eviction", async () => {
    const f = await fixture();
    for (let index = 0; index < REHEARSAL_LIMITS.runs; index++) {
      const { prepared } = await f.launch();
      await result(f.service, { ...base(), type: "agent.cancel", runId: prepared.runId });
      await vi.waitFor(async () => {
        const run = (await detail(f.service, prepared.runId)).run;
        expect(run.state).toBe("cancelled"); expect(run.cleanup.status).not.toBe("pending");
      }, { interval: 10, timeout: 1500 });
    }
    expect((await f.disk()).entries).toHaveLength(REHEARSAL_LIMITS.runs);
    const prepared = await f.draft(), starts = f.service.diagnostics().totals.start;
    // R2 conservatively latches even STORAGE_FULL admission errors as unknown;
    // the rehearsal does not weaken that existing admission policy.
    expect(await f.service.request({ ...base(), type: "agent.launch", runId: prepared.runId,
      contextHash: prepared.contextHash })).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect((await f.disk()).entries).toHaveLength(REHEARSAL_LIMITS.runs);
    expect(f.service.diagnostics().totals.start).toBe(starts);
  }, 30_000);

  it("early close disposes output and pending steering; captured crash history recovers without replay", async () => {
    const f = await fixture(); const { prepared, request } = await f.running();
    const steering = await f.steer(prepared.runId, "[delay] retained instruction");
    const pending = f.service.request(steering);
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true));
    const recoveredRoot = join(f.directory, "recovered"), recoveredDirectory = join(recoveredRoot, createHash("sha256").update(f.root).digest("hex"));
    await mkdir(recoveredDirectory, { recursive: true, mode: 0o700 });
    await copyFile(join(f.storeDirectory, "snapshot.json"), join(recoveredDirectory, "snapshot.json"));
    await Promise.all([f.service.shutdown(), f.service.shutdown()]);
    expect(await pending).toMatchObject({ value: { receipt: { status: "delivery-unknown" } } });
    expect(f.service.diagnostics()).toMatchObject({ runs: [{ activeTimers: 0, cleanupSettled: true, pendingSteer: false }], totals: { dispose: 1 } });
    const recovered = await createRehearsalAgentService({ ...f.options, storeRoot: recoveredRoot }); services.push(recovered);
    expect((await detail(recovered, prepared.runId)).run).toMatchObject({ state: "unknown", processState: "unknown",
      cleanup: { status: "unknown" }, instructions: [{ status: "delivery-unknown" }], transcript: { tailMayBeLost: true } });
    expect(await result(recovered, request)).toMatchObject({ receipt: { status: "admitted" } });
    expect(await result(recovered, steering)).toMatchObject({ receipt: { status: "delivery-unknown" } });
    expect(await recovered.request(f.prepare)).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(recovered.diagnostics().totals).toEqual({ start: 0, steer: 0, interrupt: 0, dispose: 0 });
    expect(await readFile(join(f.root, path), "utf8")).toBe(source);
  });
});
