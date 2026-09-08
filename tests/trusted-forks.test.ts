// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, uncertainMutationCode } from "../protocol/schema";
import { TrustedRequestSchema, TrustedRunSummarySchema, type TrustedRequest } from "../protocol/trusted-local";
import { TrustedLocalService, type TrustedLocalOptions } from "../core/agents/trusted-local";
import { MemoryTrustedLocalStore } from "../core/agents/trusted-local-store";
import { RegisteredAgentContextProvider } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import type { TrustedForkPoint, TrustedLocalSessionSnapshot } from "../core/agents/trusted-local-session";

const roots: string[] = [], services: TrustedLocalService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map((s) => s.shutdown())); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
const command = (type: TrustedRequest["type"], fields = {}) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type, ...fields });
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-fork-unit-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "fixture");
  const revision = await computeWorkingWorldFingerprint(root);
  const context = await RegisteredAgentContextProvider.create({ root, repositoryId: "repository:fixture", worldId: "world:working",
    workingRevision: () => revision, resolveFocus: async () => [{ attachmentPath: null, sourcePaths: [] }], provenance: async () => ({ instructions: [], configuration: [] }) });
  const input = { worldId: "world:working", focus: { worldId: "world:working", revisionKind: "working", revisionId: revision, domain: "repo", key: "directory:." },
    taskText: "Parent instructions", model: null, effort: null, links: { parentRunId: null, task: null, spec: null } };
  const session = (notify: () => void) => {
    const state: TrustedLocalSessionSnapshot = { status: "starting", threadId: null, turnId: null, output: "", approvals: [], message: "controlled" };
    return { state, snapshot: () => structuredClone(state), forkPoint: () => state.status === "ready" && state.threadId && state.turnId ? { threadId: state.threadId, turnId: state.turnId } : null,
      start: vi.fn(async (_prompt: string, _model: string | null, _fork?: TrustedForkPoint) => { Object.assign(state, { status: "ready", threadId: randomUUID(), turnId: randomUUID() }); notify(); }),
      send: vi.fn(async () => {}), decide: vi.fn(async () => {}), stop: vi.fn(async () => { state.status = "closed"; notify(); }),
    };
  };
  const sessions: ReturnType<typeof session>[] = [];
  const createSession = vi.fn(async (notify: () => void) => { const s = session(notify); sessions.push(s); return s; });
  const store = new MemoryTrustedLocalStore();
  const options: TrustedLocalOptions = { root, context, createSession, store };
  const service = new TrustedLocalService(options); services.push(service);
  const prepare = async () => (await service.request(command("trusted.prepare", { input }))).preparation!.token;
  const launch = async () => { const token = await prepare(); await service.request(command("trusted.launch", { token })); return token; };
  const parent = await launch();
  const fork = (token = parent, extra = {}) => {
    const snapshot = service.snapshot(token), point = snapshot.forkPoint!;
    return command("trusted.fork", { token, childToken: randomUUID(), expectedInstanceId: snapshot.instanceId, expectedThreadId: point.threadId, expectedTurnId: point.turnId,
      text: "Explain the inherited context", model: null, ...extra });
  };
  return { service, sessions, createSession, store, options, context, launch, prepare, parent, fork };
}

describe("typed native fork boundary", () => {
  it("accepts explicit pinned child creation and classifies lost acknowledgement as unknown", () => {
    const request = TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "fork-once", type: "trusted.fork",
      token: randomUUID(), childToken: randomUUID(), expectedInstanceId: randomUUID(), expectedThreadId: "parent", expectedTurnId: "completed", text: "Child instruction", model: null });
    expect(uncertainMutationCode(request)).toBe("AGENT_OUTCOME_UNKNOWN");
  });
  it("retains optional explicit lineage without assigning the parent's task", () => {
    const parent = randomUUID();
    const parsed = TrustedRunSummarySchema.parse({ runToken: randomUUID(), title: "Child", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      status: "starting", archived: false, approvalCount: 0, taskReference: null, message: "Forking",
      fork: { parentRunToken: parent, parentThreadId: "parent", parentTurnId: "completed", sharedWorkspace: true, inheritedTaskReference: null, confirmed: false } });
    expect(parsed).toHaveProperty("fork.parentRunToken", parent);
  });
});

