// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustedLocalService, findTrustedExecutable, trustedPrompt } from "../core/agents/trusted-local";
import { RegisteredAgentContextProvider } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { PROTOCOL_VERSION, parseCoreRequest, uncertainMutationCode } from "../protocol/schema";
import { TrustedRequestSchema, type TrustedRequest } from "../protocol/trusted-local";
import { MemoryTrustedLocalStore } from "../core/agents/trusted-local-store";

const roots: string[] = [], owners: TrustedLocalService[] = [];
afterEach(async () => { await Promise.all(owners.splice(0).map((s) => s.shutdown())); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
const command = (type: TrustedRequest["type"], fields = {}) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type, ...fields });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-unit-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  await writeFile(join(root, "source.ts"), "const value = 'λ';\n"); git("add", "."); git("commit", "-qm", "fixture");
  const revision = await computeWorkingWorldFingerprint(root);
  const context = await RegisteredAgentContextProvider.create({ root, repositoryId: "repository:fixture", worldId: "world:working",
    workingRevision: () => revision, resolveFocus: async (focus) => [{ attachmentPath: focus.path ?? null, sourcePaths: focus.path ? [focus.path] : [] }],
    provenance: async () => ({ instructions: [], configuration: [] }) });
  const input = { worldId: "world:working", focus: { worldId: "world:working", revisionKind: "working" as const, revisionId: revision,
    domain: "repo" as const, key: "file:source.ts", path: "source.ts" }, taskText: "Explain the exact source", model: null, effort: null,
    links: { parentRunId: null, task: null, spec: null } };
  let status: "starting" | "ready" | "closed" = "starting";
  const session = { snapshot: () => ({ status, threadId: "thread", turnId: null, output: "", approvals: [], message: "Controlled unit session" }),
    start: vi.fn(async () => { status = "ready"; }), send: vi.fn(async () => {}), decide: vi.fn(async () => {}), stop: vi.fn(async () => { status = "closed"; }) };
  const createSession = vi.fn(async () => session);
  const service = new TrustedLocalService({ root, context, createSession }); owners.push(service);
  return { root, service, session, context, createSession, input };
}
describe("explicit trusted-local core authority", () => {
  it("starts exact plain text without source preparation in the captured selected worktree", async () => {
    const f = await fixture(), token = randomUUID();
    const prepare = vi.spyOn(f.context, "prepare");
    const request = command("trusted.start", { token, text: "\nExplain this project λ\n" });
    const snapshot = await f.service.request(request, "/checked/selected-worktree");
    expect(prepare).not.toHaveBeenCalled();
    expect(f.createSession).toHaveBeenCalledWith(expect.any(Function), "/checked/selected-worktree");
    expect(f.session.start).toHaveBeenCalledExactlyOnceWith("\nExplain this project λ\n", null);
    expect(snapshot).toMatchObject({ runToken: token, workspace: "/checked/selected-worktree", initialText: "\nExplain this project λ\n" });
    expect(snapshot.runs?.[0]).toMatchObject({ workspace: "/checked/selected-worktree", initialText: "\nExplain this project λ\n", taskReference: null });
    await expect(f.service.request({ ...request, requestId: randomUUID() }, f.root)).rejects.toThrow("already submitted");
    await f.service.request(command("trusted.send", { token, text: "Continue" }), f.root);
    await f.service.request(command("trusted.stop", { token }), f.root);
    expect(f.session.send).toHaveBeenCalledWith("Continue"); expect(f.session.stop).toHaveBeenCalled();
    expect(f.createSession).toHaveBeenCalledOnce();
    expect(uncertainMutationCode(request)).toBe("AGENT_OUTCOME_UNKNOWN");
    expect(() => parseCoreRequest({ ...request, root: "/unchecked" })).toThrow();
    for (const text of [" ", "\0bad", "x".repeat(16385)]) expect(() => command("trusted.start", { token: randomUUID(), text })).toThrow();
  });
  it("saves failed startup text and permanently reserves its token before creating Codex", async () => {
    const f = await fixture(), store = new MemoryTrustedLocalStore(), token = randomUUID();
    const createSession = vi.fn(async () => {
      expect((await store.load())[0]?.summary).toMatchObject({ runToken: token, initialText: "Do not lose this" });
      expect(store.admittedTokens()).toContain(token);
      throw new Error("Codex is not installed. Install Codex and try a new conversation.");
    });
    const owner = new TrustedLocalService({ root: f.root, context: f.context, createSession, store }); owners.push(owner);
    await expect(owner.request(command("trusted.start", { token, text: "Do not lose this" }))).rejects.toThrow("not installed");
    expect(owner.snapshot(token)).toMatchObject({ status: "failed", archived: true, initialText: "Do not lose this" });
    await owner.shutdown();
    const restarted = new TrustedLocalService({ root: f.root, context: f.context, createSession, store }); owners.push(restarted);
    const saved = await restarted.request(command("trusted.snapshot", { token }));
    expect(saved.initialText).toBe("Do not lose this");
    await expect(restarted.request(command("trusted.start", { token, text: "Do not lose this" }))).rejects.toThrow("already submitted");
    expect(createSession).toHaveBeenCalledOnce();
  });
  it("does not start a stopped direct admission when its process factory arrives late", async () => {
    const f = await fixture(), token = randomUUID();
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    f.createSession.mockImplementation(async () => { await gate; return f.session; });
    const pending = f.service.request(command("trusted.start", { token, text: "Start once" }));
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledOnce());
    await f.service.request(command("trusted.stop", { token })); release();
    await expect(pending).rejects.toThrow("cancelled");
    expect(f.session.start).not.toHaveBeenCalled(); expect(f.session.stop).toHaveBeenCalled();
    expect(f.service.snapshot(token).initialText).toBe("Start once");
  });
  it("keeps evicted direct admission identities across restart without opening sessions", async () => {
    const f = await fixture(), store = new MemoryTrustedLocalStore();
    const owner = new TrustedLocalService({ root: f.root, context: f.context, createSession: f.createSession, store }); owners.push(owner);
    const first = randomUUID();
    for (let n = 0; n < 21; n++) {
      const token = n === 0 ? first : randomUUID();
      await owner.request(command("trusted.start", { token, text: `Task ${n}` }));
      await owner.request(command("trusted.stop", { token }));
    }
    expect(owner.snapshot().runs).toHaveLength(20);
    expect(owner.snapshot().runs?.some((run) => run.runToken === first)).toBe(false);
    await owner.shutdown();
    const createSession = vi.fn(f.createSession.getMockImplementation()!);
    const restarted = new TrustedLocalService({ root: f.root, context: f.context, createSession, store }); owners.push(restarted);
    await restarted.request(command("trusted.snapshot"));
    await expect(restarted.request(command("trusted.start", { token: first, text: "Do not replay" }))).rejects.toThrow("already submitted");
    expect(createSession).not.toHaveBeenCalled();
  });
  it("materializes exact disk context, excludes false read-only claims and launches once", async () => {
    const f = await fixture();
    const prepared = await f.service.request(command("trusted.prepare", { input: f.input }));
    expect(prepared.status).toBe("idle"); expect(prepared.workspace).toBe(f.root);
    const prompt = JSON.parse(prepared.preparation!.prompt);
    expect(prompt.profile).toBe("trusted-local"); expect(prompt.attachments[0].content).toBe("const value = 'λ';\n");
    expect(prompt.access).toBeUndefined(); expect(f.createSession).not.toHaveBeenCalled();
    const launch = command("trusted.launch", { token: prepared.preparation!.token });
    await f.service.request(launch);
    await expect(f.service.request(launch)).rejects.toThrow("Duplicate");
    await expect(f.service.request(command("trusted.launch", { token: prepared.preparation!.token }))).rejects.toThrow();
    expect(f.createSession).toHaveBeenCalledTimes(1); expect(f.session.start).toHaveBeenCalledWith(prepared.preparation!.prompt, null);
    await f.service.request(command("trusted.snapshot")); await f.service.request(command("trusted.snapshot"));
    expect(f.session.start).toHaveBeenCalledTimes(1);
  });
  it("rejects stale disk and a replaced preparation without starting Codex", async () => {
    const f = await fixture();
    const first = await f.service.request(command("trusted.prepare", { input: f.input }));
    const second = await f.service.request(command("trusted.prepare", { input: { ...f.input, taskText: "Another instruction" } }));
    await expect(f.service.request(command("trusted.launch", { token: first.preparation!.token }))).rejects.toThrow("replaced");
    await writeFile(join(f.root, "source.ts"), "changed\n");
    await expect(f.service.request(command("trusted.launch", { token: second.preparation!.token }))).rejects.toThrow("changed");
    expect(f.createSession).not.toHaveBeenCalled();
  });
  it("rejects wrong world, cwd, target controls and missing binary", async () => {
    const f = await fixture();
    await expect(f.service.request(command("trusted.prepare", { input: { ...f.input, worldId: "wrong", focus: { ...f.input.focus, worldId: "wrong" } } }))).rejects.toThrow();
    const prepared = await f.context.prepare(f.input); if (!prepared.ok) throw new Error("fixture");
    const wrong = new TrustedLocalService({ root: "/wrong-root", context: { prepare: async () => prepared, dispose: async () => {} }, createSession: f.createSession }); owners.push(wrong);
    await expect(wrong.request(command("trusted.prepare", { input: f.input }))).rejects.toThrow("workspace");
    await expect(f.service.request(command("trusted.stop", { token: randomUUID() }))).rejects.toThrow("target");
    await expect(findTrustedExecutable("/missing/swarm-trusted-codex")).rejects.toThrow("unavailable");
    expect(f.createSession).not.toHaveBeenCalled();
    expect(JSON.parse(trustedPrompt(prepared.value)).workspace).toBe(f.root);
  });
  it("Stop during held launch setup prevents any turn and closes the late owner", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.createSession.mockImplementation(async () => { await gate; return f.session; });
    const prepared = await f.service.request(command("trusted.prepare", { input: f.input }));
    const token = prepared.preparation!.token;
    const launching = f.service.request(command("trusted.launch", { token }));
    await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledOnce());
    await f.service.request(command("trusted.stop", { token }));
    release(); await expect(launching).rejects.toThrow("cancelled");
    expect(f.session.start).not.toHaveBeenCalled(); expect(f.session.stop).toHaveBeenCalled();
  });
  it("shutdown cancels materialization before launch and waits for the owner", async () => {
    const f = await fixture();
    const p = await f.service.request(command("trusted.prepare", { input: f.input }));
    await f.service.shutdown();
    await expect(f.service.request(command("trusted.launch", { token: p.preparation!.token }))).rejects.toThrow("closed");
    expect(f.createSession).not.toHaveBeenCalled();
  });
  it("retains Stop authority after the conversation command budget is exhausted", async () => {
    const f = await fixture();
    const p = await f.service.request(command("trusted.prepare", { input: f.input }));
    const token = p.preparation!.token;
    await f.service.request(command("trusted.launch", { token }));
    for (let n = 0; n < 510; n++) await f.service.request(command("trusted.send", { token, text: "bounded control" }));
    await expect(f.service.request(command("trusted.send", { token, text: "over budget" }))).rejects.toThrow("limit");
    expect((await f.service.request(command("trusted.stop", { token }))).status).toBe("closed");
    expect(f.session.stop).toHaveBeenCalled();
  });
  it("accepts only typed controls and marks mutations uncertain on bridge loss", () => {
    expect(() => parseCoreRequest({ ...command("trusted.snapshot"), cwd: "/other" })).toThrow();
    for (const type of ["trusted.launch", "trusted.send", "trusted.decide", "trusted.stop"] as const) {
      const c = command(type, { token: randomUUID(), ...(type === "trusted.send" ? { text: "hello" } : {}), ...(type === "trusted.decide" ? { approvalId: "1", choice: "accept" } : {}) });
      expect(uncertainMutationCode(c)).toBe("AGENT_OUTCOME_UNKNOWN");
    }
  });
});
