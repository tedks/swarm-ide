import { isRepositoryPath } from "../../../protocol/repository";
import { isTaskSourcePath, type TaskBacklinkEntry, type TaskBacklinkTarget, type TaskSnapshot, type TaskSummary } from "../../../protocol/tasks";

export interface TaskBacklinkRow { readonly target: TaskBacklinkTarget; readonly summary: TaskSummary; readonly refCount: number }
export interface TaskBacklinkIndex {
  readonly snapshot: TaskSnapshot;
  readonly lookup: (path: string) => readonly TaskBacklinkRow[];
  readonly references: (id: string) => readonly TaskBacklinkEntry[];
}
const emptyRows: readonly TaskBacklinkRow[] = Object.freeze([]);
const emptyRefs: readonly TaskBacklinkEntry[] = Object.freeze([]);

/** Construct once from a validated complete publication. No per-focus cache,
 * discovery reads, normalization, inference, or source existence claims. */
export function indexTaskBacklinks(snapshot: TaskSnapshot): TaskBacklinkIndex {
  const paths = new Map<string, Map<string, TaskBacklinkRow>>();
  const refs = new Map<string, TaskBacklinkEntry[]>();
  const summaries = new Map(snapshot.summaries.map((row) => [row.id, row]));
  if (snapshot.backlinks?.status === "complete") for (const entry of snapshot.backlinks.entries) {
    const taskRefs = refs.get(entry.taskId) ?? []; taskRefs.push(Object.freeze({ ...entry })); refs.set(entry.taskId, taskRefs);
    if (entry.navigation !== "candidate" || !isTaskSourcePath(entry.path) || !isRepositoryPath(entry.path)) continue;
    const summary = summaries.get(entry.taskId)!;
    const rows = paths.get(entry.path) ?? new Map<string, TaskBacklinkRow>();
    const prior = rows.get(entry.taskId);
    rows.set(entry.taskId, Object.freeze({ summary, refCount: (prior?.refCount ?? 0) + 1,
      target: Object.freeze({ provider: snapshot.provider, repositoryId: snapshot.repositoryId, worldId: snapshot.worldId,
        metadataCommit: snapshot.metadataCommit, taskId: summary.id, issueBlob: summary.blob }) }));
    paths.set(entry.path, rows);
  }
  const index = new Map([...paths].map(([path, rows]) => [path, Object.freeze([...rows.values()])]));
  for (const value of refs.values()) Object.freeze(value);
  return Object.freeze({ snapshot, lookup: (path: string) => index.get(path) ?? emptyRows,
    references: (id: string) => refs.get(id) ?? emptyRefs });
}

export interface TaskBacklinkAssociation { path: string; index: TaskBacklinkIndex }
