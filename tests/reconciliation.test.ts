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
    expect(applyCoreEvent(current, event(invalid, 2)).ignoredEvents).toBe(1);
    expect(applyCoreEvent(current, event(valid, 2)).snapshot?.reconciliation.status).toBe("green");
  });

  it("advances successive attempts and retains the last green topology", () => {
    const firstDirty = dirtySnapshot(initialSnapshot());
    const firstGreen = successfulSnapshot(firstDirty);
    const secondDirty = dirtySnapshot(firstGreen);
    const secondGreen = successfulSnapshot(secondDirty);

    expect(secondDirty.reconciliation.epoch).toBe(3);
    expect(secondDirty.revisions.working.fingerprint).toBe("work:c3");
    expect(secondDirty.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.id === "service-fraud")).toBe(true);
    expect(secondGreen.revisions.built).toEqual({ id: "build:c3", sourceFingerprint: "work:c3" });
  });

  it("rejects a stale prior green after a later attempt", () => {
    const firstGreen = successfulSnapshot(dirtySnapshot(initialSnapshot()));
    const secondDirty = dirtySnapshot(firstGreen);
    const current = applyCoreEvent(loadSnapshot(firstGreen), event(secondDirty, 10));
    const result = applyCoreEvent(current, event(firstGreen, 11));
    expect(result.snapshot?.reconciliation.status).toBe("yellow");
    expect(result.snapshot?.reconciliation.epoch).toBe(3);
    expect(result.ignoredEvents).toBe(1);
  });

  it("accepts an explicit authoritative fixture reset", () => {
    const green = successfulSnapshot(dirtySnapshot(initialSnapshot()));
    const current = applyCoreEvent(loadSnapshot(green, 8), event(dirtySnapshot(green), 9));
    const reset = { ...event(initialSnapshot(), 10), type: "workspace.reset" as const };
    const result = applyCoreEvent(current, reset);
    expect(result.snapshot?.revisions.working.id).toBe("work:a1");
    expect(result.lastSequence).toBe(10);
  });

  it("rejects an event whose envelope and snapshot epochs disagree", () => {
    const current = loadSnapshot(initialSnapshot());
    const result = applyCoreEvent(current, event(initialSnapshot(), 1, 99));
    expect(result.snapshot?.reconciliation.epoch).toBe(1);
    expect(result.ignoredEvents).toBe(1);
  });
});
