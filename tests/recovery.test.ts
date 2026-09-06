import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { retainDerived, staleSnapshot, NavigationSchema } from "../app/renderer/recovery";
import { WorkspaceSnapshotSchema } from "../protocol/schema";

describe("retained derived navigation", () => {
  it("retags working navigation but keeps old derivation provenance explicitly stale", () => {
    const previous = initialSnapshot();
    const next = structuredClone(previous);
    next.revisions.working = { id: "next", fingerprint: "next" };
    next.focus.revisionId = "next";
    next.reconciliation = { ...next.reconciliation, status: "gray", lastConsistentFingerprint: "unobserved" };
    const retained = retainDerived(previous, next);
    expect(retained.reconciliation.status).toBe("yellow");
    expect(retained.graphs.map((g) => g.provenance)).toEqual(previous.graphs.map((g) => g.provenance));
    for (const node of retained.graphs.flatMap((g) => g.nodes)) if (node.focus.revisionKind === "working") expect(node.focus.revisionId).toBe("next");
    for (const mapping of retained.mappings) {
      if (mapping.from.revisionKind === "working") expect(mapping.from.revisionId).toBe("next");
      for (const candidate of mapping.candidates) if (candidate.focus.revisionKind === "working") expect(candidate.focus.revisionId).toBe("next");
    }
    expect(() => WorkspaceSnapshotSchema.parse(retained)).not.toThrow();
  });
  it("round-trips a stale graph checkpoint for document refresh", () => {
    const snapshot = staleSnapshot(initialSnapshot(), "Core updating");
    const saved = NavigationSchema.parse(JSON.parse(JSON.stringify({ paths: [], activeSurface: "graphs", lens: "System", focus: snapshot.focus, snapshot })));
    expect(saved.snapshot?.graphs).toEqual(snapshot.graphs);
    expect(saved.snapshot?.reconciliation.status).toBe("yellow");
  });
});
