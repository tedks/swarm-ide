// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, open, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentFixtureContext, agentFixtureFrames, agentFixtureRecords } from "../fixtures/agents";
import { AGENT_LIMITS, RunSchema, utf8Bytes, type Run } from "../protocol/agents";
import { verifyRehearsalClose } from "./support/agent-rehearsal-close";

const roots: string[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const roles = ["first", "second", "third", "activeAtClose"] as const;
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "swarm-rehearsal-close-")); roots.push(parent);
  const profile = join(parent, "private"), workspace = join(parent, "workspace");
  await mkdir(profile, { mode: 0o700 }); await mkdir(workspace, { mode: 0o700 });
  await mkdir(join(profile, "agent-runs"), { mode: 0o700 });
  const directory = join(profile, "agent-runs", hash(workspace)); await mkdir(directory, { mode: 0o700 });
  const path = join(directory, "snapshot.json");
  const context = agentFixtureContext();
  context.launchContext.root = workspace;
  context.launchContext.submittedPrompt = `Synthetic unit fixture context, not filesystem observation: ${workspace}`;
  context.contextHash = context.launchContext.contextHash = hash(context.launchContext.submittedPrompt);
  const frames = agentFixtureFrames(context), records = agentFixtureRecords();
  const runIds = { first: randomUUID(), second: randomUUID(), third: randomUUID(), activeAtClose: randomUUID() };
  const entries = roles.map((role) => {
    const template = role === "second" ? frames["completed-cleaned"] : role === "activeAtClose" ? frames["recovered-unknown"] : frames.cancelled;
    const run: Run = structuredClone(template.run);
    run.runId = runIds[role]; run.processState = "exited"; run.exitCode = null;
    run.cleanup = { status: "confirmed", observedAt: run.updatedAt, detail: "Synthetic unit fixture only: timers disposed, no external process." };
    run.instructions = role === "first" ? frames["steering-accepted"].run.instructions : role === "third" ? frames["steering-unknown"].run.instructions : [];
    return { run: RunSchema.parse(run), records: structuredClone(records), receipt: {
      runId: run.runId, contextHash: run.launchContext.contextHash, admittedAt: run.createdAt, status: "admitted" as const } };
  });
  const snapshot = { version: 1, entries };
  const diagnostics = { fixture: "TEST-ONLY autonomous in-process rehearsal / R2 service / E1 disk context", externalProcesses: 0,
    totals: { start: 4, steer: 2, interrupt: 2, dispose: 4 }, runs: roles.map((role) => ({
      runId: runIds[role], activeTimers: 0, peakTimers: 3, emittedRecords: records.length,
      emittedBytes: records.reduce((sum, record) => sum + utf8Bytes(record.text), 0), pendingSteer: false, pendingInterrupt: false,
      disposing: true, cleanupSettled: true, calls: { start: 1, steer: role === "first" || role === "third" ? 1 : 0,
        interrupt: role === "first" || role === "third" ? 1 : 0, dispose: 1 },
    })) };
  const save = () => writeFile(path, JSON.stringify(snapshot), { mode: 0o600 });
  await save();
  const options = { profile, workspace, diagnostics, proof: { runIds } };
  return { path, profile, workspace, snapshot, diagnostics, options, save };
}

