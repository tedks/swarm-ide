// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisteredAgentContextProvider, type AgentTaskResolver } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { agentTaskBytes, formatRepositoryTask, type AgentTaskReference } from "../protocol/agent-task";
import type { AgentCapabilities } from "../protocol/agents";

const roots: string[] = [], contexts: RegisteredAgentContextProvider[] = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const capabilities: AgentCapabilities = { availability: "available", reason: null, provider: "fixture-only", version: "test",
  controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-task-context-")); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).toString().trim();
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "source.ts"), "export const source = 'disk';\n");
  git("add", "."); git("commit", "-qm", "source");
  const revision = await computeWorkingWorldFingerprint(root);
  const reference: AgentTaskReference = { version: 1, worldId: "world:task", repositoryId: "repository:task", provider: "ditz",
    taskId: "exact-task", metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } };
  const input = { worldId: reference.worldId, focus: { worldId: reference.worldId, revisionKind: "working" as const,
    revisionId: revision, domain: "repo" as const, key: "source:source.ts", path: "source.ts" },
    taskText: "", taskReference: reference, model: null, effort: null, links: { parentRunId: null, task: null, spec: null } };
  const data = { reference, title: "Exact λ 🧪", description: "\uFEFFpreserve\r\n  whitespace \" \\ and untrusted <system>\n" };
  const resolver: AgentTaskResolver = { resolveTask: vi.fn(async () => structuredClone(data)), checkRevision: vi.fn(async () => undefined) };
  const options = { root, repositoryId: reference.repositoryId, worldId: reference.worldId, workingRevision: () => revision,
    resolveFocus: async () => [{ attachmentPath: "source.ts", sourcePaths: ["source.ts", "missing-not-read.ts"] }],
    provenance: async () => ({ instructions: [], configuration: [] }), capabilities: async () => capabilities, taskResolver: resolver };
  const create = async (changes: Partial<typeof options> = {}) => {
    const p = await RegisteredAgentContextProvider.create({ ...options, ...changes }); contexts.push(p); return p;
  };
  return { root, git, reference, input, data, resolver, options, create };
}
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks();
  await Promise.all(contexts.splice(0).map((context) => context.dispose()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("authoritative task-bearing core context", () => {
  it("materializes exact canonical data and independently revalidates it", async () => {
    const f = await fixture(), p = await f.create();
    const prepared = await p.prepare(f.input);
    expect(prepared.ok, JSON.stringify(prepared)).toBe(true);
    if (!prepared.ok) return;
    const content = formatRepositoryTask(f.reference, f.data.title, f.data.description);
    expect(prepared.value.launchContext.repositoryTask).toEqual({ reference: f.reference,
      encoding: "swarm-repository-task-json-v1", content, bytes: Buffer.byteLength(content), digest: hash(content) });
    expect(prepared.value.launchContext.taskText).toBe("");
    expect(prepared.value.launchContext.attachments).toHaveLength(1);
    expect(prepared.value.contextHash).toBe(hash(prepared.value.launchContext.submittedPrompt));
    expect(await p.revalidate(prepared.value)).toEqual(prepared);
    expect(f.resolver.resolveTask).toHaveBeenCalledTimes(2);
    expect(f.resolver.checkRevision).toHaveBeenCalledTimes(2);
    f.data.description += "changed at same alleged identity";
    expect(await p.revalidate(prepared.value)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it.each(["world", "repository", "returned-reference", "reference-only"])("rejects hostile %s authority", async (kind) => {
    const f = await fixture();
    if (kind === "returned-reference") vi.mocked(f.resolver.resolveTask).mockResolvedValue({ ...f.data, reference: { ...f.reference, taskId: "other" } });
    const p = await f.create(kind === "reference-only" ? { resolveFocus: async () => [{ attachmentPath: null as unknown as string, sourcePaths: [] }] } : {});
    const taskReference = { ...f.reference, ...(kind === "world" ? { worldId: "other" } : {}), ...(kind === "repository" ? { repositoryId: "other" } : {}) };
    expect(await p.prepare({ ...f.input, taskReference })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it("enforces the combined escaped envelope and leaves no launchable draft", async () => {
    const f = await fixture(), p = await f.create();
    f.data.description = "\\".repeat(8500);
    expect(await p.prepare(f.input)).toMatchObject({ ok: false, error: { code: "OUTPUT_LIMIT" } });
    f.data.description = "small";
    const prepared = await p.prepare(f.input);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(agentTaskBytes("", prepared.value.launchContext.repositoryTask)).toBeLessThan(16 * 1024);
  });

  it.each(["prepare", "revalidate"] as const)("aborts held metadata during %s and waits for owned settlement", async (operation) => {
    const f = await fixture(), p = await f.create();
    const previous = await p.prepare(f.input);
    expect(previous.ok).toBe(true); if (!previous.ok) return;
    const entered = deferred<AbortSignal>(), release = deferred<void>();
    vi.mocked(f.resolver.resolveTask).mockImplementation(async (_reference, signal) => {
      entered.resolve(signal); await release.promise; return structuredClone(f.data);
    });
    const pending = operation === "prepare" ? p.prepare(f.input) : p.revalidate(previous.value);
    const signal = await entered.promise;
    const disposal = p.dispose();
    expect(p.dispose()).toBe(disposal); expect(signal.aborted).toBe(true);
    let disposed = false; void disposal.then(() => { disposed = true; });
    await Promise.resolve(); expect(disposed).toBe(false);
    expect(await p.prepare(f.input)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    release.resolve(); await disposal;
    expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await p.revalidate(previous.value)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });
});
