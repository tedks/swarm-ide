import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../../protocol/external-agents";
import { ActivityTime } from "./ActivityTime";
import { activityEntries } from "./external-agents/activity-entries";

export type SelectedActivity = { session: ExternalAgentSummary; entry: ExternalEntry };
/** Only the registered worktree prefix may turn a recorded absolute path into
 * a relative request. The core independently resolves the session registration. */
export function eventRepositoryPath(session: ExternalAgentSummary, path: string): string {
  const prefix = session.worktree ? `${session.worktree.replace(/\/$/, "")}/` : null;
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
export function FleetActivityView({ fleet, sessions, selected, onSelect, onAgent, onInspect }: {
  fleet: ExternalDetail[]; selected: SelectedActivity | null; onSelect(value: SelectedActivity | null): void;
  sessions?: ExternalAgentSummary[];
  onAgent(id: string): void; onInspect(id: string, path: string, patch?: string): void;
}) {
  const entries = activityEntries(fleet, 200);
  // Fleet tails are bounded; registration, not presence in today's tail, owns
  // source navigation. A selected event remains historical, never latest-by-ID.
  const registered = new Map((sessions ?? fleet.map((item) => item.session)).map((item) => [item.id, item]));
  const canOpen = (recorded: ExternalAgentSummary) => {
    const current = registered.get(recorded.id);
    return current?.status === "observed" && current.worktree === recorded.worktree && current.evidence === recorded.evidence;
  };
  const available = selected ? canOpen(selected.session) : false;
  return <section className="fleet-activity-view" aria-label="Live swarm activity">
    {selected ? <article className="fleet-event-detail">
      <header><button onClick={() => onSelect(null)}>All activity</button><ActivityTime at={selected.entry.at} /></header>
      <h3>{selected.session.label}</h3><p>{selected.entry.text}</p>
      {selected.entry.command ? <pre>{selected.entry.command}</pre> : null}
      {selected.session.worktree ? <p className="worktree-location">{selected.session.worktree}</p> : null}
      {!available ? <p role="status">This agent or worktree is no longer available. Return to All activity.</p> : null}
      <div className="fleet-event-actions"><button disabled={!available} onClick={() => onAgent(selected.session.id)}>Open agent</button>
        {selected.entry.path ? <button disabled={!available} onClick={() => onInspect(selected.session.id, eventRepositoryPath(selected.session, selected.entry.path!), selected.entry.patch)}>Inspect {selected.entry.path}</button> : null}</div>
      {selected.entry.patch ? <pre className="fleet-recorded-patch">{selected.entry.patch}</pre> : null}
    </article> : entries.length ? <ol>{entries.map(({ session, entry }) => <li key={`${session.id}:${entry.id}`}>
      <button aria-label={`${session.label}: ${entry.text}`} onClick={() => onSelect({ session, entry })}><ActivityTime at={entry.at} /><strong>{session.label}</strong><span>{entry.text}</span></button>
      {entry.path ? <button className="fleet-file-link" data-session={session.id} data-activity-file={entry.path} disabled={!canOpen(session)} onClick={() => onInspect(session.id, eventRepositoryPath(session, entry.path!), entry.patch)}>{entry.path}</button> : null}
    </li>)}</ol> : <p>No activity yet. Registered agents appear here as their transcripts update.</p>}
  </section>;
}
