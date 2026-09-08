import type { ExternalEntry, ExternalAgentSummary } from "../../../protocol/external-agents";
import type { ExternalClient } from "./client";
import { ActivityTime } from "../ActivityTime";
import { activityEntries } from "./activity-entries";
import "./observed-activity.css";

const previewLength = 240;

/** The dock supplies the single Activity heading. Refresh never adds chrome. */
export function ObservedActivity({ client, onOpen, onEntry, onOpenFile }: {
  client: ExternalClient; onOpen(sessionId: string): void;
  onEntry?(session: ExternalAgentSummary, entry: ExternalEntry): void;
  onOpenFile?(sessionId: string, path: string, patch?: string): void;
}) {
  const fleet = client.fleet ?? [];
  // A selection may change before its read completes; never relabel an old tail.
  const detail = client.detail?.session.id === client.selected ? client.detail : null;
  const source = fleet.length ? fleet : detail ? [detail] : [];
  const entries = activityEntries(source, fleet.length ? 16 : 4);
  const state = client.stale ? "Reconnecting…" : client.observing === false ? "Paused" :
    source.length && source.every(({ session }) => session.evidence === "synthetic") ? "Example" : null;
  return <section className="observed-activity" aria-label="Observed agent activity">
    {state ? <p className="observed-activity-state">{state}</p> : null}
    {!fleet.length && detail ? <button className="observed-activity-open" onClick={() => onOpen(detail.session.id)}
      aria-label={`Open observed activity for ${detail.session.label}`}>{detail.session.label}<span aria-hidden="true">↗</span></button> : null}
    {entries.length ? <ol aria-label="Latest observed transcript entries">{entries.map(({ session, entry }) => <li key={`${session.id}:${entry.id}`} data-session={session.id} data-event={entry.id}>
      <header><button onClick={() => { void client.read(session.id); onOpen(session.id); }}>{session.label}{session.evidence === "synthetic" ? " · example" : ""}</button><ActivityTime at={entry.at} /></header>
      <button className="observed-activity-event" title={session.worktree} onClick={() => {
        if (entry.path && onOpenFile) onOpenFile(session.id, entry.path, entry.patch);
        else if (onEntry) onEntry(session, entry);
        else { void client.read(session.id); onOpen(session.id); }
      }}>{entry.text.length > previewLength ? `${entry.text.slice(0, previewLength)}…` : entry.text}</button>
    </li>)}</ol> : <p className="observed-activity-empty">{source.length ? "No recent operations." : client.selected ? "Waiting for this agent’s observation." : "Registered agents’ tool calls and edits appear here."}</p>}
  </section>;
}
