import { useState, type CSSProperties } from "react";
import type { ExternalAgentSummary } from "../../../protocol/external-agents";
import type { ExternalClient } from "./client";
import type { SwarmBridge } from "../../electron/preload";
import { SessionSteering } from "./SessionSteering";
import "./external-agents.css";

type LineageRow = {
  session: ExternalAgentSummary; depth: number;
  /** One full-height trunk per ancestor that still has a following sibling. */
  ancestorTrunks: boolean[]; lastSibling: boolean; hasChildren: boolean;
};
const lineageStep = 16;

/** Iterative traversal: displayed role names never impose an ancestry depth. */
export function lineageRows(sessions: ExternalAgentSummary[]): LineageRow[] {
  const unique = new Map(sessions.map((session) => [session.id, session]));
  const children = new Map<string, ExternalAgentSummary[]>(), roots: ExternalAgentSummary[] = [];
  for (const session of unique.values()) {
    if (session.ancestry === "registered-parent" && session.parentId && unique.has(session.parentId)) {
      const list = children.get(session.parentId) ?? []; list.push(session); children.set(session.parentId, list);
    } else roots.push(session);
  }
  const rows: LineageRow[] = [], seen = new Set<string>();
  const rootRow = (session: ExternalAgentSummary): LineageRow => ({ session, depth: 0, ancestorTrunks: [], lastSibling: true, hasChildren: false });
  const pending = roots.map(rootRow).reverse();
  while (pending.length) {
    const row = pending.pop()!; if (seen.has(row.session.id)) continue;
    seen.add(row.session.id);
    const descendants = (children.get(row.session.id) ?? []).filter((session) => !seen.has(session.id));
    row.hasChildren = descendants.length > 0; rows.push(row);
    for (let i = descendants.length - 1; i >= 0; --i) pending.push({
      session: descendants[i], depth: row.depth + 1,
      ancestorTrunks: row.depth ? [...row.ancestorTrunks, !row.lastSibling] : [],
      lastSibling: i === descendants.length - 1, hasChildren: false,
    });
  }
  // A malformed registered cycle has no reachable root. Display its members,
  // but never fabricate connector geometry for that unverified relationship.
  for (const session of unique.values()) if (!seen.has(session.id)) rows.push(rootRow(session));
  return rows;
}

export function ExternalAgentRail({ client, onSelect }: { client: ExternalClient; onSelect(): void }) {
  const rows = lineageRows(client.snapshot?.sessions ?? []);
  const maxDepth = rows.reduce((max, row) => Math.max(max, row.depth), 0);
  return <section className="external-agents" aria-label="External supervised sessions">
    <header><strong>Agents</strong><button disabled={client.busy} onClick={() => { void client.refresh(); }} aria-label="Refresh external sessions">↻</button></header>
    {rows.length ? <div className="external-lineage-scroll"><ul aria-label="Fork lineage" style={{ minWidth: `${maxDepth * lineageStep + 190}px` }}>{rows.map(({ session, depth, ancestorTrunks, lastSibling, hasChildren }) =>
      <li key={session.id} style={{ "--lineage-indent": `${depth * lineageStep}px` } as CSSProperties} data-session={session.id} data-depth={depth}>
        <span className="external-lineage-lines" aria-hidden="true">
          {ancestorTrunks.map((continues, level) => continues ? <span key={level} className="external-lineage-trunk" style={{ left: `${level * lineageStep + 8}px` }} /> : null)}
          {depth > 0 ? <><span className="external-lineage-branch" style={{ left: `${(depth - 1) * lineageStep + 8}px` }} />
            {!lastSibling ? <span className="external-lineage-tail" style={{ left: `${(depth - 1) * lineageStep + 8}px` }} /> : null}</> : null}
          {hasChildren ? <span className="external-lineage-stem" /> : null}
          <span className={`external-lineage-node${depth === 0 ? " external-lineage-root" : ""}`} />
        </span>
        <button aria-label={`Inspect external agent ${session.label}`} aria-pressed={client.selected === session.id} onClick={() => { onSelect(); void client.read(session.id); }}>
          <span>{session.label}<small>{session.evidence === "synthetic" ? "synthetic · " : ""}{session.status === "unavailable" ? "unavailable" : session.ancestry === "unknown-parent" ? "parent not registered" : session.ancestry === "cycle" ? "invalid cyclic ancestry" : `fork depth ${depth}`}</small></span>
        </button>
      </li>)}</ul></div> : <p className="external-caption">{client.busy ? "Reading registrations…" : "No observed sessions. Supply an operator registry to connect existing harnesses."}</p>}
    {client.notice ? <p role="status">{client.notice}</p> : null}
  </section>;
}

