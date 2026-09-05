import {
  PROTOCOL_VERSION,
  CoreEventSchema,
  CoreResponseSchema,
  WorkspaceSnapshotSchema,
  parseCoreRequest,
  type CoreEvent,
  type CoreResponse,
  type WorkspaceSnapshot,
} from "../protocol/schema";
import {
  dirtySnapshot,
  failedSnapshot,
  initialSnapshot,
  progressSnapshot,
  selectFocus,
  successfulSnapshot,
} from "../fixtures/world";

let snapshot = initialSnapshot();
let sequence = 0;
const timers = new Set<NodeJS.Timeout>();

function post(message: CoreResponse | CoreEvent): void {
  process.parentPort?.postMessage(message);
}

function publish(
  type: CoreEvent["type"],
  next: WorkspaceSnapshot,
  options: { epoch?: number; sequence?: number } = {},
): void {
  const validatedSnapshot = WorkspaceSnapshotSchema.parse(next);
  const event = CoreEventSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type,
    sequence: options.sequence ?? ++sequence,
    epoch: options.epoch ?? next.reconciliation.epoch,
    emittedAt: new Date().toISOString(),
    snapshot: validatedSnapshot,
  });
  snapshot = validatedSnapshot;
  post(event);
}

function schedule(delayMs: number, action: () => void): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    try {
      action();
    } catch (error) {
      console.error("Scheduled local-core publication failed validation", error);
    }
  }, delayMs);
  timers.add(timer);
}

function cancelScheduledWork(): void {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
}

function ok(requestId: string): CoreResponse {
  return CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: true,
    sequence,
    snapshot: WorkspaceSnapshotSchema.parse(snapshot),
  });
}

function fail(requestId: string, code: string, message: string): CoreResponse {
  return CoreResponseSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    error: { code, message },
  });
}

function startReconciliation(mode: "success" | "failure" | "stale"): void {
  cancelScheduledWork();
  const before = snapshot;
  publish("reconciliation.changed", dirtySnapshot(snapshot));

  schedule(260, () => publish("job.changed", progressSnapshot(snapshot, 0.42)));
  schedule(620, () => publish("job.changed", progressSnapshot(snapshot, 0.78)));

  if (mode === "failure") {
    schedule(980, () => publish("reconciliation.changed", failedSnapshot(snapshot)));
    return;
  }

  if (mode === "stale") {
    schedule(840, () => {
      const stale = {
        ...before,
        reconciliation: {
          ...before.reconciliation,
          message: "Late build result for work:a1 (must be ignored)",
        },
      };
      post(CoreEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "graph.published",
        sequence: ++sequence,
        epoch: before.reconciliation.epoch,
        emittedAt: new Date().toISOString(),
        snapshot: stale,
      }));
    });
  }

  schedule(1_180, () => publish("graph.published", successfulSnapshot(snapshot)));
}

process.parentPort?.on("message", (event) => {
  let requestId = "invalid-request";
  try {
    const request = parseCoreRequest(event.data);
    requestId = request.requestId;

    switch (request.type) {
      case "workspace.snapshot":
        post(ok(requestId));
        return;
      case "focus.select":
        if (
          request.focus.worldId !== snapshot.world.id ||
          (request.focus.revisionKind === "working" &&
            request.focus.revisionId !== snapshot.revisions.working.id)
        ) {
          post(fail(requestId, "STALE_FOCUS", "Focus does not belong to the current working world"));
          return;
        }
        publish("workspace.changed", selectFocus(snapshot, request.focus));
        post(ok(requestId));
        return;
      case "reconciliation.start":
        startReconciliation(request.mode);
        post(ok(requestId));
        return;
      case "fixture.reset":
        cancelScheduledWork();
        publish("workspace.reset", initialSnapshot());
        post(ok(requestId));
        return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown protocol error";
    post(fail(requestId, "INVALID_REQUEST", message));
  }
});

process.parentPort?.postMessage({ type: "core.ready" });
