import { sameAgentTaskReference, type AgentTaskReference } from "../../../protocol/agent-task";
import type { TrustedActivity, TrustedRunSummary, TrustedSnapshot } from "../../../protocol/trusted-local";

/** Presentation-only subset of the ROOT-cleared runtime contract. Callers
 * pass the validated core observation; this view never accepts raw IPC. */
export type TaskTrustedRun = TrustedRunSummary;
export type TaskTrustedActivity = TrustedActivity;
export type TaskTrustedSnapshot = Pick<TrustedSnapshot,
  "instanceId" | "runToken" | "output" | "runs" | "taskReference" | "activities" | "archived">;
export interface TaskTrustedObservation {
  snapshot: TaskTrustedSnapshot | null;
  retained: boolean;
}
export interface TaskRunScope { worldId: string; repositoryId: string; taskId: string }

export function matchesTaskRun(reference: AgentTaskReference | null | undefined, scope: TaskRunScope): boolean {
  return Boolean(reference && reference.worldId === scope.worldId && reference.repositoryId === scope.repositoryId && reference.taskId === scope.taskId);
}

/** Recompute on every render. No retained per-task cache can leak another
 * task's association during rapid selection or late observation changes. */
export function taskTrustedRuns(snapshot: TaskTrustedSnapshot | null, scope: TaskRunScope): TaskTrustedRun[] {
  const runs = snapshot?.runs ?? [];
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.runToken, (counts.get(run.runToken) ?? 0) + 1);
  return runs.filter((run) => counts.get(run.runToken) === 1 && matchesTaskRun(run.taskReference, scope))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.runToken.localeCompare(b.runToken));
}

/** A selected snapshot is not another run's transcript, even if task labels
 * match. Exact admitted metadata must agree with the selected summary too. */
export function selectedTaskRunDetail(snapshot: TaskTrustedSnapshot | null, run: TaskTrustedRun): {
  output: string; activities: readonly TaskTrustedActivity[];
} | null {
  if (!snapshot || snapshot.runToken !== run.runToken || !run.taskReference || !snapshot.taskReference ||
      !sameAgentTaskReference(snapshot.taskReference, run.taskReference) || Boolean(snapshot.archived) !== run.archived) return null;
  return { output: snapshot.output, activities: snapshot.activities ?? [] };
}

export function taskRunStatus(run: Pick<TaskTrustedRun, "status" | "archived">): string {
  if (run.archived) return "Archived history";
  switch (run.status) {
    case "ready": return "Ready for instructions";
    case "running": return "Working";
    case "starting": return "Starting";
    case "stopping": return "Stopping";
    case "closed": return "Conversation closed";
    case "failed": return "Conversation failed";
    case "preparing": return "Preparing";
    case "idle": return "Idle";
  }
}
