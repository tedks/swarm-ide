import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { AgentTaskReferenceSchema, type AgentTaskReference } from "../../protocol/agent-task";
import { TASK_LIMITS, type GitObjectId } from "../../protocol/tasks";
import type { AgentTaskResolver } from "../agents/context";
import { TaskGitReader, TaskReaderError } from "./git-reader";
import { parseTaskMetadata } from "./metadata";

const unavailable = () => new TaskReaderError("TASK_REVISION_EXPIRED", "Repository-task context changed or is unavailable. Refresh and attach it again.");
const sameObject = (a: GitObjectId | null, b: GitObjectId) => a?.algorithm === b.algorithm && a.hex === b.hex;

/** Registered authority, never renderer roots/refs/object selectors. Creates no
 * child or worker until an explicit context observation. The context owns the
 * AbortSignal; reader/parser settlement attests their owned process termination. */
export function createAgentTaskResolver(options: { root: string; worldId: string; repositoryId: string }): AgentTaskResolver {
  if (!isAbsolute(options.root)) throw unavailable();
  const root = realpathSync(options.root);
  const { worldId, repositoryId } = options;
  const reader = new TaskGitReader(root);
  const validate = (untrusted: AgentTaskReference, signal: AbortSignal, deadline: number) => {
    const parsed = AgentTaskReferenceSchema.safeParse(untrusted);
    if (!parsed.success || parsed.data.worldId !== worldId || parsed.data.repositoryId !== repositoryId ||
        signal.aborted || !Number.isFinite(deadline) || Date.now() >= deadline) throw unavailable();
    return parsed.data;
  };
  const check = async (reference: AgentTaskReference, signal: AbortSignal, deadline: number) => {
    validate(reference, signal, deadline);
    if (!sameObject(await reader.resolve(signal, deadline), reference.metadataCommit)) throw unavailable();
    validate(reference, signal, deadline);
  };
  return {
    async resolveTask(untrusted, signal, absoluteDeadline) {
      const deadline = Math.min(absoluteDeadline, Date.now() + TASK_LIMITS.observationMs);
      const reference = validate(untrusted, signal, deadline);
      await check(reference, signal, deadline);
      const input = await reader.scan(reference.metadataCommit, signal, deadline);
      const details = await parseTaskMetadata(input, signal, deadline);
      const detail = details.find((item) => item.id === reference.taskId);
      if (!detail || !sameObject(detail.blob, reference.issueBlob)) throw unavailable();
      await check(reference, signal, deadline);
      return { reference, title: detail.title, description: detail.description };
    },
    async checkRevision(untrusted, signal, absoluteDeadline) {
      const deadline = Math.min(absoluteDeadline, Date.now() + TASK_LIMITS.observationMs);
      await check(validate(untrusted, signal, deadline), signal, deadline);
    },
  };
}
