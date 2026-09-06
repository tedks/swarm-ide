// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealWorkspaceProvider } from "../core/provider";
import { AGENT_FIXTURE_TURN } from "../fixtures/agents";
import { AGENT_LIMITS, utf8Bytes, type AgentRequest, type AgentResult, type Run } from "../protocol/agents";
import { PROTOCOL_VERSION } from "../protocol/common";
import { createJourneyAgentService, JourneyControlSchema, type JourneyAgentService } from "./support/agent-journey-service";

const roots: string[] = [], services: JourneyAgentService[] = [];
const base = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID() });
const path = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
const source = "export const evaluate = () => 'actual disk 🧪';\n";
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function result(service: JourneyAgentService, request: AgentRequest): Promise<AgentResult> {
  const outcome = await service.request(request);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
  return outcome.value;
}
async function detail(service: JourneyAgentService, runId: string, afterRecord = 0) {
  const read = await result(service, { ...base(), type: "agent.read", runId, afterRecord });
  if (read.kind !== "read") throw new Error("Expected durable detail");
  return read;
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "swarm-agent-journey-")); roots.push(directory);
  const root = join(directory, "repo"), storeRoot = join(directory, "app-data");
  await mkdir(join(root, "examples/checkout-world/services/fraudcheck"), { recursive: true });
  await writeFile(join(root, path), source);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: {
    ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  } });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-qm", "fixture");
  const provider = await RealWorkspaceProvider.create(root);
  await provider.observeWorkingWorld(() => undefined);
  await provider.listRepository({ protocolVersion: PROTOCOL_VERSION, requestId: "fixture-directory", type: "repo.list",
    directory: path.split("/").slice(0, -1).join("/"), page: 0, filter: "", refresh: true }, () => undefined);
  const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === path)!.focus;
  const options = { root, storeRoot, snapshot: () => provider.snapshot(), emit() {} };
  const service = await createJourneyAgentService(options); services.push(service);
  const prepare: AgentRequest = { ...base(), type: "agent.prepare", worldId: focus.worldId, focus,
    taskText: "TEST FIXTURE: explain the selected disk interface.", model: null, effort: null,
    links: { parentRunId: null, task: null, spec: null } };
  const draft = async () => {
    const prepared = await result(service, prepare);
    if (prepared.kind !== "prepare") throw new Error("Expected current disk draft");
    return prepared.draft;
  };
  const launch = async () => {
    const prepared = await draft();
    const request: AgentRequest = { ...base(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash };
    const receipt = await result(service, request);
    await vi.waitFor(() => expect(service.diagnostics().totals.start).toBeGreaterThan(0), { interval: 5 });
    return { prepared, request, receipt };
  };
  const running = async () => {
    const launched = await launch();
    await service.control({ action: "start-observed", runId: launched.prepared.runId });
    expect((await detail(service, launched.prepared.runId)).run.state).toBe("running");
    return launched;
  };
  const storeDirectory = join(storeRoot, createHash("sha256").update(root).digest("hex"));
  const disk = async () => JSON.parse(await readFile(join(storeDirectory, "snapshot.json"), "utf8")) as { entries: { run: Run }[] };
  const steer = (runId: string): AgentRequest => ({ ...base(), type: "agent.steer", runId,
    expectedTurnId: AGENT_FIXTURE_TURN, text: "TEST FIXTURE: focus on the interface failures 🧪." });
  return { directory, root, storeRoot, storeDirectory, options, service, prepare, draft, launch, running, disk, steer };
}

