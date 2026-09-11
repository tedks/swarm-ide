// @vitest-environment node
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkLogService } from "../core/work-log/service";
import { cleanWorkText, observeWork, readWorkCompletions, readWorkInputs, type WorkInput } from "../core/work-log/transcripts";
import { recordWorkOutcome, runWorkCommand, withWorkLock } from "../core/work-log/commands";
import * as workCommands from "../core/work-log/commands";
import { WorkLogEntrySchema, WorkLogSettingsSchema, type WorkLogRequest } from "../protocol/work-log";
import { PROTOCOL_VERSION, CoreRequestSchema } from "../protocol/schema";

const roots: string[] = [], services: WorkLogService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map((s) => s.dispose())); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "swarm-work-log-test.")); roots.push(dir);
  const root = join(dir, "repo"); await mkdir(root); execFileSync("git", ["init", "-q", root]);
  return { root, dir };
}
const request = (type: WorkLogRequest["type"], extra = {}) => CoreRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID(), type, ...extra }) as WorkLogRequest;
const read = request("workLog.read");
const settings = WorkLogSettingsSchema.parse({ debounceSeconds: 10 });
const input = (): Extract<WorkInput, { origin: "terminal" }> => ({ origin: "terminal", sessionId: "a", agent: "Worker A", taskId: "task-a", boundary: `turn:${Date.now()}`, at: new Date().toISOString(), text: "Implemented parser; focused tests pass.", state: "completed" });
const milestone = (boundary = `milestone:${Date.now()}`): WorkInput => {
  const { state: _state, ...base } = input(); return { ...base, origin: "milestone", boundary };
};
const summary = { outcome: "Implemented parser.", areas: ["core/parser.ts"], checks: ["Focused tests reported passing"], followUps: [] };

