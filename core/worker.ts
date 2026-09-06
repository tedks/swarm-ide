import {
  PROTOCOL_VERSION,
  CoreEventSchema,
  CoreResponseSchema,
  FileEventSchema,
  WorkspaceSnapshotSchema,
  parseCoreRequest,
  isAgentRequest,
  type CoreEvent,
  type CoreResponse,
  type FileEvent,
  type FileResult,
  type WorkspaceSnapshot,
} from "../protocol/schema";
import { AgentEventSchema, type AgentEvent, type AgentResult } from "../protocol/agents";
import { unavailableAgentRequest, unavailableAgentSnapshot } from "./agents/unavailable";
import { createProductionAgentService, type ProductionAgentService } from "./agents/production";
import { readWorkspaceFile, WorkspaceFileError, writeWorkspaceFile } from "./files";
import { computeWorkingWorldFingerprint } from "./fingerprint";
import { RealWorkspaceProvider } from "./provider";
import { BoundedRequestIds } from "./request-ids";
import { WorkspaceFileWatchers } from "./watchers";
import { WorkingWorldObserver } from "./working-world-observer";

const workspaceRoot = process.env.SWARM_WORKSPACE_ROOT ?? process.cwd();
let sequence = 0;
const requestIds = new BoundedRequestIds(512);
const fileReadGenerations = new Map<string, number>();
const providerPromise = RealWorkspaceProvider.create(workspaceRoot);
let workingWorldObserver: WorkingWorldObserver | null = null;
let shuttingDown = false;
const agentServicePromise: Promise<ProductionAgentService | null> = providerPromise.then(async (provider) => {
  // Absence is an explicitly unavailable bridge, useful for legacy/test boot.
  // Production main always supplies its own app-data location, not renderer input.
  if (!process.env.SWARM_AGENT_STORE_ROOT) return null;
  try {
    return await createProductionAgentService({ root: workspaceRoot, storeRoot: process.env.SWARM_AGENT_STORE_ROOT,
      snapshot: () => provider.snapshot(), emit: publishAgents });
  } catch {
    console.warn("Agent history/context could not be initialized; execution is disabled. Raw diagnostics withheld.");
    const error = { code: "STORAGE_UNAVAILABLE" as const, message: "Agent history or registered context could not be opened safely; execution is disabled." };
    const snapshot = unavailableAgentSnapshot();
    snapshot.capabilities.reason = error;
    return { async request(request) {
      return request.type === "agent.snapshot" ? { ok: true, value: { kind: "snapshot", snapshot } } : { ok: false, error };
    }, async shutdown() {} } satisfies ProductionAgentService;
  }
});

function publishAgents(snapshot: AgentEvent["snapshot"]): void {
  post(AgentEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "agent.changed", sequence: ++sequence,
    emittedAt: new Date().toISOString(), snapshot }));
}

function post(message: CoreResponse | CoreEvent | FileEvent | AgentEvent): void {
  process.parentPort?.postMessage(message);
}

function publish(type: CoreEvent["type"], snapshot: WorkspaceSnapshot): void {
  const validatedSnapshot = WorkspaceSnapshotSchema.parse(snapshot);
  post(CoreEventSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type,
    sequence: ++sequence,
    epoch: validatedSnapshot.reconciliation.epoch,
    emittedAt: new Date().toISOString(),
    snapshot: validatedSnapshot,
  }));
}

function ok(requestId: string, snapshot: WorkspaceSnapshot, file?: FileResult, agent?: AgentResult): CoreResponse {
  return CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: true,
    sequence,
    snapshot: WorkspaceSnapshotSchema.parse(snapshot),
    ...(file ? { file } : {}),
    ...(agent ? { agent } : {}),
  });
}

function fail(requestId: string, code: string, message: string): CoreResponse {
  return CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId, ok: false, error: { code, message } });
}

async function emitFileChange(path: string): Promise<void> {
  const generation = (fileReadGenerations.get(path) ?? 0) + 1;
  fileReadGenerations.set(path, generation);
  let event: Omit<FileEvent, "protocolVersion" | "type" | "sequence" | "emittedAt">;
  try {
    const file = await readWorkspaceFile(workspaceRoot, path);
    event = { path, revision: file.revision, change: "modified" };
  } catch (error) {
    if (error instanceof WorkspaceFileError && error.code === "FILE_NOT_FOUND") {
      event = { path, revision: null, change: "deleted", message: error.message };
    } else {
      event = { path, revision: null, change: "error", message: error instanceof Error ? error.message.slice(0, 512) : "File observation failed" };
    }
  }
  if (fileReadGenerations.get(path) !== generation) return;
  post(FileEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: ++sequence, emittedAt: new Date().toISOString(), ...event }));
  workingWorldObserver?.request();
}

