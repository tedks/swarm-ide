/** TEST ONLY: real adapter/service/store/owner, synthetic protocol and context.
 * Nothing here attests Codex installation, credentials or effective policy.
 * Production entries never import this composition.
 */
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, realpathSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createCodexAppServerAdapter, CODEX_ADAPTER_VERSION } from "../../core/agents/codex-app-server";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import { createFileRunStore } from "../../core/agents/file-store";
import { createAgentService } from "../../core/agents/service";
import type { AgentOperation } from "../../core/agents/adapter";
import type { RunStore } from "../../core/agents/store";
import { AGENT_LIMITS, type AgentCapabilities, type AgentRequest, type PreparedAgentContext, type Run } from "../../protocol/agents";
import { PROTOCOL_VERSION } from "../../protocol/common";

export type Scenario = "stop-terminal" | "unexpected-exit" | "core-death";
export const capabilities: AgentCapabilities = { availability: "available", reason: null,
  provider: "codex", version: CODEX_ADAPTER_VERSION, policy: "verified-read-only",
  controls: { launch: true, steer: true, cancel: true } };
// These deliberately synthetic capability fields satisfy the frozen R1 seam;
// the reported fixture model and evidence label prevent installed-provider claims.
export function executable(name: string): string {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (!directory.startsWith("/nix/store/")) continue;
    const candidate = join(directory, name);
    try { accessSync(candidate, constants.X_OK); return realpathSync(candidate); } catch { /* next Nix dependency */ }
  }
  throw new Error(`Missing pinned Nix fixture dependency: ${name}`);
}
export function value<T>(result: AgentOperation<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
export const base = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID() });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function openProcessFixture(directory: string, scenario: Scenario, source: string, recovery = false) {
  const root = join(directory, "repo"), storePath = join(directory, "store");
  await mkdir(root, { mode: 0o700, recursive: true });
  const disk = await createFileRunStore(storePath);
  const transitions: Run[] = [];
  const calls = { connect: 0, close: 0, methods: [] as string[], admissionBeforeConnect: false };
  // Observe successful durable writes, not the timing of transient UI snapshots.
  const store: RunStore = { ...disk, async update(run) {
    const result = await disk.update(run);
    if (result.ok) transitions.push(structuredClone(result.value));
    return result;
  } };
  const node = realpathSync(process.execPath);
  if (!node.startsWith("/nix/store/")) throw new Error("Fixture requires the Nix Node runtime");
  const fixtureFile = resolve(source, "fixtures/agent-owned-process/provider.mjs");
  const adapter = createCodexAppServerAdapter({ root, executable: node, requestTimeoutMs: 4000,
    probe: async () => ({ provider: "codex", version: CODEX_ADAPTER_VERSION, executable: node,
      available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }),
    connect(sink) {
      calls.connect++;
      if (recovery) throw new Error("Recovery must never construct a transport");
      // The durable dispatch-pending transition precedes any external process.
      calls.admissionBeforeConnect = transitions.some((run) => run.state === "starting" &&
        run.processState === "live" && run.cleanup.status === "pending");
      const transport = createOwnedCodexTransport({ root, executable: node, nodeExecutable: node,
        unshareExecutable: executable("unshare"), setprivExecutable: executable("setpriv"),
        ownerScript: resolve(source, "core/agents/owner-process.mjs"),
        args: [fixtureFile, "provider", scenario, join(directory, "witness.jsonl")], graceMs: 180 }, sink);
      return { write(line) { calls.methods.push(JSON.parse(line).method); transport.write(line); },
        close() { calls.close++; return transport.close(); } };
    },
  });
  const task = "EXTERNAL FIXTURE ONLY: synthetic protocol lifetime proof; no model request.";
  const input = { worldId: "fixture-world", focus: { worldId: "fixture-world", revisionKind: "working" as const,
    revisionId: "working", domain: "repo" as const, key: "fixture-file", path: "source.ts" },
    taskText: task, model: null, effort: null, links: { parentRunId: null, task: null, spec: null } };
  const preparedAt = new Date().toISOString();
  const contextHash = hash(task);
  const draft: PreparedAgentContext = { runId: randomUUID(), contextHash, preparedAt,
    expiresAt: new Date(Date.parse(preparedAt) + AGENT_LIMITS.draftMs).toISOString(), capabilities,
    launchContext: { worldId: input.worldId, repositoryId: "synthetic-process-fixture", root,
      head: null, workingFingerprint: hash("fixture-world"), focus: input.focus,
      taskText: task, requested: { model: null, effort: null }, links: input.links,
      attachments: [], instructionSources: [], configurationSources: [],
      submittedPrompt: task, contextHash, diskOnly: true,
      access: { policy: "read-only", toolNetwork: false, approvals: "never",
        hostConfidentiality: false, sendsSelectedContentToProvider: true } } };
  const service = await createAgentService({ store, adapter, capabilities: async () => capabilities,
    context: { prepare: async () => ({ ok: true, value: draft }), revalidate: async (current) => ({ ok: true, value: current }) },
    deadlineMs: 15000, cancelGraceMs: 1500 });
  const read = async (runId = draft.runId) => {
    const result = value(await service.request({ ...base(), type: "agent.read", runId, afterRecord: 0 }));
    if (result.kind !== "read") throw new Error("Expected read result");
    return result;
  };
  const launch = async () => {
    value(await service.request({ ...base(), type: "agent.prepare", ...input }));
    const result = value(await service.request({ ...base(), type: "agent.launch", runId: draft.runId, contextHash }));
    if (result.kind !== "launch") throw new Error("Expected admission receipt");
    return result.receipt;
  };
  const steerRequest: AgentRequest = { ...base(), type: "agent.steer", runId: draft.runId,
    expectedTurnId: "fixture-turn", text: "FIXTURE instruction: inspect termination evidence." };
  return { service, disk, calls, transitions, draft, input, steerRequest, launch, read,
    async persisted() { return JSON.parse(await readFile(join(storePath, "snapshot.json"), "utf8")); },
    async close() { await service.shutdown(); await disk.close(); } };
}
