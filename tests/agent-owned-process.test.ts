// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { base, executable, openProcessFixture, value } from "../fixtures/agent-owned-process/composition";
import type { Run } from "../protocol/agents";

// No installed Codex, live model, policy probe, physical desktop or sockets.
// /proc observations below never grant authority to signal a numeric PID.
const source = resolve(".");
const provider = resolve("fixtures/agent-owned-process/provider.mjs");
const roots: string[] = [], children: ChildProcess[] = [];
const fixtures: Awaited<ReturnType<typeof openProcessFixture>>[] = [];
const observedNamespaces = new Set<string>();
const reports: unknown[] = [];
const hooks = ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_AUDIT"];
const cleanEnvironment = { PATH: process.env.PATH, LANG: "C.UTF-8" };
let compiled: string, compileRoot: string;
let namespacesAvailable = true;
let namespaceFailure = "";
try {
  execFileSync(executable("unshare"), ["--user", "--map-current-user", "--pid", "--fork",
    "--kill-child=SIGKILL", "--mount-proc", "--", executable("true")],
  { timeout: 3000, stdio: "ignore", env: cleanEnvironment });
} catch (error) { namespacesAvailable = false; namespaceFailure = error instanceof Error ? error.message : "Namespace probe failed"; }
beforeAll(async () => {
  compileRoot = await mkdtemp(join(tmpdir(), "swarm-process-compile-"));
  compiled = join(compileRoot, "test-core.cjs");
  await build({ entryPoints: [resolve("fixtures/agent-owned-process/core.ts")], outfile: compiled,
    bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent" });
});
beforeEach(() => { for (const hook of hooks) vi.stubEnv(hook, ""); });
async function killOwned(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((done) => child.once("close", () => done()));
  child.kill("SIGKILL");
  await closed;
}
afterEach(async () => {
  // Keep attempting all owned cleanup even if one assertion/close failed.
  const results = await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  await Promise.all(children.splice(0).map(killOwned));
  for (const namespace of observedNamespaces) await until(() => liveMembers(namespace).length === 0, "failure-path namespace cleanup");
  observedNamespaces.clear();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  for (const result of results) if (result.status === "rejected") throw result.reason;
});
afterAll(async () => {
  if (compileRoot) await rm(compileRoot, { recursive: true, force: true });
  if (process.env.SWARM_PROCESS_EVIDENCE_DIR) {
    await mkdir(process.env.SWARM_PROCESS_EVIDENCE_DIR, { recursive: true });
    await writeFile(join(process.env.SWARM_PROCESS_EVIDENCE_DIR, "owned-process.json"), JSON.stringify({
      fixtureProtocolOnly: true, liveProviderRequests: 0, installedCodexStarted: false,
      namespacesAvailable, namespaceFailure, positiveScenarios: reports,
    }, null, 2) + "\n", { mode: 0o600 });
  }
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "swarm-joined-process-")); roots.push(root); return root;
}
async function until(check: () => Promise<boolean> | boolean, label: string, timeout = 7000) {
  const end = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() >= end) throw new Error(`Owned-process deadline: ${label}`);
    await new Promise((done) => setTimeout(done, 10));
  }
}
type Witness = { role: string; phase: string; namespace: string; pid: number; method?: string };
async function witness(root: string): Promise<Witness[]> {
  try { return (await readFile(join(root, "witness.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function liveMembers(namespace: string) {
  return readdirSync("/proc").filter((name) => /^\d+$/.test(name)).flatMap((name) => {
    try {
      if (readlinkSync(`/proc/${name}/ns/pid`) !== namespace) return [];
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      return ["Z", "X"].includes(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0]!) ? [] : [Number(name)];
    } catch { return []; }
  });
}
async function ownedNamespace(root: string) {
  const namespace = (await witness(root)).find((entry) => entry.role === "provider" && entry.phase === "ready")?.namespace;
  if (!namespace || !/^pid:\[\d+\]$/.test(namespace) || namespace === readlinkSync("/proc/self/ns/pid")) throw new Error("Missing private namespace witness");
  observedNamespaces.add(namespace);
  return namespace;
}
async function outsideCanary(root: string) {
  const child = spawn(process.execPath, [provider, "canary", "stop-terminal", join(root, "witness.jsonl")],
    { env: cleanEnvironment, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  children.push(child);
  let ready = false;
  child.on("message", (message) => { ready = (message as { type?: string }).type === "ready"; });
  await until(() => ready, "canary ready");
  return child;
}
const sequence = (runs: Run[]) => runs.map((run) => ({ state: run.state, process: run.processState,
  cleanup: run.cleanup.status, instructions: run.instructions.map((receipt) => receipt.status) }));
function canarySurvived(canary: ChildProcess, namespace: string) {
  expect(canary.exitCode).toBeNull(); expect(canary.signalCode).toBeNull();
  expect(readlinkSync(`/proc/${canary.pid!}/ns/pid`)).not.toBe(namespace);
}

it("reports unsupported namespaces as unavailable, never a passing required positive proof", () => {
  if (process.env.SWARM_REQUIRE_OWNED_PROCESS === "1") expect(namespacesAvailable, `UNAVAILABLE: private Linux namespaces required: ${namespaceFailure}`).toBe(true);
});

describe.skipIf(!namespacesAvailable)("joined service/stdio/private namespace fixture", () => {
  it("persists admission, real stream and receipts; completed turn precedes independently confirmed cleanup", async () => {
    const root = await directory(), canary = await outsideCanary(root);
    const fixture = await openProcessFixture(root, "stop-terminal", source); fixtures.push(fixture);
    const receipt = await fixture.launch();
    await until(async () => (await fixture.read()).page.records.some((r) => r.text.includes("café 🌱")), "normalized output");
    const active = (await fixture.read()).run;
    expect(active).toMatchObject({ state: "running", processState: "live", cleanup: { status: "pending" },
      providerObservation: { model: "fixture-model" }, providerThreadId: "fixture-thread", providerTurnId: "fixture-turn" });
    expect(fixture.calls.admissionBeforeConnect).toBe(true);
    expect((await fixture.persisted()).entries[0].receipt).toEqual(receipt);
    const same = value(await fixture.service.request({ ...base(), type: "agent.launch", runId: fixture.draft.runId, contextHash: fixture.draft.contextHash }));
    expect(same).toMatchObject({ receipt }); expect(fixture.calls.connect).toBe(1);
    const observed = await witness(root);
    const namespace = await ownedNamespace(root);
    expect(namespace).not.toBe(readlinkSync("/proc/self/ns/pid"));
    expect(liveMembers(namespace).length).toBeGreaterThanOrEqual(3);
    expect(observed.some((entry) => entry.role === "descendant" && entry.namespace === namespace && entry.phase === "ready")).toBe(true);
    expect(value(await fixture.service.request(fixture.steerRequest))).toMatchObject({ receipt: { status: "accepted" } });
    expect(value(await fixture.service.request(fixture.steerRequest))).toMatchObject({ receipt: { status: "accepted" } });
    expect(fixture.calls.methods.filter((method) => method === "turn/steer")).toHaveLength(1);
    expect((await fixture.read()).run).toMatchObject({ state: "running", processState: "live", cleanup: { status: "pending" } });
    expect(liveMembers(namespace).length).toBeGreaterThanOrEqual(3);
    expect(value(await fixture.service.request({ ...base(), type: "agent.cancel", runId: fixture.draft.runId }))).toMatchObject({ receipt: { status: "requested" } });
    await until(async () => (await fixture.read()).run.cleanup.status === "confirmed", "real cleanup");
    const final = (await fixture.read()).run;
    expect(final).toMatchObject({ state: "completed", processState: "exited", cleanup: { status: "confirmed" },
      providerOutcome: { kind: "turn", status: "completed" } });
    expect(fixture.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "cancelling", processState: "live", cleanup: expect.objectContaining({ status: "pending" }) }),
      expect.objectContaining({ state: "completed", processState: "live", cleanup: expect.objectContaining({ status: "pending" }) }),
    ]));
    expect(fixture.transitions.findIndex((run) => run.state === "completed")).toBeLessThan(fixture.transitions.findIndex((run) => run.cleanup.status === "confirmed"));
    const endedWitness = await witness(root);
    expect(endedWitness.some((entry) => entry.role === "provider" && entry.phase === "interrupt-ack")).toBe(true);
    expect(endedWitness.some((entry) => entry.role === "provider" && entry.phase === "terminal")).toBe(true);
    expect(endedWitness.some((entry) => entry.role === "provider" && entry.phase === "sigterm")).toBe(true);
    expect(endedWitness.some((entry) => entry.role === "descendant" && entry.phase === "sigterm")).toBe(true);
    expect(liveMembers(namespace)).toEqual([]); canarySurvived(canary, namespace);
    expect((await fixture.persisted()).entries[0].run).toEqual(final);
    expect(fixture.calls.close).toBe(1);
    const emittedStates = fixture.snapshots.map((snapshot) => snapshot.runs.find((run) => run.runId === fixture.draft.runId)!.state);
    expect(emittedStates).toEqual(expect.arrayContaining(["starting", "running", "cancelling", "completed"]));
    expect(emittedStates.indexOf("cancelling")).toBeLessThan(emittedStates.indexOf("completed"));
    expect(emittedStates.slice(emittedStates.indexOf("completed")).every((state) => state === "completed")).toBe(true);
    reports.push({ scenario: "stop-terminal", receipt, calls: fixture.calls, sequence: sequence(fixture.transitions),
      emittedStates, namespace, remainingLiveNamespaceMembers: 0, outsideCanarySurvived: true, witness: endedWitness });
  }, 15000);

  it("unexpected provider exit preserves unknown turn and steering despite confirmed namespace teardown", async () => {
    const root = await directory(), canary = await outsideCanary(root);
    const fixture = await openProcessFixture(root, "unexpected-exit", source); fixtures.push(fixture);
    await fixture.launch();
    await until(async () => (await fixture.read()).run.state === "running", "running");
    const namespace = await ownedNamespace(root);
    const result = value(await fixture.service.request(fixture.steerRequest));
    expect(result).toMatchObject({ receipt: { status: "delivery-unknown" } });
    await until(async () => (await fixture.read()).run.cleanup.status === "confirmed", "exit cleanup");
    const final = (await fixture.read()).run;
    expect(final).toMatchObject({ state: "unknown", exitCode: 17, processState: "exited", cleanup: { status: "confirmed" }, providerOutcome: { kind: "none" } });
    expect((await fixture.persisted()).entries[0].run).toEqual(final);
    expect(liveMembers(namespace)).toEqual([]); canarySurvived(canary, namespace);
    expect(value(await fixture.service.request(fixture.steerRequest))).toMatchObject({ receipt: { status: "delivery-unknown" } });
    expect(fixture.calls.methods.filter((method) => method === "turn/steer")).toHaveLength(1);
    reports.push({ scenario: "unexpected-exit", calls: fixture.calls, sequence: sequence(fixture.transitions),
      namespace, remainingLiveNamespaceMembers: 0, outsideCanarySurvived: true, exitCode: final.exitCode });
  }, 15000);

  it("hard owning-core death terminates descendants; reopened real store stays unknown and never replays", async () => {
    const root = await directory(), canary = await outsideCanary(root);
    const core = spawn(process.execPath, [compiled, root, source], { env: cleanEnvironment,
      stdio: ["ignore", "ignore", "pipe", "ipc"] }); children.push(core);
    let notice: { type?: string; receipt?: { runId: string }; calls?: unknown } | undefined;
    core.on("message", (message) => { notice = message as typeof notice; });
    core.stderr!.resume();
    await until(async () => notice?.type === "pending" && (await witness(root)).some((entry) => entry.method === "turn/steer"), "durable pending and delivered steer");
    const runId = notice!.receipt!.runId;
    const before = JSON.parse(await readFile(join(root, "store/snapshot.json"), "utf8")).entries[0].run as Run;
    expect(before).toMatchObject({ state: "running", cleanup: { status: "pending" }, instructions: [{ status: "pending" }] });
    const namespace = await ownedNamespace(root);
    expect(liveMembers(namespace).length).toBeGreaterThanOrEqual(3);
    await killOwned(core);
    expect(core.signalCode).toBe("SIGKILL");
    await until(() => liveMembers(namespace).length === 0, "kernel teardown after control pipe EOF");
    canarySurvived(canary, namespace);
    const recovered = await openProcessFixture(root, "core-death", source, true); fixtures.push(recovered);
    const run = (await recovered.read(runId)).run;
    expect(run).toMatchObject({ state: "unknown", processState: "unknown", cleanup: { status: "unknown" },
      instructions: [{ status: "delivery-unknown" }], transcript: { tailMayBeLost: true } });
    expect(await recovered.service.request({ ...base(), type: "agent.prepare", ...recovered.input })).toMatchObject({ error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(recovered.calls).toMatchObject({ connect: 0, close: 0, methods: [] });
    expect((await witness(root)).filter((entry) => entry.method === "turn/start")).toHaveLength(1);
    expect((await witness(root)).filter((entry) => entry.method === "turn/steer")).toHaveLength(1);
    expect((await recovered.persisted()).entries[0].run).toEqual(run);
    reports.push({ scenario: "core-death", before: sequence([before]), after: sequence([run]),
      priorCalls: notice!.calls, replacementCalls: recovered.calls, namespace,
      remainingLiveNamespaceMembers: 0, outsideCanarySurvived: true, recoveryCleanup: "unknown", replay: false });
  }, 15000);
});
