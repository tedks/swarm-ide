import type { ExternalEntry } from "../../../protocol/external-agents";
import type { ExternalClient } from "./client";
import "./observed-activity.css";

type ObservedClient = ExternalClient & { observing?: boolean; refreshing?: boolean };
const previewCount = 4;
const previewLength = 240;
const kinds: Record<ExternalEntry["kind"], string> = {
  assistant: "Assistant report", "tool-call": "Tool call", "tool-result": "Tool result",
  "turn-start": "Turn started", "turn-complete": "Turn ended",
};

function timeLabel(at: string) {
  const parsed = new Date(at);
  return Number.isFinite(parsed.getTime())
    ? { dateTime: parsed.toISOString(), label: parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }
    : { dateTime: undefined, label: at || "Time not recorded" };
}

/** A replaceable transcript preview, not an accumulated event log or a model summary. */
export function ObservedActivity({ client, onOpen }: { client: ObservedClient; onOpen(): void }) {
  // Selection changes can precede the corresponding read: never attribute the old tail to a new agent.
  const detail = client.detail?.session.id === client.selected ? client.detail : null;
  const session = detail?.session;
  const entries = detail?.entries.slice(-previewCount) ?? [];
  const observed = session ? timeLabel(session.observedAt) : null;
  const refresh = client.observing === false ? "Auto-refresh paused" : client.stale ? "Retained observation · refresh unavailable" : client.refreshing ? "Refreshing observation" : client.observing ? "Auto-refresh on" : "Transcript observation";
  return <section className="observed-activity" aria-label="Observed agent activity">
    <header><strong>Observed activity</strong><small>{refresh}</small></header>
    {session ? <>
      <button className="observed-activity-open" onClick={onOpen} aria-label={`Open observed activity for ${session.label}`}>{session.label}<span aria-hidden="true">↗</span></button>
      <p className="observed-activity-evidence">{session.evidence === "synthetic"
        ? "Synthetic transcript · not a real agent run"
        : "Local JSONL observation · not a generated summary"}</p>
      <p className="observed-activity-observed">Last observed <time dateTime={observed?.dateTime} title={session.observedAt}>{observed?.label}</time></p>
      {entries.length ? <ol aria-label="Latest observed transcript entries">{entries.map((entry) => {
        const at = timeLabel(entry.at);
        return <li key={entry.id}>
          <header><span>{kinds[entry.kind]}</span><time dateTime={at.dateTime} title={entry.at}>{at.label}</time></header>
          <p>{entry.text.length > previewLength ? `${entry.text.slice(0, previewLength)}…` : entry.text}</p>
          <small>{entry.attribution === "assistant-reported" ? "Assistant-reported · not verified" : entry.attribution === "recorded-tool-event" ? "Recorded tool event" : "Recorded harness event"}</small>
        </li>;
      })}</ol> : <p className="observed-activity-empty">No eligible entries in the observed tail; this does not mean the agent is idle.</p>}
      {detail && (detail.coverage.partial || detail.entries.length > previewCount) ? <p className="observed-activity-coverage">Showing {entries.length} latest entries from a bounded tail; earlier activity may be omitted.</p> : null}
    </> : <p className="observed-activity-empty">{client.selected ? "Waiting for this agent’s observation." : "Select an external agent to follow its observed activity."}</p>}
  </section>;
}
