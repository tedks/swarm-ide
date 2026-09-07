import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ExternalAgentService, extractEntry, resolveAncestry } from "../core/external-agents";
import { PROTOCOL_VERSION, parseCoreRequest, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import type { ExternalAgentSummary, ExternalRequest } from "../protocol/external-agents";

const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const dirs: string[] = [], services: ExternalAgentService[] = [];
afterEach(async () => { for (const service of services.splice(0)) service.dispose(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
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
  it("does not promote analysis or prose into verified edits", () => {
    expect(extractEntry({ type: "response_item", payload: { type: "message", phase: "analysis", role: "assistant", content: [{ type: "output_text", text: "private reasoning" }] } }, "1")).toBeNull();
    const entry = extractEntry(JSON.parse(message("commit abc passed all tests")), "2");
    expect(entry?.attribution).toBe("assistant-reported");
  });
});
