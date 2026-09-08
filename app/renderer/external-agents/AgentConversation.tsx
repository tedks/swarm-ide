import { useState, useSyncExternalStore } from "react";
import type { SwarmBridge } from "../../electron/preload";
import type { ExternalClient } from "./client";
import { SessionSteering } from "./SessionSteering";
import { ActivityTime } from "../ActivityTime";
import { SteeringMemory } from "./steering-memory";
import { outgoingPresentation, type OutgoingMessage } from "./message-outbox";
import { useConversationScroll } from "./conversation-scroll";
import "./external-agents.css";
import "./message-outbox.css";

function OutgoingRow({ message }: { message: OutgoingMessage }) {
  const state = outgoingPresentation[message.status];
  const [copyState, setCopyState] = useState("");
  return <li className="conversation-user conversation-outgoing" data-outgoing-id={message.id} data-outgoing-status={message.status}>
    <header><strong>You</strong><ActivityTime at={message.at} />
      <span className="outgoing-state" role="status" aria-label={state.label} title={state.explanation}>{state.symbol}</span>
      <button type="button" title="Copy exact message text" aria-label="Copy message" onClick={() => {
        void Promise.resolve().then(() => navigator.clipboard.writeText(message.text)).then(() => setCopyState("Copied"), () => setCopyState("Select the message text to copy it."));
      }}>Copy</button><span role="status">{copyState}</span>
    </header><p>{message.text}</p>
  </li>;
}

/** Display-only checked command supplied by the existing terminal owner. */
function CopyTerminalCommand({ command }: { command?: string }) {
  const [notice, setNotice] = useState("");
  return <>
    <button type="button" aria-label="Copy terminal command" disabled={!command} title={command ? `Copy terminal command: ${command}` : "Terminal command unavailable for this session"}
      onClick={() => { if (!command) return; void Promise.resolve().then(() => navigator.clipboard.writeText(command))
        .then(() => setNotice("Terminal command copied"), () => setNotice("Use Agent details to select and copy the terminal command.")); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 6 6 6-6 6m9 0h5" /></svg>
    </button>
    {notice ? <span role="status">{notice}</span> : null}
  </>;
}

/** Presentation only; the existing selected-session client remains the authority. */
export function AgentConversationActions({ client, onContext, onWorktree }: {
  client: ExternalClient; onContext(): void; onWorktree?(id: string): void;
}) {
  const detail = client.detail?.session.id === client.selected ? client.detail : null;
  const summary = detail?.session ?? client.snapshot?.sessions.find((row) => row.id === client.selected);
  const current = summary?.status === "observed" && !client.stale;
  const command = current && detail?.handoff === "available" && detail.session.evidence === "local" ? detail.terminal?.attach : undefined;
  return <div className="conversation-actions" role="group" aria-label="Selected agent actions">
    <CopyTerminalCommand key={`${client.selected}:${command ?? "unavailable"}`} command={command} />
    <button type="button" aria-label="Worktree" title={current && summary.worktree ? "Explore agent worktree" : "Agent worktree unavailable"}
      disabled={!current || !summary.worktree || !onWorktree} onClick={() => { if (current && summary.worktree) onWorktree?.(summary.id); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7V5h7l2 3h9v12H3Zm0 1v12" /></svg>
    </button>
    <button type="button" aria-label="Agent details" title={summary ? "Agent details" : "Select an agent to view details"} disabled={!summary} onClick={onContext}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg>
    </button>
  </div>;
}

/** This stays mounted when tabs or observation detail change: one message owner. */
export function AgentConversation({ client, bridge, onContext, onWorktree, memory, embeddedHeader = false }: {
  client: ExternalClient; bridge?: SwarmBridge; onContext(): void; onWorktree?(id: string): void; memory?: SteeringMemory; embeddedHeader?: boolean;
}) {
  const [local] = useState(() => new SteeringMemory());
  const owner = memory ?? local;
  const { outgoing, storageNotice } = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const submitted = outgoing.filter((row) => row.sessionId === client.selected);
  const detail = client.detail?.session.id === client.selected ? client.detail : null;
  const summary = detail?.session ?? client.snapshot?.sessions.find((row) => row.id === client.selected);
  const entries = detail?.entries.filter((entry) => entry.kind === "assistant" || entry.kind === "user") ?? [];
  const rows = [
    ...entries.map((entry) => ({ kind: "transcript" as const, id: entry.id, at: entry.at, entry })),
    ...submitted.map((message) => ({ kind: "outgoing" as const, id: message.id, at: message.at, message })),
  ].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const scroll = useConversationScroll(client.selected, Boolean(detail), `${entries.at(-1)?.id ?? ""}:${submitted.at(-1)?.id ?? ""}`);
  return <section className="agent-conversation" aria-label="Agent conversation" data-external-session={client.selected}>
    {!embeddedHeader ? <header className="conversation-heading"><strong>{summary?.label ?? "Choose an agent"}</strong>
      {summary ? <><small>{summary.evidence === "synthetic" ? "Example" : client.stale ? "Reconnecting…" : summary.control === "tmux" ? "Terminal session" : "Conversation history"}</small>
        <AgentConversationActions client={client} onContext={onContext} onWorktree={onWorktree} /></> : null}
    </header> : null}
    {client.notice ? <p role="status" className="conversation-notice">{client.notice}</p> : null}
    {storageNotice ? <p role="status" className="conversation-notice">{storageNotice}</p> : null}
    {!client.selected ? <p className="conversation-empty">Select an agent in the fork list to read its conversation and send a message.</p>
      : !detail ? <p className="conversation-empty" role="status">Reading {summary?.label ?? "conversation"}…</p> : null}
    <ol {...scroll} className="conversation-messages" aria-label="Conversation messages">{rows.map((row) => row.kind === "outgoing" ? <OutgoingRow key={`outgoing:${row.id}`} message={row.message} />
      : <li key={`transcript:${row.id}`} className={`conversation-${row.entry.kind}`}>
        <header><strong>{row.entry.kind === "user" ? "You" : summary?.label}</strong><ActivityTime at={row.at} /></header><p>{row.entry.text}</p>
      </li>)}</ol>
    {detail && !entries.length && !submitted.length ? <p className="conversation-empty">No messages in the recent transcript yet.</p> : null}
    <SessionSteering detail={detail} bridge={bridge} memory={owner} />
  </section>;
}
