import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceContextRouter, resolveWorkspaceSelection, type RootedRuntime } from "../core/workspace-context";
import { createWorkspaceRuntime } from "../core/worker-runtime";
import { readWorkspaceFile, writeWorkspaceFile } from "../core/files";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, parseCoreRequest, parseCoreResponseForRequest, FileEventSchema, type WorkspaceSnapshot } from "../protocol/schema";
import type { WorkspaceSelection } from "../protocol/workspace";

const SESSION = "10000000-0000-4000-8000-000000000001";
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
async function repositories() {
  const directory = await mkdtemp(join(tmpdir(), "swarm-workspace-context-")); directories.push(directory);
  const primary = join(directory, "primary"), other = join(directory, "other"), unrelated = join(directory, "unrelated");
  await mkdir(primary); await mkdir(unrelated);
  for (const root of [primary, unrelated]) {
    git(root, "init", "--quiet", "--initial-branch=master"); await writeFile(join(root, "same.txt"), "launch bytes\n");
    git(root, "add", "same.txt"); git(root, "-c", "user.name=Workspace test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Initial");
  }
  git(primary, "worktree", "add", "--quiet", "-b", "agent-work", other);
  await writeFile(join(other, "same.txt"), "agent bytes\n");
  const registry = join(directory, "registry.json");
  const register = (root: string) => writeFile(registry, JSON.stringify({ version: 1, sessions: [{
    id: SESSION, label: "Agent", rollout: join(directory, "agent.jsonl"), contextRoot: root,
  }] }), { mode: 0o600 });
  await register(other);
  return { primary, other, unrelated, registry, register };
}
const selection = (id: string, sessionId: string | null = null): WorkspaceSelection => ({
  id, root: `/work/${id}`, label: id, sessionId, branch: "master", base: null, changes: [], changesComplete: true,
});
const snapshot = (id: string): WorkspaceSnapshot => ({ ...initialSnapshot(), project: { id, name: id } });
const command = (type: string, fields = {}) => ({ protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID(), type, ...fields });
function fixture() {
  const calls: Array<{ id: string; input: unknown }> = [], outputs: unknown[] = [];
  const primary = selection("primary"), other = selection("other", SESSION);
  const create = vi.fn((selected: WorkspaceSelection): RootedRuntime => ({
    ready: Promise.resolve(snapshot(selected.id)), snapshot: async () => snapshot(selected.id),
    async request(input) { calls.push({ id: selected.id, input }); }, shutdown: vi.fn(async () => {}), close: vi.fn(),
  }));
  const router = new WorkspaceContextRouter({ resolve: async (sessionId) => sessionId === null ? primary : other,
    create, post: (value) => outputs.push(value) });
  return { router, calls, outputs, create, primary, other };
}

describe("workspace routing", () => {
  it("does not create a runtime when primary registration resolves after close", async () => {
    let release!: (selection: WorkspaceSelection) => void;
    const registration = new Promise<WorkspaceSelection>((resolve) => { release = resolve; });
    const create = vi.fn((): RootedRuntime => ({ ready: Promise.resolve(snapshot("primary")), snapshot: async () => snapshot("primary"),
      request: async () => {}, shutdown: async () => {}, close() {} }));
    const router = new WorkspaceContextRouter({ resolve: () => registration, create, post() {} });
    router.close();
    release(selection("primary"));
    await expect(router.primary).rejects.toThrow("shutting down");
    expect(create).not.toHaveBeenCalled();
  });
  it("accepts the scope envelope without loosening strict domain command fields", () => {
    expect(parseCoreRequest(command("repo.list", { workspaceId: "other", directory: "", page: 0, filter: "", refresh: true }))).toMatchObject({ workspaceId: "other" });
    expect(() => parseCoreRequest(command("repo.list", { workspaceId: "other", directory: "", page: 0, refresh: true, root: "/etc" }))).toThrow();
    expect(() => parseCoreRequest(command("workspace.open", { sessionId: SESSION, root: "/etc" }))).toThrow();
    expect(() => parseCoreRequest(command("file.read", { workspaceId: "", path: "same.txt" }))).toThrow();
  });
  it("opens a context once and routes explicit root and existing repository identity without changing legacy requests", async () => {
    const { router, calls, outputs, create } = fixture();
    await router.request(command("workspace.open", { sessionId: SESSION }));
    await router.request(command("workspace.open", { sessionId: SESSION }));
    await router.request(command("file.read", { workspaceId: "other", path: "same.txt" }));
    await router.request(command("file.read", { path: "same.txt" }));
    await router.request(command("plans.read", { repositoryId: "other", worldId: "world:working" }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(calls.map((call) => call.id)).toEqual(["other", "primary", "other"]);
    expect(calls[0]!.input).not.toHaveProperty("workspaceId");
    expect(outputs[0]).toMatchObject({ ok: true, workspaceId: "other", workspace: { id: "other" }, snapshot: { project: { id: "other" } } });
    await router.shutdown();
  });
  it("rejects unopened/mixed roots and nonlaunch preparation while observation remains shared", async () => {
    const { router, calls, outputs } = fixture();
    await router.request(command("file.read", { workspaceId: "unopened", path: "same.txt" }));
    await router.request(command("plans.read", { workspaceId: "primary", repositoryId: "other", worldId: "world:working" }));
    await router.request(command("trusted.launch", { workspaceId: "other", token: SESSION }));
    await router.request(command("agent.snapshot", { workspaceId: "other" }));
    expect(outputs.slice(0, 3)).toEqual(expect.arrayContaining([expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "UNSUPPORTED_CONTROL" }) })]));
    expect(outputs.slice(0, 3).every((value) => (value as { ok: boolean }).ok === false)).toBe(true);
    expect(calls).toHaveLength(1); expect(calls[0]!.id).toBe("primary");
    await router.shutdown();
  });
  it("validates scope correlation on responses and preserves workspace identity on file events", () => {
    const input = parseCoreRequest(command("file.read", { workspaceId: "other", path: "same.txt" }));
    const response = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 1,
      workspaceId: "other", snapshot: snapshot("other"), file: { kind: "read", path: "same.txt", content: "x", size: 1, revision: "a".repeat(64) } };
    expect(parseCoreResponseForRequest(response, input).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...response, workspaceId: "primary" }, input)).toThrow("Workspace");
    expect(FileEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: new Date().toISOString(),
      workspaceId: "other", path: "same.txt", revision: null, change: "deleted" })).toHaveProperty("workspaceId", "other");
  });
  it("waits for readiness and leaves existing context usable after failed selection", async () => {
    const outputs: unknown[] = [], calls: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const router = new WorkspaceContextRouter({ resolve: async (id) => id === null ? selection("primary") : selection("other", SESSION),
      post: (value) => outputs.push(value), create: (s) => ({ ready: s.id === "other" ? held.then(() => { throw new Error("target removed"); }) : Promise.resolve(snapshot(s.id)),
        snapshot: async () => snapshot(s.id), request: async () => { calls.push(s.id); }, shutdown: async () => {}, close() {} }) });
    const opening = router.request(command("workspace.open", { sessionId: SESSION }));
    await router.request(command("file.read", { path: "same.txt" }));
    expect(outputs).toHaveLength(0); release(); await opening;
    await router.request(command("file.read", { path: "same.txt" }));
    expect(outputs).toContainEqual(expect.objectContaining({ ok: false })); expect(calls).toEqual(["primary", "primary"]);
    await router.shutdown();
  });
});

