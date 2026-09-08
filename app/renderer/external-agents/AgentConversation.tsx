import { useEffect, useRef } from "react";
import type { SwarmBridge } from "../../electron/preload";
import type { ExternalClient } from "./client";
import { SessionSteering } from "./SessionSteering";
import { ActivityTime } from "../ActivityTime";
import type { SteeringMemory } from "./steering-memory";
import "./external-agents.css";

/** This stays mounted when tabs or observation detail change: one message owner. */
export function AgentConversation({ client, bridge, onContext, memory }: {
  client: ExternalClient; bridge?: SwarmBridge; onContext(): void; memory?: SteeringMemory;
}) {
  const detail = client.detail?.session.id === client.selected ? client.detail : null;
  const summary = detail?.session ?? client.snapshot?.sessions.find((row) => row.id === client.selected);
  const entries = detail?.entries.filter((entry) => entry.kind === "assistant" || entry.kind === "user") ?? [];
  const scroll = useRef<HTMLOListElement>(null), follow = useRef(true), previous = useRef(client.selected);
  const last = entries.at(-1)?.id;
  useEffect(() => {
    if (previous.current !== client.selected) { follow.current = true; previous.current = client.selected; }
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [client.selected, last]);
  return <section className="agent-conversation" aria-label="Agent conversation" data-external-session={client.selected}>
    <header className="conversation-heading"><strong>{summary?.label ?? "Choose an agent"}</strong>
      {summary ? <><small>{summary.evidence === "synthetic" ? "Example" : client.stale ? "Reconnecting…" : summary.control === "tmux" ? "Terminal session" : "Conversation history"}</small><button onClick={onContext}>Agent details</button></> : null}
    </header>
    {client.notice ? <p role="status" className="conversation-notice">{client.notice}</p> : null}
    {!client.selected ? <p className="conversation-empty">Select an agent in the fork list to read its conversation and send a message. Native agents are available in the next tab.</p>
      : !detail ? <p className="conversation-empty" role="status">Reading {summary?.label ?? "conversation"}…</p> : null}
    <ol ref={scroll} className="conversation-messages" aria-label="Conversation messages" onScroll={() => {
      const node = scroll.current; if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 36;
    }}>{entries.map((entry) => <li key={entry.id} className={`conversation-${entry.kind}`}>
      <header><strong>{entry.kind === "user" ? "You" : summary?.label}</strong><ActivityTime at={entry.at} /></header><p>{entry.text}</p>
    </li>)}</ol>
    {detail && !entries.length ? <p className="conversation-empty">No messages in the recent transcript yet.</p> : null}
    <SessionSteering detail={detail} bridge={bridge} memory={memory} />
  </section>;
}
