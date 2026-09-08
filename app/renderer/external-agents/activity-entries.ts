import type { ExternalDetail, ExternalEntry } from "../../../protocol/external-agents";

/** Activity is raw operations. Assistant prose belongs in conversation/Work Log. */
export const isActivityOperation = (entry: ExternalEntry) => entry.kind !== "assistant" && entry.kind !== "user";

export function activityEntries(fleet: readonly ExternalDetail[], limit: number) {
  return fleet.flatMap(({ session, entries }) => entries.map((entry, index) => ({ session, entry, index })).filter(({ entry }) => isActivityOperation(entry)))
    .sort((a, b) => (Date.parse(b.entry.at) || 0) - (Date.parse(a.entry.at) || 0) || a.session.id.localeCompare(b.session.id) || b.index - a.index)
    .slice(0, limit).map(({ session, entry }) => ({ session, entry }));
}