describe("registered same-repository selection", () => {
  it("the actual root runtimes read and write their own same-path file, publish scoped events, and never announce secondary readiness", async () => {
    const { primary, registry } = await repositories();
    const a = await resolveWorkspaceSelection(primary, registry, null), b = await resolveWorkspaceSelection(primary, registry, SESSION);
    const output: unknown[] = [];
    const first = createWorkspaceRuntime(a.root, a.id, false, {}, (message) => output.push(message));
    const second = createWorkspaceRuntime(b.root, b.id, false, {}, (message) => output.push(message));
    try {
      await Promise.all([first.ready, second.ready]);
      const readA = command("file.read", { path: "same.txt" }), readB = command("file.read", { path: "same.txt" });
      await first.request(readA); await second.request(readB);
      const responseA = output.find((value) => (value as { requestId?: string }).requestId === readA.requestId);
      const responseB = output.find((value) => (value as { requestId?: string }).requestId === readB.requestId);
      expect(responseA).toMatchObject({ workspaceId: a.id, file: { content: "launch bytes\n" } });
      expect(responseB).toMatchObject({ workspaceId: b.id, file: { content: "agent bytes\n" } });
      const before = await readWorkspaceFile(a.root, "same.txt");
      const saving = command("file.write", { path: "same.txt", expectedRevision: before.revision, content: "first stays first\n" });
      await Promise.all([first.request(saving), second.request(command("file.read", { path: "same.txt" }))]);
      expect(output.find((value) => (value as { requestId?: string }).requestId === saving.requestId)).toMatchObject({ ok: true, workspaceId: a.id });
      expect((await readWorkspaceFile(b.root, "same.txt")).content).toBe("agent bytes\n");
      expect(output.some((value) => (value as { type?: string }).type === "core.ready")).toBe(false);
      expect(output.some((value) => (value as { type?: string }).type === "agent.changed")).toBe(false);
    } finally { await Promise.all([first.shutdown(), second.shutdown()]); }
  });
  it("returns distinct root identities and real branch/master comparison; another repository is rejected", async () => {
    const { primary, other, unrelated, registry, register } = await repositories();
    const a = await resolveWorkspaceSelection(primary, registry, null), b = await resolveWorkspaceSelection(primary, registry, SESSION);
    expect(b.id).not.toBe(a.id); expect(b).toMatchObject({ root: other, branch: "agent-work", base: "master", sessionId: SESSION });
    expect(b.changes).toContainEqual({ path: "same.txt", status: "modified" });
    await register(unrelated); await expect(resolveWorkspaceSelection(primary, registry, SESSION)).rejects.toThrow("this Git repository");
  });
  it("an accepted write holds its original root while another same-path file is explored", async () => {
    const { primary, other, registry } = await repositories();
    const a = await resolveWorkspaceSelection(primary, registry, null), b = await resolveWorkspaceSelection(primary, registry, SESSION);
    const original = await readWorkspaceFile(a.root, "same.txt");
    const saving = writeWorkspaceFile(a.root, "same.txt", original.revision, "saved to launch\n");
    expect((await readWorkspaceFile(b.root, "same.txt")).content).toBe("agent bytes\n");
    await saving;
    expect(await readFile(join(primary, "same.txt"), "utf8")).toBe("saved to launch\n");
    expect(await readFile(join(other, "same.txt"), "utf8")).toBe("agent bytes\n");
  });
});
