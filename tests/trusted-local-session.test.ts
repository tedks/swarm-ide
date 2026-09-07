import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedLocalSession } from "../core/agents/trusted-local-session";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const sessions: TrustedLocalSession[] = [];
afterEach(async () => {
  const stopping = sessions.splice(0).map((session) => session.stop());
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  await Promise.all(stopping); vi.useRealTimers();
});
function fixture(cleanup: "confirmed" | "unknown" = "confirmed") {
  vi.useFakeTimers();
  let sink!: CodexTransportSink;
  const sent: Array<Record<string, any>> = [];
  const changed = vi.fn();
  const close = vi.fn(async () => ({ status: cleanup, observedAt: new Date().toISOString(), detail: "fixture" }));
  const session = new TrustedLocalSession({ root: "/repo", executable: "/operator/codex", openTransport(callbacks) {
    sink = callbacks;
    return { write(line) { sent.push(JSON.parse(line)); }, close };
  } }, changed);
  sessions.push(session);
  const receive = (value: unknown) => sink.stdout(Buffer.from(JSON.stringify(value) + "\n"));
  const notify = (method: string, params: unknown) => receive({ method, params });
  const reply = async (method: string, result: unknown) => {
    const request = sent.filter((message) => message.method === method).at(-1);
    expect(request).toBeDefined(); receive({ id: request!.id, result }); await flush();
  };
  let started: Promise<void>;
  const setup = async (model: string | null = null) => {
    started = session.start("Initial prompt", model);
    // Observe rejection immediately, including deliberately failed fixtures.
    void started.catch(() => {});
    await reply("initialize", { userAgent: "codex/0.153.4" });
    await reply("thread/start", { thread: { id: "thread" }, cwd: "/repo" });
  };
  const running = async () => { await setup(); await reply("turn/start", { turn: { id: "turn-1", status: "inProgress" } }); await started; };
  const complete = (id = "turn-1", status = "completed") => notify("turn/completed", { threadId: "thread", turn: { id, status } });
  const delta = (delta: string, turnId = "turn-1") => notify("item/agentMessage/delta", { threadId: "thread", turnId, itemId: "message", delta });
  return { session, sent, close, changed, receive, notify, reply, setup, running, complete, delta,
    get sink() { return sink; }, get started() { return started; } };
}

