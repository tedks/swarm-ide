import {
  CoreEventSchema,
  WorkspaceSnapshotSchema,
  type CoreEvent,
  type WorkspaceSnapshot,
} from "../../protocol/schema";

export interface WorkspaceState {
  snapshot: WorkspaceSnapshot | null;
  lastSequence: number;
  ignoredEvents: number;
}

export const emptyWorkspaceState: WorkspaceState = {
  snapshot: null,
  lastSequence: 0,
  ignoredEvents: 0,
};

export function loadSnapshot(input: unknown, sequence = 0): WorkspaceState {
  return {
    snapshot: WorkspaceSnapshotSchema.parse(input),
    lastSequence: sequence,
    ignoredEvents: 0,
  };
}

export function applyCoreEvent(state: WorkspaceState, input: unknown): WorkspaceState {
  const parsed = CoreEventSchema.safeParse(input);
  if (!parsed.success) {
    console.error("Ignored invalid local-core event", parsed.error);
    return { ...state, ignoredEvents: state.ignoredEvents + 1 };
  }
  const event: CoreEvent = parsed.data;
  if (event.sequence <= state.lastSequence) {
    return { ...state, ignoredEvents: state.ignoredEvents + 1 };
  }
  if (event.type === "workspace.reset") {
    return { snapshot: event.snapshot, lastSequence: event.sequence, ignoredEvents: state.ignoredEvents };
  }
  const currentEpoch = state.snapshot?.reconciliation.epoch ?? -1;
  const currentWorkingFingerprint = state.snapshot?.revisions.working.fingerprint;
  const publishesGreen = event.snapshot.reconciliation.status === "green";

  if (
    event.epoch < currentEpoch ||
    (publishesGreen &&
      currentWorkingFingerprint !== undefined &&
      event.epoch === currentEpoch &&
      event.snapshot.revisions.working.fingerprint !== currentWorkingFingerprint)
  ) {
    return { ...state, ignoredEvents: state.ignoredEvents + 1 };
  }

  return {
    snapshot: event.snapshot,
    lastSequence: event.sequence,
    ignoredEvents: state.ignoredEvents,
  };
}
