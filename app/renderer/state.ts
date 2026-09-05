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

export function loadSnapshot(input: unknown): WorkspaceState {
  return {
    snapshot: WorkspaceSnapshotSchema.parse(input),
    lastSequence: 0,
    ignoredEvents: 0,
  };
}

export function applyCoreEvent(state: WorkspaceState, input: unknown): WorkspaceState {
  const event: CoreEvent = CoreEventSchema.parse(input);
  const currentEpoch = state.snapshot?.reconciliation.epoch ?? -1;
  const currentWorkingFingerprint = state.snapshot?.revisions.working.fingerprint;
  const publishesGreen = event.snapshot.reconciliation.status === "green";
  const greenMatchesWorking =
    event.snapshot.reconciliation.inputFingerprint ===
    event.snapshot.revisions.working.fingerprint;

  if (
    event.sequence <= state.lastSequence ||
    event.epoch < currentEpoch ||
    (publishesGreen && !greenMatchesWorking) ||
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
