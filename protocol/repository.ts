import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";

export const REPOSITORY_PAGE_SIZE = 200;
export const REPOSITORY_CAPTURE_ENTRIES = 4_096;
export const REPOSITORY_CAPTURE_BYTES = 1024 * 1024;
export const REPOSITORY_STALE_MS = 5_000;

export function isRepositoryPath(path: string, allowRoot = false): boolean {
  return (allowRoot && path === "") || (path.length > 0 && path.length <= 4_096 &&
    !/[\\\x00-\x1f\x7f]/.test(path) && !/[\uD800-\uDFFF]/u.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part !== ".git"));
}
export const RepositoryPathSchema = z.string().refine((path) => isRepositoryPath(path), "Canonical repository file path required");
export const RepositoryDirectorySchema = z.string().refine((path) => isRepositoryPath(path, true), "Canonical repository directory required");
export function repositoryEntryId(repositoryId: string, kind: string, path: string): string {
  return `${repositoryId}:${kind}:${encodeURIComponent(path)}`;
}

export const RepositoryEntrySchema = z.object({
  id: z.string().min(1).max(16_500),
  path: RepositoryPathSchema.nullable(),
  label: z.string().min(1).max(1_024),
  kind: z.enum(["directory", "file", "symlink", "repository", "special", "unsupported"]),
  git: z.enum(["tracked", "untracked", "ignored", "unknown"]),
  actionable: z.boolean(),
  reason: z.string().min(1).max(512).optional(),
}).strict().superRefine((entry, context) => {
  if (entry.actionable && (!entry.path || !["directory", "file"].includes(entry.kind)))
    context.addIssue({ code: "custom", message: "Only canonical files and directories are actionable" });
  if (!entry.actionable && !entry.reason)
    context.addIssue({ code: "custom", message: "Unsupported entries require a reason" });
});
export type RepositoryEntry = z.infer<typeof RepositoryEntrySchema>;

export const RepositoryObservationSchema = z.object({
  directory: RepositoryDirectorySchema,
  observationId: z.string().min(1).max(128),
  capturedAt: z.string().datetime(),
  state: z.enum(["loading", "observed", "stale", "error"]),
  complete: z.boolean(),
  capturedCount: z.number().int().min(0).max(REPOSITORY_CAPTURE_ENTRIES),
  filteredCount: z.number().int().min(0).max(REPOSITORY_CAPTURE_ENTRIES),
  page: z.number().int().nonnegative(),
  pageCount: z.number().int().min(1).max(Math.ceil(REPOSITORY_CAPTURE_ENTRIES / REPOSITORY_PAGE_SIZE)),
  filter: z.string().max(256),
  entries: z.array(RepositoryEntrySchema).max(REPOSITORY_PAGE_SIZE),
  notice: z.string().max(1_024).optional(),
  reveal: z.object({ path: RepositoryPathSchema, status: z.enum(["selected", "outside-capture", "absent", "unsupported"]) }).strict().optional(),
}).strict().superRefine((observation, context) => {
  const prefix = observation.directory ? `${observation.directory}/` : "";
  if (observation.page >= observation.pageCount || observation.filteredCount > observation.capturedCount ||
      observation.pageCount !== Math.max(1, Math.ceil(observation.filteredCount / REPOSITORY_PAGE_SIZE)) ||
      new Set(observation.entries.map((entry) => entry.id)).size !== observation.entries.length)
    context.addIssue({ code: "custom", message: "Invalid directory page or duplicate identities" });
  if (observation.entries.some((entry) => entry.path !== null &&
    (!entry.path.startsWith(prefix) || entry.path.slice(prefix.length).includes("/"))))
    context.addIssue({ code: "custom", message: "Only immediate directory children belong to an observation" });
  if (observation.reveal?.status === "selected" && !observation.entries.some((entry) => entry.path === observation.reveal!.path && entry.actionable && entry.kind === "file"))
    context.addIssue({ code: "custom", message: "Selected reveal must identify a loaded eligible file" });
});
export type RepositoryObservation = z.infer<typeof RepositoryObservationSchema>;

export const RepositoryRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1), type: z.literal("repo.list"),
  directory: RepositoryDirectorySchema, page: z.number().int().min(0).max(20),
  observationId: z.string().min(1).max(128).optional(), filter: z.string().max(256).default(""), refresh: z.boolean(),
  // An explicit navigation intent, never a read permission or a hidden node.
  revealPath: RepositoryPathSchema.optional(),
}).strict().superRefine((request, context) => {
  if (request.revealPath && request.revealPath.split("/").slice(0, -1).join("/") !== request.directory)
    context.addIssue({ code: "custom", message: "Reveal must belong to the requested parent directory" });
});
export type RepositoryRequest = z.infer<typeof RepositoryRequestSchema>;
export const RepositoryResultSchema = z.object({ kind: z.literal("list"), observation: RepositoryObservationSchema }).strict();
export type RepositoryResult = z.infer<typeof RepositoryResultSchema>;
export function parseRepositoryResultForRequest(input: unknown, request: RepositoryRequest): RepositoryResult {
  const result = RepositoryResultSchema.parse(input);
  const observation = result.observation;
  if (observation.directory !== request.directory ||
      (!request.refresh && request.observationId && observation.observationId !== request.observationId) ||
      (request.revealPath ? observation.reveal?.path !== request.revealPath || observation.filter !== "" :
        observation.page !== request.page || observation.filter !== request.filter || observation.reveal !== undefined))
    throw new Error("Repository result does not match its navigation intent");
  return result;
}
