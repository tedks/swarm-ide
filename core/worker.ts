import { watch, type FSWatcher } from "node:fs";
import {
  PROTOCOL_VERSION,
  CoreEventSchema,
  CoreResponseSchema,
  FileEventSchema,
  WorkspaceSnapshotSchema,
  parseCoreRequest,
  type CoreEvent,
  type CoreResponse,
  type FileEvent,
  type FileResult,
  type WorkspaceSnapshot,
} from "../protocol/schema";
import { readWorkspaceFile, resolveWorkspaceFile, WorkspaceFileError, writeWorkspaceFile } from "./files";
import { RealWorkspaceProvider } from "./provider";
import { BoundedRequestIds } from "./request-ids";

const workspaceRoot = process.env.SWARM_WORKSPACE_ROOT ?? process.cwd();
let sequence = 0;
const requestIds = new BoundedRequestIds(512);
const watchers = new Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null }>();

function post(message: CoreResponse | CoreEvent | FileEvent): void {
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

function ok(requestId: string, snapshot: WorkspaceSnapshot, file?: FileResult): CoreResponse {
  return CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: true,
    sequence,
    snapshot: WorkspaceSnapshotSchema.parse(snapshot),
    ...(file ? { file } : {}),
  });
}

function fail(requestId: string, code: string, message: string): CoreResponse {
  return CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId, ok: false, error: { code, message } });
}

function closeWatcher(path: string): void {
  const watched = watchers.get(path);
  if (!watched) return;
  if (watched.timer) clearTimeout(watched.timer);
  watched.watcher.close();
  watchers.delete(path);
}

async function emitFileChange(path: string): Promise<void> {
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
  post(FileEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: ++sequence, emittedAt: new Date().toISOString(), ...event }));
  if (event.change === "modified") await watchFile(path).catch(() => undefined);
}

async function watchFile(path: string): Promise<void> {
  if (watchers.has(path)) return;
  const resolved = await resolveWorkspaceFile(workspaceRoot, path);
  const entry = { watcher: null as unknown as FSWatcher, timer: null as NodeJS.Timeout | null };
  entry.watcher = watch(resolved.absolutePath, { persistent: false }, () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      closeWatcher(path);
      void emitFileChange(path);
    }, 45);
  });
  entry.watcher.on("error", (error) => {
    post(FileEventSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "file.changed",
      sequence: ++sequence,
      emittedAt: new Date().toISOString(),
      path,
      revision: null,
      change: "error",
      message: error.message.slice(0, 512),
    }));
    closeWatcher(path);
  });
  watchers.set(path, entry);
}

const providerPromise = RealWorkspaceProvider.create(workspaceRoot);

process.parentPort?.on("message", async (event) => {
  let requestId = "invalid-request";
  try {
    const request = parseCoreRequest(event.data);
    requestId = request.requestId;
    if (!requestIds.accept(requestId)) {
      post(fail(requestId, "DUPLICATE_REQUEST", "This request id has already been processed"));
      return;
    }
    const provider = await providerPromise;
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
        void provider.startReconciliation(publish);
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
        post(ok(requestId, provider.snapshot(), file));
        return;
      }
      case "file.watch":
        await watchFile(request.path);
        post(ok(requestId, provider.snapshot()));
        return;
      case "file.unwatch":
        closeWatcher(request.path);
        post(ok(requestId, provider.snapshot()));
        return;
    }
  } catch (error) {
    const code = error instanceof WorkspaceFileError ? error.code : "INVALID_REQUEST";
    const message = error instanceof Error ? error.message : "Unknown protocol error";
    post(fail(requestId, code, message.slice(0, 512)));
  }
});

void providerPromise.then(() => process.parentPort?.postMessage({ type: "core.ready" })).catch((error) => {
  console.error("Local core failed to open the workspace", error);
  process.parentPort?.postMessage({ type: "core.failed" });
});

process.on("exit", () => {
  for (const path of watchers.keys()) closeWatcher(path);
});
