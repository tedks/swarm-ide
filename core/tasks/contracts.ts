import type { GitObjectId, TaskObservation, TaskReadResult } from "../../protocol/tasks";
import type { TaskActivityResult } from "../../protocol/task-activity";

/** Constructor authority comes only from the registered local core world.
 * No renderer-supplied roots, refs, executable names or metadata paths. */
export interface TaskProviderContext {
  root: string;
  worldId: string;
  repositoryId: string;
}
export interface TaskProvider {
  /** true: one bounded observation; false: local-ref check and retained cache.
   * Neither means fetch/sync. Each returned observation carries its own sequence. */
  snapshot(input: { refresh: boolean }): Promise<TaskObservation>;
  /** Only the latest complete cache; an old revision must never be silently read
   * from a moving ref. Errors echo the requested identity/revision too. */
  read(input: { metadataCommit: GitObjectId; taskId: string }): Promise<TaskReadResult>;
  activity?(input: { metadataCommit: GitObjectId; taskId: string }): Promise<TaskActivityResult>;
  /** Idempotent, owned lifetime shutdown. No new operations/late publication. */
  dispose(): Promise<void>;
}
export type CreateTaskProvider = (context: TaskProviderContext) => TaskProvider | Promise<TaskProvider>;
