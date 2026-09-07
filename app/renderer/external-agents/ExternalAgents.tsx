import { useState } from "react";
import type { ExternalAgentSummary } from "../../../protocol/external-agents";
import type { ExternalClient } from "./client";
import "./external-agents.css";

/** Iterative traversal: displayed role names never impose an ancestry depth. */
export function lineageRows(sessions: ExternalAgentSummary[]): { session: ExternalAgentSummary; depth: number }[] {
  const children = new Map<string, ExternalAgentSummary[]>(), roots: ExternalAgentSummary[] = [];
  for (const session of sessions) {
    if (session.ancestry === "registered-parent" && session.parentId) {
      const list = children.get(session.parentId) ?? []; list.push(session); children.set(session.parentId, list);
    } else roots.push(session);
  }
  const rows: { session: ExternalAgentSummary; depth: number }[] = [], seen = new Set<string>();
  const pending = roots.map((session) => ({ session, depth: 0 })).reverse();
  while (pending.length) {
    const row = pending.pop()!; if (seen.has(row.session.id)) continue;
    seen.add(row.session.id); rows.push(row);
    for (const session of [...(children.get(row.session.id) ?? [])].reverse()) pending.push({ session, depth: row.depth + 1 });
  }
  for (const session of sessions) if (!seen.has(session.id)) rows.push({ session, depth: 0 });
  return rows;
}

export function ExternalAgentRail({ client, onSelect }: { client: ExternalClient; onSelect(): void }) {
  return <section className="external-agents" aria-label="External supervised sessions">
    <header><strong>External sessions</strong><button disabled={client.busy} onClick={() => { void client.refresh(); }} aria-label="Refresh external sessions">↻</button></header>
    <p className="external-caption">Observed harnesses · not managed runs</p>
    {client.snapshot?.sessions.length ? <ul aria-label="Fork lineage">{lineageRows(client.snapshot.sessions).map(({ session, depth }) =>
      <li key={session.id} style={{ paddingLeft: `${Math.min(depth, 8) * 12}px` }} data-session={session.id} data-depth={depth}>
        <button aria-label={`Inspect external agent ${session.label}`} aria-pressed={client.selected === session.id} onClick={() => { onSelect(); void client.read(session.id); }}>
          <span aria-hidden="true">{depth ? "↳" : "◇"}</span><span>{session.label}<small>{session.evidence === "synthetic" ? "synthetic · " : ""}{session.status === "unavailable" ? "unavailable" : session.ancestry === "unknown-parent" ? "parent not registered" : session.ancestry === "cycle" ? "invalid cyclic ancestry" : `fork depth ${depth}`}</small></span>
        </button>
      </li>)}</ul> : <p className="external-caption">{client.busy ? "Reading registrations…" : "No observed sessions. Supply an operator registry to connect existing harnesses."}</p>}
    {client.notice ? <p role="status">{client.notice}</p> : null}
  </section>;
}

export function ExternalAgentInformation({ client, onReturn, onOpen }: { client: ExternalClient; onReturn(): void; onOpen(path: string): void }) {
  const [tab, setTab] = useState<"worklog" | "conversation">("worklog");
  const detail = client.detail, session = detail?.session;
  const entries = detail?.entries.filter((entry) => tab === "worklog" || entry.kind === "assistant") ?? [];
  return <section className="external-information" aria-label="External agent information" data-external-session={client.selected}>
    <header><span className="eyebrow">external supervised session</span><h2>{session?.label ?? "Reading session…"}</h2>
      <button onClick={onReturn}>Return to source information</button></header>
    <p className="external-boundary">Read-only observation. Managed agent execution remains separate and unavailable.</p>
    {client.busy ? <p role="status">Observing…</p> : null}
    {client.notice ? <p role="status">{client.notice}</p> : null}
    {session ? <>
      <dl><dt>Evidence</dt><dd>{session.evidence === "synthetic" ? "Synthetic example — not a real agent run" : "Registered local JSONL — recorded, not live telemetry"}</dd>
        <dt>Session</dt><dd>{session.id}</dd><dt>Forked from</dt><dd>{session.parentId ?? (session.status === "observed" ? "No parent in metadata" : "Unavailable")}</dd>
        {session.role ? <><dt>Authored role</dt><dd>{session.role} · not parentage</dd></> : null}
        {session.task ? <><dt>Authored task link</dt><dd>{session.task}</dd></> : null}
        <dt>Observed</dt><dd>{session.observedAt}</dd></dl>
      <p className="external-caption">{session.message}</p>
      <div className="external-actions"><button disabled={client.busy} onClick={() => { void client.refresh(); }}>Refresh observation</button>
        <button disabled={client.busy || detail.handoff !== "available"} onClick={() => { void client.handoff(); }}>Open conversation in tmux</button></div>
      <p className="external-caption">{detail.handoff === "available" ? "Existing target checked; checked again on Open. No keys, prompts or replacement launches." : "Interactive handoff unavailable; the recorded conversation below remains read-only."}</p>
      {session.contextPaths.length ? <details><summary>Why this context?</summary><p>Operator-associated briefing links, not a claim of all effective context.</p>{session.contextPaths.map((path) => <button key={path} onClick={() => onOpen(path)}>{path}</button>)}</details> : null}
      <nav aria-label="External information views"><button aria-pressed={tab === "worklog"} onClick={() => setTab("worklog")}>Worklog</button><button aria-pressed={tab === "conversation"} onClick={() => setTab("conversation")}>Conversation · read-only</button></nav>
      <p className="external-caption">{detail.coverage.partial ? "Partial tail. " : "Bounded transcript. "}{detail.coverage.message} {detail.coverage.tailBytes} bytes read; {detail.coverage.omittedRecords} records omitted.</p>
      <ol className="external-worklog" aria-label={tab === "worklog" ? "Recorded agent worklog" : "Recorded assistant conversation"}>{entries.map((entry) => <li key={entry.id}>
        <header><time>{entry.at}</time><small>{entry.attribution}</small></header><p>{entry.text}</p>
      </li>)}</ol>
      {!entries.length ? <p>No eligible messages in the bounded tail. This is not evidence of inactivity.</p> : null}
    </> : null}
  </section>;
}
