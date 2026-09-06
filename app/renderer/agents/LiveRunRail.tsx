import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";

export function LiveRunRail({ state, client, onDraft }: { state: LiveAgentState; client: AgentBridgeClient; onDraft: () => void }) {
  return <div className="rail-section agent-rail">
    <div className="section-heading"><span>Agent runs</span><b>{state.snapshot?.runs.length ?? "—"}</b></div>
    <p className="empty-rail" role="status">{state.notice}</p>
    {state.snapshot?.runs.map((run) => <button key={run.runId} className={`agent-run-select ${state.selectedRunId === run.runId ? "selected" : ""}`}
      aria-label={`Select run: ${displayAgentText(run.taskLabel)}`} aria-pressed={state.selectedRunId === run.runId} onClick={() => client.select(run.runId)}>
      <span className={`agent-state agent-state-${run.state}`}>{run.state}</span><strong>{displayAgentText(run.taskLabel)}</strong><small>{displayAgentText(run.focusLabel)}</small>
    </button>)}
    <button className="agent-primary" onClick={onDraft} disabled={Boolean(state.draft)}>Ask an agent about this focus</button>
    <button className="agent-secondary" disabled={!state.connected} onClick={() => { void client.refresh(); }}>Refresh agent state</button>
    <p className="empty-rail">One active run. No automatic queue or replay.</p>
  </div>;
}
