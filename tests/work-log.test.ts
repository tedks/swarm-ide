// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkLogService } from "../core/work-log/service";
import { cleanWorkText, readWorkCompletions, readWorkInputs, type WorkInput } from "../core/work-log/transcripts";
import { recordWorkOutcome, runWorkCommand, withWorkLock } from "../core/work-log/commands";
import * as workCommands from "../core/work-log/commands";
import { WorkLogSettingsSchema, type WorkLogRequest } from "../protocol/work-log";
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
const input = (): WorkInput => ({ sessionId: "a", agent: "Worker A", taskId: "task-a", boundary: `turn:${Date.now()}`, at: new Date().toISOString(), text: "Implemented parser; focused tests pass." });
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
  it("stop aborts in-flight summary and prevents late publication", async () => {
    const f = await fixture(); let aborted = false;
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [input()], summarize: (_input, _settings, signal) => new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve([summary]); })) }); services.push(service);
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).summarizing).toBe(true));
    await service.request(request("workLog.stop")); expect(aborted).toBe(true);
    expect((await service.request(read)).entries).toHaveLength(0);
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
      { sessionId: "a", boundary: `older:${at}`, at },
      { sessionId: "a", boundary: `failed:${at}`, at, state: "failed" as const },
      { sessionId: "a", boundary: `mismatch:${at}`, at },
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
  it("defers legacy repair behind another producer and preserves its newer document", async () => {
    const f = await fixture(), at = new Date().toISOString();
    const entry = { id: `a:old:${at}`, sessionId: "a", agent: "Worker", taskId: "task-a", at, state: "working", recorded: false, ...summary };
    await mkdir(join(f.root, ".swarm")); await writeFile(join(f.root, ".swarm/work-log.json"), JSON.stringify({ version: 1, entries: [entry] }));
    let release!: () => void;
    const held = withWorkLock(join(f.root, ".git/swarm-work-log/producer.lock"), () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const summarize = vi.fn(async () => [summary]);
    const service = new WorkLogService(f.root, undefined, { inputs: async () => [], completions: async () => [{ sessionId: "a", boundary: `old:${at}`, at }], summarize }); services.push(service);
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
    expect(result).toHaveLength(1); expect(result[0].boundary).toContain("new:"); expect(result[0].text).not.toContain("private-value"); expect(result[0].text).not.toContain("Inherited");
    expect(await readWorkInputs(f.root, registry, { [id]: result[0].boundary })).toEqual([]);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id: "01a07f1d-d63e-7963-b2b4-41e4c4538c7b", label: "Wrong", rollout }] }));
    expect(await readWorkInputs(f.root, registry)).toEqual([]);
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
    expect((await readWorkInputs(f.root, registry))[0].text).toBe("Own completion after nested header");
    await save([...inherited, { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "child", started_at: started, last_agent_message: "Own final only", error: { message: "Provider failed" } } }]);
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
      { type: "event_msg", timestamp: at, payload: { type: "task_complete", turn_id: "older", last_agent_message: "Older outcome" } },
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
    expect(cleanWorkText("Edited /home/alice/private/a and /tmp/token with api_key=sekret")).not.toMatch(/alice|token|sekret/);
  });
  it("rejects record target mismatch before spawning Ditz", async () => {
    const f = await fixture();
    await expect(recordWorkOutcome(f.root, join(f.root, ".git"), { id: "entry", sessionId: "a", taskId: "task-a", agent: "A", at: new Date().toISOString(), state: "working", recorded: false, ...summary }, "task-b", new AbortController().signal)).rejects.toThrow("different registered task");
  });
});