const fileWatchers = new WorkspaceFileWatchers(
  workspaceRoot,
  (path) => { void emitFileChange(path); },
  (path, error) => post(FileEventSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: "file.changed",
    sequence: ++sequence,
    emittedAt: new Date().toISOString(),
    path,
    revision: null,
    change: "error",
    message: error.message.slice(0, 512),
  })),
);

process.parentPort?.on("message", async (event) => {
  // This private utility-process control is not in the public request schema.
  if (event.data?.type === "core.shutdown") {
    if (!shuttingDown) {
      shuttingDown = true;
      try {
        await (await agentServicePromise)?.shutdown();
        process.parentPort?.postMessage({ type: "core.shutdown.ready" });
      } catch { /* No successful shutdown attestation; supervisor's deadline owns fallback. */ }
    }
    return;
  }
  let requestId = "invalid-request";
  try {
    const request = parseCoreRequest(event.data);
    requestId = request.requestId;
    if (shuttingDown) { post(fail(requestId, "CORE_UNAVAILABLE", "Core is shutting down; no operation was sent.")); return; }
    if (!requestIds.accept(requestId)) {
      post(fail(requestId, "DUPLICATE_REQUEST", "This request id has already been processed"));
      return;
    }
    const provider = await providerPromise;
    if (isAgentRequest(request)) {
      const service = await agentServicePromise;
      const result = service ? await service.request(request) : unavailableAgentRequest(request);
      post(result.ok ? ok(requestId, provider.snapshot(), undefined, result.value)
        : fail(requestId, result.error.code, result.error.message));
      return;
    }
    switch (request.type) {
      case "workspace.snapshot":
        post(ok(requestId, provider.snapshot()));
        return;
      case "focus.select":
        try {
          const snapshot = provider.selectFocus(request.focus);
          publish("workspace.changed", snapshot);
          post(ok(requestId, snapshot));
        } catch (error) {
          post(fail(requestId, "STALE_FOCUS", error instanceof Error ? error.message : "Focus is stale"));
        }
        return;
      case "reconciliation.start":
        void provider.startReconciliation(publish).catch((error) => console.error("Topology reconciliation terminated unexpectedly", error));
        post(ok(requestId, provider.snapshot()));
        return;
      case "fixture.reset":
        post(fail(requestId, "UNSUPPORTED_REQUEST", "Fixture controls are unavailable in the real workspace provider"));
        return;
      case "file.read": {
        const file = await readWorkspaceFile(workspaceRoot, request.path);
        post(ok(requestId, provider.snapshot(), file));
        return;
      }
      case "file.write": {
        const file = await writeWorkspaceFile(workspaceRoot, request.path, request.expectedRevision, request.content);
        if (file.workingFingerprint) {
          workingWorldObserver?.observeKnown(file.workingFingerprint);
          provider.markWorkingWorldChanged(file.workingFingerprint, publish);
        }
        else provider.markWorkingWorldUnknown(file.fingerprintError ?? "unknown post-save fingerprint error", publish);
        post(ok(requestId, provider.snapshot(), file));
        return;
      }
      case "file.watch":
        await fileWatchers.watch(request.path);
        post(ok(requestId, provider.snapshot()));
        return;
      case "file.unwatch":
        fileReadGenerations.set(request.path, (fileReadGenerations.get(request.path) ?? 0) + 1);
        fileWatchers.unwatch(request.path);
        post(ok(requestId, provider.snapshot()));
        return;
    }
  } catch (error) {
    const code = error instanceof WorkspaceFileError ? error.code : "INVALID_REQUEST";
    const message = error instanceof Error ? error.message : "Unknown protocol error";
    post(fail(requestId, code, message.slice(0, 512)));
  }
});

void providerPromise.then(async (provider) => {
  workingWorldObserver = new WorkingWorldObserver(
    provider.snapshot().revisions.working.fingerprint,
    () => computeWorkingWorldFingerprint(workspaceRoot),
    (fingerprint) => provider.markWorkingWorldChanged(fingerprint, publish),
    (error) => provider.markWorkingWorldUnknown(error.message, publish),
  );
  workingWorldObserver.start();
  const service = await agentServicePromise;
  process.parentPort?.postMessage({ type: "core.ready" });
  const initial = await service?.request({ protocolVersion: PROTOCOL_VERSION, requestId: "initial-agent-snapshot", type: "agent.snapshot" });
  publishAgents(initial?.ok && initial.value.kind === "snapshot" ? initial.value.snapshot : unavailableAgentSnapshot());
}).catch((error) => {
  console.error("Local core failed to open the workspace", error);
  process.parentPort?.postMessage({ type: "core.failed" });
});

process.on("exit", () => {
  workingWorldObserver?.close();
  fileWatchers.closeAll();
});
