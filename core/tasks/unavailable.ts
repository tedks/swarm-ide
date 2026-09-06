import { TaskObservationSchema, TaskReadResultSchema, TASK_METADATA_REF, type TaskError } from "../../protocol/tasks";
import type { TaskProvider, TaskProviderContext } from "./contracts";

/** No discovery, fixtures, file access, subprocesses or agent calls. */
export function createUnavailableTaskProvider(context: TaskProviderContext): TaskProvider {
  let sequence = 0;
  let disposed = false;
  const world = { worldId: context.worldId, repositoryId: context.repositoryId, provider: "ditz" as const };
  const reason: TaskError = { code: "TASK_PROVIDER_UNAVAILABLE", message: "Repository task reading is not installed in this build." };
  const next = () => {
    if (disposed) throw new Error("Task provider is disposed");
    return { sequence: ++sequence, checkedAt: new Date().toISOString() };
  };
  return {
    async snapshot() {
      return TaskObservationSchema.parse({ ...world, ...next(), status: "unavailable", metadataRef: TASK_METADATA_REF,
        localRef: null, reason, snapshot: null });
    },
    async read(input) {
      return TaskReadResultSchema.parse({ kind: "read", ...world, ...next(), ...input,
        result: { ok: false, error: reason } });
    },
    async dispose() { disposed = true; },
  };
}
