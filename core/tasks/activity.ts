import { TaskActivityEventSchema, TaskActivitySchema, type TaskActivity } from "../../protocol/task-activity";
import type { GitObjectId } from "../../protocol/tasks";

/** Supplementary fields never reject a previously supported task detail. The
 * same bounded YAML owner supplied this document; no second parser or I/O. */
export function projectTaskActivity(doc: Record<string, unknown>, blob: GitObjectId): TaskActivity {
  const empty = { blob, createdAt: null, events: [], total: 0, omitted: 0, status: "unavailable" as const };
  const creation = TaskActivitySchema.shape.createdAt.safeParse(doc.creation_time ?? null);
  if (!Array.isArray(doc.log_events)) return { ...empty, createdAt: creation.success ? creation.data : null };
  const total = doc.log_events.length;
  if (total > 8192) return empty;
  // Preserve recorded order/duplicates and source ordinals. Keep the latest
  // recorded tail by timestamp, then render it in its original source order.
  const candidates = doc.log_events.flatMap((row, ordinal) => {
    const parsed = TaskActivityEventSchema.safeParse(row && typeof row === "object" ? { ...row, ordinal } : null);
    return parsed.success ? [parsed.data] : [];
  }).sort((a, b) => Date.parse(b.time) - Date.parse(a.time) || b.ordinal - a.ordinal).slice(0, 32);
  const events: TaskActivity["events"] = [];
  for (const candidate of candidates) {
    const proposed = [...events, candidate];
    if (new TextEncoder().encode(JSON.stringify(proposed)).length <= 44 * 1024) events.push(candidate);
  }
  events.sort((a, b) => a.ordinal - b.ordinal);
  return TaskActivitySchema.parse({ blob, createdAt: creation.success ? creation.data : null,
    events, total, omitted: total - events.length,
    status: creation.success && events.length === total ? "complete" : "partial" });
}
