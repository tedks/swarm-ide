// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkLogService } from "../core/work-log/service";
import { cleanWorkText, readWorkInputs, type WorkInput } from "../core/work-log/transcripts";
import { recordWorkOutcome, runWorkCommand, withWorkLock } from "../core/work-log/commands";
import { WorkLogSettingsSchema, type WorkLogRequest } from "../protocol/work-log";
import { PROTOCOL_VERSION, CoreRequestSchema } from "../protocol/schema";

const roots: string[] = [], services: WorkLogService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map((s) => s.dispose())); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
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
  it("reads without model calls, runs explicitly, persists and never replays an unchanged turn", async () => {
    const f = await fixture(), row = input(), summarize = vi.fn(async () => [summary]);
    const deps = { inputs: async () => [row], summarize };
    const service = new WorkLogService(f.root, undefined, deps); services.push(service);
    expect((await service.request(read)).running).toBe(false); expect(summarize).not.toHaveBeenCalled();
    await service.request(request("workLog.start", { settings }));
    await vi.waitFor(async () => expect((await service.request(read)).entries).toHaveLength(1));
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
