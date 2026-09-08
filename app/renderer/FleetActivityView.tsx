import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../../protocol/external-agents";
import { ActivityTime } from "./ActivityTime";

export type SelectedActivity = { session: ExternalAgentSummary; entry: ExternalEntry };
export function FleetActivityView({ fleet, selected, onSelect, onAgent, onInspect }: {
  fleet: ExternalDetail[]; selected: SelectedActivity | null; onSelect(value: SelectedActivity | null): void;
  onAgent(id: string): void; onInspect(id: string, path: string, patch?: string): void;
}) {
  const entries = fleet.flatMap(({ session, entries }) => entries.map((entry) => ({ session, entry })))
    .filter(({ entry }) => entry.kind !== "assistant")
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at)).slice(0, 200);
  return <section className="fleet-activity-view" aria-label="Live swarm activity">
    {selected ? <article className="fleet-event-detail">
      <header><button onClick={() => onSelect(null)}>All activity</button><ActivityTime at={selected.entry.at} /></header>
      <h3>{selected.session.label}</h3><p>{selected.entry.text}</p>
      {selected.entry.command ? <pre>{selected.entry.command}</pre> : null}
      {selected.session.worktree ? <p className="worktree-location">{selected.session.worktree}</p> : null}
      <div className="fleet-event-actions"><button onClick={() => onAgent(selected.session.id)}>Open agent</button>
        {selected.entry.path ? <button onClick={() => onInspect(selected.session.id, selected.entry.path!, selected.entry.patch)}>Inspect {selected.entry.path}</button> : null}</div>
      {selected.entry.patch ? <pre className="fleet-recorded-patch">{selected.entry.patch}</pre> : null}
    </article> : entries.length ? <ol>{entries.map(({ session, entry }) => <li key={`${session.id}:${entry.id}`}>
      <button onClick={() => onSelect({ session, entry })}><ActivityTime at={entry.at} /><strong>{session.label}</strong><span>{entry.text}</span></button>
      {entry.path ? <button className="fleet-file-link" onClick={() => onInspect(session.id, entry.path!, entry.patch)}>{entry.path}</button> : null}
    </li>)}</ol> : <p>No activity yet. Registered agents appear here as their transcripts update.</p>}
  </section>;
}
