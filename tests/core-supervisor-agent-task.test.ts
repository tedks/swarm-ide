// @vitest-environment node
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreSupervisor } from "../app/electron/core-supervisor";
import { agentFixtureContext, agentFixtureFrames } from "../fixtures/agents";
import { TASK_FIXTURE_COMMIT } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { formatAgentContextV2, formatRepositoryTask } from "../protocol/agent-task";
import { PreparedAgentContextSchema, type AgentResult, type PreparedAgentContext } from "../protocol/agents";
import { PROTOCOL_VERSION, parseCoreResponseForRequest, type CoreRequest, type CoreResponse } from "../protocol/schema";

class FakeCore extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => true);
  ready() { this.emit("message", { type: "core.ready" }); }
  exit() { this.emit("exit", 0); }
}
const supervisors: CoreSupervisor[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function taskDraft(): PreparedAgentContext {
  const base = agentFixtureContext();
  const reference = { version: 1 as const, worldId: base.launchContext.worldId,
    repositoryId: base.launchContext.repositoryId, provider: "ditz" as const, taskId: "supervisor-task",
    metadataCommit: TASK_FIXTURE_COMMIT, issueBlob: { algorithm: "sha1" as const, hex: "b".repeat(40) } };
  const content = formatRepositoryTask(reference, "Synthetic transport task", "Exact data λ\r\n");
  const fields = { ...base.launchContext, repositoryTask: { reference,
    encoding: "swarm-repository-task-json-v1" as const, content, bytes: Buffer.byteLength(content), digest: hash(content) } };
  const submittedPrompt = formatAgentContextV2(fields), contextHash = hash(submittedPrompt);
  return PreparedAgentContextSchema.parse({ ...base, contextHash, launchContext: { ...fields, submittedPrompt, contextHash } });
}
function prepare(draft = taskDraft(), requestId = "prepare"): CoreRequest {
  const context = draft.launchContext;
  return { protocolVersion: PROTOCOL_VERSION, requestId, type: "agent.prepare",
    worldId: context.worldId, focus: context.focus, taskText: context.taskText,
    model: context.requested.model, effort: context.requested.effort, links: context.links,
    ...(context.repositoryTask ? { taskReference: context.repositoryTask.reference } : {}) };
}
function response(request: CoreRequest, agent: AgentResult): CoreResponse {
  // Check synthetic replies independently, so a rejected fixture cannot masquerade as a dropped late reply.
  return parseCoreResponseForRequest({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId,
    ok: true, sequence: 1, snapshot: initialSnapshot(), agent }, request);
}
function setup() {
  const children: FakeCore[] = [];
  const hooks = { launch: vi.fn(() => { const child = new FakeCore(); children.push(child); return child; }),
    status: vi.fn(), event: vi.fn() };
  const supervisor = new CoreSupervisor(hooks);
  supervisors.push(supervisor); supervisor.start(); children[0]!.ready();
  return { supervisor, first: children[0]!, children, hooks };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const supervisor of supervisors.splice(0)) supervisor.stop();
  vi.useRealTimers();
});