describe("trusted-local app-server conversation", () => {
  it("inherits thread settings exactly and preserves explicit model only at turn start", async () => {
    const f = fixture(); await f.setup("chosen-model");
    expect(f.sent.map((message) => message.method)).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
    expect(f.sent[0]!.params).toEqual({ clientInfo: { name: "swarm_ide", version: "0.1.0" } });
    expect(f.sent[2]!.params).toEqual({ cwd: "/repo" });
    expect(f.sent[3]!.params).toEqual({ threadId: "thread", model: "chosen-model", input: [{ type: "text", text: "Initial prompt", text_elements: [] }] });
    await f.reply("turn/start", { turn: { id: "turn-1" } }); await f.started;
    expect(f.session.snapshot().status).toBe("running");
  });
  it("rejects mismatched working directory before dispatch", async () => {
    const f = fixture(); const start = f.session.start("hello", null); void start.catch(() => {});
    await f.reply("initialize", { userAgent: "codex" });
    await f.reply("thread/start", { cwd: "/other", thread: { id: "thread" } });
    await expect(start).rejects.toThrow("different working directory");
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("streams early output and handles terminal-before-ack without reopening the turn", async () => {
    const f = fixture(); await f.setup(); f.delta("early "); f.delta("output"); f.complete();
    await f.reply("turn/start", { turn: { id: "turn-1" } }); await f.started;
    expect(f.session.snapshot()).toMatchObject({ status: "ready", turnId: "turn-1" });
    expect(f.session.snapshot().output).toContain("early output");
    expect(f.close).not.toHaveBeenCalled();
    const next = f.session.send("Follow-up");
    f.complete(); // late notification for the preceding turn must not bind this one
    f.delta("stale");
    await f.reply("turn/start", { turn: { id: "turn-2" } }); await next;
    f.delta("new answer", "turn-2"); f.complete("turn-2");
    expect(f.session.snapshot().status).toBe("ready");
    expect(f.session.snapshot().output).not.toContain("stale");
    expect(f.session.snapshot().output).toContain("new answer");
  });
  it("steers one acknowledged turn and rejects rapid input without replay", async () => {
    const f = fixture(); await f.running();
    const steer = f.session.send("Correction");
    await expect(f.session.send("Double click")).rejects.toThrow("pending");
    expect(f.sent.filter((message) => message.method === "turn/steer")).toHaveLength(1);
    expect(f.sent.at(-1)!.params.expectedTurnId).toBe("turn-1");
    await f.reply("turn/steer", { turnId: "turn-1" }); await steer;
    f.complete();
  });
  it("deduplicates completed messages, does not publish reasoning, and bounds output", async () => {
    const f = fixture(); await f.running(); f.delta("hello");
    const item = { threadId: "thread", turnId: "turn-1", item: { type: "agentMessage", id: "message", text: "hello world" } };
    f.notify("item/completed", item); f.notify("item/completed", item);
    expect(f.session.snapshot().output.endsWith("hello world")).toBe(true);
    f.notify("item/reasoning/textDelta", { delta: "private reasoning" });
    expect(f.session.snapshot().output).not.toContain("private reasoning");
    f.notify("item/agentMessage/delta", { threadId: "thread", turnId: "turn-1", itemId: "large", delta: "é".repeat(200_000) });
    expect(Buffer.byteLength(f.session.snapshot().output)).toBeLessThanOrEqual(256 * 1024);
    expect(f.session.snapshot().output).toContain("Earlier output omitted"); f.complete();
  });
  it("supports explicit once-only command approvals with type-distinct IDs and copied snapshots", async () => {
    const f = fixture(); await f.running();
    const params = { threadId: "thread", turnId: "turn-1", itemId: "cmd", cwd: "/repo", command: "git status", availableDecisions: ["accept", "decline", "acceptForSession"] };
    f.receive({ id: 7, method: "item/commandExecution/requestApproval", params });
    f.receive({ id: "7", method: "item/commandExecution/requestApproval", params: { ...params, itemId: "cmd2" } });
    expect(f.session.snapshot().approvals.map((approval) => approval.id)).toEqual(["number:7", "string:7"]);
    const copy = f.session.snapshot(); copy.approvals[0]!.choices.push("acceptForSession");
    await expect(f.session.decide("number:7", "acceptForSession")).rejects.toThrow("unsupported");
    await f.session.decide("number:7", "accept");
    expect(f.sent.at(-1)).toEqual({ id: 7, result: { decision: "accept" } });
    await expect(f.session.decide("number:7", "accept")).rejects.toThrow("stale");
    f.notify("serverRequest/resolved", { threadId: "thread", requestId: "7" });
    expect(f.session.snapshot().approvals).toEqual([]); f.complete();
  });
  it("shows file diffs before allowing approval and prevents blind acceptance", async () => {
    const f = fixture(); await f.running();
    const params = { threadId: "thread", turnId: "turn-1", itemId: "patch" };
    f.receive({ id: 1, method: "item/fileChange/requestApproval", params });
    expect(f.session.snapshot().approvals[0]!.choices).toEqual(["decline"]);
    await f.session.decide("number:1", "decline");
    f.notify("item/started", { ...params, item: { type: "fileChange", id: "patch", changes: [{ path: "/repo/a", diff: "+new" }] } });
    f.receive({ id: 2, method: "item/fileChange/requestApproval", params });
    expect(f.session.snapshot().approvals[0]).toMatchObject({ choices: ["accept", "decline"], summary: expect.stringContaining("+new") });
    f.complete(); await expect(f.session.decide("number:2", "accept")).rejects.toThrow("stale");
  });
  it("shows the command's actual directory, disables unknown cwd approval, and rejects invalid cwd", async () => {
    const f = fixture(); await f.running();
    const params = { threadId: "thread", turnId: "turn-1", itemId: "cmd", command: "pwd", cwd: "/different/repository" };
    f.receive({ id: 21, method: "item/commandExecution/requestApproval", params });
    expect(f.session.snapshot().approvals[0]).toMatchObject({ summary: "Working directory: /different/repository\nRun command: pwd", choices: ["accept", "decline"] });
    await f.session.decide("number:21", "decline");
    f.receive({ id: 22, method: "item/commandExecution/requestApproval", params: { ...params, cwd: null } });
    expect(f.session.snapshot().approvals[0]).toMatchObject({ summary: expect.stringContaining("not inferred"), choices: ["decline"] });
    await f.session.decide("number:22", "decline");
    f.receive({ id: 23, method: "item/commandExecution/requestApproval", params: { ...params, cwd: "relative/path" } });
    expect(f.session.snapshot().status).toBe("failed");
    const g = fixture(); await g.running();
    g.receive({ id: 24, method: "item/commandExecution/requestApproval", params: { ...params, cwd: "/repo\u202Eevil" } });
    expect(g.session.snapshot().status).toBe("failed");
  });
  it("accepts the full initial prompt budget but bounds follow-up input separately", async () => {
    const f = fixture(), prompt = "é".repeat(65536);
    const start = f.session.start(prompt, null);
    await f.reply("initialize", { userAgent: "codex" });
    await f.reply("thread/start", { thread: { id: "thread" }, cwd: "/repo" });
    expect(f.sent.at(-1)!.params.input[0].text).toBe(prompt);
    await f.reply("turn/start", { turn: { id: "turn-1" } }); await start;
    await expect(f.session.send("x".repeat(16385))).rejects.toThrow("16384");
    expect(f.session.snapshot().status).toBe("running"); f.complete();
  });
  it("settles invalid initial prompt/model validation without opening transport or staying starting", async () => {
    for (const [prompt, model] of [["", null], ["x".repeat(131073), null], ["valid", "bad model"], ["nul\0", null]] as const) {
      const f = fixture(); await expect(f.session.start(prompt, model)).rejects.toThrow("setup failed");
      await flush(); expect(f.session.snapshot().status).toBe("failed");
      expect(f.sent).toEqual([]); expect(f.close).not.toHaveBeenCalled();
      await expect(f.session.start("Retry", null)).rejects.toThrow("cannot be started again");
      await f.session.stop();
    }
  });
  it("does not bind a new unacknowledged turn to a late approval for a completed turn", async () => {
    const f = fixture(); await f.running(); f.complete();
    const next = f.session.send("Follow-up");
    f.receive({ id: 30, method: "item/commandExecution/requestApproval", params: {
      threadId: "thread", turnId: "turn-1", itemId: "late-command", command: "pwd", cwd: "/repo",
    } });
    expect(f.sent.at(-1)).toEqual({ id: 30, result: { decision: "cancel" } });
    expect(f.session.snapshot()).toMatchObject({ status: "running", turnId: null, approvals: [] });
    await f.reply("turn/start", { turn: { id: "turn-2" } }); await next;
    expect(f.session.snapshot()).toMatchObject({ status: "running", turnId: "turn-2" }); f.complete("turn-2");
  });
  it("rejects foreign/stale approvals and unsupported interactive requests without granting", async () => {
    const f = fixture(); await f.running();
    f.receive({ id: 10, method: "item/commandExecution/requestApproval", params: { threadId: "other", turnId: "turn-1", itemId: "cmd" } });
    expect(f.sent.at(-1)).toEqual({ id: 10, result: { decision: "cancel" } });
    f.receive({ id: 11, method: "item/tool/requestUserInput", params: {} }); await flush();
    expect(f.sent.at(-1)).toMatchObject({ id: 11, error: { code: -32601 } });
    expect(f.session.snapshot().status).toBe("failed"); expect(f.close).toHaveBeenCalledOnce();
  });
  it("waits for terminal evidence, not interrupt acknowledgement, and closes exactly once", async () => {
    const f = fixture(); await f.running();
    const stopped = f.session.stop(); expect(f.session.stop()).toBe(stopped);
    await f.reply("turn/interrupt", {});
    expect(f.session.snapshot().status).toBe("stopping"); expect(f.close).not.toHaveBeenCalled();
    f.complete("turn-1", "interrupted"); await stopped;
    expect(f.session.snapshot().status).toBe("closed"); expect(f.close).toHaveBeenCalledOnce();
  });
  it("bounds Stop when the provider does not acknowledge and reports uncertain cleanup", async () => {
    const f = fixture("unknown"); await f.running(); const stopping = f.session.stop();
    await vi.advanceTimersByTimeAsync(1000); await stopping;
    expect(f.close).toHaveBeenCalledOnce(); expect(f.session.snapshot()).toMatchObject({ status: "failed", message: expect.stringContaining("unconfirmed") });
  });
  it("prevents setup dispatch after Stop and never retries a lost acknowledgement", async () => {
    const f = fixture(); const start = f.session.start("hello", null); void start.catch(() => {});
    await f.session.stop(); await expect(start).rejects.toThrow();
    await f.reply("initialize", { userAgent: "codex" });
    expect(f.sent.map((message) => message.method)).toEqual(["initialize"]);
    const g = fixture(); await g.setup(); await vi.advanceTimersByTimeAsync(30_000);
    await expect(g.started).rejects.toThrow();
    expect(g.sent.filter((message) => message.method === "turn/start")).toHaveLength(1);
    expect(g.session.snapshot().status).toBe("failed");
  });
  it("handles malformed stream, EOF, and synchronous transport failure without leaking ownership", async () => {
    const f = fixture(); await f.running(); f.sink.stdout(Buffer.from("{bad}\n")); await flush();
    expect(f.session.snapshot().status).toBe("failed"); expect(f.close).toHaveBeenCalledOnce();
    const g = fixture(); await g.running(); g.sink.exit(0); g.complete(); g.sink.end(); await flush();
    expect(g.session.snapshot().status).toBe("failed"); expect(g.close).toHaveBeenCalledOnce();
    const close = vi.fn(async () => ({ status: "confirmed" as const, observedAt: new Date().toISOString(), detail: "test" }));
    const h = new TrustedLocalSession({ root: "/repo", executable: "/codex", openTransport(sink) { sink.error(); return { write() {}, close }; } }, () => {});
    sessions.push(h); await expect(h.start("hello", null)).rejects.toThrow(); await flush(); expect(close).toHaveBeenCalledOnce();
  });
});
