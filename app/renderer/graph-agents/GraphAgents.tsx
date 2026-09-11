import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AGENT_EXECUTION_LABELS } from "../../../protocol/agent-lifecycle";
import type { ExternalClient } from "../external-agents/client";
import { observedGraphAgents, placeGraphAgents, type AgentNodeLocation, type GraphAgent } from "./locations";
import type { WorkspaceDescriptor } from "../../../protocol/workspace";
import "./graph-agents.css";

const emptyAgents: GraphAgent[] = [];
const AgentContext = createContext<{ agents: GraphAgent[]; visible: boolean; toggle(): void; open(id: string): void }>(
  { agents: emptyAgents, visible: true, toggle() {}, open() {} });
const LocationContext = createContext<ReadonlyMap<string, GraphAgent[]>>(new Map());

/** The existing observer supplies updates. No timer or provider is introduced. */
export function GraphAgents({ client, selection, connected, onOpen, children }: {
  client: ExternalClient; selection?: WorkspaceDescriptor; connected: boolean; onOpen(id: string): void; children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const agents = useMemo(() => observedGraphAgents({ selection, sessions: client.snapshot?.sessions ?? [],
    fleet: client.fleet ?? [], detail: client.detail,
    retained: !connected || client.stale || client.observing === false || client.snapshot?.status !== "observed",
  }), [selection, client.snapshot, client.fleet, client.detail, client.stale, client.observing, connected]);
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
  const placedIds = useMemo(() => new Set([...placed.values()].flatMap((rows) => rows.map((agent) => agent.id))), [placed]);
  return <LocationContext.Provider value={placed}><div className="graph-agent-layer" data-graph-agent-layer="true">
    {children}<GraphAgentPlacementSummary placedIds={placedIds} />
  </div></LocationContext.Provider>;
}

function GraphAgentPlacementSummary({ placedIds }: { placedIds: ReadonlySet<string> }) {
  const { agents, visible, open } = useContext(AgentContext);
  if (!visible || !agents.length) return null;
  const unplaced = agents.filter((agent) => !placedIds.has(agent.id));
  return <div className="graph-agent-placement-summary nodrag nopan" data-graph-agent-summary="true"
    onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <span>{placedIds.size} located · {unplaced.length} unplaced</span>
    {unplaced.map((agent) => { const worktree = agent.worktree.split("/").at(-1) ?? agent.worktree;
      const origin = agent.branch ? `${agent.branch} · ${worktree}` : worktree;
      const exactOrigin = agent.branch ? `${agent.branch} · ${agent.worktree}` : agent.worktree;
      return <button type="button" key={agent.id} data-agent-id={agent.id}
        aria-label={`Open unplaced agent ${agent.label} from ${exactOrigin}`}
        title={`${agent.label} · Origin ${exactOrigin}\nNo explicit membership in this graph.\nLatest: ${agent.latestAction}`}
        onClick={(event) => { event.stopPropagation(); open(agent.id); }}>{agent.label} · {origin}</button>; })}
  </div>;
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
      const origin = agent.branch ? `${agent.branch} · ${agent.worktree}` : agent.worktree;
      const placement = agent.path ? `Last touched ${agent.path}` : agent.task ? `Exact task ${agent.task}` : "Explicit graph membership";
      const activity = [agent.action, agent.at].filter(Boolean).join("\n");
      const description = `${agent.label} · ${status} · Origin ${origin} · ${placement}${activity ? `\n${activity}` : ""}\nLatest: ${agent.latestAction}`;
      return <button type="button" key={agent.id} className={`graph-agent-sprite state-${agent.state}${agent.retained ? " is-retained" : ""}`}
        data-agent-id={agent.id} data-agent-path={agent.path} data-agent-working={!agent.retained && agent.state === "working"}
        aria-label={`Open ${agent.label} from ${origin} · ${status} · ${placement}`} title={description}
        onClick={(event) => { event.stopPropagation(); open(agent.id); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4M3 11v6m18-6v6M8 20v2m8-2v2" /><rect x="5" y="6" width="14" height="14" rx="4" /><path d="M9 16h6" /><circle cx="9" cy="11" r="1" /><circle cx="15" cy="11" r="1" /></svg>
        <span>{agent.label}</span><i aria-hidden="true" />
      </button>;
    })}
  </span>;
}
