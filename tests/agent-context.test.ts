// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPABILITY_OBSERVATION_TIMEOUT_MS, CONTEXT_OBSERVATION_TIMEOUT_MS, RegisteredAgentContextProvider, type RegisteredAgentContextOptions } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { AGENT_LIMITS, PreparedAgentContextSchema, type AgentCapabilities, type PreparedAgentContext } from "../protocol/agents";

const roots: string[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const verifiedFixture: AgentCapabilities = { availability: "available", reason: null, provider: "fixture-only", version: "test", controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-agent-context-"));
  roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "source.ts"), "one\r\ntwo λ\r\nthree\n");
  await writeFile(join(root, "AGENTS.md"), "local instruction\n");
  await writeFile(join(root, ".gitignore"), "ignored*\n");
  git("add", "."); git("commit", "-qm", "fixture");
  let revision = await computeWorkingWorldFingerprint(root);
  let clock = Date.parse("2026-09-06T00:00:00Z");
  const options: RegisteredAgentContextOptions = {
    root, repositoryId: "repository:fixture", worldId: "world:working",
    workingRevision: () => revision,
    resolveFocus: async (focus) => [{ attachmentPath: focus.path ?? null, sourcePaths: focus.path ? [focus.path] : [] }],
    provenance: async () => ({ instructions: ["AGENTS.md"], configuration: [] }), now: () => clock,
  };
  const input = () => ({ worldId: "world:working", focus: { worldId: "world:working", revisionKind: "working" as const, revisionId: revision, domain: "repo" as const, key: "source:source.ts", path: "source.ts" }, taskText: "Explain this file", model: null, effort: null, links: { parentRunId: null, task: null, spec: null } });
  return { root, options, input, git, advance: (ms: number) => { clock += ms; }, refresh: async () => { revision = await computeWorkingWorldFingerprint(root); } };
}
function value(result: Awaited<ReturnType<RegisteredAgentContextProvider["prepare"]>>): PreparedAgentContext {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("registered disk-only launch context", () => {
  it.each([false, true])("D3 refuses all task-bearing Prepare even with resolver=%s", async (injected) => {
    const f = await fixture();
    const resolveTask = vi.fn(), checkRevision = vi.fn();
    const p = await RegisteredAgentContextProvider.create({ ...f.options,
      ...(injected ? { taskResolver: { resolveTask, checkRevision } } : {}) });
    const taskReference = { version: 1 as const, worldId: f.options.worldId, repositoryId: f.options.repositoryId,
      provider: "ditz" as const, taskId: "one", metadataCommit: { algorithm: "sha1" as const, hex: "a".repeat(40) },
      issueBlob: { algorithm: "sha1" as const, hex: "b".repeat(40) } };
    expect(await p.prepare({ ...f.input(), taskText: "", taskReference })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_CONTROL" } });
    expect(resolveTask).not.toHaveBeenCalled(); expect(checkRevision).not.toHaveBeenCalled();
    expect(value(await p.prepare(f.input())).launchContext).toMatchObject({ contextVersion: 2, sourceLinks: ["source.ts"] });
    await p.dispose();
  });
  it.each(["prepare", "revalidate"] as const)("closes intake and rejects held %s publication after idempotent disposal", async (operation) => {
    const f = await fixture(); let held = false, release!: () => void, enter!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => verifiedFixture,
      resolveFocus: async (focus) => {
        if (held) { enter(); await gate; }
        return [{ attachmentPath: focus.path ?? null, sourcePaths: [] }];
      } });
    const old = value(await p.prepare(f.input())); held = true;
    const pending = operation === "prepare" ? p.prepare(f.input()) : p.revalidate(old);
    await entered;
    const disposal = p.dispose(); expect(p.dispose()).toBe(disposal); await disposal;
    expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await p.revalidate(old)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    release(); expect(await pending).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await p.revalidate(old)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });
  it("captures exact UTF-8/range, identity, hashes, normalized opaque links and honest provenance", async () => {
    const f = await fixture();
    const provider = await RegisteredAgentContextProvider.create(f.options);
    const input = { ...f.input(), focus: { ...f.input().focus, range: { startLine: 2, endLine: 2 } }, links: { parentRunId: null, task: "tickets/not-read.yml", spec: "docs/not-read.md" } };
    const draft = value(await provider.prepare(input));
    expect(PreparedAgentContextSchema.safeParse(draft).success).toBe(true);
    expect(draft.launchContext.attachments).toEqual([{ path: "source.ts", content: "two λ\r\n", digest: hash("two λ\r\n"), startLine: 2, endLine: 2 }]);
    expect(draft.launchContext).toMatchObject({ root: f.root, repositoryId: "repository:fixture", head: f.git("rev-parse", "HEAD").toString().trim(), workingFingerprint: f.input().focus.revisionId, diskOnly: true, access: { hostConfidentiality: false, sendsSelectedContentToProvider: true } });
    expect(draft.contextHash).toBe(hash(draft.launchContext.submittedPrompt));
    expect(draft.launchContext.instructionSources[0]).toMatchObject({ path: "AGENTS.md", digest: hash("local instruction\n"), observation: "observed" });
    expect(draft.launchContext.configurationSources).toMatchObject([{ observation: "unobserved" }]);
    expect(await provider.revalidate(draft)).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
  });

  it("revalidates unchanged evidence only with explicitly injected verified fixture capabilities", async () => {
    const f = await fixture(); f.options.capabilities = async () => verifiedFixture;
    const provider = await RegisteredAgentContextProvider.create(f.options);
    const draft = value(await provider.prepare(f.input()));
    f.advance(100);
    expect(await provider.revalidate(draft)).toEqual({ ok: true, value: draft });
    draft.launchContext.taskText = "substituted";
    expect(await provider.revalidate(draft)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  });

  it("rejects replaced/forged drafts, expiry and clock rollback", async () => {
    const f = await fixture(); f.options.capabilities = async () => verifiedFixture;
    const provider = await RegisteredAgentContextProvider.create(f.options);
    const old = value(await provider.prepare(f.input()));
    const fresh = value(await provider.prepare(f.input()));
    for (const changed of [old, { ...fresh, runId: randomUUID() }, { ...fresh, expiresAt: "2026-09-06T00:04:59Z" }]) {
      expect(await provider.revalidate(changed)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    }
    f.advance(-1); expect((await provider.revalidate(fresh)).ok).toBe(false);
    f.advance(AGENT_LIMITS.draftMs + 1); expect((await provider.revalidate(fresh)).ok).toBe(false);
  });

  it("rejects stale, unknown, built/deployed and ambiguous working mappings", async () => {
    const f = await fixture();
    for (const revisionKind of ["built", "deployed"] as const) {
      const p = await RegisteredAgentContextProvider.create(f.options);
      expect((await p.prepare({ ...f.input(), focus: { ...f.input().focus, revisionKind } })).ok).toBe(false);
    }
    for (const resolveFocus of [async () => [], async () => [{ attachmentPath: null, sourcePaths: [] }, { attachmentPath: null, sourcePaths: [] }]]) {
      const p = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus });
      expect((await p.prepare(f.input())).ok).toBe(false);
    }
    const p = await RegisteredAgentContextProvider.create({ ...f.options, workingRevision: () => null });
    expect((await p.prepare(f.input())).ok).toBe(false);
    const other = await RegisteredAgentContextProvider.create({ ...f.options, worldId: "world:elsewhere" });
    expect((await other.prepare(f.input())).ok).toBe(false);
    expect(await other.prepare({ ...f.input(), focus: { ...f.input().focus, worldId: "world:elsewhere" } })).toMatchObject({ ok: false, error: { message: "Unsupported or invalid working focus, task or links." } });
  });

  it("supports reference-only service/directory context without reading linked sources", async () => {
    const f = await fixture();
    const p = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus: async () => [{ attachmentPath: null, sourcePaths: ["docs/missing.md"] }] });
    const draft = value(await p.prepare({ ...f.input(), focus: { ...f.input().focus, domain: "service", key: "service:fraudcheck" } }));
    expect(draft.launchContext.attachments).toEqual([]);
    expect(draft.launchContext.submittedPrompt).toContain("docs/missing.md");
    expect((await p.prepare({ ...f.input(), focus: { ...f.input().focus, range: { startLine: 1, endLine: 1 } } })).ok).toBe(false);
  });

  it("rejects unknown parent, unsafe links, arbitrary cwd and unsaved buffer fields", async () => {
    const f = await fixture(); const p = await RegisteredAgentContextProvider.create(f.options);
    for (const input of [{ ...f.input(), links: { ...f.input().links, parentRunId: randomUUID() } }, { ...f.input(), links: { ...f.input().links, spec: "../private" } }, { ...f.input(), cwd: "/tmp" }, { ...f.input(), buffer: "not disk" }]) {
      expect((await p.prepare(input)).ok).toBe(false);
    }
  });

  it.each(["../escape", "/etc/passwd", "alias", "nested-alias/source.ts", "binary", "invalid-utf8", "missing", "large", "ignored-unreadable"])("rejects unsafe/unreadable attachment %s", async (path) => {
    if (path === "ignored-unreadable" && process.getuid?.() === 0) return; // Root bypasses Unix mode bits.
    const f = await fixture();
    await symlink("source.ts", join(f.root, "alias"));
    await symlink(f.root, join(f.root, "nested-alias"));
    await writeFile(join(f.root, "binary"), Buffer.from([1, 0]));
    await writeFile(join(f.root, "invalid-utf8"), Buffer.from([0xff]));
    await writeFile(join(f.root, "large"), Buffer.alloc(AGENT_LIMITS.attachmentBytes + 1, 65));
    await writeFile(join(f.root, "ignored-unreadable"), "hidden");
    f.git("add", "."); f.git("commit", "-qm", "unsafe files");
    await f.refresh();
    if (path === "ignored-unreadable") await chmod(join(f.root, path), 0);
    try {
      const p = await RegisteredAgentContextProvider.create(f.options);
      expect((await p.prepare({ ...f.input(), focus: { ...f.input().focus, path } })).ok).toBe(false);
    } finally { await chmod(join(f.root, "ignored-unreadable"), 0o600); }
  });

  it("preserves a BOM and rejects invalid/out-of-bounds ranges and total serialized byte limits", async () => {
    const f = await fixture(); await writeFile(join(f.root, "source.ts"), "\uFEFFfirst\nsecond"); await f.refresh();
    const p = await RegisteredAgentContextProvider.create(f.options);
    expect(value(await p.prepare(f.input())).launchContext.attachments[0]!.content).toBe("\uFEFFfirst\nsecond");
    expect((await p.prepare({ ...f.input(), focus: { ...f.input().focus, range: { startLine: 1, endLine: 3 } } })).ok).toBe(false);
    await writeFile(join(f.root, "source.ts"), "\\".repeat(40_000)); await f.refresh();
    expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { code: "OUTPUT_LIMIT" } });
  });

  it("detects changed source and changed ignored bytes outside an attached range", async () => {
    const f = await fixture(); f.options.capabilities = async () => verifiedFixture;
    await writeFile(join(f.root, "ignored.ts"), "first\nsecond\n");
    const p = await RegisteredAgentContextProvider.create(f.options);
    const draft = value(await p.prepare({ ...f.input(), focus: { ...f.input().focus, path: "ignored.ts", range: { startLine: 1, endLine: 1 } } }));
    await writeFile(join(f.root, "ignored.ts"), "first\nchanged\n");
    expect(await p.revalidate(draft)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    const second = value(await p.prepare(f.input()));
    await writeFile(join(f.root, "source.ts"), "changed\n");
    expect((await p.revalidate(second)).ok).toBe(false);
  });

  it("detects ignored configuration changes and missing sources becoming observed", async () => {
    const f = await fixture(); f.options.capabilities = async () => verifiedFixture;
    f.options.provenance = async () => ({ instructions: [], configuration: ["ignored.config"] });
    const p = await RegisteredAgentContextProvider.create(f.options);
    const missing = value(await p.prepare(f.input()));
    expect(missing.launchContext.configurationSources[0]!.observation).toBe("unobserved");
    expect((await p.revalidate(missing)).ok).toBe(false);
    await writeFile(join(f.root, "ignored.config"), "secret-not-copied");
    expect((await p.revalidate(missing)).ok).toBe(false);
    const present = value(await p.prepare(f.input()));
    expect(present.launchContext.submittedPrompt).not.toContain("secret-not-copied");
    await writeFile(join(f.root, "ignored.config"), "changed");
    expect((await p.revalidate(present)).ok).toBe(false);
  });

  it("rejects an ignored source changing between observations and mapping races", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "ignored-source.ts"), "first");
    let count = 0;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, provenance: async () => {
      if (++count === 1) await writeFile(join(f.root, "ignored-source.ts"), "raced");
      return { instructions: [], configuration: [] };
    } });
    expect(await p.prepare({ ...f.input(), focus: { ...f.input().focus, path: "ignored-source.ts" } })).toMatchObject({ ok: false, error: { message: "Context changed while being prepared; refresh the draft." } });
    await f.refresh(); count = 0;
    const mapping = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus: async () => [{ attachmentPath: null, sourcePaths: ++count === 1 ? [] : ["changed.ts"] }] });
    expect((await mapping.prepare(f.input())).ok).toBe(false);
  });

  it("does not dereference absolute/private provenance or symlink aliases", async () => {
    const f = await fixture(); await symlink("AGENTS.md", join(f.root, "instructions-link")); await f.refresh();
    const p = await RegisteredAgentContextProvider.create({ ...f.options, provenance: async () => ({ instructions: ["/private/never-read", "instructions-link"], configuration: [] }) });
    const draft = value(await p.prepare(f.input()));
    expect(draft.launchContext.instructionSources.every((source) => source.observation === "unobserved" && source.digest === null)).toBe(true);
  });

  it("rejects concurrent prepares without replacing saved bytes", async () => {
    const f = await fixture();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void; const ready = new Promise<void>((resolve) => { entered = resolve; });
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => { entered(); await gate; return verifiedFixture; } });
    const first = p.prepare(f.input()); await ready;
    expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { code: "BUSY" } });
    release(); expect(await p.revalidate(value(await first))).toMatchObject({ ok: true });
  });

  it("rejects changed capabilities and rechecks disk after a delayed capability observation", async () => {
    const f = await fixture(); let calls = 0;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => {
      if (++calls === 2) await writeFile(join(f.root, "source.ts"), "changed during preflight");
      return verifiedFixture;
    } });
    const draft = value(await p.prepare(f.input()));
    expect((await p.revalidate(draft)).ok).toBe(false);
    await f.refresh(); let available = true;
    const changing = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => ({ ...verifiedFixture, version: available ? "before" : "after" }) });
    const second = value(await changing.prepare(f.input())); available = false;
    expect((await changing.revalidate(second)).ok).toBe(false);
  });

  it("classifies thrown/invalid probes as policy unavailable and never exposes their sensitive error text", async () => {
    const f = await fixture(); let throws = false;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => {
      if (throws) throw new Error("provider secret=do-not-export");
      return verifiedFixture;
    } });
    const draft = value(await p.prepare(f.input())); throws = true;
    for (const result of [await p.revalidate(draft), await p.prepare(f.input())]) {
      expect(result).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
      expect(JSON.stringify(result)).not.toContain("do-not-export");
    }
    const invalid = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => ({} as AgentCapabilities) });
    expect(await invalid.prepare(f.input())).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
  });

  it("bounds a stalled capability observation and admits a fresh prepare after timeout", async () => {
    const f = await fixture(); let stalled = true;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => stalled ? new Promise<AgentCapabilities>(() => {}) : verifiedFixture });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = p.prepare(f.input());
    await vi.advanceTimersByTimeAsync(CAPABILITY_OBSERVATION_TIMEOUT_MS);
    expect(await pending).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    stalled = false; vi.useRealTimers();
    expect(await p.revalidate(value(await p.prepare(f.input())))).toMatchObject({ ok: true });
  });

  it("bounds a stalled context observation and late completion cannot overwrite a replacement draft", async () => {
    const f = await fixture(); let stalled = true; let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => verifiedFixture, resolveFocus: async (focus) => {
      if (stalled) { entered(); await gate; }
      return [{ attachmentPath: focus.path ?? null, sourcePaths: [] }];
    } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = p.prepare(f.input()); await ready;
    await vi.advanceTimersByTimeAsync(CONTEXT_OBSERVATION_TIMEOUT_MS);
    expect(await pending).toMatchObject({ ok: false, error: { message: "Context or policy observation exceeded its bounded deadline." } });
    vi.useRealTimers(); stalled = false;
    const fresh = value(await p.prepare(f.input())); release();
    expect(await p.revalidate(fresh)).toMatchObject({ ok: true });
  });

  it("rejects replacement during revalidation but keeps the replacement usable", async () => {
    const f = await fixture(); let replace = false; let fresh!: PreparedAgentContext;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, capabilities: async () => {
      if (replace) { replace = false; fresh = value(await p.prepare(f.input())); }
      return verifiedFixture;
    } });
    const old = value(await p.prepare(f.input())); replace = true;
    expect(await p.revalidate(old)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(await p.revalidate(fresh)).toMatchObject({ ok: true });
    // Invalid requests do not evict a draft the user is reviewing.
    expect((await p.prepare({ ...f.input(), taskText: "" })).ok).toBe(false);
    expect(await p.revalidate(fresh)).toMatchObject({ ok: true });
  });

  it("records unexpected failures without copying their raw diagnostics", async () => {
    const f = await fixture(); const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus: async () => { throw new TypeError("private-token-do-not-copy"); } });
    const result = await p.prepare(f.input());
    expect(result).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(warning).toHaveBeenCalledWith("Agent context prepare failed unexpectedly; raw diagnostics withheld");
    expect(JSON.stringify([result, warning.mock.calls])).not.toContain("private-token-do-not-copy");
  });

  it("validates core-resolved attachment and reference bounds independently of renderer path validation", async () => {
    const f = await fixture();
    for (const attachmentPath of ["../escape", "/etc/passwd", "different-file.ts"]) {
      const p = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus: async () => [{ attachmentPath, sourcePaths: [] }] });
      expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { message: "Focus does not uniquely identify its canonical source file." } });
      if (attachmentPath !== "different-file.ts") {
        const { path: _, ...focus } = f.input().focus;
        expect(await p.prepare({ ...f.input(), focus })).toMatchObject({ ok: false, error: { message: "Focus does not uniquely identify its canonical source file." } });
      }
    }
    for (const sourcePaths of [["../escape"], Array(33).fill("source.ts")]) {
      const p = await RegisteredAgentContextProvider.create({ ...f.options, resolveFocus: async () => [{ attachmentPath: null, sourcePaths }] });
      expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { message: "Source links are unsupported or not repository-relative." } });
    }
    const p = await RegisteredAgentContextProvider.create({ ...f.options, provenance: async () => ({ instructions: Array(32).fill("AGENTS.md"), configuration: [] }) });
    expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { code: "OUTPUT_LIMIT", message: "Too many provenance sources for this bounded draft." } });
  });

  it("pins ranges to editor line semantics, including empty/trailing lines, and accepts a known parent", async () => {
    const f = await fixture(); const parentRunId = randomUUID();
    const p = await RegisteredAgentContextProvider.create({ ...f.options, knownParent: async (id) => id === parentRunId });
    const draft = value(await p.prepare({ ...f.input(), links: { ...f.input().links, parentRunId } }));
    expect(draft.launchContext.links.parentRunId).toBe(parentRunId);
    expect(draft.launchContext.attachments[0]!.endLine).toBe(4);
    for (const range of [{ startLine: 0, endLine: 1 }, { startLine: 2, endLine: 1 }, { startLine: 1.5, endLine: 2 }]) {
      expect(await p.prepare({ ...f.input(), focus: { ...f.input().focus, range } })).toMatchObject({ ok: false, error: { message: "Unsupported or invalid working focus, task or links." } });
    }
    await writeFile(join(f.root, "source.ts"), ""); await f.refresh();
    expect(value(await p.prepare(f.input())).launchContext.attachments[0]).toMatchObject({ content: "", startLine: 1, endLine: 1 });
  });

  it("refuses ambient Git redirection instead of recording another repository's identity", async () => {
    const f = await fixture(); const p = await RegisteredAgentContextProvider.create(f.options);
    vi.stubEnv("GIT_DIR", "/private/not-the-registered-repo");
    expect(await p.prepare(f.input())).toMatchObject({ ok: false, error: { message: "Ambient Git redirection is unsupported for a registered agent world." } });
    await expect(RegisteredAgentContextProvider.create(f.options)).rejects.toThrow("Ambient Git redirection");
  });

  it("rejects an ignored FIFO without waiting for a writer or the observation timeout", async () => {
    const f = await fixture();
    execFileSync("mkfifo", [join(f.root, "ignored-fifo")]);
    const p = await RegisteredAgentContextProvider.create(f.options);
    expect(await p.prepare({ ...f.input(), focus: { ...f.input().focus, path: "ignored-fifo" } })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  }, 5000);
});