describe("read-only post-core-exit rehearsal close proof", () => {
  it.each(["diagnostics-schema", "retained-record-count", "retained-text-bytes", "retained-consistency"])("reports only the fixed %s failure code", async (code) => {
    const f = await fixture();
    if (code === "diagnostics-schema") f.diagnostics.runs[0]!.activeTimers = 1;
    if (code === "retained-record-count") f.diagnostics.runs[0]!.emittedRecords++;
    if (code === "retained-text-bytes") f.diagnostics.runs[0]!.emittedBytes++;
    if (code === "retained-consistency") {
      f.snapshot.entries[0]!.run.launchContext.submittedPrompt = "PRIVATE untrusted prompt must not appear in a diagnostic";
      await f.save();
    }
    const before = await readFile(f.path);
    const message = await verifyRehearsalClose(f.options).then(() => "unexpected success", (error: unknown) => error instanceof Error ? error.message : "unexpected rejection");
    expect(message).toBe(`Rehearsal close proof failed: [${code}] owned shutdown diagnostics and retained run history did not agree; no successful cleanup claim was published.`);
    expect(message).not.toContain(f.profile); expect(message).not.toContain(f.workspace);
    expect(message).not.toContain("PRIVATE"); expect(message).not.toContain(f.snapshot.entries[0]!.run.runId);
    expect(await readFile(f.path)).toEqual(before);
  });

  it("joins all four retained outcomes and sanitized timer evidence without mutating or recovering history", async () => {
    const f = await fixture(), before = await readFile(f.path);
    const proof = await verifyRehearsalClose(f.options);
    expect(proof).toMatchObject({ verified: true, inProcessCleanupOnly: true, runCount: 4,
      responder: { start: 4, dispose: 4, activeTimers: 0 }, runs: [
        { role: "first", state: "cancelled", instructionStatuses: ["accepted"] },
        { role: "second", state: "completed", instructionStatuses: [] },
        { role: "third", state: "cancelled", instructionStatuses: ["delivery-unknown"] },
        { role: "activeAtClose", state: "unknown", instructionStatuses: [] },
      ] });
    expect(await readFile(f.path)).toEqual(before);
    const sanitized = JSON.stringify(proof);
    expect(sanitized).not.toContain(f.workspace); expect(sanitized).not.toContain("FIXTURE record");
    expect(sanitized).not.toContain("focus on interface failures");
  });

  it.each(["missing", "timer", "steer", "interrupt", "cleanup", "start", "dispose", "duplicate"])("rejects incomplete %s shutdown diagnostics", async (kind) => {
    const f = await fixture();
    if (kind === "missing") { await expect(verifyRehearsalClose({ ...f.options, diagnostics: null })).rejects.toThrow("close proof failed"); return; }
    const run = f.diagnostics.runs[0]!;
    if (kind === "timer") run.activeTimers = 1;
    if (kind === "steer") run.pendingSteer = true;
    if (kind === "interrupt") run.pendingInterrupt = true;
    if (kind === "cleanup") run.cleanupSettled = false;
    if (kind === "start") f.diagnostics.totals.start = 3;
    if (kind === "dispose") run.calls.dispose = 0;
    if (kind === "duplicate") f.diagnostics.runs[1]!.runId = run.runId;
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
  });

  it.each(["missing-run", "running", "accepted-lost", "unknown-lost", "context-hash", "attachment-hash", "receipt-hash", "history-count"])("rejects %s retained history without altering it", async (kind) => {
    const f = await fixture(), run = f.snapshot.entries[0]!.run;
    if (kind === "missing-run") f.snapshot.entries.pop();
    if (kind === "running") {
      Object.assign(f.snapshot.entries[3]!.run, { state: "running", processState: "live", endedAt: null,
        terminalReason: null, cleanup: { status: "pending", observedAt: run.updatedAt, detail: "Still live" } });
    }
    if (kind === "accepted-lost") run.instructions = [];
    if (kind === "unknown-lost") f.snapshot.entries[2]!.run.instructions = [];
    if (kind === "context-hash") run.launchContext.submittedPrompt += "not captured";
    if (kind === "attachment-hash") run.launchContext.attachments[0]!.content += "not captured";
    if (kind === "receipt-hash") run.instructions[0]!.text += "not submitted";
    if (kind === "history-count") run.transcript.lastRecord--;
    await f.save(); const before = await readFile(f.path);
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
    expect(await readFile(f.path)).toEqual(before);
  });

  it("rejects missing or repeated expected driver identities", async () => {
    const f = await fixture();
    await expect(verifyRehearsalClose({ ...f.options, proof: {} })).rejects.toThrow("close proof failed");
    f.options.proof.runIds.activeAtClose = f.options.proof.runIds.first;
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
  });

  it("rejects permissive modes, symlink leaf and symlink ancestry without following them", async () => {
    const f = await fixture();
    await chmod(f.path, 0o644);
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
    await chmod(f.path, 0o600);
    const linked = `${f.path}.saved`; await writeFile(linked, await readFile(f.path), { mode: 0o600 });
    await unlink(f.path); await symlink(linked, f.path);
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
    const profileLink = `${f.profile}-link`; await symlink(f.profile, profileLink);
    await expect(verifyRehearsalClose({ ...f.options, profile: profileLink })).rejects.toThrow("close proof failed");
  });

  it("rejects a FIFO without blocking and an oversized sparse regular file before parsing", async () => {
    const f = await fixture(); await unlink(f.path);
    execFileSync("mkfifo", ["-m", "600", f.path]);
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
    await unlink(f.path);
    const file = await open(f.path, "wx", 0o600);
    await file.truncate(AGENT_LIMITS.storeBytes + 1); await file.close();
    await expect(verifyRehearsalClose(f.options)).rejects.toThrow("close proof failed");
  }, 1000);
});
