import { describe, expect, it } from "vitest";
import { CoreRequestSchema, CoreResponseSchema, FileEventSchema, FocusRefSchema, MAX_EDITABLE_FILE_BYTES, PROTOCOL_VERSION, WorkspaceSnapshotSchema, parseCoreResponseForRequest } from "../protocol/schema";
import { unavailableAgentSnapshot } from "../core/agents/unavailable";
import {
  dirtySnapshot,
  failedSnapshot,
  initialSnapshot,
  writerFileFocus,
  successfulSnapshot,
} from "../fixtures/world";

describe("runtime contracts", () => {
  it.each(["read", "write"] as const)("correlates file %s replies with their exact path and kind", (kind) => {
    const revision = "a".repeat(64);
    const request = CoreRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "file-command", type: `file.${kind}`, path: "src/a.ts",
      ...(kind === "write" ? { expectedRevision: revision, content: "next" } : {}) });
    const file = kind === "read" ? { kind, path: "src/a.ts", content: "next", revision, size: 4 }
      : { kind, path: "src/a.ts", revision, workingFingerprint: revision };
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot: initialSnapshot() };
    expect(parseCoreResponseForRequest({ ...common, file }, request)).toMatchObject({ file });
    expect(() => parseCoreResponseForRequest(common, request)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...common, file: { ...file, path: "src/b.ts" } }, request)).toThrow();
    const otherKind = kind === "read" ? { kind: "write", path: file.path, revision, workingFingerprint: revision }
      : { kind: "read", path: file.path, content: "next", revision, size: 4 };
    expect(() => parseCoreResponseForRequest({ ...common, file: otherKind }, request)).toThrow();
  });

  it("rejects unsolicited file results on observation-only commands", () => {
    for (const type of ["workspace.snapshot", "file.watch", "file.unwatch"] as const) {
      const request = CoreRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: type, type, path: "src/a.ts" });
      const common = { protocolVersion: PROTOCOL_VERSION, requestId: type, ok: true, sequence: 1, snapshot: initialSnapshot() };
      expect(parseCoreResponseForRequest(common, request).ok).toBe(true);
      expect(parseCoreResponseForRequest({ ...common, file: undefined, agent: undefined }, request).ok).toBe(true);
      expect(() => parseCoreResponseForRequest({ ...common, file: { kind: "read", path: "src/a.ts", content: "x", revision: "a".repeat(64), size: 1 } }, request)).toThrow();
    }
  });

  it("rejects unsolicited agent results on workspace and file commands", () => {
    const agent = { kind: "snapshot", snapshot: unavailableAgentSnapshot() };
    for (const type of ["workspace.snapshot", "file.read"] as const) {
      const request = CoreRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: type, type, path: "src/a.ts" });
      const response = { protocolVersion: PROTOCOL_VERSION, requestId: type, ok: true, sequence: 1, snapshot: initialSnapshot(),
        ...(type === "file.read" ? { file: { kind: "read", path: "src/a.ts", content: "x", revision: "a".repeat(64), size: 1 } } : {}) };
      expect(parseCoreResponseForRequest(response, request).ok).toBe(true);
      expect(() => parseCoreResponseForRequest({ ...response, agent }, request)).toThrow();
    }
  });

  it("accepts every deterministic fixture state", () => {
    const initial = WorkspaceSnapshotSchema.parse(initialSnapshot());
    const dirty = WorkspaceSnapshotSchema.parse(dirtySnapshot(initial));
    const succeeded = WorkspaceSnapshotSchema.parse(successfulSnapshot(dirty));
    const failed = WorkspaceSnapshotSchema.parse(failedSnapshot(dirty));

    expect(initial.reconciliation.status).toBe("green");
    expect(dirty.reconciliation.status).toBe("yellow");
    expect(succeeded.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "Validator")).toBe(true);
    expect(failed.reconciliation.lastConsistentFingerprint).toBe("work:a1");
    expect(failed.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "Validator")).toBe(false);
  });

  it("keeps ambiguity explicit instead of choosing silently", () => {
    const mapping = initialSnapshot().mappings.find((candidate) => candidate.from.key === writerFileFocus.key);
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
    expect(() => FocusRefSchema.parse({ ...writerFileFocus, range: { startLine: 8, endLine: 2 } })).toThrow();
    expect(() => CoreRequestSchema.parse({ requestId: "x", protocolVersion: 1, type: "shell.exec", command: "rm" })).toThrow();
  });

  it("bounds the typed file bridge and carries content revisions without filesystem authority", () => {
    const snapshot = initialSnapshot();
    const revision = "a".repeat(64);
    expect(CoreRequestSchema.parse({ requestId: "read", protocolVersion: PROTOCOL_VERSION, type: "file.read", path: "src/file.ts" }).type).toBe("file.read");
    expect(CoreRequestSchema.parse({ requestId: "write", protocolVersion: PROTOCOL_VERSION, type: "file.write", path: "src/file.ts", expectedRevision: revision, content: "next\n" }).type).toBe("file.write");
    expect(() => CoreRequestSchema.parse({ requestId: "large", protocolVersion: PROTOCOL_VERSION, type: "file.write", path: "src/file.ts", expectedRevision: revision, content: "x".repeat(MAX_EDITABLE_FILE_BYTES + 1) })).toThrow();
    const response = CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "read", ok: true, sequence: 0, snapshot, file: { kind: "read", path: "src/file.ts", content: "next\n", revision, size: 5 } });
    expect(response.ok && response.file?.kind).toBe("read");
    expect(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "write-warning", ok: true, sequence: 0, snapshot, file: { kind: "write", path: "src/file.ts", revision, workingFingerprint: null, fingerprintError: "saved; refresh failed" } }).ok).toBe(true);
    expect(() => CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "dishonest-write", ok: true, sequence: 0, snapshot, file: { kind: "write", path: "src/file.ts", revision, workingFingerprint: null } })).toThrow();
    expect(FileEventSchema.parse({ protocolVersion: PROTOCOL_VERSION, type: "file.changed", sequence: 1, emittedAt: "2026-09-05T12:00:00.000Z", path: "src/file.ts", revision, change: "modified" }).change).toBe("modified");
  });
});
