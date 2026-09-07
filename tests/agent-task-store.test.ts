// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileRunStore, type FileRunStore } from "../core/agents/file-store";
import { agentFixtureContext, agentFixtureFrames, agentFixtureRecords, createAgentAdapterFixture, AGENT_FIXTURE_AT } from "../fixtures/agents";
import { LaunchContextV1Schema, type PreparedAgentContext } from "../protocol/agents";
import { AgentTaskReferenceSchema, formatAgentContextV2, formatRepositoryTask } from "../protocol/agent-task";
import { createAgentService } from "../core/agents/service";
import { PROTOCOL_VERSION } from "../protocol/common";

const directories: string[] = [], stores: FileRunStore[] = [];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function entry(legacy = false) {
  const run = agentFixtureFrames()["completed-cleaned"].run;
  if (legacy) {
    const { contextVersion: _version, sourceLinks: _links, ...context } = agentFixtureContext().launchContext;
    context.submittedPrompt = "Original legacy payload\ufeffé\r\n";
    context.contextHash = hash(context.submittedPrompt);
    run.launchContext = LaunchContextV1Schema.parse(context);
  }
  return { run, receipt: { runId: run.runId, contextHash: run.launchContext.contextHash, admittedAt: run.createdAt, status: "admitted" },
    records: agentFixtureRecords() };
}
async function seed(version: number, entries = [entry(true)]) {
  const directory = await mkdtemp(join(tmpdir(), "swarm-d3-store-")); directories.push(directory);
  const path = join(directory, "snapshot.json"), original = JSON.stringify({ version, entries });
  await writeFile(path, original, { mode: 0o600 });
  return { directory, path, original };
}
async function open(directory: string) {
  const store = await createFileRunStore(directory, { now: () => Date.parse(AGENT_FIXTURE_AT) + 400 });
  stores.push(store); return store;
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
describe("D3 durable version boundary", () => {
  it("opens V1 without rewrite; next ordinary write and restart retain exact legacy values", async () => {
    const originalEntry = entry(true), f = await seed(1, [originalEntry]);
    const store = await open(f.directory);
    expect(await readFile(f.path, "utf8")).toBe(f.original);
    const newDraft = agentFixtureContext(); newDraft.runId = randomUUID();
    expect(await store.admit(newDraft)).toMatchObject({ ok: true, value: { existing: false } });
    const persisted = JSON.parse(await readFile(f.path, "utf8"));
    expect(persisted.version).toBe(2); expect(persisted.entries[0]).toEqual(originalEntry);
    await store.close(); const restarted = await open(f.directory);
    const read = await restarted.read(originalEntry.run.runId, 0);
    expect(read).toMatchObject({ ok: true, value: { run: originalEntry.run } });
    const recovered = JSON.parse(await readFile(f.path, "utf8"));
    expect(recovered.entries[0]).toEqual(originalEntry);
    expect(recovered.entries[1].run.state).toBe("unknown");
    expect(recovered.entries[1].run.launchContext).toEqual(newDraft.launchContext);
  });
  it("rejects new V1 admission while the service acknowledges existing historical receipts without revalidation", async () => {
    const legacy = entry(true), f = await seed(1, [legacy]); const store = await open(f.directory);
    const oldPrepared = { ...agentFixtureContext(), launchContext: legacy.run.launchContext, contextHash: legacy.run.launchContext.contextHash };
    expect(await store.admit(oldPrepared as PreparedAgentContext)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    const adapter = createAgentAdapterFixture(), prepare = vi.fn(), revalidate = vi.fn();
    const service = await createAgentService({ store, adapter: adapter.adapter, context: { prepare, revalidate },
      capabilities: async () => agentFixtureContext().capabilities });
    try {
      const request = { protocolVersion: PROTOCOL_VERSION, type: "agent.launch" as const, requestId: "legacy-ack",
        runId: legacy.run.runId, contextHash: legacy.run.launchContext.contextHash };
      for (let i = 0; i < 2; i++) expect(await service.request(request)).toMatchObject({ ok: true, value: { kind: "launch", receipt: legacy.receipt } });
      expect(prepare).not.toHaveBeenCalled(); expect(revalidate).not.toHaveBeenCalled(); expect(adapter.calls()).toEqual([]);
      expect(await readFile(f.path, "utf8")).toBe(f.original);
    } finally { await service.shutdown(); }
  });
  it.each([0, 3, 99])("refuses unknown snapshot version %s without touching data", async (version) => {
    const f = await seed(version); await expect(open(f.directory)).rejects.toThrow();
    expect(await readFile(f.path, "utf8")).toBe(f.original);
  });
  it("rejects V2 inside store1; mixed store2 opens without rewrite", async () => {
    const f = await seed(1, [entry()]); await expect(open(f.directory)).rejects.toThrow();
    expect(await readFile(f.path, "utf8")).toBe(f.original);
    const old = entry(true); old.run.runId = old.receipt.runId = randomUUID();
    const mixed = await seed(2, [old, entry()]); const store = await open(mixed.directory);
    expect((await store.snapshot()).ok).toBe(true); expect(await readFile(mixed.path, "utf8")).toBe(mixed.original);
  });
  it.each(["digest", "reference", "bytes", "prompt", "source", "unknown-tag", "legacy-smuggling"])("rejects %s inconsistency even if the outer hash is recomputed", async (kind) => {
    const row = entry(kind === "legacy-smuggling");
    const context: any = row.run.launchContext;
    const reference = AgentTaskReferenceSchema.parse({ version: 1, worldId: context.worldId, repositoryId: context.repositoryId,
      provider: "ditz", taskId: "task", metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } });
    const content = formatRepositoryTask(reference, "Exact task", "Untrusted \ufeffé\r\n\"title\"");
    context.repositoryTask = { reference, encoding: "swarm-repository-task-json-v1", content, bytes: Buffer.byteLength(content), digest: hash(content) };
    if (kind === "digest") context.repositoryTask.digest = "f".repeat(64);
    if (kind === "reference") context.repositoryTask.reference = { ...reference, taskId: "other" };
    if (kind === "bytes") context.repositoryTask.bytes++;
    if (kind === "source") context.attachments[0].digest = "f".repeat(64);
    if (kind === "unknown-tag") context.contextVersion = 99;
    context.submittedPrompt = formatAgentContextV2(context);
    if (kind === "prompt") context.taskText = "changed outside prompt";
    context.contextHash = row.receipt.contextHash = hash(context.submittedPrompt);
    const f = await seed(2, [row]); await expect(open(f.directory)).rejects.toThrow();
    expect(await readFile(f.path, "utf8")).toBe(f.original);
  });
  it("opens a version 2 empty snapshot without rewriting it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "swarm-d3-store-")); directories.push(directory);
    const path = join(directory, "snapshot.json");
    const original = '{ "version": 2, "entries": [] }\n';
    await writeFile(path, original, { mode: 0o600 });
    const store = await createFileRunStore(directory); stores.push(store);
    expect((await store.snapshot()).ok).toBe(true);
    expect(await readFile(path, "utf8")).toBe(original);
  });
});
