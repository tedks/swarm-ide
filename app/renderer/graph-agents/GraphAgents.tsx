import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AGENT_EXECUTION_LABELS } from "../../../protocol/agent-lifecycle";
import type { ExternalClient } from "../external-agents/client";
import { observedGraphAgents, placeGraphAgents, type AgentNodeLocation, type GraphAgent } from "./locations";
import "./graph-agents.css";

const emptyAgents: GraphAgent[] = [];
const AgentContext = createContext<{ agents: GraphAgent[]; visible: boolean; toggle(): void; open(id: string): void }>(
  { agents: emptyAgents, visible: true, toggle() {}, open() {} });
const LocationContext = createContext<ReadonlyMap<string, GraphAgent[]>>(new Map());

/** The existing observer supplies updates. No timer or provider is introduced. */
export function GraphAgents({ client, root, connected, onOpen, children }: {
  client: ExternalClient; root?: string; connected: boolean; onOpen(id: string): void; children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const agents = useMemo(() => observedGraphAgents({ root, sessions: client.snapshot?.sessions ?? [],
    fleet: client.fleet ?? [], detail: client.detail,
    retained: !connected || client.stale || client.observing === false || client.snapshot?.status !== "observed",
  }), [root, client.snapshot, client.fleet, client.detail, client.stale, client.observing, connected]);
  return <AgentContext.Provider value={{ agents, visible, toggle: () => setVisible((value) => !value), open: onOpen }}>{children}</AgentContext.Provider>;
}

export function GraphAgentsToggle() {
  const { visible, toggle } = useContext(AgentContext);
  return <button type="button" aria-pressed={visible} onClick={toggle} title="Show agents at their last observed source location">♧ Agents</button>;
}

/** Node locations change with graph membership, not the transcript. ReactFlow's
 * node/edge arrays and camera dependencies do not include agent observations. */
export function GraphAgentLayer({ locations, nearest = false, children }: {
  locations: readonly AgentNodeLocation[]; nearest?: boolean; children: ReactNode;
}) {
  const { agents, visible } = useContext(AgentContext);
  const placed = useMemo(() => placeGraphAgents(visible ? agents : emptyAgents, locations, nearest), [agents, locations, nearest, visible]);
  return <LocationContext.Provider value={placed}>{children}</LocationContext.Provider>;
}

export function GraphAgentSprites({ nodeId }: { nodeId: string }) {
  const agents = useContext(LocationContext).get(nodeId) ?? emptyAgents;
  const { open } = useContext(AgentContext);
  if (!agents.length) return null;
  return <span className="graph-agent-sprites nodrag nopan" data-graph-agents="true"
    onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    {agents.map((agent) => {
      const status = agent.retained ? `Last seen · ${AGENT_EXECUTION_LABELS[agent.state]}` : AGENT_EXECUTION_LABELS[agent.state];
      const description = `${agent.label} · ${status} · Last touched ${agent.path}\n${agent.action}\n${agent.at}\nLatest: ${agent.latestAction}`;
      return <button type="button" key={agent.id} className={`graph-agent-sprite state-${agent.state}${agent.retained ? " is-retained" : ""}`}
        data-agent-id={agent.id} data-agent-path={agent.path} data-agent-working={!agent.retained && agent.state === "working"}
        aria-label={`Open ${agent.label} · ${status} · last touched ${agent.path}`} title={description}
        onClick={(event) => { event.stopPropagation(); open(agent.id); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4M3 11v6m18-6v6M8 20v2m8-2v2" /><rect x="5" y="6" width="14" height="14" rx="4" /><path d="M9 16h6" /><circle cx="9" cy="11" r="1" /><circle cx="15" cy="11" r="1" /></svg>
        <span>{agent.label}</span><i aria-hidden="true" />
      </button>;
    })}
  </span>;
}
