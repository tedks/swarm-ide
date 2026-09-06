// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RegisteredAgentContextProvider, type RegisteredAgentContextOptions } from "../core/agents/context";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";
import { AGENT_LIMITS, PreparedAgentContextSchema, type AgentCapabilities, type PreparedAgentContext } from "../protocol/agents";

const roots: string[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const verifiedFixture: AgentCapabilities = { availability: "available", reason: null, provider: "fixture-only", version: "test", controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-agent-context-"));
  roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
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
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("registered disk-only launch context", () => {
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

  it("detects ignored configuration changes, missing sources becoming observed and unreadable sources", async () => {
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

  it("rejects a source changing between observations, mapping races and unavailable policy", async () => {
    const f = await fixture();
    let count = 0;
    const p = await RegisteredAgentContextProvider.create({ ...f.options, provenance: async () => {
      if (++count === 1) await writeFile(join(f.root, "source.ts"), "raced");
      return { instructions: [], configuration: [] };
    } });
    expect((await p.prepare(f.input())).ok).toBe(false);
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
    release(); expect((await first).ok).toBe(true);
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
});
