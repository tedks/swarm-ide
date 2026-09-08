import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SwarmBridge } from "../../electron/preload";
import type { ExternalClient } from "./client";
import { SessionSteering } from "./SessionSteering";
import { ActivityTime } from "../ActivityTime";
import { SteeringMemory } from "./steering-memory";
import { outgoingPresentation, type OutgoingMessage } from "./message-outbox";
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

/** This stays mounted when tabs or observation detail change: one message owner. */
export function AgentConversation({ client, bridge, onContext, onWorktree, memory }: {
  client: ExternalClient; bridge?: SwarmBridge; onContext(): void; onWorktree?(id: string): void; memory?: SteeringMemory;
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
  const scroll = useRef<HTMLOListElement>(null), follow = useRef(true), previous = useRef(client.selected);
  const last = entries.at(-1)?.id;
  useEffect(() => {
    if (previous.current !== client.selected) { follow.current = true; previous.current = client.selected; }
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [client.selected, last, submitted.at(-1)?.id]);
  return <section className="agent-conversation" aria-label="Agent conversation" data-external-session={client.selected}>
    <header className="conversation-heading"><strong>{summary?.label ?? "Choose an agent"}</strong>
      {summary ? <><small>{summary.evidence === "synthetic" ? "Example" : client.stale ? "Reconnecting…" : summary.control === "tmux" ? "Terminal session" : "Conversation history"}</small>
        {summary.worktree && onWorktree ? <button onClick={() => onWorktree(summary.id)}>Worktree</button> : null}<button onClick={onContext}>Agent details</button></> : null}
    </header>
    {client.notice ? <p role="status" className="conversation-notice">{client.notice}</p> : null}
    {storageNotice ? <p role="status" className="conversation-notice">{storageNotice}</p> : null}
    {!client.selected ? <p className="conversation-empty">Select an agent in the fork list to read its conversation and send a message. Native agents are available in the next tab.</p>
      : !detail ? <p className="conversation-empty" role="status">Reading {summary?.label ?? "conversation"}…</p> : null}
    <ol ref={scroll} className="conversation-messages" aria-label="Conversation messages" onScroll={() => {
      const node = scroll.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 36;
    }}>{rows.map((row) => row.kind === "outgoing" ? <OutgoingRow key={`outgoing:${row.id}`} message={row.message} />
      : <li key={`transcript:${row.id}`} className={`conversation-${row.entry.kind}`}>
        <header><strong>{row.entry.kind === "user" ? "You" : summary?.label}</strong><ActivityTime at={row.at} /></header><p>{row.entry.text}</p>
      </li>)}</ol>
    {detail && !entries.length && !submitted.length ? <p className="conversation-empty">No messages in the recent transcript yet.</p> : null}
    <SessionSteering detail={detail} bridge={bridge} memory={owner} />
  </section>;
}
