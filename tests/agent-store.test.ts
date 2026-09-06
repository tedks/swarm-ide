// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileRunStore, type FileRunStore, type FileRunStoreOptions } from "../core/agents/file-store";
import type { AgentOperation } from "../core/agents/adapter";
import { unavailableAgentSnapshot } from "../core/agents/unavailable";
import { AGENT_LIMITS, AgentSnapshotSchema, RunSchema, utf8Bytes, type InstructionReceipt, type PreparedAgentContext, type Run, type TranscriptRecord } from "../protocol/agents";

const roots: string[] = [];
const stores: FileRunStore[] = [];
const at = "2026-09-06T04:00:00.000Z";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const options = { now: () => Date.parse(at) };
function value<T>(result: AgentOperation<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
function draft(runId = randomUUID()): PreparedAgentContext {
  const prompt = "Explain the contract.";
  const digest = hash(prompt);
  return {
    runId, contextHash: digest, preparedAt: at, expiresAt: "2026-09-06T04:05:00.000Z",
    capabilities: unavailableAgentSnapshot().capabilities,
    launchContext: {
      worldId: "local", repositoryId: "repo", root: "/registered/repository", head: "a".repeat(40),
      workingFingerprint: "a".repeat(64),
      focus: { worldId: "local", revisionKind: "working", revisionId: "working", domain: "repo", key: "source:source.ts", path: "source.ts" },
      taskText: prompt, links: { parentRunId: null, task: null, spec: null }, requested: { model: null, effort: null },
      attachments: [{ path: "source.ts", content: "export {};", digest: hash("export {};"), startLine: 1, endLine: 1 }],
      instructionSources: [], configurationSources: [], submittedPrompt: prompt, contextHash: digest, diskOnly: true,
      access: { policy: "read-only", toolNetwork: false, approvals: "never", hostConfidentiality: false, sendsSelectedContentToProvider: true },
    },
  };
}
async function root() { const path = await mkdtemp(join(tmpdir(), "swarm-agent-store-")); roots.push(path); return path; }
async function openStore(path: string, extra: FileRunStoreOptions = {}) {
  const store = await createFileRunStore(path, { ...options, ...extra }); stores.push(store); return store;
}
async function fixture(extra: FileRunStoreOptions = {}) {
  const directory = join(await root(), "private");
  const store = await openStore(directory, extra);
  const context = draft(); value(await store.admit(context));
  return { directory, store, context, read: async () => value(await store.read(context.runId, 0)).run };
}
function running(run: Run): Run {
  return { ...run, state: "running", processState: "live", providerThreadId: "thread", providerTurnId: "turn", startedAt: at,
    cleanup: { status: "pending", observedAt: at, detail: "Owned process is active." } };
}
function completed(run: Run, exited = true): Run {
  return { ...run, state: "completed", endedAt: at, terminalReason: "Provider completed.",
    providerOutcome: { kind: "turn", threadId: "thread", turnId: "turn", status: "completed", observedAt: at },
    ...(exited ? { processState: "exited" as const, exitCode: 0, cleanup: { status: "confirmed" as const, observedAt: at, detail: "Owned descendants exited." } } : {}) };
}
function instruction(requestId = "instruction"): InstructionReceipt {
  return { requestId, expectedTurnId: "turn", text: "Explain the failure modes.", textHash: hash("Explain the failure modes."), status: "pending", submittedAt: at, settledAt: null, error: null };
}
function record(recordId = 1, text = "Visible commentary"): TranscriptRecord {
  return { recordId, timestamp: at, kind: "message", providerItemId: null, text };
}
async function snapshotFile(directory: string) { return JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8")); }
async function seed(directory: string, change: (data: any) => void) {
  const data = await snapshotFile(directory); change(data);
  await writeFile(join(directory, "snapshot.json"), JSON.stringify(data), { mode: 0o600 });
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("durable private agent store", () => {
  it("creates private, atomic storage and returns detached schema-valid reads", async () => {
    const f = await fixture();
    expect((await stat(f.directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(f.directory, "snapshot.json"))).mode & 0o777).toBe(0o600);
    expect(await readdir(f.directory)).toEqual(["snapshot.json"]);
    const first = await f.read(); expect(RunSchema.safeParse(first).success).toBe(true);
    first.launchContext.taskText = "mutated";
    expect((await f.read()).launchContext.taskText).toBe(f.context.launchContext.taskText);
    expect(AgentSnapshotSchema.safeParse(value(await f.store.snapshot())).success).toBe(true);
  });

  it("deduplicates concurrent admission before any execution and rejects changed context", async () => {
    const directory = join(await root(), "private"); const store = await openStore(directory); const context = draft();
    const results = (await Promise.all([store.admit(context), store.admit(context), store.admit(context)])).map(value);
    expect(results.map((r) => r.existing)).toEqual([false, true, true]);
    expect(results.every((r) => JSON.stringify(r.receipt) === JSON.stringify(results[0]!.receipt))).toBe(true);
    const changed = structuredClone(context); changed.launchContext.taskText = "Different source of intent";
    expect(await store.admit(changed)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await store.admit(draft())).toMatchObject({ ok: false, error: { code: "BUSY" } });
  });

  it("captures input before the serial queue and refuses invalid context hashes and expired drafts", async () => {
    const directory = join(await root(), "private"); const store = await openStore(directory);
    const invalid = draft(); invalid.launchContext.attachments[0]!.digest = "f".repeat(64);
    expect(await store.admit(invalid)).toMatchObject({ ok: false, error: { code: "STORAGE_UNAVAILABLE" } });
    const expired = draft(); expired.preparedAt = "2026-09-06T03:55:00.000Z"; expired.expiresAt = at;
    expect(await store.admit(expired)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    const context = draft(); const pending = store.admit(context); context.launchContext.taskText = "edited after call";
    value(await pending);
    expect(value(await store.read(context.runId, 0)).run.launchContext.taskText).toBe("Explain the contract.");
  });

  it("holds an exclusive kernel lifetime lock, releases it on close, and cleans failed initialization", async () => {
    const f = await fixture();
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow("could not be safely opened");
    expect((await f.store.snapshot()).ok).toBe(true);
    await f.store.close();
    const restarted = await openStore(f.directory);
    expect(value(await restarted.read(f.context.runId, 0)).run.state).toBe("unknown");
    await restarted.close();
    await writeFile(join(f.directory, "snapshot.json"), "invalid");
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow();
    await writeFile(join(f.directory, "snapshot.json"), JSON.stringify({ version: 1, entries: [] }));
    const repaired = await openStore(f.directory); expect(value(await repaired.snapshot()).runs).toEqual([]);
  });

  it("removes only private incomplete snapshots after taking the exclusive lock, preserving retained history", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    value(await f.store.update(completed(await f.read())));
    const before = await readFile(join(f.directory, "snapshot.json"), "utf8");
    const abandoned = `snapshot-${randomUUID()}.tmp`;
    await writeFile(join(f.directory, abandoned), "{truncated", { mode: 0o600 });
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow();
    expect(await readFile(join(f.directory, abandoned), "utf8")).toBe("{truncated");
    await f.store.close();
    await writeFile(join(f.directory, "snapshot-not-a-uuid.tmp"), "unrelated", { mode: 0o600 });
    const reopened = await openStore(f.directory);
    expect((await readdir(f.directory)).sort()).toEqual(["snapshot-not-a-uuid.tmp", "snapshot.json"]);
    expect(await readFile(join(f.directory, "snapshot.json"), "utf8")).toBe(before);
    expect(value(await reopened.read(f.context.runId, 0)).run.state).toBe("completed");
  });

  it.each(["symlink", "mode", "hardlink", "fifo"])("refuses suspicious %s temporary files without deleting them or history", async (kind) => {
    const f = await fixture(); await f.store.close();
    const history = join(f.directory, "snapshot.json"), before = await readFile(history, "utf8");
    const temporary = join(f.directory, `snapshot-${randomUUID()}.tmp`);
    if (kind === "symlink") await symlink(history, temporary);
    if (kind === "mode") await writeFile(temporary, "unexpected mode", { mode: 0o644 });
    if (kind === "hardlink") await link(history, temporary);
    if (kind === "fifo") execFileSync("mkfifo", ["-m", "600", temporary]);
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow();
    expect(await readdir(f.directory)).toContain(temporary.split("/").at(-1));
    expect(await readFile(history, "utf8")).toBe(before);
  });

  it("bounds recovery directory enumeration and does not partially prune when that bound is exceeded", async () => {
    const directory = join(await root(), "private"); const store = await openStore(directory); await store.close();
    const names = Array.from({ length: 128 }, () => `snapshot-${randomUUID()}.tmp`);
    await Promise.all(names.map((name) => writeFile(join(directory, name), "incomplete", { mode: 0o600 })));
    await expect(createFileRunStore(directory, options)).rejects.toThrow();
    expect(await readdir(directory)).toHaveLength(129);
    expect(await readFile(join(directory, "snapshot.json"), "utf8")).toBe(JSON.stringify({ version: 1, entries: [] }));
  });

  it("recovers active state and pending delivery as durable unknown without replay", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    value(await f.store.instruction(f.context.runId, instruction()));
    value(await f.store.append(f.context.runId, record()));
    await f.store.close(); const reopened = await openStore(f.directory);
    const history = value(await reopened.read(f.context.runId, 0));
    expect(history.run).toMatchObject({ state: "unknown", processState: "unknown", cleanup: { status: "unknown" }, transcript: { tailMayBeLost: true }, instructions: [{ status: "delivery-unknown" }] });
    expect(history.page.records).toHaveLength(1);
    expect(value(await reopened.admit(f.context)).existing).toBe(true);
    expect(await reopened.admit(draft())).toMatchObject({ ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN" } });
    expect(value(await reopened.instruction(f.context.runId, instruction())).status).toBe("delivery-unknown");
    expect((await snapshotFile(f.directory)).entries[0].run.state).toBe("unknown");
    expect(value(await reopened.snapshot())).toMatchObject({ activeRunId: null, tail: [] });
  });

  it("preserves a known terminal turn while making unconfirmed process lifetime unknown", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    const result = completed(await f.read(), false); value(await f.store.update(result));
    await f.store.close(); const store = await openStore(f.directory);
    const recovered = value(await store.read(f.context.runId, 0)).run;
    expect(recovered).toMatchObject({ state: "completed", providerOutcome: result.providerOutcome, processState: "unknown", cleanup: { status: "unknown" } });
  });

  it("preserves observed direct exit but recovers pending descendant cleanup as unknown", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    const result = { ...completed(await f.read(), false), processState: "exited" as const, exitCode: 0 };
    value(await f.store.update(result)); await f.store.close(); const store = await openStore(f.directory);
    expect(value(await store.read(f.context.runId, 0)).run).toMatchObject({ state: "completed", processState: "exited", exitCode: 0, cleanup: { status: "unknown" } });
    expect(await store.admit(draft())).toMatchObject({ ok: false, error: { code: "AGENT_OUTCOME_UNKNOWN" } });
  });

  it("does not regress immutable launch, identity, terminal outcome, receipt or transcript facts", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    const current = await f.read();
    for (const changed of [
      { ...current, launchContext: { ...current.launchContext, taskText: "changed" } },
      { ...current, providerTurnId: "different-turn" },
      { ...current, state: "starting" },
      { ...current, transcript: { ...current.transcript, lastRecord: 42 } },
      { ...current, instructions: [instruction()] },
    ]) expect((await f.store.update(changed as Run)).ok).toBe(false);
    value(await f.store.update(completed(current)));
    expect((await f.store.update(current)).ok).toBe(false);
    const finished = await f.read();
    expect((await f.store.update({ ...finished, terminalReason: "rewritten" })).ok).toBe(false);
    expect((await f.store.update({ ...finished, processState: "live", exitCode: null, cleanup: current.cleanup })).ok).toBe(false);
    value(await f.store.admit(draft()));
  });

  it("persists instruction intent, deduplicates payloads and never rewrites settled evidence", async () => {
    const f = await fixture();
    expect(await f.store.instruction(f.context.runId, instruction())).toMatchObject({ ok: false, error: { code: "RUN_NOT_ACTIVE" } });
    value(await f.store.update(running(await f.read())));
    const receipt = instruction(); value(await f.store.instruction(f.context.runId, receipt));
    expect((await snapshotFile(f.directory)).entries[0].run.instructions[0].status).toBe("pending");
    expect(await f.store.instruction(f.context.runId, instruction("second"))).toMatchObject({ ok: false, error: { code: "BUSY" } });
    expect(await f.store.instruction(f.context.runId, { ...receipt, text: "changed", textHash: hash("changed") })).toMatchObject({ ok: false, error: { code: "STALE_TURN" } });
    const accepted = { ...receipt, status: "accepted" as const, settledAt: at };
    value(await f.store.instruction(f.context.runId, accepted));
    expect(value(await f.store.instruction(f.context.runId, receipt))).toEqual(accepted);
    expect((await f.store.instruction(f.context.runId, { ...accepted, status: "delivery-unknown" })).ok).toBe(false);
    expect(await f.store.instruction(f.context.runId, { ...instruction("stale"), expectedTurnId: "old" })).toMatchObject({ ok: false, error: { code: "STALE_TURN" } });
    expect((await f.store.instruction(f.context.runId, { ...accepted, requestId: "never-admitted" })).ok).toBe(false);
  });

  it("atomically settles pending delivery as unknown with a terminal transition and monotonic loss flags", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    value(await f.store.instruction(f.context.runId, instruction()));
    const run = await f.read();
    const unknown: Run = { ...run, state: "unknown", endedAt: at, terminalReason: "Core replacement.",
      transcript: { ...run.transcript, truncated: true, tailMayBeLost: true },
      instructions: run.instructions.map((receipt) => ({ ...receipt, status: "delivery-unknown", settledAt: at,
        error: { code: "AGENT_OUTCOME_UNKNOWN", message: "Delivery is unknown; no replay." } })),
    };
    value(await f.store.update(unknown));
    expect((await snapshotFile(f.directory)).entries[0].run).toMatchObject({ state: "unknown", instructions: [{ status: "delivery-unknown" }] });
    expect((await f.store.update({ ...unknown, transcript: { ...unknown.transcript, truncated: false } })).ok).toBe(false);
    expect((await f.store.update({ ...unknown, instructions: [] })).ok).toBe(false);
    expect((await f.store.update({ ...unknown, instructions: [{ ...unknown.instructions[0]!, status: "accepted", error: null }] })).ok).toBe(false);
  });

  it("bounds retained instruction receipts instead of evicting deduplication evidence", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    for (let i = 0; i < AGENT_LIMITS.receipts; i++) {
      const receipt = instruction(`request-${i}`);
      value(await f.store.instruction(f.context.runId, receipt));
      value(await f.store.instruction(f.context.runId, { ...receipt, status: "accepted", settledAt: at }));
    }
    expect(await f.store.instruction(f.context.runId, instruction("over-limit"))).toMatchObject({ ok: false, error: { code: "INSTRUCTION_LIMIT" } });
    expect(value(await f.store.instruction(f.context.runId, instruction("request-0"))).status).toBe("accepted");
    expect((await f.read()).instructions).toHaveLength(AGENT_LIMITS.receipts);
  });

  it("keeps reserved final transcript space after normal output hits quota", async () => {
    const f = await fixture(); value(await f.store.update(running(await f.read())));
    value(await f.store.update(completed(await f.read()))); await f.store.close();
    await seed(f.directory, (data) => {
      const entry = data.entries[0];
      // Seed schema-valid retained history to avoid quadratic disk churn in the
      // quota test. Each record still fits the normal public read-page bound.
      entry.records = Array.from({ length: 123 }, (_, i) => record(i + 1, "x".repeat(AGENT_LIMITS.recordBytes)));
      entry.run.transcript.lastRecord = entry.records.length;
      entry.run.transcript.bytes = utf8Bytes(JSON.stringify(entry.records));
    });
    const store = await openStore(f.directory);
    expect(await store.append(f.context.runId, record(124, "x".repeat(AGENT_LIMITS.recordBytes)))).toMatchObject({ ok: false, error: { code: "OUTPUT_LIMIT" } });
    value(await store.append(f.context.runId, { ...record(124, "Output interrupted at the bounded transcript quota."), kind: "gap" }));
    expect(value(await store.read(f.context.runId, 123)).page).toMatchObject({ truncated: true, nextCursor: 124 });
  });

  it("bounds UTF-8 pages and tails, preserves explicit gaps, and rejects invalid cursors/records", async () => {
    const f = await fixture();
    for (let i = 1; i <= 35; i++) value(await f.store.append(f.context.runId, record(i, "λ".repeat(8192))));
    const snapshot = value(await f.store.snapshot());
    expect(snapshot.tail.length).toBeLessThanOrEqual(32);
    expect(snapshot.tail.at(-1)!.recordId).toBe(35);
    expect(utf8Bytes(JSON.stringify(snapshot.tail))).toBeLessThanOrEqual(AGENT_LIMITS.tailBytes);
    const first = value(await f.store.read(f.context.runId, 0));
    expect(first.page.nextCursor).toBeGreaterThan(0); expect(first.page.nextCursor).toBeLessThan(35);
    expect(utf8Bytes(JSON.stringify(first.page.records))).toBeLessThanOrEqual(AGENT_LIMITS.pageBytes);
    const second = value(await f.store.read(f.context.runId, first.page.nextCursor));
    expect(second.page.records[0]!.recordId).toBe(first.page.nextCursor + 1);
    value(await f.store.append(f.context.runId, { ...record(36), kind: "gap" }));
    expect(value(await f.store.read(f.context.runId, 36)).page).toEqual({ records: [], nextCursor: 36, truncated: true });
    expect(value(await f.store.append(f.context.runId, { ...record(36), kind: "gap" })).nextCursor).toBe(36);
    expect((await f.store.append(f.context.runId, record(36, "changed"))).ok).toBe(false);
    for (const cursor of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 37, NaN]) expect(await f.store.read(f.context.runId, cursor)).toMatchObject({ ok: false, error: { code: "INVALID_CURSOR" } });
    expect(await f.store.append(f.context.runId, record(38))).toMatchObject({ ok: false, error: { code: "INVALID_CURSOR" } });
    expect(await f.store.append(f.context.runId, record(37, "\u0000".repeat(AGENT_LIMITS.recordBytes)))).toMatchObject({ ok: false, error: { code: "OUTPUT_LIMIT" } });
  });

  it("refuses admission at history quota without silently deleting earlier runs", async () => {
    const directory = join(await root(), "private"); const store = await openStore(directory);
    for (let i = 0; i < AGENT_LIMITS.history; i++) {
      const context = draft(); value(await store.admit(context));
      const run = value(await store.read(context.runId, 0)).run;
      value(await store.update({ ...run, state: "cancelling" }));
      value(await store.update({ ...run, state: "cancelled", endedAt: at, terminalReason: "Dispatch prevented.", providerOutcome: { kind: "dispatch-prevented", observedAt: at } }));
    }
    expect(await store.admit(draft())).toMatchObject({ ok: false, error: { code: "STORAGE_FULL" } });
    expect(value(await store.snapshot()).runs).toHaveLength(20);
  });

  it.each(["write", "rename"] as const)("fails %s atomically, classifies disk-full, and leaves old history readable", async (phase) => {
    let fail = false;
    const f = await fixture({ beforePersist: (current) => { if (fail && current === phase) throw Object.assign(new Error("private filesystem path"), { code: "ENOSPC" }); } });
    const before = await readFile(join(f.directory, "snapshot.json"), "utf8");
    fail = true;
    expect(await f.store.append(f.context.runId, record())).toEqual({ ok: false, error: { code: "STORAGE_FULL", message: "Agent history storage is full; no history was removed." } });
    expect(await readFile(join(f.directory, "snapshot.json"), "utf8")).toBe(before);
    expect((await f.read()).transcript.lastRecord).toBe(0);
    expect(await readdir(f.directory)).toEqual(["snapshot.json"]);
    fail = false; value(await f.store.append(f.context.runId, record()));
  });

  it("poisons uncertain post-rename commits so a failed acknowledgement never authorizes further work", async () => {
    let fail = false;
    const directory = join(await root(), "private");
    const store = await openStore(directory, { beforePersist: (phase) => { if (fail && phase === "directory-sync") throw new Error("fsync failed"); } });
    const context = draft(); fail = true;
    expect(await store.admit(context)).toMatchObject({ ok: false, error: { code: "STORAGE_UNAVAILABLE" } });
    expect((await store.snapshot()).ok).toBe(false); expect((await store.admit(context)).ok).toBe(false);
    await store.close(); const recovered = await openStore(directory);
    expect(value(await recovered.admit(context)).existing).toBe(true);
    expect(value(await recovered.read(context.runId, 0)).run.state).toBe("unknown");
  });

  it("rejects path replacement without writing into a replacement directory or snapshot", async () => {
    const f = await fixture();
    const original = join(f.directory, "snapshot.json"); const before = await readFile(original, "utf8");
    const replacement = join(f.directory, "replacement.json"); await writeFile(replacement, before, { mode: 0o600 }); await rename(replacement, original);
    expect((await f.store.append(f.context.runId, record())).ok).toBe(false);
    expect(await readFile(original, "utf8")).toBe(before);
    await rename(f.directory, `${f.directory}-moved`); await mkdir(f.directory, { mode: 0o700 });
    expect((await f.store.append(f.context.runId, record())).ok).toBe(false);
    expect(await readdir(f.directory)).toEqual([]);
  });

  it("refuses symlinked or nonprivate directories and storage inside a repo", async () => {
    const base = await root(); const privateDir = join(base, "private"); await mkdir(privateDir, { mode: 0o700 });
    const alias = join(base, "alias"); await symlink(privateDir, alias);
    await expect(createFileRunStore(alias)).rejects.toThrow();
    await expect(createFileRunStore(join(alias, "child"))).rejects.toThrow();
    await chmod(privateDir, 0o755); await expect(createFileRunStore(privateDir)).rejects.toThrow();
    const repo = join(base, "repo"); await mkdir(join(repo, ".git"), { recursive: true });
    await expect(createFileRunStore(join(repo, "private"))).rejects.toThrow();
    const store = await openStore(join(base, "valid")); const context = draft(); context.launchContext.root = base;
    expect(await store.admit(context)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it.each(["symlink", "hardlink", "fifo", "public", "oversize", "utf8", "json"])("rejects unsafe %s snapshots without following, blocking, or destructive repair", async (kind) => {
    const directory = join(await root(), "private"); const store = await openStore(directory); await store.close();
    const path = join(directory, "snapshot.json"); const target = join(directory, "original.json"); await rename(path, target);
    if (kind === "symlink") await symlink(target, path);
    if (kind === "hardlink") await link(target, path);
    if (kind === "fifo") execFileSync("mkfifo", ["-m", "600", path]);
    if (kind === "public") await writeFile(path, "{}", { mode: 0o644 });
    if (kind === "oversize") { await writeFile(path, "", { mode: 0o600 }); await truncate(path, AGENT_LIMITS.storeBytes + 1); }
    if (kind === "utf8") await writeFile(path, Buffer.from([0xff]), { mode: 0o600 });
    if (kind === "json") await writeFile(path, "{", { mode: 0o600 });
    await expect(createFileRunStore(directory)).rejects.toThrow("could not be safely opened");
    expect(await readFile(target, "utf8")).toBe(JSON.stringify({ version: 1, entries: [] }));
  });

  it.each(["duplicate", "receipt", "hash", "records", "bytes", "extra", "instruction-turn", "instruction-time"])("validates cross-record %s invariants on reload", async (kind) => {
    const f = await fixture(); await f.store.close();
    await seed(f.directory, (data) => {
      const entry = data.entries[0];
      if (kind === "duplicate") data.entries.push(entry);
      if (kind === "receipt") entry.receipt.runId = randomUUID();
      if (kind === "hash") entry.run.launchContext.submittedPrompt = "tampered";
      if (kind === "records") { entry.records = [record(2)]; entry.run.transcript.lastRecord = 2; entry.run.transcript.bytes = utf8Bytes(JSON.stringify(entry.records)); }
      if (kind === "bytes") entry.run.transcript.bytes = 1;
      if (kind === "extra") data.privateExtension = true;
      if (kind === "instruction-turn" || kind === "instruction-time") {
        entry.run = running(entry.run);
        entry.run.instructions = [{ ...instruction(),
          ...(kind === "instruction-turn" ? { expectedTurnId: "wrong-turn" } : { submittedAt: "2026-09-06T04:00:01.000Z" }),
        }];
      }
    });
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow();
  });

  it("drains accepted persistence before close and refuses new work after closing", async () => {
    const f = await fixture(); const append = f.store.append(f.context.runId, record()); const close = f.store.close();
    expect((await f.store.snapshot()).ok).toBe(false); value(await append); await close;
    const store = await openStore(f.directory); expect(value(await store.read(f.context.runId, 0)).page.records).toHaveLength(1);
  });

  it.each(["records", "instructions", "sources"])("rejects hostile %s arrays without aggregating per-element validation failures", async (kind) => {
    const f = await fixture(); await f.store.close();
    await seed(f.directory, (data) => {
      const many = Array.from({ length: 100_000 }, () => ({}));
      if (kind === "records") data.entries[0].records = many;
      if (kind === "instructions") data.entries[0].run.instructions = many;
      if (kind === "sources") data.entries[0].run.launchContext.instructionSources = many;
    });
    await expect(createFileRunStore(f.directory, options)).rejects.toThrow();
  });
});
