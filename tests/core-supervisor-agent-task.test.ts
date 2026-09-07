// @vitest-environment node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreSupervisor } from "../app/electron/core-supervisor";
import { agentFixtureContext, agentFixtureFrames } from "../fixtures/agents";
import { TASK_FIXTURE_COMMIT } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { formatAgentContextV2, formatRepositoryTask } from "../protocol/agent-task";
import { PreparedAgentContextSchema, type AgentResult, type PreparedAgentContext } from "../protocol/agents";
import { PROTOCOL_VERSION, isAgentRequest, parseCoreResponseForRequest, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { RealWorkspaceProvider } from "../core/provider";
import { TaskGitReader } from "../core/tasks/git-reader";
import { advanceTaskFixture, createTaskFixture } from "../tools/task-integration/fixture.mjs";
import { createRehearsalAgentService, type RehearsalAgentService } from "./support/agent-rehearsal-service";

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

  it.each(["admitted", "rejected"] as const)("reconciles actual late %s after held CLI metadata revalidation without replay", async (outcome) => {
    // Real Git, YAML worker, disk context and private durable store; only the
    // supervisor response clock and a launch-time metadata gate are controlled.
    vi.useRealTimers();
    const directory = await mkdtemp(join(tmpdir(), "swarm-supervisor-task-launch-"));
    let service: RehearsalAgentService | undefined, supervisor: CoreSupervisor | undefined;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scanning = new Promise<void>((resolve) => { entered = resolve; });
    const deliveries = new Map<string, Promise<CoreResponse>>();
    let restoreScan = () => undefined;
    try {
      const fixture = await createTaskFixture(directory);
      const provider = await RealWorkspaceProvider.create(fixture.root);
      await provider.observeWorkingWorld(() => undefined);
      await provider.listRepository({ protocolVersion: PROTOCOL_VERSION, requestId: "source-directory", type: "repo.list",
        directory: "src", page: 0, filter: "", refresh: true }, () => undefined);
      const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === fixture.sourcePath)!.focus;
      const blob = execFileSync("git", ["rev-parse", `${fixture.firstCommit.hex}:.ditz/issue-${fixture.taskId}.yaml`],
        { cwd: fixture.root, encoding: "utf8" }).trim();
      const reference = { version: 1 as const, worldId: focus.worldId,
        repositoryId: `repository:${hash(fixture.root)}`, provider: "ditz" as const, taskId: fixture.taskId,
        metadataCommit: fixture.firstCommit, issueBlob: { algorithm: "sha1" as const, hex: blob } };
      service = await createRehearsalAgentService({ root: fixture.root, storeRoot: join(directory, "private"),
        snapshot: () => provider.snapshot(), emit() {} });
      const ownedService = service;
      const transport = setup(); supervisor = transport.supervisor;
      transport.first.postMessage.mockImplementation((input: CoreRequest | { type: "core.shutdown" }) => {
        if (!("requestId" in input) || !isAgentRequest(input)) throw new Error("Expected agent request");
        const delivery = ownedService.request(input).then((result): CoreResponse => {
          const reply = result.ok ? response(input, result.value)
            : { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: result.error };
          transport.first.emit("message", reply);
          return reply;
        });
        deliveries.set(input.requestId, delivery);
      });
      const prepared = await supervisor.request({ protocolVersion: PROTOCOL_VERSION, requestId: "real-prepare", type: "agent.prepare",
        worldId: focus.worldId, focus, taskText: "Explain the exact pinned task", taskReference: reference,
        model: null, effort: null, links: { parentRunId: null, task: null, spec: null } });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok || prepared.agent?.kind !== "prepare") throw new Error("Expected real task context");
      const draft = prepared.agent.draft;
      const content = formatRepositoryTask(reference, fixture.title, fixture.description);
      expect(draft.launchContext.repositoryTask).toMatchObject({ reference, content, digest: hash(content) });
      expect(draft.launchContext.attachments[0]?.content).toBe(fixture.sourceText);

      const originalScan = TaskGitReader.prototype.scan;
      const scan = vi.spyOn(TaskGitReader.prototype, "scan").mockImplementation(async function (this: TaskGitReader, ...args) {
        entered(); await gate;
        return originalScan.apply(this, args);
      });
      restoreScan = () => { scan.mockRestore(); return undefined; };
      // Keep Date and actual I/O real: advancing just timeout scheduling cannot
      // move the real metadata deadline or make worker timestamps run backwards.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const launch: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "real-launch", type: "agent.launch",
        runId: draft.runId, contextHash: draft.contextHash };
      const settled = vi.fn(), pending = supervisor.request(launch).then(settled);
      await scanning;
      await vi.advanceTimersByTimeAsync(4_999); expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await pending;
      expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: false,
        error: expect.objectContaining({ code: "AGENT_OUTCOME_UNKNOWN" }) }));
      expect(service.diagnostics().totals.start).toBe(0);
      vi.useRealTimers();
      if (outcome === "rejected") await advanceTaskFixture(fixture);
      release();
      const actual = await deliveries.get(launch.requestId)!;
      if (outcome === "admitted") expect(actual).toMatchObject({ ok: true, agent: { kind: "launch",
        receipt: { runId: draft.runId, contextHash: draft.contextHash, status: "admitted" } } });
      else expect(actual).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
      expect(scan).toHaveBeenCalledTimes(1);

      const read = await supervisor.request({ protocolVersion: PROTOCOL_VERSION, requestId: "real-read", type: "agent.read",
        runId: draft.runId, afterRecord: 0 });
      const snapshot = await supervisor.request({ protocolVersion: PROTOCOL_VERSION, requestId: "real-snapshot", type: "agent.snapshot" });
      if (outcome === "admitted") {
        expect(read).toMatchObject({ ok: true, agent: { kind: "read", run: { launchContext: draft.launchContext } } });
        expect(snapshot).toMatchObject({ ok: true, agent: { kind: "snapshot", snapshot: { runs: [{ runId: draft.runId }] } } });
        await vi.waitFor(() => expect(service!.diagnostics().totals.start).toBe(1));
      } else {
        expect(read).toMatchObject({ ok: false, error: { code: "RUN_NOT_ACTIVE" } });
        expect(snapshot).toMatchObject({ ok: true, agent: { kind: "snapshot", snapshot: { runs: [] } } });
        expect(service.diagnostics().totals.start).toBe(0);
      }
      // Even actual rejection and no durable run do not amend the caller's
      // timed-out result. Only a positive durable read establishes admission.
      expect(settled).toHaveBeenCalledTimes(1);
      expect(transport.first.postMessage.mock.calls.map(([request]) => request.type))
        .toEqual(["agent.prepare", "agent.launch", "agent.read", "agent.snapshot"]);
      expect(scan).toHaveBeenCalledTimes(1); // History reads never reread metadata.
    } finally {
      release(); vi.useRealTimers();
      await Promise.allSettled(deliveries.values());
      supervisor?.stop();
      await service?.shutdown();
      restoreScan();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
