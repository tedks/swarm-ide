import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedLocalSession } from "../core/agents/trusted-local-session";
import type { CodexTransportSink } from "../core/agents/codex-app-server";

const sessions: TrustedLocalSession[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(async () => {
  const pending = sessions.splice(0).map((session) => session.stop());
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  await Promise.all(pending); vi.useRealTimers();
});
const point = { threadId: "parent", turnId: "completed-parent" };
function fixture() {
  vi.useFakeTimers();
  let sink!: CodexTransportSink;
  const sent: Array<Record<string, any>> = [];
  const close = vi.fn(async () => ({ status: "confirmed" as const, observedAt: new Date().toISOString(), detail: "controlled" }));
  const session = new TrustedLocalSession({ root: "/repo", executable: "/codex", openTransport(callbacks) {
    sink = callbacks; return { write(line) { sent.push(JSON.parse(line)); }, close };
  } }, () => {});
  sessions.push(session);
  const receive = (message: unknown) => sink.stdout(Buffer.from(JSON.stringify(message) + "\n"));
  const reply = async (method: string, result: unknown) => {
    const pending = sent.filter((message) => message.method === method).at(-1);
    expect(pending).toBeDefined(); receive({ id: pending!.id, result }); await flush();
  };
  const beginFork = async () => {
    const started = Reflect.apply(session.start, session, ["Child instructions", null, point]) as Promise<void>;
    void started.catch(() => {});
    await reply("initialize", { userAgent: "codex/0.153.4" });
    return { started };
  };
  const forkReply = (thread = { id: "child", forkedFromId: "parent", cwd: "/repo" }) => reply("thread/fork", { cwd: "/repo", thread });
  const clearGoal = async () => { await reply("thread/goal/clear", { cleared: false }); await reply("thread/goal/get", { goal: null }); };
  const complete = (threadId: string, turnId: string, status = "completed") => receive({ method: "turn/completed", params: { threadId, turn: { id: turnId, status } } });
  return { session, sent, close, receive, reply, beginFork, forkReply, clearGoal, complete };
}

describe("native trusted fork transport", () => {
  it("clears only the child's inherited goal before any child turn", async () => {
    const f = fixture(), { started } = await f.beginFork();
    await f.forkReply();
    expect(f.sent.at(-1)).toMatchObject({ method: "thread/goal/clear", params: { threadId: "child" } });
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    await f.reply("thread/goal/clear", { cleared: true });
    await f.reply("thread/goal/get", { goal: null });
    await f.reply("turn/start", { turn: { id: "child-turn" } }); await started;
    f.complete("child", "child-turn");
  });
  it("pins completed history and confirms native ancestry before one child instruction", async () => {
    const f = fixture(), { started } = await f.beginFork();
    expect(f.sent.at(-1)).toMatchObject({ method: "thread/fork", params: { threadId: "parent", lastTurnId: "completed-parent", cwd: "/repo", excludeTurns: true, deferGoalContinuation: true } });
    expect(f.sent.some((message) => message.method === "thread/start" || message.method === "turn/start")).toBe(false);
    await f.forkReply();
    await f.clearGoal();
    expect(f.sent.at(-1)).toMatchObject({ method: "turn/start", params: { threadId: "child", input: [{ type: "text", text: "Child instructions" }] } });
    await f.reply("turn/start", { turn: { id: "child-turn" } }); await started;
    expect(f.session.snapshot().threadId).toBe("child");
    f.complete("child", "child-turn");
  });
  it("advertises a boundary only after successful completion and acknowledgement", async () => {
    const f = fixture();
    const forkPoint = () => (f.session as TrustedLocalSession & { forkPoint?(): unknown }).forkPoint?.();
    expect(forkPoint()).toBeNull();
    const started = f.session.start("Initial", null); void started.catch(() => {});
    await f.reply("initialize", { userAgent: "codex" });
    await f.reply("thread/start", { cwd: "/repo", thread: { id: "parent" } });
    f.complete("parent", "completed-parent");
    expect(forkPoint()).toBeNull();
    await f.reply("turn/start", { turn: { id: "completed-parent" } }); await started;
    expect(forkPoint()).toEqual(point);
    const next = f.session.send("another"); expect(forkPoint()).toBeNull();
    await f.reply("turn/start", { turn: { id: "failed-turn" } }); await next;
    f.complete("parent", "failed-turn", "failed"); expect(forkPoint()).toBeNull();
  });
  it.each([
    { id: "parent", forkedFromId: "parent", cwd: "/repo" },
    { id: "child", forkedFromId: "other", cwd: "/repo" },
    { id: "child", forkedFromId: "parent", cwd: "/other" },
    { id: "child", forkedFromId: null, cwd: "/repo" },
  ])("does not send instructions on an unconfirmed fork: %j", async (thread) => {
    const f = fixture(), { started } = await f.beginFork();
    await f.reply("thread/fork", { cwd: "/repo", thread });
    await expect(started).rejects.toThrow(); await flush();
    expect(f.session.snapshot().threadId).toBeNull();
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("ignores a duplicate fork acknowledgement and never sends a second instruction", async () => {
    const f = fixture(), { started } = await f.beginFork();
    const request = f.sent.at(-1)!;
    await f.forkReply();
    f.receive({ id: request.id, result: { cwd: "/repo", thread: { id: "different", forkedFromId: "parent", cwd: "/repo" } } });
    await f.clearGoal();
    await f.reply("turn/start", { turn: { id: "child-turn" } }); await started;
    expect(f.session.snapshot().threadId).toBe("child");
    expect(f.sent.filter((message) => message.method === "turn/start")).toHaveLength(1);
    f.complete("child", "child-turn");
    expect(f.session.forkPoint()).toEqual({ threadId: "child", turnId: "child-turn" });
  });
  it("Stop during a held fork acknowledgement prevents the initial child turn", async () => {
    const f = fixture(), { started } = await f.beginFork();
    await f.session.stop(); await expect(started).rejects.toThrow();
    await f.forkReply();
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    expect(f.close).toHaveBeenCalledOnce();
    await expect(Reflect.apply(f.session.start, f.session, ["retry", null, point])).rejects.toThrow("cannot be started again");
  });
  it("a lost native fork acknowledgement is a bounded unknown outcome, not a retry", async () => {
    const f = fixture(), { started } = await f.beginFork();
    await vi.advanceTimersByTimeAsync(30_000); await expect(started).rejects.toThrow();
    expect(f.session.snapshot()).toMatchObject({ status: "failed", message: expect.stringContaining("unknown") });
    expect(f.sent.filter((message) => message.method === "thread/fork")).toHaveLength(1);
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("does not dispatch when child goal removal is uncertain or the inherited goal remains", async () => {
    const f = fixture(), { started } = await f.beginFork();
    await f.forkReply(); await f.reply("thread/goal/clear", { cleared: true });
    await f.reply("thread/goal/get", { goal: { objective: "Parent goal" } });
    await expect(started).rejects.toThrow();
    expect(f.sent.some((message) => message.method === "turn/start")).toBe(false);
    expect(f.sent.filter((message) => message.method.startsWith("thread/goal/")).every((message) => message.params.threadId === "child")).toBe(true);
  });
  it("Stop during child goal clearing cannot be undone by a late clear acknowledgement", async () => {
    const f = fixture(), { started } = await f.beginFork(); await f.forkReply();
    await f.session.stop(); await expect(started).rejects.toThrow();
    await f.reply("thread/goal/clear", { cleared: true });
    expect(f.sent.some((message) => message.method === "turn/start" || message.method === "thread/goal/get")).toBe(false);
    expect(f.close).toHaveBeenCalledOnce();
  });
});
