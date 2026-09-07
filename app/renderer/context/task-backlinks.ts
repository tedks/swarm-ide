import type { ContextSection, ContextSubject } from "../../../protocol/context";
import type { TaskClientState } from "../tasks/client";
import { displayTaskText, taskRevisionLabel } from "../tasks/display";

/** A second, independently versioned instrument about the same file. */
export function taskBacklinkSection(subject: ContextSubject, tasks?: TaskClientState): ContextSection {
  const section: ContextSection = { id: "task-backlinks", title: "Explicit file references · Ditz", rows: [] };
  const observation = tasks?.observation, snapshot = observation?.snapshot;
  if (!tasks || !observation || subject.kind !== "file" || !snapshot || snapshot.repositoryId !== subject.repositoryId || snapshot.worldId !== subject.worldId) {
    section.notice = tasks?.notice ?? observation?.reason?.message ?? "Task metadata has not been observed for this file's repository. Refresh tasks to observe it.";
    return section;
  }
  const current = tasks.connected && !tasks.notice && !tasks.refreshing && observation.status === "observed";
  const scope = `${current ? "observed" : "retained"} metadata ${taskRevisionLabel(snapshot.metadataCommit)}`;
  section.evidence = { provider: snapshot.provider, repositoryId: snapshot.repositoryId, worldId: snapshot.worldId,
    origin: observation.metadataRef, revisionKind: "ditz", revision: taskRevisionLabel(snapshot.metadataCommit),
    observedAt: snapshot.observedAt, timeBasis: "producer", freshness: current ? "current" : "retained",
    coverage: `All explicit file_refs in ${scope}, all task states; last local-ref check ${observation.checkedAt ?? "unavailable"}. Not inferred bugs or working-source ownership.` };
  const warning = [tasks.notice, observation.reason?.message, tasks.refreshing ? "Checking tasks; previous evidence retained." : null,
    tasks.backlinkNotice].filter(Boolean).join(" ");
  const index = tasks.backlinks;
  if (!index || snapshot.backlinks?.status !== "complete") {
    section.notice = [warning, snapshot.backlinks?.status === "unavailable" ? "Backlink projection unavailable: projection-limit. Task browsing remains available."
      : "Provider has not published usable associations in this connection."].filter(Boolean).join(" ");
    return section;
  }
  const rows = index.lookup(subject.path);
  section.rows = rows.map((row) => ({ label: `Explicit file reference · ${row.refCount} recorded`,
    value: `${displayTaskText(row.summary.title)} · ${row.summary.status}`, link: { kind: "task", target: row.target } }));
  section.notice = [warning, rows.length ? `Showing ${Math.min(32, rows.length)} of ${rows.length} tasks in ${scope}.`
    : `No explicit file references in ${scope}.`].filter(Boolean).join(" ");
  return section;
}
