import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, parseCoreRequest, parseCoreResponseForRequest } from "../protocol/schema";
import { FILE_SEARCH_ENTRIES, FILE_SEARCH_RESULTS, RepositorySearchRequestSchema, RepositorySearchResultSchema,
  compareSearchPaths, parseRepositorySearchResult } from "../protocol/repository-search";

const request = () => RepositorySearchRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: "search-1", type: "repo.search", repositoryId: initialSnapshot().project.id, query: "file", refresh: false });
const result = () => ({ kind: "search" as const, repositoryId: request().repositoryId, query: "file", captureId: "filenames:1", capturedAt: "2026-09-06T17:00:00.000Z", state: "observed" as const,
  complete: true, capturedCount: 2, matchesComplete: true, paths: ["core/file.ts", "file.ts"], notice: "Names only; open revalidates current source." });
const response = () => ({ protocolVersion: PROTOCOL_VERSION, requestId: request().requestId, ok: true as const, sequence: 1, snapshot: initialSnapshot(), search: result() });

describe("strict filename search wire contract", () => {
  it("accepts the bounded names-only request and response through the shared protocol", () => {
    expect(parseCoreRequest(request())).toEqual(request());
    expect(parseCoreResponseForRequest(response(), request()).ok).toBe(true);
    expect(parseRepositorySearchResult(result(), request())).toEqual(result());
  });

  it("rejects missing, mistyped, oversized and additional request fields", () => {
    for (const delta of [{ refresh: undefined }, { refresh: "true" }, { repositoryId: "" }, { repositoryId: "x".repeat(257) },
      { query: "x".repeat(257) }, { query: "a\nb" }, { query: "a\0b" }, { query: "a\u007fb" }, { path: "file.ts" }, { protocolVersion: -1 }])
      expect(() => parseCoreRequest({ ...request(), ...delta })).toThrow();
    for (const query of ["", ".", "[a]*?", "$(touch sentinel);", "é😀", "x".repeat(256)])
      expect(RepositorySearchRequestSchema.parse({ ...request(), query }).query).toBe(query);
  });

  it("does not allow duplicate, nonmatching, noncanonical or misranked paths", () => {
    for (const paths of [["file.ts", "file.ts"], ["other.ts"], ["../file"], ["/file"], ["a/.git/file"], ["file\\name"], ["file\nname"], ["file.ts", "core/file.ts"]])
      expect(() => RepositorySearchResultSchema.parse({ ...result(), paths })).toThrow();
    expect(() => RepositorySearchResultSchema.parse({ ...result(), paths: ["file.ts"], capturedCount: 0 })).toThrow();
  });

  it("enforces serialized bounds and rejects fabricated file/node authority", () => {
    for (const delta of [{ capturedCount: -1 }, { capturedCount: 0.5 }, { capturedCount: FILE_SEARCH_ENTRIES + 1 }, { captureId: "" },
      { captureId: "x".repeat(129) }, { capturedAt: "yesterday" }, { state: "green" }, { complete: undefined }, { matchesComplete: undefined },
      { notice: "" }, { notice: "x".repeat(1025) }, { nodeId: "fabricated" }, { content: "file bytes" }, { revision: "authority" },
      { paths: Array.from({ length: FILE_SEARCH_RESULTS + 1 }, (_, index) => `file-${String(index).padStart(3, "0")}`), capturedCount: FILE_SEARCH_RESULTS + 1 }])
      expect(() => RepositorySearchResultSchema.parse({ ...result(), ...delta })).toThrow();
  });

  it("preserves independent capture coverage, match coverage and stale state for empty results", () => {
    for (const complete of [false, true]) for (const matchesComplete of [false, true]) for (const state of ["observed", "stale"])
      expect(RepositorySearchResultSchema.parse({ ...result(), paths: [], complete, matchesComplete, state })).toMatchObject({ paths: [], complete, matchesComplete, state });
  });

  it("binds response request, repository, query and snapshot identity exactly", () => {
    expect(() => parseCoreResponseForRequest({ ...response(), requestId: "another" }, request())).toThrow();
    expect(() => parseCoreResponseForRequest({ ...response(), search: undefined }, request())).toThrow();
    for (const delta of [{ query: "FILE" }, { repositoryId: "another" }])
      expect(() => parseCoreResponseForRequest({ ...response(), search: { ...result(), ...delta } }, request())).toThrow();
    const snapshot = initialSnapshot();
    expect(() => parseCoreResponseForRequest({ ...response(), snapshot: { ...snapshot, project: { ...snapshot.project, id: "another" } } }, request())).toThrow();
    expect(() => parseCoreResponseForRequest(response(), parseCoreRequest({ protocolVersion: PROTOCOL_VERSION, requestId: request().requestId, type: "repo.list", directory: "", page: 0, filter: "", refresh: true }))).toThrow();
  });

  it("accepts a structured failure but not a success payload hidden in failure", () => {
    const failure = { protocolVersion: PROTOCOL_VERSION, requestId: request().requestId, ok: false, error: { code: "REPOSITORY_SEARCH_UNAVAILABLE", message: "Retry explicitly" } };
    expect(parseCoreResponseForRequest(failure, request()).ok).toBe(false);
    expect(() => parseCoreResponseForRequest({ ...failure, search: result() }, request())).toThrow();
  });

  it("uses basename exact/prefix, path prefix, basename fragment, then ordinal ties", () => {
    const paths = ["z/needle", "a/needle", "needle-more", "needle-dir/other", "a/xneedle", "z/needle-dir/other", "A/needle"];
    expect(paths.sort((a, b) => compareSearchPaths("NEEDLE", a, b))).toEqual(["A/needle", "a/needle", "z/needle", "needle-more", "needle-dir/other", "a/xneedle", "z/needle-dir/other"]);
  });
});