describe("online Work Log", () => {
  it("starts from core activation without a read or Start and preserves Pause across restart", async () => {
    const f = await fixture(), row = input(), summarize = vi.fn(async () => [summary]);
    const deps = { inputs: async () => [row], summarize };
    const first = new WorkLogService(f.root, undefined, deps); services.push(first);
    first.activate(); first.activate();
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect((await first.request(read)).entries).toHaveLength(1));
    await first.request(request("workLog.stop")); await first.dispose();
    const next = new WorkLogService(f.root, undefined, deps); services.push(next); next.activate();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await next.request(read)).running).toBe(false); expect(summarize).toHaveBeenCalledTimes(1);
    await next.request(request("workLog.start", { settings })); await next.dispose();
    const resumed = new WorkLogService(f.root, undefined, deps); services.push(resumed); resumed.activate();
    await vi.waitFor(async () => expect((await resumed.request(read)).running).toBe(true));
    expect((await resumed.request(read)).settings).toEqual(settings);
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("automatically watches idle input without calling the model or writing Ditz", async () => {
    const f = await fixture(), inputs = vi.fn(async () => []), summarize = vi.fn(async () => [summary]);
    const record = vi.spyOn(workCommands, "recordWorkOutcome");
    const service = new WorkLogService(f.root, undefined, { inputs, summarize }); services.push(service);
    service.activate();
    await vi.waitFor(() => expect(inputs).toHaveBeenCalledTimes(1));
    expect(summarize).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
    expect((await service.request(read)).running).toBe(true);
    await service.dispose(); expect((service as unknown as { timer?: unknown }).timer).toBeUndefined();
  });
  it("two activated windows admit a completed turn once and observe saved Pause", async () => {
    const f = await fixture(), row = input(), summarize = vi.fn(async () => [summary]);
    const deps = { inputs: async () => [row], summarize };
    const a = new WorkLogService(f.root, undefined, deps), b = new WorkLogService(f.root, undefined, deps); services.push(a, b);
    a.activate(); b.activate();
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect((await a.request(read)).summarizing).toBe(false));
    await a.request(request("workLog.stop"));
    await vi.waitFor(async () => expect((await b.request(read)).running).toBe(false), { timeout: 5000 });
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("a Pause from another window prevents admission after a held input read", async () => {
    const f = await fixture(); let release!: (rows: WorkInput[]) => void;
    const summarize = vi.fn(async () => [summary]);
    const deps = { inputs: () => new Promise<WorkInput[]>((resolve) => { release = resolve; }), summarize };
    const a = new WorkLogService(f.root, undefined, deps), b = new WorkLogService(f.root, undefined, deps); services.push(a, b);
    await a.request(read); b.activate();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await a.request(request("workLog.stop")); release([input()]);
    await vi.waitFor(async () => expect((await b.request(read)).running).toBe(false));
    expect(summarize).not.toHaveBeenCalled();
  });
  it("a Pause from another window wins before a held summary can publish", async () => {
    const f = await fixture(); let release!: () => void;
    const summarize = vi.fn((_rows: WorkInput[], _settings: typeof settings, signal: AbortSignal) => new Promise<typeof summary[]>((resolve) => {
      release = () => resolve([summary]); signal.addEventListener("abort", release, { once: true });
    }));
    const deps = { inputs: async () => [input()], summarize };
    const reader = new WorkLogService(f.root, undefined, deps), producer = new WorkLogService(f.root, undefined, deps); services.push(reader, producer);
    await reader.request(read); await producer.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await reader.request(request("workLog.stop")); release();
    await vi.waitFor(async () => expect((await producer.request(read)).summarizing).toBe(false));
    expect((await producer.request(read)).entries).toHaveLength(0); expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("disposal during the post-summary preference read prevents late publication", async () => {
    const f = await fixture(); let release!: (paused: boolean) => void;
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize: async () => {
      vi.spyOn(service as unknown as { isPaused(): Promise<boolean> }, "isPaused").mockImplementationOnce(() => new Promise<boolean>((resolve) => { release = resolve; }));
      return [summary];
    } }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const closing = service.dispose(); release(false); await closing;
    await expect(readFile(join(f.root, ".swarm/work-log.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("keeps a saved ten-minute batch delay and prevents a background read overlapping publication", async () => {
    const f = await fixture(), summarize = vi.fn(async () => [summary]);
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize }); services.push(service);
    await service.request(request("workLog.start", { settings: { ...settings, debounceSeconds: 600 } }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
    const internal = service as unknown as { timer?: { _idleTimeout: number }; loadDocument(): Promise<void> };
    expect(internal.timer?._idleTimeout).toBe(600000);
    await service.request(request("workLog.stop"));
    let release!: () => void;
    const held = withWorkLock(join(f.root, ".git/swarm-work-log/producer.lock"), () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const documentRead = vi.spyOn(internal, "loadDocument"); service.activate();
    await vi.waitFor(async () => expect((await service.request(read)).notice).toContain("another window"));
    expect(documentRead).not.toHaveBeenCalled(); release(); await held;
  });
  it("automatic stop drains an in-flight controlled summary and startup never replaces malformed preferences", async () => {
    const f = await fixture(); let signal!: AbortSignal;
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize: (_rows, _settings, abort) => {
      signal = abort; return new Promise((resolve) => abort.addEventListener("abort", () => resolve([summary]), { once: true }));
    } }); services.push(service); service.activate();
    await vi.waitFor(() => expect(signal).toBeDefined()); await service.dispose(); expect(signal.aborted).toBe(true);
    await expect(readFile(join(f.root, ".swarm/work-log.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const path = join(f.root, ".git/swarm-work-log/watcher.json"); await writeFile(path, "broken settings");
    const summarize = vi.fn(async () => [summary]);
    const next = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize }); services.push(next); next.activate();
    await vi.waitFor(async () => expect((await next.request(read)).notice).toContain("not replaced"));
    expect(await readFile(path, "utf8")).toBe("broken settings"); expect(summarize).not.toHaveBeenCalled();
    await expect(next.request(request("workLog.start", { settings }))).rejects.toThrow("not replaced");
  });
  it("reads without model calls, runs explicitly, persists and never replays an unchanged turn", async () => {
    const f = await fixture(), row = input(), summarize = vi.fn(async () => [summary]);
    const deps = { inputs: async () => [row], summarize };
    const service = new WorkLogService(f.root, undefined, deps); services.push(service);
    expect((await service.request(read)).running).toBe(false); expect(summarize).not.toHaveBeenCalled();
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
    expect((await service.request(read)).entries[0]).toMatchObject({ state: "completed", recorded: false });
    await service.request(request("workLog.stop"));
    expect(JSON.parse(await readFile(join(f.root, ".swarm/work-log.json"), "utf8")).entries[0].outcome).toBe(summary.outcome);
    await service.dispose();
    const next = new WorkLogService(f.root, undefined, deps); services.push(next);
    expect((await next.request(read)).entries).toHaveLength(1);
    await next.request(request("workLog.start", { settings }));
    await new Promise((r) => setTimeout(r, 60));
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("publishes successive ongoing milestones and one later terminal without alternating checkpoints", async () => {
    const f = await fixture(); let observed = [milestone("m:first")], now = Date.now();
    const summarize = vi.fn(async (batch: WorkInput[]) => batch.map((row) => ({ ...summary, outcome: `${row.origin}:${row.boundary}` })));
    const inputs = vi.fn(async (_root: string, _registry?: string, checkpoints = {}, legacySeen = {}) => {
      expect(checkpoints).toBeTypeOf("object"); expect(legacySeen).toBeTypeOf("object"); return observed;
    });
    const deps = { inputs, summarize, now: () => now };
    const service = new WorkLogService(f.root, undefined, deps); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(inputs).toHaveBeenCalled()); expect(summarize).not.toHaveBeenCalled();
    now += 10_000; await (service as unknown as { tick(): Promise<void> }).tick();
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
    expect((await service.request(read)).entries[0]).toMatchObject({ origin: "milestone", state: "working", outcome: "milestone:m:first" });

    observed = [milestone("m:second")];
    await (service as unknown as { tick(): Promise<void> }).tick(); expect(summarize).toHaveBeenCalledTimes(1);
    now += 10_000;
    await (service as unknown as { tick(): Promise<void> }).tick();
    expect((await service.request(read)).entries.map((entry) => [entry.origin, entry.state, entry.outcome])).toEqual([
      ["milestone", "working", "milestone:m:second"], ["milestone", "working", "milestone:m:first"],
    ]);

    observed = [{ ...input(), boundary: "turn:done" }];
    await (service as unknown as { tick(): Promise<void> }).tick();
    expect((await service.request(read)).entries.map((entry) => [entry.origin, entry.state])).toEqual([
      ["terminal", "completed"], ["milestone", "working"], ["milestone", "working"],
    ]);
    await service.request(request("workLog.stop")); await service.dispose();

    const restarted = new WorkLogService(f.root, undefined, deps); services.push(restarted);
    await restarted.request(request("workLog.start", { settings })); await new Promise((resolve) => setTimeout(resolve, 60));
    expect(summarize).toHaveBeenCalledTimes(3);
  });
  it("does not replay a failed milestone attempt but admits genuinely newer evidence", async () => {
    const f = await fixture(); let observed = [milestone("m:failed")], now = Date.now();
    const summarize = vi.fn(async () => { throw new Error("Provider unavailable"); });
    const inputs = vi.fn(async () => observed);
    const service = new WorkLogService(f.root, undefined, { inputs, summarize, now: () => now }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(inputs).toHaveBeenCalled());
    now += 10_000; await (service as unknown as { tick(): Promise<void> }).tick();
    await vi.waitFor(async () => expect((await service.request(read)).notice).toBe("Provider unavailable"));
    await (service as unknown as { tick(): Promise<void> }).tick(); expect(summarize).toHaveBeenCalledTimes(1);
    observed = [milestone("m:new")];
    await (service as unknown as { tick(): Promise<void> }).tick(); expect(summarize).toHaveBeenCalledTimes(1);
    now += 10_000; await (service as unknown as { tick(): Promise<void> }).tick(); expect(summarize).toHaveBeenCalledTimes(2);
  });
  it("persists a pending milestone batching window across restart", async () => {
    const f = await fixture(); let now = Date.now(); const inputs = vi.fn(async () => [milestone("m:pending")]);
    const summarize = vi.fn(async () => [summary]), deps = { inputs, summarize, now: () => now };
    const first = new WorkLogService(f.root, undefined, deps); services.push(first);
    await first.request(request("workLog.start", { settings })); await vi.waitFor(() => expect(inputs).toHaveBeenCalled());
    expect(summarize).not.toHaveBeenCalled(); await first.dispose();
    now += 10_000;
    const restarted = new WorkLogService(f.root, undefined, deps); services.push(restarted);
    await restarted.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await restarted.request(read)).entries).toHaveLength(1));
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("stop aborts in-flight summary and prevents late publication", async () => {
    const f = await fixture(); let aborted = false;
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize: (_input, _settings, signal) => new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve([summary]); })) }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).summarizing).toBe(true));
    await service.request(request("workLog.stop")); expect(aborted).toBe(true);
    expect((await service.request(read)).entries).toHaveLength(0);
  });
  it("settings replacement drains the old summary and cannot publish its stale output", async () => {
    const f = await fixture(), row = input(); let signal!: AbortSignal;
    const summarize = vi.fn((_rows: WorkInput[], _settings: typeof settings, abort: AbortSignal) => {
      signal = abort; return new Promise<typeof summary[]>((resolve) => abort.addEventListener("abort", () => resolve([summary]), { once: true }));
    });
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [row], summarize }); services.push(service);
    await service.request(request("workLog.start", { settings })); await vi.waitFor(() => expect(signal).toBeDefined());
    const changed = { ...settings, model: "gpt-5.6-luna-next" };
    const snapshot = await service.request(request("workLog.start", { settings: changed }));
    expect(signal.aborted).toBe(true); expect(snapshot.settings).toEqual(changed); expect(snapshot.entries).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 60)); expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("two windows preserve attempted boundaries and both published outcomes", async () => {
    const f = await fixture(); let row = input();
    const summarize = vi.fn(async () => [summary]), deps = { inputs: async () => [row], summarize };
    const a = new WorkLogService(f.root, undefined, deps), b = new WorkLogService(f.root, undefined, deps); services.push(a, b);
    await a.request(read); await b.request(read);
    await a.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await a.request(read)).entries).toHaveLength(1));
    await a.request(request("workLog.stop"));
    await b.request(request("workLog.start", { settings })); await new Promise((r) => setTimeout(r, 60));
    expect(summarize).toHaveBeenCalledTimes(1);
    await b.request(request("workLog.stop")); row = { ...row, boundary: "next-turn" };
    await b.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await b.request(read)).entries).toHaveLength(2));
    expect(JSON.parse(await readFile(join(f.root, ".swarm/work-log.json"), "utf8")).entries).toHaveLength(2);
    expect((await b.request(read)).entries.map((entry) => entry.state)).toEqual(["completed", "completed"]);
  });
  it("retains explicit failed completion independently of recording", async () => {
    const f = await fixture(), row = { ...input(), state: "failed" as const };
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [row], summarize: async () => [summary] }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
    await service.request(request("workLog.stop"));
    const entry = (await service.request(read)).entries[0];
    const record = vi.spyOn(workCommands, "recordWorkOutcome").mockResolvedValue(undefined);
    const recorded = await service.request(request("workLog.record", { entryId: entry.id, taskId: "task-a" }));
    expect(record).toHaveBeenCalledTimes(1);
    expect(recorded.entries[0]).toEqual({ ...entry, recorded: true });
  });
  it("bounds generated entry identities for maximum-length registered sessions", async () => {
    const f = await fixture(), row = { ...input(), sessionId: "s".repeat(160), boundary: "b".repeat(160) };
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [row], summarize: async () => [summary] }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
    expect((await service.request(read)).entries[0].id.length).toBeLessThanOrEqual(160);
  });
  it("repairs exact legacy completions while stopped without changing outcomes, recording or attempts", async () => {
    const f = await fixture(), at = new Date().toISOString();
    const base = { sessionId: "a", agent: "Worker", taskId: "task-a", at, state: "working", recorded: false, ...summary, outcome: "  Original outcome\nwith spacing.  " };
    const entries = [
      { ...base, id: `a:seen:${at}` },
      { ...base, id: `a:older:${at}`, recorded: true },
      { ...base, id: `a:failed:${at}` },
      { ...base, id: `other:seen:${at}`, sessionId: "other" },
      { ...base, id: `a:unknown:${at}` },
      { ...base, id: `a:mismatch:${at}`, at: "2020-01-01T00:00:00.000Z" },
    ];
    await mkdir(join(f.root, ".swarm")); await writeFile(join(f.root, ".swarm/work-log.json"), JSON.stringify({ version: 1, entries }));
    await mkdir(join(f.root, ".git/swarm-work-log"));
    const state = JSON.stringify({ version: 1, settings, seen: { a: `seen:${at}` } });
    await writeFile(join(f.root, ".git/swarm-work-log/state.json"), state);
    const summarize = vi.fn(async () => [summary]), inputs = vi.fn(async () => []);
    const completions = vi.fn(async () => [
      { sessionId: "a", boundary: `older:${at}`, at, state: "completed" as const },
      { sessionId: "a", boundary: `failed:${at}`, at, state: "failed" as const },
      { sessionId: "a", boundary: `mismatch:${at}`, at, state: "completed" as const },
    ]);
    const service = new WorkLogService(f.root, undefined, { inputs, completions, summarize }); services.push(service);
    const snapshot = await service.request(read);
    expect(snapshot.running).toBe(false);
    expect(snapshot.entries).toEqual(entries.map((entry, index) => ({ ...entry, state: index === 0 ? "unknown" : index === 1 ? "completed" : index === 2 ? "failed" : "working" })));
    expect(JSON.parse(await readFile(join(f.root, ".swarm/work-log.json"), "utf8")).entries).toEqual(snapshot.entries);
    expect(await readFile(join(f.root, ".git/swarm-work-log/state.json"), "utf8")).toBe(state);
    await service.request(read);
    expect(completions).toHaveBeenCalledTimes(1); expect(inputs).not.toHaveBeenCalled(); expect(summarize).not.toHaveBeenCalled();
  });
  it("preserves explicit ongoing milestone provenance during restart repair", async () => {
    const f = await fixture(), at = new Date().toISOString();
    const milestoneEntry = { id: "milestone-entry", origin: "milestone", sessionId: "a", agent: "Worker", taskId: "task-a", at,
      state: "working", recorded: true, ...summary };
    await mkdir(join(f.root, ".swarm")); await writeFile(join(f.root, ".swarm/work-log.json"), JSON.stringify({ version: 1, entries: [milestoneEntry] }));
    const completions = vi.fn(async () => [{ sessionId: "a", boundary: "anything", at, state: "completed" as const }]);
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [], completions, summarize: async () => [summary] }); services.push(service);
    expect((await service.request(read)).entries).toEqual([milestoneEntry]);
    expect(completions).not.toHaveBeenCalled();
  });
  it("defers legacy repair behind another producer and preserves its newer document", async () => {
    const f = await fixture(), at = new Date().toISOString();
    const entry = { id: `a:old:${at}`, sessionId: "a", agent: "Worker", taskId: "task-a", at, state: "working", recorded: false, ...summary };
    await mkdir(join(f.root, ".swarm")); await writeFile(join(f.root, ".swarm/work-log.json"), JSON.stringify({ version: 1, entries: [entry] }));
    let release!: () => void;
    const held = withWorkLock(join(f.root, ".git/swarm-work-log/producer.lock"), () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const summarize = vi.fn(async () => [summary]);
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [], completions: async () => [{ sessionId: "a", boundary: `old:${at}`, at, state: "completed" as const }], summarize }); services.push(service);
    expect((await service.request(read)).entries).toEqual([entry]);
    const newer = { ...entry, id: "newer", state: "completed", recorded: true };
    await writeFile(join(f.root, ".swarm/work-log.json"), JSON.stringify({ version: 1, entries: [newer, { ...entry, recorded: true }] }));
    release(); await held;
    expect((await service.request(read)).entries).toEqual([newer, { ...entry, recorded: true, state: "completed" }]);
    expect(summarize).not.toHaveBeenCalled();
  });
  it("keeps fifth and later fresh boundaries eligible for the next batch", async () => {
    const f = await fixture(); const rows = Array.from({ length: 5 }, (_, index) => ({ ...input(), sessionId: String(index) }));
    const summarize = vi.fn(async (batch: WorkInput[]) => batch.map(() => summary));
    const service = new WorkLogService(f.root, undefined, { inputs: async () => rows, summarize }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(4));
    await service.request(request("workLog.stop")); await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(5));
    expect(summarize.mock.calls.map((call) => call[0].length)).toEqual([4, 1]);
  });
  it("drains milestone batch overflow without losing per-session checkpoints", async () => {
    const f = await fixture(); let now = Date.now(); const rows = Array.from({ length: 5 }, (_, index) => ({ ...milestone(`m:${index}`), sessionId: String(index), at: new Date(now + index).toISOString() }));
    const summarize = vi.fn(async (batch: WorkInput[]) => batch.map(() => summary));
    const inputs = vi.fn(async () => rows);
    const service = new WorkLogService(f.root, undefined, { inputs, summarize, now: () => now }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(inputs).toHaveBeenCalled()); expect(summarize).not.toHaveBeenCalled();
    now += 10_000; await (service as unknown as { tick(): Promise<void> }).tick();
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(4));
    await (service as unknown as { tick(): Promise<void> }).tick();
    expect((await service.request(read)).entries).toHaveLength(5);
    expect(summarize.mock.calls.map((call) => call[0].length)).toEqual([4, 1]);
  });
  it("records failed attempts before inference and does not pay again on restart", async () => {
    const f = await fixture(), row = input(), summarize = vi.fn(async () => { throw new Error("Provider unavailable"); });
    const deps = { inputs: async () => [row], summarize };
    const first = new WorkLogService(f.root, undefined, deps); services.push(first);
    await first.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await first.request(read)).notice).toBe("Provider unavailable"));
    await first.dispose();
    const next = new WorkLogService(f.root, undefined, deps); services.push(next);
    await next.request(request("workLog.start", { settings })); await new Promise((r) => setTimeout(r, 60));
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("kernel lock excludes another producer without stale lock files", async () => {
    const f = await fixture(); let release!: () => void;
    const held = withWorkLock(join(f.dir, "lock"), () => new Promise<void>((r) => { release = r; }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(withWorkLock(join(f.dir, "lock"), async () => true)).rejects.toThrow("another window");
    release(); await held; expect(await withWorkLock(join(f.dir, "lock"), async () => true)).toBe(true);
  });
  it("owned command stops and drains on abort", async () => {
    const f = await fixture(), controller = new AbortController();
    const pending = runWorkCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], f.root, controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow("Stopped");
  });
  it("reads only registered matching sessions and completed non-inherited turns", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json");
    const at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: "2020-01-01T00:00:00.000Z", payload: { type: "task_complete", turn_id: "old", last_agent_message: "Inherited" } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Updated core/parser.ts, password=private-value" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "new", last_agent_message: "Implemented parser" } },
    ].map((v) => JSON.stringify(v)).join("\n") + "\n{partial");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", task: "task-a", rollout }] }), { mode: 0o600 });
    const result = await readWorkInputs(f.root, registry);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ origin: "terminal" }); expect(result[0].boundary).toContain("new:"); expect(result[0].text).not.toContain("private-value"); expect(result[0].text).not.toContain("Inherited");
    expect(await readWorkInputs(f.root, registry, { [id]: result[0].checkpoint! })).toEqual([]);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id: "01a07f1d-d63e-7963-b2b4-41e4c4538c7b", label: "Wrong", rollout }] }));
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("emits only completed concrete ongoing operations and advances from a stable checkpoint", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json");
    const startedAt = "2026-09-11T00:00:00.000Z", firstAt = "2026-09-11T01:00:00.000Z", secondAt = "2026-09-11T01:05:00.000Z";
    const rows: unknown[] = [
      { type: "session_meta", timestamp: startedAt, payload: { id } },
      { type: "event_msg", timestamp: startedAt, payload: { type: "task_started", turn_id: "long-turn", started_at: Date.parse(startedAt) / 1000 } },
      { type: "event_msg", timestamp: firstAt, payload: { type: "agent_message", message: "I plan to change the parser next." } },
      { type: "response_item", timestamp: firstAt, payload: { type: "function_call", name: "functions.exec_command", call_id: "inspect", arguments: JSON.stringify({ cmd: "rg parser core" }) } },
      { type: "response_item", timestamp: firstAt, payload: { type: "function_call_output", call_id: "inspect", output: "core/parser.ts:1" } },
      { type: "response_item", timestamp: firstAt, payload: { type: "custom_tool_call", name: "functions.apply_patch", call_id: "patch-1", input: "*** Begin Patch\n*** Update File: core/parser.ts\n@@\n-old\n+new\n*** End Patch" } },
      { type: "response_item", timestamp: firstAt, payload: { type: "custom_tool_call_output", call_id: "patch-1", output: "Done!" } },
    ];
    const save = async () => writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n{partial");
    await save(); await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", task: "task-a", rollout }] }), { mode: 0o600 });
    const [first] = await readWorkInputs(f.root, registry);
    expect(first).toMatchObject({ origin: "milestone", at: firstAt, sessionId: id }); expect(first).not.toHaveProperty("state");
    expect(first.text).toContain("core/parser.ts"); expect(first.text).toContain("Done!");
    expect(first.text).not.toContain("plan to"); expect(first.text).not.toContain("rg parser");
    expect(await readWorkInputs(f.root, registry, { [id]: first.checkpoint! })).toEqual([]);

    rows.push(
      { type: "response_item", timestamp: secondAt, payload: { type: "function_call", name: "functions.exec_command", call_id: "test-1", arguments: JSON.stringify({ cmd: "nix develop --command bazel test //tools/work-log:check" }) } },
      { type: "response_item", timestamp: secondAt, payload: { type: "function_call_output", call_id: "test-1", output: "Executed 1 out of 1 test: 1 test passes." } },
    );
    await save();
    const [second] = await readWorkInputs(f.root, registry, { [id]: first.checkpoint! });
    expect(second).toMatchObject({ origin: "milestone", at: secondAt }); expect(second.boundary).not.toBe(first.boundary);
    expect(second.text).toContain("bazel test"); expect(second.text).not.toContain("core/parser.ts");

    rows.push({ type: "event_msg", timestamp: secondAt, payload: { type: "task_complete", turn_id: "long-turn" } });
    await save();
    const [terminal] = await readWorkInputs(f.root, registry, { [id]: second.checkpoint! });
    expect(terminal).toMatchObject({ origin: "terminal", state: "completed" }); expect(terminal.text).toContain("earlier saved milestones");
  });
  it("normalizes current wrapper result blocks through the reader and service without leaking other blocks", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json");
    let now = Date.now(); const at = new Date(now).toISOString();
    const patch = "*** Begin Patch\n*** Update File: core/work-log/transcripts.ts\n@@\n-old\n+new\n*** End Patch";
    const wrapper = `text(await tools.apply_patch(${JSON.stringify(patch)}));\ntext(await tools.exec_command(${JSON.stringify({ cmd: "nix develop --command bazel test //tools/work-log:check" })}));`;
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "current-shape", started_at: now / 1000 } },
      { type: "response_item", timestamp: at, payload: { type: "custom_tool_call", name: "functions.exec", call_id: "wrapped", input: wrapper } },
      { type: "response_item", timestamp: at, payload: { type: "custom_tool_call_output", call_id: "wrapped", output: [
        { type: "input_text", text: "Passed /srv/private/check; access_token=private-value" },
        { type: "input_image", image_url: "IMAGE_SHOULD_NOT_LEAK" },
        { type: "future_block", secret: "OBJECT_SHOULD_NOT_LEAK" },
      ] } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", task: "task-a", rollout }] }), { mode: 0o600 });

    const observed = await observeWork(f.root, registry);
    expect(observed.inputs).toHaveLength(1);
    expect(observed.inputs[0]).toMatchObject({ origin: "milestone", sessionId: id });
    expect(observed.inputs[0].text).toContain("Edited core/work-log/transcripts.ts");
    expect(observed.inputs[0].text).toContain("bazel test //tools/work-log:check");
    expect(observed.inputs[0].text).toContain("Result: Passed [private]; [private]");
    expect(observed.inputs[0].text).not.toMatch(/private-value|IMAGE_SHOULD_NOT_LEAK|OBJECT_SHOULD_NOT_LEAK|\[object Object\]/);
    expect((await observeWork(f.root, registry, { [id]: observed.inputs[0].checkpoint! })).inputs).toEqual([]);

    const summarize = vi.fn(async (rows: WorkInput[]) => {
      expect(rows).toHaveLength(1); expect(rows[0].text).toBe(observed.inputs[0].text); return [summary];
    });
    const productionObserve = vi.fn(observeWork);
    const service = new WorkLogService(f.root, registry, { inputs: readWorkInputs, observe: productionObserve, summarize, now: () => now }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(() => expect(productionObserve).toHaveBeenCalled());
    expect(summarize).not.toHaveBeenCalled();
    now += 10_000; await (service as unknown as { tick(): Promise<void> }).tick();
    expect(summarize).toHaveBeenCalledTimes(1);
    expect((await service.request(read)).entries[0]).toMatchObject({ origin: "milestone", state: "working" });
  });
  it("ignores unmatched results, repeated intention, noisy commands and aborted final prose", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "I will implement this next. I will implement this next." } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "status", arguments: JSON.stringify({ cmd: "git status --short" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "status", output: "clean" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "search", arguments: JSON.stringify({ cmd: "rg 'bazel test' docs" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "search", output: "docs/example.md:bazel test //..." } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "quoted", arguments: JSON.stringify({ cmd: "printf '; bazel test //...' && rg '&& git commit' docs" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "quoted", output: "just documentation" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "missing", output: "Done!" } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Implemented everything." } },
      { type: "event_msg", timestamp: at, payload: { type: "turn_aborted", turn_id: "turn" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("accepts a matched concrete operation with silent output", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "push", arguments: JSON.stringify({ cmd: "git push" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "push", output: "" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [result] = await readWorkInputs(f.root, registry);
    expect(result.text).toContain("git push"); expect(result.text).toContain("completed without output");
  });
  it("accepts a concrete command after one safely parsed leading directory change", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "cd 'work tree' && bazel test //tools/work-log:check" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "test", output: "passed" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    expect((await readWorkInputs(f.root, registry))[0].text).toContain("bazel test");
  });
  it("uses byte-accurate checkpoints after invalid UTF-8 and rejects oversized multibyte records", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const header = Buffer.from(`${JSON.stringify({ type: "session_meta", timestamp: at, payload: { id } })}\n`);
    const invalid = Buffer.concat([Buffer.from('{"type":"noise","payload":"'), Buffer.from([0xff]), Buffer.from('"}\n')]);
    const concrete = Buffer.from([
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "valid" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "bazel test //tools/work-log:check" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "test", output: "passed" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(rollout, Buffer.concat([header, invalid, concrete]));
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [first] = await readWorkInputs(f.root, registry); expect(first.checkpoint?.offset).toBe(header.length + invalid.length + concrete.length);
    expect(await readWorkInputs(f.root, registry, { [id]: first.checkpoint! })).toEqual([]);

    const oversized = Buffer.from(`${JSON.stringify({ type: "noise", payload: "é".repeat(33_000) })}\n`);
    const later = Buffer.from([
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "later" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "build", arguments: JSON.stringify({ cmd: "bazel build //..." }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "build", output: "built" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(rollout, Buffer.concat([header, oversized, later]));
    const [second] = await readWorkInputs(f.root, registry); expect(second.text).toContain("bazel build");
    expect(second.checkpoint!.length).toBeLessThanOrEqual(64_001);
  });
  it("bounds untrusted turn identities before checkpoint persistence", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "x".repeat(1000) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "bazel test //tools/work-log:check" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "test", output: "passed" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [result] = await readWorkInputs(f.root, registry); expect(result.checkpoint!.turnId!.length).toBeLessThanOrEqual(160);
  });
  it("does not revive aborted or nested ownership with a later terminal", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const header = { type: "session_meta", timestamp: at, payload: { id } };
    const abort = { type: "event_msg", timestamp: at, payload: { type: "turn_aborted", turn_id: "stopped" } };
    const terminal = { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "stopped", last_agent_message: "Not actually complete" } };
    const save = async (rows: unknown[]) => writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    await save([header, { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "stopped" } }, abort, terminal]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
    await save([header, { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "stopped" } }, abort]);
    const observed = await observeWork(f.root, registry); expect(observed.advances[id]).toMatchObject({ kind: "abort" });
    await save([header, { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "stopped" } }, abort, terminal]);
    expect((await observeWork(f.root, registry, { [id]: observed.advances[id] })).inputs).toEqual([]);
    await save([header, { type: "session_meta", timestamp: at, payload: { id: "nested" } }, terminal]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("accepts a missing terminal turn id only inside its active owned span", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const rows = [{ type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "owned" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", last_agent_message: "Owned turn completed" } }];
    await writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    expect((await readWorkInputs(f.root, registry))[0]).toMatchObject({ origin: "terminal", state: "completed", text: "Owned turn completed" });
    rows.splice(2, 0, { type: "event_msg", timestamp: at, payload: { type: "turn_aborted", turn_id: "owned" } });
    await writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("bridges a bounded-tail gap only for an explicit turn after the closed turn", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const rows = [{ type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "closed" } },
      { type: "event_msg", timestamp: at, payload: { type: "turn_aborted", turn_id: "closed" } }];
    const base = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await writeFile(rollout, base);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const checkpoint = (await observeWork(f.root, registry)).advances[id]; expect(checkpoint).toMatchObject({ kind: "abort", turnId: "closed" });
    const noise = `${JSON.stringify({ type: "noise", payload: "x".repeat(530_000) })}\n`;
    await appendFile(rollout, noise);
    await appendFile(rollout, `${JSON.stringify({ type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "closed", last_agent_message: "Still closed" } })}\n`);
    expect(await readWorkInputs(f.root, registry, { [id]: checkpoint })).toEqual([]);
    await appendFile(rollout, `${JSON.stringify({ type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "later", last_agent_message: "Later turn completed" } })}\n`);
    expect((await readWorkInputs(f.root, registry, { [id]: checkpoint }))[0]).toMatchObject({ origin: "terminal", text: "Later turn completed" });
    const terminal = { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "later", last_agent_message: "Must stay aborted" } };
    await writeFile(rollout, `${base}${noise}${[
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "later" } },
      { type: "event_msg", timestamp: at, payload: { type: "turn_aborted", turn_id: "later" } }, terminal,
    ].map((row) => JSON.stringify(row)).join("\n")}\n`);
    expect(await readWorkInputs(f.root, registry, { [id]: checkpoint })).toEqual([]);
    await writeFile(rollout, `${base}${noise}${[
      { type: "session_meta", timestamp: at, payload: { id: "nested" } }, terminal,
    ].map((row) => JSON.stringify(row)).join("\n")}\n`);
    expect(await readWorkInputs(f.root, registry, { [id]: checkpoint })).toEqual([]);
    await writeFile(rollout, `${base}${noise}${[
      { type: "event_msg", payload: { type: "turn_aborted", turn_id: "later" } }, terminal,
    ].map((row) => JSON.stringify(row)).join("\n")}\n`);
    expect(await readWorkInputs(f.root, registry, { [id]: checkpoint })).toEqual([]);
    await writeFile(rollout, `${base}${noise}${[
      { type: "event_msg", timestamp: "invalid", payload: { type: "task_started", turn_id: "later" } }, terminal,
    ].map((row) => JSON.stringify(row)).join("\n")}\n`);
    expect(await readWorkInputs(f.root, registry, { [id]: checkpoint })).toEqual([]);
  });
  it("uses empty-terminal fallback only after a milestone from the same turn", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const header = { type: "session_meta", timestamp: at, payload: { id } };
    const save = async (rows: unknown[]) => writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    await save([header, { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "first", last_agent_message: "First done" } }]);
    const [first] = await readWorkInputs(f.root, registry); expect(first.checkpoint).toMatchObject({ kind: "terminal" });
    await save([header, { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "first", last_agent_message: "First done" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "empty" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "empty" } }]);
    expect(await readWorkInputs(f.root, registry, { [id]: first.checkpoint! })).toEqual([]);
  });
  it("restores a pre-kind paid milestone checkpoint by its bounded turn", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const rows: unknown[] = [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "ongoing" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call", name: "exec_command", call_id: "test", arguments: JSON.stringify({ cmd: "bazel test //tools/work-log:check" }) } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", call_id: "test", output: "passed" } },
    ];
    const save = async () => writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await save(); await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [milestone] = await readWorkInputs(f.root, registry); const { kind: _kind, ...legacy } = milestone.checkpoint!;
    rows.push({ type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "ongoing" } }); await save();
    expect((await readWorkInputs(f.root, registry, { [id]: legacy }))[0]).toMatchObject({ origin: "terminal", state: "completed" });
  });
  it("keeps new concrete work eligible after its prior checkpoint leaves the bounded tail", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json");
    const oldAt = "2026-09-10T20:00:00.000Z", newAt = new Date().toISOString();
    const header = JSON.stringify({ type: "session_meta", timestamp: oldAt, payload: { id } });
    const oldCall = JSON.stringify({ type: "response_item", timestamp: oldAt, payload: { type: "custom_tool_call", name: "apply_patch", call_id: "old", input: "*** Begin Patch\n*** Update File: old.ts\n@@\n-a\n+b\n*** End Patch" } });
    const oldResult = JSON.stringify({ type: "response_item", timestamp: oldAt, payload: { type: "custom_tool_call_output", call_id: "old", output: "Done!" } });
    await writeFile(rollout, `${header}\n${oldCall}\n${oldResult}\n`);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [old] = await readWorkInputs(f.root, registry);
    const noise = Array.from({ length: 12 }, (_, index) => JSON.stringify({ type: "event_msg", timestamp: newAt,
      payload: { type: "token_count", ignored: `${index}:${"noise".repeat(12000)}` } })).join("\n");
    const newCall = JSON.stringify({ type: "response_item", timestamp: newAt, payload: { type: "function_call", name: "exec_command", call_id: "new", arguments: JSON.stringify({ cmd: "git commit -m milestone" }) } });
    const newResult = JSON.stringify({ type: "response_item", timestamp: newAt, payload: { type: "function_call_output", call_id: "new", output: "[feature abc123] milestone" } });
    await writeFile(rollout, `${header}\n${oldCall}\n${oldResult}\n${noise}\n${newCall}\n${newResult}\n`);
    const [fresh] = await readWorkInputs(f.root, registry, { [id]: old.checkpoint! });
    expect(fresh).toMatchObject({ origin: "milestone", at: newAt }); expect(fresh.text).toContain("git commit"); expect(fresh.text).not.toContain("old.ts");
  });
  it("fails closed when a transcript is rewritten in place across a saved checkpoint", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const header = JSON.stringify({ type: "session_meta", timestamp: at, payload: { id } });
    const call = JSON.stringify({ type: "response_item", timestamp: at, payload: { type: "custom_tool_call", name: "apply_patch", call_id: "old", input: "*** Begin Patch\n*** Update File: old.ts\n@@\n-a\n+b\n*** End Patch" } });
    const result = JSON.stringify({ type: "response_item", timestamp: at, payload: { type: "custom_tool_call_output", call_id: "old", output: "Done!" } });
    await writeFile(rollout, `${header}\n${call}\n${result}\n`);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const [old] = await readWorkInputs(f.root, registry);
    const replacement = `${header}\n${" ".repeat(old.checkpoint!.offset)}\n${call.replaceAll("old", "new")}\n${result.replaceAll("old", "new")}\n`;
    await writeFile(rollout, replacement);
    expect(await readWorkInputs(f.root, registry, { [id]: old.checkpoint! })).toEqual([]);
  });
  it("retains the latest boundary behind a large ongoing turn without sending its noisy tail", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    const rows = [{ type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "finished", last_agent_message: "Added completed behavior" } },
      ...Array.from({ length: 10 }, () => ({ type: "response_item", payload: { type: "function_call_output", output: "noise".repeat(6000) } }))];
    await writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    const result = await readWorkInputs(f.root, registry);
    expect(result[0].text).toBe("Added completed behavior"); expect(result[0].boundary).toContain("finished:");
  });
  it("uses preserved fork turn starts, not rewritten parent timestamps or nested headers", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json");
    const at = "2026-09-08T10:00:00.000Z", before = "2026-09-08T09:00:00.000Z", started = Date.parse(at) / 1000;
    const header = { type: "session_meta", timestamp: before, payload: { id, timestamp: at, forked_from_id: "parent" } };
    const inherited = [
      header,
      { type: "session_meta", timestamp: at, payload: { id: "parent", timestamp: before } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "parent", started_at: started - 3600 } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Inherited parent prose" } },
      { type: "response_item", timestamp: at, payload: { type: "function_call_output", output: "Inherited tool output" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "parent", started_at: started - 3600, last_agent_message: "Inherited completion" } },
    ];
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Child", rollout }] }), { mode: 0o600 });
    const save = async (rows: unknown[]) => writeFile(rollout, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await save(inherited);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
    await save([...inherited,
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "child", started_at: started } },
      { type: "response_item", timestamp: at, payload: { type: "custom_tool_call", name: "apply_patch", call_id: "child-patch", input: "*** Begin Patch\n*** Update File: child.ts\n@@\n-old\n+new\n*** End Patch" } },
      { type: "response_item", timestamp: at, payload: { type: "custom_tool_call_output", call_id: "child-patch", output: "Done!" } },
    ]);
    expect((await readWorkInputs(f.root, registry))[0]).toMatchObject({ origin: "milestone", agent: "Child" });
    await save([...inherited,
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "child", started_at: started } },
      { type: "event_msg", timestamp: before, payload: { type: "agent_message", message: "Pre-birth evidence" } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Own work" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "child", started_at: started, last_agent_message: "Own completion" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "next", started_at: started } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Unfinished next turn" } },
    ]);
    const [result] = await readWorkInputs(f.root, registry);
    expect(result.text).toBe("Own work\nOwn completion"); expect(result.boundary).toContain("child:"); expect(result.state).toBe("completed");
    await save([...inherited,
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "child", started_at: started } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Own work before nested header" } },
      { type: "session_meta", payload: { id: "parent" } },
      { type: "event_msg", timestamp: at, payload: { type: "agent_message", message: "Copied nested evidence" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "child", started_at: started, last_agent_message: "Own completion after nested header" } },
    ]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
    await save([...inherited,
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "child", started_at: started } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "child", started_at: started, last_agent_message: "Own final only", error: { message: "Provider failed" } } },
    ]);
    expect((await readWorkInputs(f.root, registry))[0]).toMatchObject({ text: "Own final only", state: "failed" });
    await save([{ ...header, payload: { id, forked_from_id: "parent" } }, ...inherited.slice(1)]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
    await save([{ ...header, payload: { ...header.payload, timestamp: "invalid" } }, ...inherited.slice(1)]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
    await save([{ ...header, payload: { ...header.payload, timestamp: "2026-09-08T10:00:00.250Z" } },
      { type: "event_msg", timestamp: "2026-09-08T10:00:01.000Z", payload: { type: "task_started", turn_id: "ambiguous", started_at: started } },
      { type: "event_msg", timestamp: "2026-09-08T10:00:01.000Z", payload: { type: "task_complete", turn_id: "ambiguous", started_at: started, last_agent_message: "Ambiguous same-second ownership" } },
    ]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("corroborates older and empty completion boundaries in the bounded tail without summarizing them", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [
      { type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "older" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "older", last_agent_message: "Older outcome" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "empty" } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "empty", error: { message: "Provider unavailable" } } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    expect(await readWorkCompletions(f.root, registry)).toEqual([
      { sessionId: id, boundary: `older:${at}`, at, state: "completed" },
      { sessionId: id, boundary: `empty:${at}`, at, state: "failed" },
    ]);
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("does not buy a summary for an empty startup turn", async () => {
    const f = await fixture(), id = "01a07f1d-d6d0-7f01-b2bd-4154876ec187", rollout = join(f.dir, "session.jsonl"), registry = join(f.dir, "registry.json"), at = new Date().toISOString();
    await writeFile(rollout, [{ type: "session_meta", timestamp: at, payload: { id } },
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "empty" } }].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id, label: "Worker", rollout }] }), { mode: 0o600 });
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
  });
  it("scrubs private paths and common credential assignments", () => {
    expect(cleanWorkText("Edited /home/alice/private/a, /tmp/token, /srv/company/private.ts and [`/run/user/1000/key`] with api_key=sekret GITHUB_TOKEN=hidden AWS_SECRET_ACCESS_KEY=also-hidden Authorization: Bearer abc.def")).not.toMatch(/alice|\/srv|\/run|token|sekret|hidden|abc\.def/i);
  });
  it("enforces explicit saved-entry provenance and state invariants", () => {
    const base = { id: "entry", sessionId: "session", agent: "Worker", taskId: null, at: new Date().toISOString(), outcome: "Did work", areas: [], checks: [], followUps: [], recorded: false };
    expect(WorkLogEntrySchema.safeParse({ ...base, origin: "milestone", state: "completed" }).success).toBe(false);
    expect(WorkLogEntrySchema.safeParse({ ...base, origin: "terminal", state: "working" }).success).toBe(false);
    expect(WorkLogEntrySchema.safeParse({ ...base, state: "working" }).success).toBe(true);
  });
  it("rejects record target mismatch before spawning Ditz", async () => {
    const f = await fixture();
    await expect(recordWorkOutcome(f.root, join(f.root, ".git"), { id: "entry", sessionId: "a", taskId: "task-a", agent: "A", at: new Date().toISOString(), state: "working", recorded: false, ...summary }, "task-b", new AbortController().signal)).rejects.toThrow("different registered task");
  });
});
