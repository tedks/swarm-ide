// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentFixtureFrames, agentFixtureRecords } from "../fixtures/agents";
import { formatAgentContextV2, formatRepositoryTask } from "../protocol/agent-task";
import { verifyTaskRehearsalClose, type TaskRehearsalProof } from "./support/task-rehearsal-driver";

vi.mock("electron", () => ({ app: {} })); // Pure readonly verifier; no desktop.
const roots: string[] = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "task-rehearsal-close-test-")); roots.push(root);
  const profile = join(root, "profile"), workspace = join(root, "workspace");
  await mkdir(profile, { mode: 0o700 }); await mkdir(workspace, { mode: 0o700 });
  const directory = join(profile, "agent-runs", hash(workspace));
  await mkdir(join(profile, "agent-runs"), { mode: 0o700 }); await mkdir(directory, { mode: 0o700 });
  const run = agentFixtureFrames()["completed-cleaned"].run;
  if (!("contextVersion" in run.launchContext)) throw new Error("V2 fixture required");
  const reference = { version: 1 as const, worldId: run.launchContext.worldId, repositoryId: run.launchContext.repositoryId,
    provider: "ditz" as const, taskId: "task-rehearsal", metadataCommit: { algorithm: "sha1" as const, hex: "a".repeat(40) },
    issueBlob: { algorithm: "sha1" as const, hex: "b".repeat(40) } };
  const content = formatRepositoryTask(reference, "Task λ", "Quoted \"literal\" data.");
  run.launchContext.repositoryTask = { reference, encoding: "swarm-repository-task-json-v1", content, bytes: Buffer.byteLength(content), digest: hash(content) };
  run.launchContext.submittedPrompt = formatAgentContextV2(run.launchContext);
  run.launchContext.contextHash = hash(run.launchContext.submittedPrompt);
  const records = agentFixtureRecords();
  run.transcript = { lastRecord: records.length, bytes: Buffer.byteLength(JSON.stringify(records)), truncated: false, tailMayBeLost: false };
  const proof: TaskRehearsalProof = { run: structuredClone(run), originalMetadata: reference.metadataCommit.hex,
    currentMetadata: "c".repeat(40), rendererErrors: [], sourceUnchanged: true, replayedCommands: 0, fixtureOnly: true, coreGenerations: 2, elapsedMs: 1 };
  const snapshot = { version: 2, entries: [{ run, records, receipt: { runId: run.runId, contextHash: run.launchContext.contextHash,
    admittedAt: run.createdAt, status: "admitted" } }] };
  const path = join(directory, "snapshot.json");
  const save = () => writeFile(path, JSON.stringify(snapshot), { mode: 0o600 });
  await save();
  return { profile, workspace, proof, snapshot, path, save };
}
describe("D6 immutable context after ordinary shutdown bookkeeping", () => {
  it("accepts only a monotonic shutdown updatedAt while retaining every other run field", async () => {
    const f = await fixture();
    f.snapshot.entries[0]!.run.updatedAt = new Date(Date.parse(f.proof.run.updatedAt) + 1).toISOString();
    await f.save(); const before = await readFile(f.path);
    await expect(verifyTaskRehearsalClose(f.profile, f.workspace, f.proof)).resolves.toMatchObject({ immutable: true });
    expect(await readFile(f.path)).toEqual(before);
  });
  it.each(["context", "receipt", "backwards-time", "future-time", "records"])("rejects %s drift without repairing history", async (fault) => {
    const f = await fixture(), entry = f.snapshot.entries[0]!;
    if (fault === "context") entry.run.launchContext.taskText += "tampered";
    if (fault === "receipt") entry.receipt.contextHash = "0".repeat(64);
    if (fault === "backwards-time") entry.run.updatedAt = new Date(Date.parse(f.proof.run.updatedAt) - 1).toISOString();
    if (fault === "future-time") entry.run.updatedAt = new Date(Date.now() + 60_000).toISOString();
    if (fault === "records") entry.records.pop();
    await f.save(); const before = await readFile(f.path);
    await expect(verifyTaskRehearsalClose(f.profile, f.workspace, f.proof)).rejects.toThrow();
    expect(await readFile(f.path)).toEqual(before);
  });
});
