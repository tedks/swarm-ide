import { describe, expect, it } from "vitest";
import { dirtySnapshot, initialSnapshot, successfulSnapshot } from "../fixtures/world";
import { applyCoreEvent, loadSnapshot } from "../app/renderer/state";
import type { CoreEvent, WorkspaceSnapshot } from "../protocol/schema";

function event(snapshot: WorkspaceSnapshot, sequence: number, epoch = snapshot.reconciliation.epoch): CoreEvent {
  return {
    protocolVersion: 1,
    type: "graph.published",
    sequence,
    epoch,
    emittedAt: "2026-09-05T06:01:00.000Z",
    snapshot,
  };
}

describe("reconciliation event ordering", () => {
  it("retains the yellow world while rejecting a late old epoch", () => {
    const initial = initialSnapshot();
    const dirty = dirtySnapshot(initial);
    const yellow = applyCoreEvent(loadSnapshot(initial), event(dirty, 10));
    const stale = applyCoreEvent(yellow, event(initial, 11));

    expect(stale.snapshot?.reconciliation.status).toBe("yellow");
    expect(stale.snapshot?.revisions.working.fingerprint).toBe("work:b2");
    expect(stale.ignoredEvents).toBe(1);
  });

  it("rejects out-of-order sequences even if their epoch is newer", () => {
    const dirty = dirtySnapshot(initialSnapshot());
    const current = applyCoreEvent(loadSnapshot(initialSnapshot()), event(dirty, 10));
    const malicious = { ...dirty, reconciliation: { ...dirty.reconciliation, epoch: 99 } };
    const result = applyCoreEvent(current, event(malicious, 9, 99));
    expect(result.lastSequence).toBe(10);
    expect(result.ignoredEvents).toBe(1);
  });

  it("publishes green only when the built input matches working source", () => {
    const dirty = dirtySnapshot(initialSnapshot());
    const current = applyCoreEvent(loadSnapshot(initialSnapshot()), event(dirty, 1));
    const valid = successfulSnapshot(dirty);
    const invalid = {
      ...valid,
      reconciliation: { ...valid.reconciliation, inputFingerprint: "work:someone-else" },
    };
    expect(() => applyCoreEvent(current, event(invalid, 2))).toThrow("green publication must match its exact working fingerprint");
    expect(applyCoreEvent(current, event(valid, 2)).snapshot?.reconciliation.status).toBe("green");
  });
});
