// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisteredAgentContextProvider, type AgentTaskResolver } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { agentTaskBytes, formatRepositoryTask, type AgentTaskReference } from "../protocol/agent-task";
import type { AgentCapabilities } from "../protocol/agents";
import { createAgentTaskResolver } from "../core/tasks/draft-context";
import { TaskGitReader } from "../core/tasks/git-reader";
import * as metadata from "../core/tasks/metadata";
import { TASK_LIMITS } from "../protocol/tasks";
import { createTaskFixture, invalidateTaskFixture, removeTaskMetadata, restoreTaskFixture } from "../tools/task-integration/fixture.mjs";

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

  it("brackets the last source observation with final metadata authority", async () => {
    const f = await fixture(); const order: string[] = [];
    vi.mocked(f.resolver.resolveTask).mockImplementation(async () => { order.push("resolve-task"); return structuredClone(f.data); });
    vi.mocked(f.resolver.checkRevision).mockImplementation(async () => { order.push("check-ref"); throw new Error("private raw metadata"); });
    const p = await f.create({ provenance: async () => { order.push("source"); return { instructions: [], configuration: [] }; } });
    const result = await p.prepare(f.input);
    expect(result).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(JSON.stringify(result)).not.toContain("private raw");
    expect(order).toEqual(["resolve-task", "source", "source", "check-ref"]);
  });

  it("cannot start final metadata after disposal while a trusted source callback is held", async () => {
    const f = await fixture(), entered = deferred<void>(), release = deferred<void>();
    const p = await f.create({ provenance: async () => { entered.resolve(); await release.promise; return { instructions: [], configuration: [] }; } });
    const pending = p.prepare(f.input); await entered.promise;
    await p.dispose(); release.resolve();
    expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(f.resolver.checkRevision).not.toHaveBeenCalled();
  });

  it("registers metadata ownership before synchronous resolver reentrancy and preserves one disposal promise", async () => {
    const f = await fixture(), release = deferred<void>(), entered = deferred<void>();
    let p!: RegisteredAgentContextProvider, reentrant: Promise<void> | undefined;
    vi.mocked(f.resolver.resolveTask).mockImplementation(async (_ref, signal) => {
      signal.addEventListener("abort", () => { reentrant = p.dispose(); });
      entered.resolve(); await release.promise; return structuredClone(f.data);
    });
    p = await f.create(); const pending = p.prepare(f.input); await entered.promise;
    const disposal = p.dispose();
    expect(reentrant).toBe(disposal); release.resolve(); await disposal;
    expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it.each(["backwards", "expired", "nonfinite"])("rejects %s clock at preparation publication", async (kind) => {
    const f = await fixture(); let clock = Date.now();
    const p = await RegisteredAgentContextProvider.create({ ...f.options, now: () => clock }); contexts.push(p);
    vi.mocked(f.resolver.checkRevision).mockImplementation(async () => { clock = kind === "backwards" ? clock - 1 : kind === "expired" ? clock + 300_000 : NaN; });
    expect(await p.prepare(f.input)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it("uses one shared 30s observation deadline, aborts on timeout and observes late owned settlement", async () => {
    const f = await fixture(), p = await f.create(), entered = deferred<AbortSignal>(), release = deferred<void>();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(f.resolver.resolveTask).mockImplementation(async (_ref, signal) => {
      entered.resolve(signal); await release.promise; return structuredClone(f.data);
    });
    const pending = p.prepare(f.input), signal = await entered.promise;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await p.prepare(f.input)).toMatchObject({ ok: false, error: { code: "BUSY" } });
    expect(f.resolver.resolveTask).toHaveBeenCalledTimes(1);
    let disposed = false; const disposal = p.dispose().then(() => { disposed = true; });
    await Promise.resolve(); expect(disposed).toBe(false);
    release.resolve(); await disposal;
    expect(f.resolver.checkRevision).not.toHaveBeenCalled();
  });

  it("does not let an injected resolver mutate the claimed pin or grant arbitrary source authority", async () => {
    const f = await fixture(), p = await f.create();
    vi.mocked(f.resolver.resolveTask).mockImplementation(async (reference) => {
      reference.taskId = "changed-by-resolver"; return { ...f.data, reference };
    });
    expect(await p.prepare(f.input)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(f.reference.taskId).toBe("exact-task");
  });
});

describe("real registered Git and owned YAML task resolution", () => {
  async function realFixture() {
    const parent = await mkdtemp(join(tmpdir(), "swarm-task-context-cli-")); roots.push(parent);
    const f = await createTaskFixture(parent);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: f.root, stdio: "pipe",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).toString().trim();
    const reference: AgentTaskReference = { version: 1, worldId: "world:real-task", repositoryId: "repository:real-task", provider: "ditz",
      taskId: f.taskId, metadataCommit: f.firstCommit, issueBlob: { algorithm: "sha1", hex: git("rev-parse", `${f.firstCommit.hex}:.ditz/issue-${f.taskId}.yaml`) } };
    const resolver = createAgentTaskResolver({ root: f.root, worldId: reference.worldId, repositoryId: reference.repositoryId });
    const resolve = (ref = reference, signal = new AbortController().signal) => resolver.resolveTask(ref, signal, Date.now() + 30_000);
    return { f, git, reference, resolver, resolve };
  }

  it("reads exact CLI-authored data once, ref-only checks never rescan, no writes or linked-file reads", async () => {
    const { f, git, reference, resolver, resolve } = await realFixture();
    const before = git("show-ref"), status = git("status", "--porcelain"), source = await readFile(join(f.root, f.sourcePath));
    const scan = vi.spyOn(TaskGitReader.prototype, "scan"), parse = vi.spyOn(metadata, "parseTaskMetadata");
    expect(await resolve()).toEqual({ reference, title: f.title, description: f.description });
    expect(scan).toHaveBeenCalledTimes(1); expect(parse).toHaveBeenCalledTimes(1);
    const [commit, signal, deadline] = scan.mock.calls[0]!;
    expect(commit).toEqual(reference.metadataCommit); expect(signal.aborted).toBe(false);
    expect(deadline).toBeLessThanOrEqual(Date.now() + TASK_LIMITS.observationMs);
    await resolver.checkRevision(reference, new AbortController().signal, Date.now() + 30_000);
    expect(scan).toHaveBeenCalledTimes(1); expect(parse).toHaveBeenCalledTimes(1);
    expect(git("show-ref")).toBe(before); expect(git("status", "--porcelain")).toBe(status);
    expect(await readFile(join(f.root, f.sourcePath))).toEqual(source);
    // CLI fixture includes missing and ../outside refs; successful parsing does
    // not require or authorize their targets to exist.
  }, 30_000);

  it("rejects unrelated commit advancement even with unchanged issue blob, wrong IDs/blob/world/repository and missing ref", async () => {
    const { f, git, reference, resolve } = await realFixture();
    for (const wrong of [{ ...reference, taskId: "missing-full-id" }, { ...reference, issueBlob: { ...reference.issueBlob, hex: "0".repeat(40) } },
      { ...reference, repositoryId: "other" }, { ...reference, worldId: "other" }]) await expect(resolve(wrong)).rejects.toThrow();
    // Explicit owned Git fault: different commit, identical metadata tree.
    const advanced = git("commit-tree", git("rev-parse", `${reference.metadataCommit.hex}^{tree}`), "-p", reference.metadataCommit.hex, "-m", "unrelated revision only");
    git("update-ref", "refs/heads/ditz-metadata", advanced);
    expect(git("rev-parse", `${advanced}:.ditz/issue-${f.taskId}.yaml`)).toBe(reference.issueBlob.hex);
    await expect(resolve()).rejects.toThrow();
    expect(await resolve({ ...reference, metadataCommit: { algorithm: "sha1", hex: advanced } })).toMatchObject({ title: f.title });
    await restoreTaskFixture(f, f.firstCommit); await removeTaskMetadata(f);
    await expect(resolve()).rejects.toThrow();
  }, 30_000);

  it("rejects malformed structure at its actual current revision and aborted/expired reads before child start", async () => {
    const { f, reference, resolver, resolve } = await realFixture();
    const bad = await invalidateTaskFixture(f);
    await expect(resolve({ ...reference, metadataCommit: bad })).rejects.toThrow();
    await restoreTaskFixture(f, f.firstCommit);
    const scan = vi.spyOn(TaskGitReader.prototype, "scan"), controller = new AbortController(); controller.abort();
    await expect(resolve(reference, controller.signal)).rejects.toThrow();
    await expect(resolver.checkRevision(reference, controller.signal, Date.now() + 30_000)).rejects.toThrow();
    await expect(resolver.resolveTask(reference, new AbortController().signal, Date.now() - 1)).rejects.toThrow();
    expect(scan).not.toHaveBeenCalled();
  }, 30_000);

  it("rejects movement after parsing and retains one full-observation deadline across reader and worker", async () => {
    const { git, reference, resolve } = await realFixture();
    const actual = metadata.parseTaskMetadata;
    const resolveRef = vi.spyOn(TaskGitReader.prototype, "resolve"), scan = vi.spyOn(TaskGitReader.prototype, "scan");
    vi.spyOn(metadata, "parseTaskMetadata").mockImplementation(async (...args) => {
      const details = await actual(...args);
      expect(args[2]).toBe(scan.mock.calls[0]![2]);
      const advanced = git("commit-tree", git("rev-parse", `${reference.metadataCommit.hex}^{tree}`), "-p", reference.metadataCommit.hex, "-m", "move during scan");
      git("update-ref", "refs/heads/ditz-metadata", advanced);
      return details;
    });
    await expect(resolve()).rejects.toThrow();
    expect(resolveRef).toHaveBeenCalledTimes(2);
    expect(resolveRef.mock.calls[0]![1]).toBe(resolveRef.mock.calls[1]![1]);
  }, 30_000);

  it.each(["oversize", "malformed-yaml"])("rejects actual %s Git blob without weakening reader bounds", async (kind) => {
    const { f, git, reference, resolve } = await realFixture();
    const plumbing = (args: string[], input: string) => execFileSync("git", args, { cwd: f.root, input, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const bytes = kind === "oversize" ? "x".repeat(TASK_LIMITS.blobBytes + 1) : "{ malformed: [";
    const blob = plumbing(["hash-object", "-w", "--stdin"], bytes);
    const project = git("rev-parse", `${reference.metadataCommit.hex}:.ditz/project.yaml`);
    const subtree = plumbing(["mktree"], `100644 blob ${blob}\tissue-${f.taskId}.yaml\n100644 blob ${project}\tproject.yaml\n`);
    const tree = plumbing(["mktree"], `040000 tree ${subtree}\t.ditz\n`);
    const commit = git("commit-tree", tree, "-p", reference.metadataCommit.hex, "-m", "Synthetic bounded metadata fault");
    git("update-ref", "refs/heads/ditz-metadata", commit);
    const bad = { ...reference, metadataCommit: { algorithm: "sha1" as const, hex: commit }, issueBlob: { algorithm: "sha1" as const, hex: blob } };
    const parse = vi.spyOn(metadata, "parseTaskMetadata");
    await expect(resolve(bad)).rejects.toThrow();
    if (kind === "oversize") expect(parse).not.toHaveBeenCalled();
    else expect(parse).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("cancels actual reader work after first child invocation without permitting scan or mutation", async () => {
    const { git, reference, resolver } = await realFixture();
    const before = git("show-ref"), status = git("status", "--porcelain");
    const controller = new AbortController(), scan = vi.spyOn(TaskGitReader.prototype, "scan");
    const original = TaskGitReader.prototype.resolve;
    vi.spyOn(TaskGitReader.prototype, "resolve").mockImplementation(function(this: TaskGitReader, signal, deadline) {
      const actual = original.call(this, signal, deadline);
      controller.abort(); // Real child was started synchronously by resolve.
      return actual;
    });
    await expect(resolver.resolveTask(reference, controller.signal, Date.now() + 30_000)).rejects.toThrow();
    expect(scan).not.toHaveBeenCalled();
    expect(git("show-ref")).toBe(before); expect(git("status", "--porcelain")).toBe(status);
  }, 30_000);

  it("awaits cancellation of the actual owned YAML worker, not just its result race", async () => {
    const { reference, resolver } = await realFixture();
    const controller = new AbortController(), original = metadata.parseTaskMetadata;
    let parsingSettled = false;
    const parse = vi.spyOn(metadata, "parseTaskMetadata").mockImplementation(async (...args) => {
      const parsing = original(...args); // Starts the real worker before returning.
      controller.abort();
      try { return await parsing; } finally { parsingSettled = true; }
    });
    await expect(resolver.resolveTask(reference, controller.signal, Date.now() + 30_000)).rejects.toThrow();
    expect(parse).toHaveBeenCalledTimes(1); expect(parsingSettled).toBe(true);
  }, 30_000);
});