describe("owned child admission and retained lineage", () => {
  it("forks a child recursively while preserving parent and unrelated preparation", async () => {
    const f = await fixture(), before = f.service.snapshot(f.parent), preparation = await f.prepare();
    const request = f.fork(), child = await f.service.request(request);
    expect(request.type).toBe("trusted.fork"); if (request.type !== "trusted.fork") throw new Error("fixture");
    expect(child.runToken).toBe(request.childToken);
    expect(child.runs?.find((r) => r.runToken === child.runToken)?.fork).toEqual({ parentRunToken: f.parent, parentThreadId: before.threadId,
      parentTurnId: before.turnId, sharedWorkspace: true, inheritedTaskReference: null, confirmed: true });
    expect(child.taskReference).toBeNull(); expect(child.preparation?.token).toBe(preparation);
    const call = f.sessions[1]!.start.mock.calls[0]!;
    expect(call[2]).toEqual(before.forkPoint); expect(JSON.parse(call[0]).instructions).toBe(request.text);
    expect(JSON.parse(call[0]).contextNotice).toContain("not a new task assignment");
    const grandchild = await f.service.request(f.fork(child.runToken!));
    expect(grandchild.runs?.find((r) => r.runToken === grandchild.runToken)?.fork?.parentRunToken).toBe(child.runToken);
    await f.service.request(command("trusted.stop", { token: child.runToken }));
    expect(f.service.snapshot(f.parent)).toMatchObject({ threadId: before.threadId, turnId: before.turnId, status: "ready", output: before.output });
    expect(f.sessions[0]!.stop).not.toHaveBeenCalled(); expect(f.service.snapshot(grandchild.runToken!).status).toBe("ready");
  });
  it("rejects stale owner/turn/thread, busy, unknown and archived parents before creating a child", async () => {
    const f = await fixture();
    for (const extra of [{ expectedInstanceId: randomUUID() }, { expectedThreadId: "wrong" }, { expectedTurnId: "wrong" }, { token: randomUUID() }])
      await expect(f.service.request(f.fork(f.parent, extra))).rejects.toThrow();
    const request = f.fork(); f.sessions[0]!.state.status = "running";
    await expect(f.service.request(request)).rejects.toThrow("completed");
    f.sessions[0]!.state.status = "ready"; const archivedRequest = f.fork();
    await f.service.request(command("trusted.stop", { token: f.parent }));
    await expect(f.service.request(archivedRequest)).rejects.toThrow("completed");
    expect(f.createSession).toHaveBeenCalledOnce();
  });
  it("reserves admission once before persistence, and Stop closes a late owner without dispatch", async () => {
    const f = await fixture(), request = f.fork(); if (request.type !== "trusted.fork") throw new Error("fixture");
    const gate = held<void>(), original = f.createSession.getMockImplementation()!;
    f.createSession.mockImplementation(async (notify) => { await gate.promise; return original(notify); });
    const operation = f.service.request(request);
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledTimes(2));
    await expect(f.service.request(request)).rejects.toThrow("Duplicate");
    await expect(f.service.request({ ...request, requestId: randomUUID() })).rejects.toThrow("already used");
    await f.service.request(command("trusted.stop", { token: request.childToken }));
    gate.resolve(); await expect(operation).rejects.toThrow("cancelled");
    expect(f.sessions[1]!.start).not.toHaveBeenCalled(); expect(f.sessions[1]!.stop).toHaveBeenCalledOnce();
    expect(f.service.snapshot(f.parent).status).toBe("ready");
  });
  it("keeps capacity at eight, retains twenty and never reuses an evicted child token", async () => {
    const f = await fixture();
    for (let n = 0; n < 7; n++) await f.service.request(f.fork());
    await expect(f.service.request(f.fork())).rejects.toThrow("Eight");
    for (const run of f.service.snapshot().runs!) if (run.runToken !== f.parent) await f.service.request(command("trusted.stop", { token: run.runToken }));
    const first = f.fork(); if (first.type !== "trusted.fork") throw new Error("fixture");
    for (let n = 0; n < 22; n++) {
      const child = await f.service.request(n === 0 ? first : f.fork());
      await f.service.request(command("trusted.stop", { token: child.runToken }));
    }
    expect(f.service.snapshot().runs).toHaveLength(20);
    expect(f.service.snapshot().runs!.some((r) => r.runToken === first.childToken)).toBe(false);
    await expect(f.service.request({ ...first, requestId: randomUUID() })).rejects.toThrow("already used");
  });
  it("persists lineage as history with zero provider replay and preserves legacy records", async () => {
    const f = await fixture(), request = f.fork(), child = await f.service.request(request);
    const saved = await f.store.load(), recoveredStore = new MemoryTrustedLocalStore(); await recoveredStore.save(saved);
    const createSession = vi.fn(async (notify: () => void) => f.createSession(notify));
    const recovered = new TrustedLocalService({ ...f.options, context: { prepare: f.context.prepare.bind(f.context), dispose: async () => {} }, store: recoveredStore, createSession }); services.push(recovered);
    const history = await recovered.request(command("trusted.snapshot", { token: child.runToken }));
    expect(history.archived).toBe(true); expect(history.forkPoint).toBeNull();
    expect(history.runs?.find((r) => r.runToken === child.runToken)?.fork).toEqual(child.runs?.find((r) => r.runToken === child.runToken)?.fork);
    expect(history.runs?.find((r) => r.runToken === f.parent)?.fork).toBeUndefined();
    await expect(recovered.request({ ...request, requestId: randomUUID() })).rejects.toThrow("owner changed");
    expect(createSession).not.toHaveBeenCalled();
  });
  it("does not start a child if durable admission fails", async () => {
    const f = await fixture(); vi.spyOn(f.store, "save").mockRejectedValue(new Error("full"));
    await expect(f.service.request(f.fork())).rejects.toThrow("could not be saved");
    expect(f.createSession).toHaveBeenCalledOnce();
  });
});
