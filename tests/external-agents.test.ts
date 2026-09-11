import { afterEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, writeFile, appendFile, mkdir, rm, symlink, chmod } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ExternalAgentService, extractEntry, resolveAncestry } from "../core/external-agents";
import { AgentLifecycleProjection } from "../core/agent-lifecycle";
import { PROTOCOL_VERSION, parseCoreRequest, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import type { ExternalAgentSummary, ExternalRequest } from "../protocol/external-agents";
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const dirs: string[] = [], services: ExternalAgentService[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const service of services.splice(0)) await service.dispose(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const request = (type: ExternalRequest["type"], fields = {}): ExternalRequest => parseCoreRequest({ protocolVersion: PROTOCOL_VERSION, requestId: "external-test", type, ...fields }) as ExternalRequest;
const meta = (id = A, parent?: string) => JSON.stringify({ type: "session_meta", payload: { id, ...(parent ? { forked_from_id: parent } : {}) } }) + "\n";
const message = (text = "I changed the parser; this is my report, not verified repository evidence.") => JSON.stringify({ timestamp: "2026-09-07T12:00:00Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] } }) + "\n";
async function setup(content = meta() + message()) {
  const dir = await mkdtemp(join(tmpdir(), "swarm-external-test-")); dirs.push(dir);
  const root = join(dir, "repo"); await mkdir(root);
  const rollout = join(dir, "session.jsonl"), registry = join(dir, "registry.json");
  await writeFile(rollout, content); await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ id: A, label: "Parser agent", rollout, evidence: "synthetic", contextPaths: ["docs/guide.md"] }] }), { mode: 0o600 });
  const service = new ExternalAgentService(root, registry); services.push(service);
  return { dir, root, rollout, registry, service };
}
describe("operator-registered external observation", () => {
  it("retains execution state before trimming activity and across observed append-only tails", async () => {
    const at = "2026-09-08T12:00:01Z", started = Date.parse(at) / 1000;
    const begin = JSON.stringify({ type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "current", started_at: started } }) + "\n";
    const { service, rollout } = await setup(meta() + begin + message().repeat(140));
    const first = await service.request(request("externalAgents.snapshot"));
    expect(first).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working", turnId: "current" } }] } });
    // Every individual append interval remains observed, but the original start
    // eventually leaves the bounded raw tail. Its state is not a raw feed row.
    for (let i = 0; i < 3; i++) {
      await appendFile(rollout, message("x".repeat(3000)).repeat(60));
      expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working" } }] } });
    }
    await appendFile(rollout, JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:02:00Z", payload: { type: "task_complete", turn_id: "current", started_at: started } }) + "\n");
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "completed" } }] } });
    await writeFile(rollout, meta() + message("Replaced contents without execution evidence"));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("validates the state-bearing suffix but projects only new append records", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "current" } }) + "\n";
    const { service, rollout } = await setup(meta() + begin + message("history").repeat(100));
    await service.request(request("externalAgents.snapshot"));
    const consume = vi.spyOn(AgentLifecycleProjection.prototype, "consume");
    await appendFile(rollout, message("one new record"));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working" } }] } });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("does not carry old running state over an unobserved byte gap", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const { service, rollout } = await setup(meta() + begin);
    await service.request(request("externalAgents.snapshot"));
    await appendFile(rollout, message("x".repeat(3000)).repeat(1500));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("recovers the latest explicit lifecycle beyond the activity tail on a cold read", async () => {
    const at = "2026-09-08T12:00:01Z", started = Date.parse(at) / 1000;
    const oldStart = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T11:59:00Z", payload: { type: "task_started", turn_id: "old", started_at: started - 60 } }) + "\n";
    const oldComplete = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:00Z", payload: { type: "task_complete", turn_id: "old", started_at: started - 60 } }) + "\n";
    const begin = JSON.stringify({ type: "event_msg", timestamp: at, payload: { type: "task_started", turn_id: "current", started_at: started } }) + "\n";
    const compacted = JSON.stringify({ type: "compacted", timestamp: "2026-09-08T12:01:00Z", payload: { replacement_history: "x".repeat(700000) } }) + "\n";
    const prefix = message("older history ".repeat(250)).repeat(900);
    const content = meta() + prefix + oldStart + oldComplete + begin + message("x".repeat(3000)).repeat(350) + compacted + message("latest activity");
    expect(Buffer.byteLength(content)).toBeGreaterThan(4 * 1024 * 1024);
    const { service, rollout, root, registry } = await setup(content);
    const first = await service.request(request("externalAgents.snapshot"));
    expect(first).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working", turnId: "current" } }],
      fleet: [{ session: { lifecycle: { state: "working", turnId: "current" } } }] } });
    const detail = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(detail).toMatchObject({ detail: { session: { lifecycle: { state: "working", turnId: "current" } } } });
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working" } }] } });
    await appendFile(rollout, JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:02:00Z", payload: { type: "task_complete", turn_id: "current", started_at: started } }) + "\n" +
      message("x".repeat(3000)).repeat(350));
    const cold = new ExternalAgentService(root, registry); services.push(cold);
    expect(await cold.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "completed", turnId: "current" } }] } });
  });

  it("does not carry status through same-inode same-header growth rewrites", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const { service, rollout } = await setup(meta() + begin);
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working" } }] } });
    await writeFile(rollout, meta() + message("A larger replacement without execution evidence".repeat(10)));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("does not carry status through a growth rewrite that preserves the old trailing anchor", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const body = begin + message("discarded lifecycle padding"), anchor = message("preserved suffix ".repeat(40));
    const neutralPrefix = '{"type":"event_msg","timestamp":"2026-09-08T12:00:01Z","payload":{"type":"token_count","padding":"';
    const neutralSuffix = '"}}\n';
    const neutral = neutralPrefix + "x".repeat(body.length - neutralPrefix.length - neutralSuffix.length) + neutralSuffix;
    expect(neutral).toHaveLength(body.length);
    const { service, rollout } = await setup(meta() + body + anchor);
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working" } }] } });
    await writeFile(rollout, meta() + neutral + anchor + message("growth after preserved suffix"));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("revalidates terminal ordering from a rewritten earlier start", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const complete = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:02:00Z", payload: { type: "task_complete", turn_id: "old" } }) + "\n";
    const replacement = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:03:00Z", payload: { type: "task_started", turn_id: "new" } }) + "\n";
    expect(replacement).toHaveLength(begin.length);
    const { service, rollout } = await setup(meta() + begin + complete + message("preserved suffix"));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "completed" } }] } });
    await writeFile(rollout, meta() + replacement + complete + message("preserved suffix") + message("growth"));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working", turnId: "new" } }] } });
  });

  it("accepts a valid oversized terminal envelope without publishing its large content", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const { service, rollout } = await setup(meta() + begin);
    await service.request(request("externalAgents.snapshot"));
    await appendFile(rollout, JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:02:00Z", payload: { type: "task_complete", turn_id: "old", last_agent_message: "x".repeat(70000) } }) + "\n");
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "completed", turnId: "old" } }] } });
  });

  it("drops old working evidence after a malformed oversized record", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const { service, rollout } = await setup(meta() + begin);
    await service.request(request("externalAgents.snapshot"));
    await appendFile(rollout, `{\"type\":\"response_item\",\"payload\":${"x".repeat(70000)}\n`);
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("keeps a recovery window trapped inside one unterminated larger record unknown", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "old" } }) + "\n";
    const compacted = JSON.stringify({ type: "compacted", timestamp: "2026-09-08T12:01:00Z", payload: { replacement_history: "x".repeat(4 * 1024 * 1024) } });
    const { service } = await setup(meta() + begin + compacted);
    for (let i = 0; i < 2; i++)
      expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "unknown" } }] } });
  });

  it("starts a new observed interval after truncation even below the previous cached cursor", async () => {
    const begin = JSON.stringify({ type: "event_msg", timestamp: "2026-09-08T12:00:01Z", payload: { type: "task_started", turn_id: "new" } }) + "\n";
    const { service, rollout } = await setup(meta() + message("x".repeat(3000)).repeat(300));
    await service.request(request("externalAgents.snapshot"));
    await writeFile(rollout, meta() + begin);
    await service.request(request("externalAgents.snapshot"));
    for (let i = 0; i < 3; i++) {
      await appendFile(rollout, message("x".repeat(3000)).repeat(60));
      expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { sessions: [{ lifecycle: { state: "working", turnId: "new" } }] } });
    }
  });

  it("publishes immutable session creation metadata, not event or observation timestamps", async () => {
    const createdAt = "2026-09-05T06:03:47.422Z";
    const metadata = JSON.stringify({ type: "session_meta", timestamp: "2026-09-08T04:00:00Z", payload: { id: A, timestamp: createdAt, forked_from_id: B } }) + "\n";
    const { service, rollout } = await setup(metadata + message());
    const read = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(read).toMatchObject({ detail: { session: { status: "observed", parentId: B, createdAt } } });
    await appendFile(rollout, message("Later activity"));
    const snapshot = await service.request(request("externalAgents.snapshot"));
    expect(snapshot).toMatchObject({ snapshot: { sessions: [{ createdAt }], fleet: [{ session: { createdAt } }] } });
  });

  it.each([undefined, "invalid", 42])("keeps older metadata readable without a usable creation date: %s", async (timestamp) => {
    const metadata = JSON.stringify({ type: "session_meta", timestamp: "2026-09-08T04:00:00Z", payload: { id: A, timestamp } }) + "\n";
    const { service } = await setup(metadata + message());
    const read = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(read).toMatchObject({ detail: { session: { status: "observed" } } });
    if (read.kind !== "read") throw new Error("Expected read");
    expect(read.detail.session).not.toHaveProperty("createdAt", "2026-09-08T04:00:00Z");
    expect("createdAt" in read.detail.session && read.detail.session.createdAt).toBeFalsy();
  });

  it("proof port matches the owned configurable endpoint and rejects absent, malformed or mismatched values", () => {
    const { resolveOwnedPort } = createRequire(import.meta.url)("../tools/demo-agents/port.cjs");
    expect(resolveOwnedPort({ SWARM_DEV_PORT: "55174" })).toBe(55174);
    expect(resolveOwnedPort({ SWARM_DEV_PORT: "55203", SWARM_VIRTUAL_DESKTOP_PORT: "55203" })).toBe(55203);
    for (const raw of [undefined, "", "0", "65536", "NaN", "1e3", "55203 ", "55174"]) {
      expect(() => resolveOwnedPort({ SWARM_DEV_PORT: raw, SWARM_VIRTUAL_DESKTOP_PORT: "55203" })).toThrow();
    }
    expect(() => resolveOwnedPort({ SWARM_DEV_PORT: "55203", SWARM_VIRTUAL_DESKTOP_PORT: "55203x" })).toThrow();
  });
  it("reads actual metadata and assistant text, excludes input, reasoning, arguments and raw outputs", async () => {
    const { service } = await setup(meta(A, B) + message() +
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "PRIVATE_INPUT" }] } }) + "\n" +
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "PRIVATE_ARGUMENT" } }) + "\n" +
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", output: "PRIVATE_OUTPUT" } }) + "\n");
    const snapshot = await service.request(request("externalAgents.snapshot"));
    expect(snapshot.kind === "snapshot" && snapshot.snapshot.sessions[0]?.ancestry).toBe("unknown-parent");
    const read = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(read.kind).toBe("read"); if (read.kind !== "read") return;
    expect(read.detail.session.parentId).toBe(B); expect(read.detail.session.evidence).toBe("synthetic");
    expect(read.detail.entries.map((entry) => entry.kind)).toEqual(["assistant", "tool-call", "tool-result"]);
    expect(read.detail.handoff).toBe("unconfigured");
    expect(JSON.stringify(read)).not.toMatch(/PRIVATE_|session\.jsonl/);
    expect(read.detail.entries[0]?.attribution).toBe("assistant-reported");
  });
  it("rejects repo-controlled registration, duplicates, world-writable registry and symlinks", async () => {
    const { service, root, registry, rollout, dir } = await setup();
    await writeFile(join(root, "registry.json"), JSON.stringify({ version: 1, sessions: [] }));
    const local = new ExternalAgentService(root, join(root, "registry.json")); services.push(local);
    expect(await local.request(request("externalAgents.snapshot"))).toMatchObject({ kind: "snapshot", snapshot: { status: "unavailable" } });
    await chmod(registry, 0o666);
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { status: "unavailable" } });
    await chmod(registry, 0o600);
    const row = { id: A, label: "duplicate", rollout };
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [row, row] }));
    expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { status: "unavailable" } });
    const link = join(dir, "link.jsonl"); await symlink(rollout, link);
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, rollout: link }] }));
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { status: "unavailable" }, entries: [] } });
  });
  it("rejects wrong session metadata and unregistered renderer IDs without leaking bytes", async () => {
    const { service } = await setup(meta(B) + message("DO_NOT_EXPOSE"));
    const result = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(result).toMatchObject({ detail: { session: { status: "unavailable", parentId: null }, entries: [] } });
    expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPOSE");
    await expect(service.request(request("externalAgents.read", { sessionId: B }))).rejects.toThrow("not registered");
  });
  it("handles missing, oversized header, partial/malformed tail and bounded large files", async () => {
    const { service, rollout } = await setup();
    await rm(rollout);
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { status: "unavailable" } } });
    await writeFile(rollout, "x".repeat(65537));
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { status: "unavailable" } } });
    await writeFile(rollout, meta() + message().repeat(1600) + "{broken}\n" + '{"unfinished":');
    const result = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(result.kind).toBe("read"); if (result.kind !== "read") return;
    expect(result.detail.session.status).toBe("observed"); expect(result.detail.coverage.partial).toBe(true);
    expect(result.detail.coverage.tailBytes).toBeLessThanOrEqual(262144);
    expect(result.detail.entries).toHaveLength(120);
    expect(result.detail.coverage.omittedRecords).toBeGreaterThan(0);
  });
  it("disposal revokes held filesystem operations and future requests", async () => {
    const { service } = await setup();
    const pending = service.request(request("externalAgents.snapshot")); service.dispose();
    await expect(pending).rejects.toThrow("disposed");
    await expect(service.request(request("externalAgents.snapshot"))).rejects.toThrow("disposed");
  });
  it("rejects a FIFO without blocking or acquiring ownership of its writer", async () => {
    const { service, rollout } = await setup(); await rm(rollout); execFileSync("mkfifo", [rollout]);
    const started = Date.now();
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { status: "unavailable" }, entries: [] } });
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("context paths require exact operator repository scope and cannot be absolute or parent escapes", async () => {
    const { service, registry, root, rollout } = await setup();
    const row = { id: A, label: "context", rollout, contextPaths: ["docs/guide.md"] };
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { contextPaths: [] } } });
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, contextRoot: root }] }));
    expect(await service.request(request("externalAgents.read", { sessionId: A }))).toMatchObject({ detail: { session: { contextPaths: ["docs/guide.md"] } } });
    for (const path of ["../private.json", "/private.json", ".git/config"]) {
      await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, contextRoot: root, contextPaths: [path] }] }));
      expect(await service.request(request("externalAgents.snapshot"))).toMatchObject({ snapshot: { status: "unavailable" } });
    }
  });
  it("marks truncated assistant text rather than silently presenting it as complete", async () => {
    const { service } = await setup(meta() + message("x".repeat(5000)));
    const result = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(result.kind === "read" && result.detail.entries[0]?.text).toContain("[truncated]");
  });
  it("retains context links for the explicitly registered other worktree, never for a missing or aliased root", async () => {
    const { service, registry, rollout, dir } = await setup();
    const other = join(dir, "other-worktree"), alias = join(dir, "other-alias");
    await mkdir(other); await symlink(other, alias);
    const row = { id: A, label: "other worker", rollout, contextPaths: ["docs/guide.md"] };
    await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, contextRoot: other }] }));
    const observed = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(observed).toMatchObject({ detail: { session: { contextPaths: ["docs/guide.md"], worktree: other } } });
    for (const contextRoot of [alias, join(dir, "missing"), "relative-worktree"]) {
      await writeFile(registry, JSON.stringify({ version: 1, sessions: [{ ...row, contextRoot }] }));
      const result = await service.request(request("externalAgents.read", { sessionId: A }));
      expect(result.kind).toBe("read"); if (result.kind !== "read") throw new Error("Unexpected result");
      expect(result.detail.session.contextPaths).toEqual([]);
      expect(result.detail.session.worktree).toBeUndefined();
    }
  });
  it("rejects a same-inode same-size session rewrite between metadata and tail reads", async () => {
    const { service, rollout } = await setup(meta(A) + message("alpha text"));
    const originalOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open;
    vi.mocked(fsPromises.open).mockImplementation(async (...args) => {
      const file = await originalOpen(...args);
      if (args[0] === rollout) {
        const originalRead = file.read.bind(file); let calls = 0;
        vi.spyOn(file, "read").mockImplementation(async (...readArgs: Parameters<typeof file.read>) => {
          if (++calls === 2) await writeFile(rollout, meta(B) + message("bravo text"));
          return originalRead(...readArgs);
        });
      }
      return file;
    });
    const result = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(result).toMatchObject({ kind: "read", detail: { session: { status: "unavailable" }, entries: [] } });
  });
  it("allows ordinary append-only growth while retaining exact metadata identity", async () => {
    const { service, rollout } = await setup(meta(A) + message("alpha text"));
    const originalOpen = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).open;
    vi.mocked(fsPromises.open).mockImplementation(async (...args) => {
      const file = await originalOpen(...args);
      if (args[0] === rollout) {
        const originalRead = file.read.bind(file); let calls = 0;
        vi.spyOn(file, "read").mockImplementation(async (...readArgs: Parameters<typeof file.read>) => {
          if (++calls === 2) await appendFile(rollout, message("later text"));
          return originalRead(...readArgs);
        });
      }
      return file;
    });
    const result = await service.request(request("externalAgents.read", { sessionId: A }));
    expect(result).toMatchObject({ kind: "read", detail: { session: { status: "observed", id: A }, entries: [{ text: "alpha text" }] } });
  });
  it("packaged verifier rejects unsuccessful or missing desktop exit despite successful UI/cleanup booleans", () => {
    const { verify } = createRequire(import.meta.url)("../tools/demo-agents/verify.cjs");
    const proof = { ok: true, synthetic: true, packaged: true, modelTurns: 0, rendererErrors: [] };
    const close = { observedProcessSurvivedAppClose: true, ownedTmuxCleaned: true, desktopCode: 0 };
    expect(() => verify(proof, close)).not.toThrow();
    for (const desktopCode of [1, 137, null, undefined]) expect(() => verify(proof, { ...close, desktopCode })).toThrow(/desktop must close successfully/);
    expect(() => verify({ ...proof, rendererErrors: ["error"] }, close)).toThrow();
    expect(() => verify(proof, { ...close, ownedTmuxCleaned: false })).toThrow();
  });
  it("metadata ancestry supports arbitrary admitted depth and marks cycles without recursion", () => {
    const sessions: ExternalAgentSummary[] = Array.from({ length: 64 }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, label: `agent ${i}`, status: "observed", evidence: "synthetic", parentId: i ? `10000000-0000-4000-8000-${String(i).padStart(12, "0")}` : null, ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-07T12:00:00Z", message: "test", contextPaths: [] }));
    resolveAncestry(sessions); expect(sessions[63]?.ancestry).toBe("registered-parent");
    sessions[0]!.parentId = sessions[63]!.id; resolveAncestry(sessions);
    expect(sessions.every((s) => s.ancestry === "cycle")).toBe(true);
  });
  it("wire accepts only registered IDs and correlates exact response kind/session", () => {
    expect(() => parseCoreRequest({ ...request("externalAgents.read", { sessionId: A }), path: "/arbitrary" })).toThrow();
    const input = request("externalAgents.handoff", { sessionId: A, observationId: "a".repeat(64) });
    expect(() => parseCoreResponseForRequest({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: initialSnapshot(), external: { kind: "handoff", sessionId: B, status: "opened", message: "no" } }, input)).toThrow();
  });
  it("joined build graph and external observer responses cannot exchange authority", () => {
    const snapshot = initialSnapshot(), externalRequest = request("externalAgents.snapshot");
    const graphRequest = parseCoreRequest({ protocolVersion: PROTOCOL_VERSION, requestId: "graph", type: "buildGraph.observe",
      repositoryId: snapshot.project.id, worldId: snapshot.world.id, refresh: false });
    const buildGraph = { repositoryId: snapshot.project.id, worldId: snapshot.world.id, generation: 0, status: "unavailable", message: "No build graph" };
    const external = { kind: "snapshot", snapshot: { status: "observed", message: "Registered", observedAt: "2026-09-07T12:00:00Z", sessions: [] } };
    const base = { protocolVersion: PROTOCOL_VERSION, ok: true, sequence: 0, snapshot };
    expect(() => parseCoreResponseForRequest({ ...base, requestId: externalRequest.requestId, external }, externalRequest)).not.toThrow();
    expect(() => parseCoreResponseForRequest({ ...base, requestId: graphRequest.requestId, buildGraph }, graphRequest)).not.toThrow();
    for (const input of [externalRequest, graphRequest]) {
      expect(() => parseCoreResponseForRequest({ ...base, requestId: input.requestId, external, buildGraph }, input)).toThrow();
    }
    expect(() => parseCoreResponseForRequest({ ...base, requestId: graphRequest.requestId, external }, graphRequest)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...base, requestId: externalRequest.requestId, buildGraph }, externalRequest)).toThrow();
  });
  it("does not promote analysis or prose into verified edits", () => {
    expect(extractEntry({ type: "response_item", payload: { type: "message", phase: "analysis", role: "assistant", content: [{ type: "output_text", text: "private reasoning" }] } }, "1")).toBeNull();
    const entry = extractEntry(JSON.parse(message("commit abc passed all tests")), "2");
    expect(entry?.attribution).toBe("assistant-reported");
  });
});