describe("test-only E2 adapter joined to real disk context and durable service", () => {
  it("retains exact disk focus/provenance and admits one fixture behind durable deduplication", async () => {
    const f = await fixture();
    const { prepared, request, receipt } = await f.launch();
    expect(prepared).toMatchObject({ capabilities: { provider: "deterministic-fixture", version: "test-only" },
      launchContext: { root: f.root, focus: f.prepare.type === "agent.prepare" ? f.prepare.focus : undefined,
        diskOnly: true, attachments: [{ path, content: source }],
        instructionSources: [{ observation: "unobserved", path: "provider://instruction-expansion-unobserved" }] } });
    expect(Date.parse(prepared.expiresAt)).toBeGreaterThan(Date.now());
    expect(prepared.launchContext.submittedPrompt).toContain("not a frozen filesystem");
    expect(receipt).toMatchObject({ kind: "launch", receipt: { status: "admitted" } });
    expect((await f.disk()).entries[0]!.run).toMatchObject({ state: "starting", processState: "live", cleanup: { status: "pending" } });
    expect(await result(f.service, { ...request, requestId: "duplicate-launch" })).toEqual(receipt);
    expect(f.service.diagnostics().totals.start).toBe(1);
    expect(await f.service.request(f.prepare)).toMatchObject({ ok: false, error: { code: "BUSY" } });
    await f.service.control({ action: "start-observed" });
    expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "running",
      providerObservation: { model: "TEST-FIXTURE-NO-MODEL", provider: "deterministic-fixture" } });
  });

  it("refuses stale disk preparation without admitting or dispatching a fixture", async () => {
    const f = await fixture(); const prepared = await f.draft();
    await writeFile(join(f.root, path), `${source}// advanced disk\n`);
    expect(await f.service.request({ ...base(), type: "agent.launch", runId: prepared.runId,
      contextHash: prepared.contextHash })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(f.service.diagnostics().totals.start).toBe(0);
    const snapshot = await result(f.service, { ...base(), type: "agent.snapshot" });
    expect(snapshot).toMatchObject({ snapshot: { runs: [] } });
  });

  it("records pending, accepted and stale steering without replay or leaking text in diagnostics", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    const request = f.steer(prepared.runId); const pending = f.service.request(request);
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true), { interval: 5 });
    expect((await f.disk()).entries[0]!.run.instructions[0]!.status).toBe("pending");
    await f.service.control({ action: "steer-accepted" });
    expect(await pending).toMatchObject({ ok: true, value: { receipt: { status: "accepted" } } });
    expect((await f.disk()).entries[0]!.run.instructions[0]!.status).toBe("accepted");
    expect(await result(f.service, request)).toMatchObject({ receipt: { status: "accepted" } });
    expect(f.service.diagnostics().totals.steer).toBe(1);
    const stale = f.service.request(f.steer(prepared.runId));
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true), { interval: 5 });
    await f.service.control({ action: "steer-stale" });
    expect(await stale).toMatchObject({ ok: true, value: { receipt: { status: "rejected", error: { code: "STALE_TURN" } } } });
    expect(f.service.diagnostics().totals.steer).toBe(2);
    const serialized = JSON.stringify(f.service.diagnostics());
    expect(serialized).not.toContain("interface failures"); expect(serialized).not.toContain(f.root);
    expect(f.service.diagnostics().runs[0]!.invocations.find((call) => call.method === "steer")?.textBytes).toBe(
      request.type === "agent.steer" ? utf8Bytes(request.text) : -1);
  });

  it("keeps Stop, completion and in-process cleanup separate, never inventing exit zero", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    await expect(f.service.control({ action: "cleanup-confirmed" })).rejects.toThrow("awaiting cleanup");
    expect(await result(f.service, { ...base(), type: "agent.cancel", runId: prepared.runId })).toMatchObject({ receipt: { status: "requested" } });
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingInterrupt).toBe(true), { interval: 5 });
    await f.service.control({ action: "interrupt-accepted" });
    expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "cancelling", cleanup: { status: "pending" } });
    await f.service.control({ action: "terminal-completed" });
    expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "completed", processState: "live",
      cleanup: { status: "pending" }, providerOutcome: { kind: "turn", status: "completed" }, exitCode: null });
    expect(await f.service.request(f.prepare)).toMatchObject({ ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    await f.service.control({ action: "cleanup-confirmed" });
    await vi.waitFor(async () => expect((await detail(f.service, prepared.runId)).run).toMatchObject({ state: "completed",
      processState: "exited", exitCode: null, cleanup: { status: "confirmed", detail: expect.stringContaining("no external process existed") } }), { interval: 5 });
    expect((await f.disk()).entries[0]!.run).toMatchObject({ state: "completed", cleanup: { status: "confirmed" }, exitCode: null });
    expect(await f.service.request({ ...base(), type: "agent.cancel", runId: prepared.runId })).toMatchObject({ error: { code: "RUN_NOT_ACTIVE" } });
    expect(f.service.diagnostics()).toMatchObject({ externalProcesses: 0, totals: { start: 1, interrupt: 1, dispose: 1 } });
  });

  it("pages bounded literal HTML and multibyte output through the actual file store", async () => {
    const f = await fixture(); const { prepared } = await f.running();
    await f.service.control({ action: "output", count: 40, repeat: 256 });
    const first = await detail(f.service, prepared.runId);
    expect(first.run.transcript.bytes).toBeGreaterThan(AGENT_LIMITS.pageBytes);
    expect(utf8Bytes(JSON.stringify(first.page.records))).toBeLessThanOrEqual(AGENT_LIMITS.pageBytes);
    expect(first.page.nextCursor).toBeLessThan(first.run.transcript.lastRecord);
    const records = [...first.page.records]; let cursor = first.page.nextCursor;
    while (cursor < first.run.transcript.lastRecord) {
      const next = await detail(f.service, prepared.runId, cursor);
      expect(next.page.nextCursor).toBeGreaterThan(cursor); records.push(...next.page.records); cursor = next.page.nextCursor;
    }
    expect(records).toHaveLength(40);
    expect(records.some((record) => record.text.includes("<img src=x onerror=alert('fixture')>"))).toBe(true);
    expect(records.some((record) => record.text.includes("réponse 🧪"))).toBe(true);
    expect((await detail(f.service, prepared.runId, cursor)).page).toMatchObject({ records: [], nextCursor: cursor, truncated: false });
    expect(f.service.diagnostics().runs[0]!.output).toEqual([{ requestedCount: 40, repeat: 256,
      emittedCount: 40, emittedBytes: records.reduce((bytes, record) => bytes + utf8Bytes(record.text), 0) }]);
  }, 15_000);

  it("recovers a captured durable crash image as unknown with no second spawn or steering replay", async () => {
    const f = await fixture(); const { prepared, request } = await f.running();
    const instruction = f.steer(prepared.runId), pending = f.service.request(instruction);
    await vi.waitFor(() => expect(f.service.diagnostics().runs[0]!.pendingSteer).toBe(true), { interval: 5 });
    // Copy the exact atomically committed live image; do not hand-author a
    // recovery state. Actual worker death is the separate desktop scenario.
    const recoveredRoot = join(f.directory, "recovered-app-data");
    const recoveredDirectory = join(recoveredRoot, createHash("sha256").update(f.root).digest("hex"));
    await mkdir(recoveredDirectory, { recursive: true, mode: 0o700 });
    await copyFile(join(f.storeDirectory, "snapshot.json"), join(recoveredDirectory, "snapshot.json"));
    await f.service.shutdown();
    expect(await pending).toMatchObject({ value: { receipt: { status: "delivery-unknown" } } });
    expect(f.service.diagnostics().runs[0]!.cleanupSettled).toBe(true);
    const recovered = await createJourneyAgentService({ ...f.options, storeRoot: recoveredRoot }); services.push(recovered);
    expect((await detail(recovered, prepared.runId)).run).toMatchObject({ state: "unknown", processState: "unknown",
      cleanup: { status: "unknown" }, instructions: [{ status: "delivery-unknown" }], transcript: { tailMayBeLost: true } });
    expect(await result(recovered, request)).toMatchObject({ receipt: { status: "admitted" } });
    expect(await result(recovered, instruction)).toMatchObject({ receipt: { status: "delivery-unknown" } });
    expect(await recovered.request(f.prepare)).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(recovered.diagnostics()).toMatchObject({ runs: [], totals: { start: 0, steer: 0, interrupt: 0, dispose: 0 } });
  });

  it("rejects expanded private-control authority and bad bounds before fixture work", async () => {
    for (const input of [
      { action: "output", count: 65 }, { action: "output", count: 0 }, { action: "output", repeat: 257 },
      { action: "output", text: "arbitrary output" }, { action: "start-observed", executable: "/bin/sh" },
      { action: "cleanup-confirmed", exitCode: 0 }, { action: "diagnostics", runId: randomUUID() },
    ]) expect(JourneyControlSchema.safeParse(input).success).toBe(false);
    const f = await fixture();
    await expect(f.service.control({ action: "output" })).rejects.toThrow("No dispatched fixture");
    expect(f.service.diagnostics().totals.start).toBe(0);
    await f.service.shutdown();
    await expect(f.service.control({ action: "start-observed" })).rejects.toThrow("closed during shutdown");
  });
});
