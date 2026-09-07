import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { RepositoryPathSchema } from "./repository";

export const FILE_SEARCH_ENTRIES = 8_192;
export const FILE_SEARCH_NAME_BYTES = 1024 * 1024;
export const FILE_SEARCH_RESULTS = 40;
export const FILE_SEARCH_STALE_MS = 5_000;
export const FileSearchQuerySchema = z.string().max(256).refine((query) => !/[\x00-\x1f\x7f]/.test(query), "Use a literal filename fragment");
export const RepositorySearchRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1), type: z.literal("repo.search"),
  repositoryId: z.string().min(1).max(256), query: FileSearchQuerySchema, refresh: z.boolean(),
}).strict();
export type RepositorySearchRequest = z.infer<typeof RepositorySearchRequestSchema>;
export const RepositorySearchResultSchema = z.object({
  kind: z.literal("search"), repositoryId: z.string().min(1).max(256), query: FileSearchQuerySchema,
  captureId: z.string().min(1).max(128), capturedAt: z.string().datetime(),
  state: z.enum(["observed", "stale"]), complete: z.boolean(),
  capturedCount: z.number().int().min(0).max(FILE_SEARCH_ENTRIES),
  matchesComplete: z.boolean(), paths: z.array(RepositoryPathSchema).max(FILE_SEARCH_RESULTS),
  notice: z.string().min(1).max(1024),
}).strict().superRefine((result, context) => {
  if (new Set(result.paths).size !== result.paths.length || result.paths.length > result.capturedCount ||
      result.paths.some((path) => !path.toLowerCase().includes(result.query.toLowerCase())) ||
      result.paths.some((path, index) => index > 0 && compareSearchPaths(result.query, result.paths[index - 1]!, path) > 0))
    context.addIssue({ code: "custom", message: "Search paths must be unique, matching and ranked within capture bounds" });
});
export type RepositorySearchResult = z.infer<typeof RepositorySearchResultSchema>;
export function parseRepositorySearchResult(input: unknown, request: RepositorySearchRequest): RepositorySearchResult {
  const result = RepositorySearchResultSchema.parse(input);
  if (result.repositoryId !== request.repositoryId || result.query !== request.query) throw new Error("Search result identity mismatch");
  return result;
}

/** Literal, case-insensitive matching; ordinal full-path tie breaks, not locale order. */
export function compareSearchPaths(query: string, a: string, b: string): number {
  const needle = query.toLowerCase();
  const rank = (path: string) => {
    const lower = path.toLowerCase(), name = lower.slice(lower.lastIndexOf("/") + 1);
    return name === needle ? 0 : name.startsWith(needle) ? 1 : lower.startsWith(needle) ? 2 : name.includes(needle) ? 3 : 4;
  };
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}