export function ExternalAgentInformation({ client, bridge, visible = true, onReturn, onOpen }: { client: ExternalClient; bridge?: SwarmBridge; visible?: boolean; onReturn(): void; onOpen(path: string): void }) {
  const [tab, setTab] = useState<"worklog" | "conversation">("worklog");
  const detail = client.detail, session = detail?.session;
  const entries = detail?.entries.filter((entry) => tab === "worklog" || entry.kind === "assistant") ?? [];
  return <section className="external-information" aria-label="External agent information" data-external-session={client.selected} hidden={!visible} style={visible ? undefined : { display: "none" }}>
    <header><span className="eyebrow">external supervised session</span><h2>{session?.label ?? "Reading session…"}</h2>
      <button onClick={onReturn}>Return to source information</button></header>
    <SessionSteering detail={detail} bridge={bridge} />
    {client.busy ? <p role="status">Observing…</p> : null}
    {client.notice ? <p role="status">{client.notice}</p> : null}
    {session ? <>
      {session.evidence === "synthetic" ? <p className="external-caption">Example session</p> : null}
      <details className="external-provenance"><summary>Fork ancestry & provenance · {session.parentId ? `parent ${session.parentId.slice(0, 8)}…` : "no recorded parent"}</summary>
      <dl><dt>Evidence</dt><dd>{session.evidence}</dd>
        <dt>Session</dt><dd>{session.id}</dd><dt>Forked from</dt><dd>{session.parentId ?? (session.status === "observed" ? "No parent in metadata" : "Unavailable")}</dd>
        {session.role ? <><dt>Authored role</dt><dd>{session.role} · not parentage</dd></> : null}
        {session.task ? <><dt>Authored task link</dt><dd>{session.task}</dd></> : null}
        <dt>Observed</dt><dd>{session.observedAt}</dd></dl>
      <p className="external-caption">{session.message}</p>
      </details>
      <div className="external-actions"><button disabled={client.busy} onClick={() => { void client.refresh(); }}>Refresh observation</button>
        <button disabled={client.busy || detail.handoff !== "available"} onClick={() => { void client.handoff(); }}>Select in tmux</button></div>
      {detail.terminal && detail.handoff === "available" ? <details><summary>Open in terminal · {detail.terminal.location}</summary>
        <label>Outside tmux<input aria-label="Attach terminal command" readOnly value={detail.terminal.attach} onFocus={(event) => event.currentTarget.select()} /></label>
        <label>Inside tmux<input aria-label="Switch terminal command" readOnly value={detail.terminal.switch} onFocus={(event) => event.currentTarget.select()} /></label>
      </details> : detail.handoff !== "available" ? <p className="external-caption">Terminal session unavailable.</p> : null}
      {session.contextPaths.length ? <details><summary>Why this context?</summary><p>Operator-associated briefing links, not a claim of all effective context.</p>{session.contextPaths.map((path) => <button key={path} onClick={() => onOpen(path)}>{path}</button>)}</details> : null}
      <nav aria-label="External information views"><button aria-pressed={tab === "worklog"} onClick={() => setTab("worklog")}>Activity</button><button aria-pressed={tab === "conversation"} onClick={() => setTab("conversation")}>Conversation</button></nav>
      <details><summary>Observation details</summary><p>{detail.coverage.message} {detail.coverage.tailBytes} bytes read; {detail.coverage.omittedRecords} records omitted.</p></details>
      <ol className="external-worklog" aria-label={tab === "worklog" ? "Recorded agent worklog" : "Recorded assistant conversation"}>{entries.map((entry) => <li key={entry.id}>
        <header><time>{entry.at}</time><small>{entry.attribution}</small></header><p>{entry.text}</p>
      </li>)}</ol>
      {!entries.length ? <p>No recent messages to show.</p> : null}
    </> : null}
  </section>;
}
