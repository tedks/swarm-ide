import { describe, expect, it } from "vitest";
import { CoreRequestSchema, FocusRefSchema, WorkspaceSnapshotSchema } from "../protocol/schema";
import {
  dirtySnapshot,
  failedSnapshot,
  initialSnapshot,
  paymentsFileFocus,
  successfulSnapshot,
} from "../fixtures/world";

describe("runtime contracts", () => {
  it("accepts every deterministic fixture state", () => {
    const initial = WorkspaceSnapshotSchema.parse(initialSnapshot());
    const dirty = WorkspaceSnapshotSchema.parse(dirtySnapshot(initial));
    const succeeded = WorkspaceSnapshotSchema.parse(successfulSnapshot(dirty));
    const failed = WorkspaceSnapshotSchema.parse(failedSnapshot(dirty));

    expect(initial.reconciliation.status).toBe("green");
    expect(dirty.reconciliation.status).toBe("yellow");
    expect(succeeded.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "FraudCheck")).toBe(true);
    expect(failed.reconciliation.lastConsistentFingerprint).toBe("work:a1");
    expect(failed.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "FraudCheck")).toBe(false);
  });

  it("keeps ambiguity explicit instead of choosing silently", () => {
    const mapping = initialSnapshot().mappings.find((candidate) => candidate.from.key === paymentsFileFocus.key);
    expect(mapping?.ambiguous).toBe(true);
    expect(mapping?.candidates).toHaveLength(2);
  });

  it("rejects malformed focus ranges and unsupported requests", () => {
    expect(() => FocusRefSchema.parse({ ...paymentsFileFocus, range: { startLine: 8, endLine: 2 } })).toThrow();
    expect(() => CoreRequestSchema.parse({ requestId: "x", protocolVersion: 1, type: "shell.exec", command: "rm" })).toThrow();
  });
});