describe("task-bearing preparation transport deadline", () => {
  it("accepts exact pinned V2 preparation after 5s and just before 40s", async () => {
    const { supervisor, first } = setup();
    const draft = taskDraft(), input = prepare(draft), settled = vi.fn();
    const pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(settled).not.toHaveBeenCalled();
    const reply = response(input, { kind: "prepare", draft });
    first.emit("message", reply); await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(reply);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(first.postMessage).toHaveBeenCalledExactlyOnceWith(input);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out at exactly 40s and drops late preparation without publishing or replaying", async () => {
    const { supervisor, first, hooks } = setup();
    const draft = taskDraft(), input = prepare(draft), settled = vi.fn();
    const pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(39_999); expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "CORE_TIMEOUT" }) }));
    const nextInput = prepare(draft, "next"), nextSettled = vi.fn();
    const next = supervisor.request(nextInput).then(nextSettled);
    first.emit("message", response(input, { kind: "prepare", draft }));
    await vi.advanceTimersByTimeAsync(1);
    expect(nextSettled).not.toHaveBeenCalled(); expect(hooks.event).not.toHaveBeenCalled();
    first.emit("message", response(nextInput, { kind: "prepare", draft })); await next;
    expect(nextSettled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: true }));
    expect(settled).toHaveBeenCalledTimes(1); expect(first.postMessage).toHaveBeenCalledTimes(2);
  });

  it.each(["exit", "restart", "stop"] as const)("drops task Prepare on %s and ignores its late response", async (action) => {
    const { supervisor, first, children, hooks } = setup();
    const draft = taskDraft(), input = prepare(draft), settled = vi.fn();
    const pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(6_000); expect(settled).not.toHaveBeenCalled();
    if (action === "exit") first.exit();
    else if (action === "restart") supervisor.restart();
    else supervisor.stop();
    await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "CORE_UNAVAILABLE" }) }));
    first.emit("message", response(input, { kind: "prepare", draft }));
    if (action === "restart") first.exit();
    await vi.advanceTimersByTimeAsync(100);
    const replacement = children[1];
    if (replacement) {
      replacement.ready();
      expect(replacement.postMessage).not.toHaveBeenCalled();
      const nextSettled = vi.fn(), next = supervisor.request(input).then(nextSettled);
      first.emit("message", response(input, { kind: "prepare", draft }));
      await vi.advanceTimersByTimeAsync(34_000); // Cross the departed core's original deadline.
      expect(nextSettled).not.toHaveBeenCalled();
      replacement.emit("message", response(input, { kind: "prepare", draft })); await next;
      expect(nextSettled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: true }));
    }
    expect(settled).toHaveBeenCalledTimes(1); expect(hooks.event).not.toHaveBeenCalled();
  });

  it("preserves ordinary Prepare/read 5s, task reads 12s and untimed file writes beside attached Prepare", async () => {
    const { supervisor } = setup();
    const inputs: CoreRequest[] = [prepare(), prepare(agentFixtureContext(), "plain"),
      { protocolVersion: PROTOCOL_VERSION, requestId: "agents", type: "agent.snapshot" },
      { protocolVersion: PROTOCOL_VERSION, requestId: "tasks", type: "tasks.snapshot", worldId: "world:working", refresh: true },
      { protocolVersion: PROTOCOL_VERSION, requestId: "detail", type: "tasks.read", worldId: "world:working", metadataCommit: TASK_FIXTURE_COMMIT, taskId: "supervisor-task" },
      { protocolVersion: PROTOCOL_VERSION, requestId: "save", type: "file.write", path: "source.ts", content: "next", expectedRevision: "a".repeat(64) }];
    const settled = inputs.map(() => vi.fn());
    const pending = inputs.map((input, index) => supervisor.request(input).then(settled[index]!));
    await vi.advanceTimersByTimeAsync(4_999); settled.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(1);
    for (const index of [1, 2]) expect(settled[index]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error: expect.objectContaining({ code: "CORE_TIMEOUT" }) }));
    for (const index of [0, 3, 4, 5]) expect(settled[index]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6_999);
    for (const index of [3, 4]) expect(settled[index]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    for (const index of [3, 4]) expect(settled[index]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error: expect.objectContaining({ code: "CORE_TIMEOUT" }) }));
    expect(settled[0]).not.toHaveBeenCalled(); expect(settled[5]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(48_000); expect(settled[5]).not.toHaveBeenCalled();
    supervisor.stop(); await Promise.all(pending);
    expect(settled[5]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error: expect.objectContaining({ code: "WRITE_OUTCOME_UNKNOWN" }) }));
  });

  it.each(["admitted", "rejected"] as const)("keeps launch unknown at 5s when a synthetic %s reply arrives late; never replays", async (outcome) => {
    const { supervisor, first, hooks } = setup();
    const draft = taskDraft();
    const input: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch", runId: draft.runId, contextHash: draft.contextHash };
    const settled = vi.fn(), pending = supervisor.request(input).then(settled);
    await vi.advanceTimersByTimeAsync(4_999); expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error: expect.objectContaining({ code: "AGENT_OUTCOME_UNKNOWN" }) }));
    await vi.advanceTimersByTimeAsync(1_000);
    first.emit("message", outcome === "admitted"
      ? response(input, { kind: "launch", receipt: { runId: draft.runId, contextHash: draft.contextHash, admittedAt: draft.preparedAt, status: "admitted" } })
      : { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "STALE_CONTEXT", message: "Pinned metadata advanced" } });
    const read: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "reconcile", type: "agent.read", runId: draft.runId, afterRecord: 0 };
    const reading = supervisor.request(read);
    first.emit("message", outcome === "admitted"
      ? response(read, agentFixtureFrames(draft).admitted!.read)
      : { protocolVersion: PROTOCOL_VERSION, requestId: read.requestId, ok: false, error: { code: "RUN_NOT_ACTIVE", message: "No persisted run" } });
    const result = await reading;
    if (outcome === "admitted") expect(result).toMatchObject({ ok: true, agent: { kind: "read", run: { launchContext: draft.launchContext } } });
    else expect(result).toMatchObject({ ok: false, error: { code: "RUN_NOT_ACTIVE" } });
    // An absent run is only a failed read, never a revision of the unknown launch response.
    expect(settled).toHaveBeenCalledTimes(1); expect(hooks.event).not.toHaveBeenCalled();
    expect(first.postMessage.mock.calls.map(([request]) => request.type)).toEqual(["agent.launch", "agent.read"]);
  });
});
