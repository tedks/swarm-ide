import { describe, expect, it } from "vitest";
import { initialSnapshot as createInitialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, NavigationMappingSchema, WorkspaceSnapshotSchema, parseCoreResponseForRequest } from "../protocol/schema";
import { RepositoryObservationSchema, RepositoryRequestSchema, isRepositoryPath } from "../protocol/repository";

const observation = () => RepositoryObservationSchema.parse({ directory: "core", observationId: "directory:1", capturedAt: "2026-09-06T17:00:00.000Z", state: "observed", complete: true,
  capturedCount: 1, filteredCount: 1, page: 0, pageCount: 1, filter: "", entries: [{ id: "repo:file:core%2Ffiles.ts", path: "core/files.ts", label: "files.ts", kind: "file", git: "tracked", actionable: true }] });

describe("repository navigation contract", () => {
  it("has an exact v5 bounded immediate directory response", () => {
    const request = RepositoryRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "listing", type: "repo.list", directory: "core", page: 0, refresh: true });
    const response = { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot: createInitialSnapshot(), repo: { kind: "list", observation: observation() } };
    expect(parseCoreResponseForRequest(response, request).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...response, repo: { kind: "list", observation: { ...observation(), directory: "app", entries: [] } } }, request)).toThrow();
    expect(() => RepositoryObservationSchema.parse({ ...observation(), entries: [{ ...observation().entries[0], path: "core/deep/file.ts" }] })).toThrow();
    expect(() => RepositoryRequestSchema.parse({ ...request, page: 21 })).toThrow();
  });
  it("rejects aliases and administration but accepts normal Git-named files", () => {
    for (const path of ["", ".", "..", "../a", "/a", "a//b", "a/./b", "a/.git/config", "a\\b", "bad\uFFFD\ud800", "bad\nname"]) expect(isRepositoryPath(path)).toBe(false);
    for (const path of [".gitignore", ".gitmodules", "core/files.ts", "é/😀.ts"]) expect(isRepositoryPath(path)).toBe(true);
  });
  it("retains loaded and unloaded ambiguity while forbidding fabricated node authority", () => {
    const snapshot = createInitialSnapshot();
    const graph = snapshot.graphs.find((graph) => graph.topologyId === "repo")!;
    const loaded = graph.nodes[0]!;
    const recipe = { focus: { ...loaded.focus, domain: "repo" as const, key: "file:core/files.ts", path: "core/files.ts" }, revealPath: "core/files.ts", confidence: 1, reason: "source declaration" };
    const mapping = { from: loaded.focus, targetTopology: "repo", candidates: [{ focus: loaded.focus, nodeId: loaded.id, confidence: 1, reason: "loaded" }, recipe], ambiguous: true };
    expect(WorkspaceSnapshotSchema.parse({ ...snapshot, mappings: [mapping] }).mappings[0]?.candidates).toHaveLength(2);
    expect(() => WorkspaceSnapshotSchema.parse({ ...snapshot, mappings: [{ ...mapping, ambiguous: false }] })).toThrow();
    expect(() => NavigationMappingSchema.parse({ ...mapping, candidates: [{ ...recipe, nodeId: loaded.id }] })).toThrow();
    expect(() => NavigationMappingSchema.parse({ ...mapping, candidates: [{ ...recipe, revealPath: "different.ts" }] })).toThrow();
    expect(() => WorkspaceSnapshotSchema.parse({ ...snapshot, mappings: [{ ...mapping, candidates: [{ ...mapping.candidates[0], nodeId: "missing" }], ambiguous: false }] })).toThrow();
  });
  it("cannot use registration coordinates or unavailable retained evidence as green authority", () => {
    const snapshot = createInitialSnapshot();
    const id = "unobserved:registered-root";
    const unknown = { ...snapshot, revisions: { ...snapshot.revisions, working: { id, fingerprint: "", evidence: "unavailable" } }, focus: { ...snapshot.focus, revisionId: id },
      graphs: snapshot.graphs.map((graph) => ({ ...graph, reconciliation: "gray" })), reconciliation: { ...snapshot.reconciliation, status: "gray", inputFingerprint: id, lastConsistentFingerprint: "unobserved" } };
    expect(WorkspaceSnapshotSchema.parse(unknown).revisions.working.evidence).toBe("unavailable");
    expect(() => WorkspaceSnapshotSchema.parse({ ...unknown, reconciliation: { ...unknown.reconciliation, status: "green" } })).toThrow();
    expect(() => WorkspaceSnapshotSchema.parse({ ...snapshot, revisions: { ...snapshot.revisions, working: { ...snapshot.revisions.working, evidence: "unavailable" } } })).toThrow();
  });
});
