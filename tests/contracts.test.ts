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

  it("binds green provenance to the exact published revision", () => {
    const dirty = dirtySnapshot(initialSnapshot());
    const succeeded = successfulSnapshot(dirty);
    expect(succeeded.graphs.find((graph) => graph.topologyId === "repo")?.provenance[0]?.version).toBe("work:b2");
    expect(succeeded.graphs.find((graph) => graph.topologyId === "service")?.provenance[0]?.version).toBe("build:b2");
    const tampered = {
      ...succeeded,
      graphs: succeeded.graphs.map((graph) => graph.topologyId === "service"
        ? { ...graph, provenance: [{ ...graph.provenance[0]!, version: "build:old" }] }
        : graph),
    };
    expect(() => WorkspaceSnapshotSchema.parse(tampered)).toThrow("green graph provenance");
  });

  it("rejects dangling mapping candidates and duplicate graph ids", () => {
    const snapshot = initialSnapshot();
    const badMapping = {
      ...snapshot,
      mappings: snapshot.mappings.map((mapping, index) => index === 0
        ? { ...mapping, candidates: [{ ...mapping.candidates[0]!, nodeId: "missing-node" }] }
        : mapping),
    };
    expect(() => WorkspaceSnapshotSchema.parse(badMapping)).toThrow("mapping candidate");
    const duplicateNode = {
      ...snapshot,
      graphs: snapshot.graphs.map((graph, index) => index === 0
        ? { ...graph, nodes: [...graph.nodes, graph.nodes[0]!] }
        : graph),
    };
    expect(() => WorkspaceSnapshotSchema.parse(duplicateNode)).toThrow("node ids must be unique");
  });

  it("rejects malformed focus ranges and unsupported requests", () => {
    expect(() => FocusRefSchema.parse({ ...paymentsFileFocus, range: { startLine: 8, endLine: 2 } })).toThrow();
    expect(() => CoreRequestSchema.parse({ requestId: "x", protocolVersion: 1, type: "shell.exec", command: "rm" })).toThrow();
  });
});
