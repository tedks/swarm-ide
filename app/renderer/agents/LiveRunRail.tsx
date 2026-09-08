import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";

/** Hide only the exact legacy capability notice, never an operation failure. */
export function cockpitAgentNotice(state: LiveAgentState, trustedLocal: boolean): string {
  const reason = state.snapshot?.capabilities.reason;
  return trustedLocal && state.connected && reason?.code === "ADAPTER_POLICY_UNAVAILABLE" &&
    state.notice === `${reason.code}: ${displayAgentText(reason.message)}` ? "" : state.notice;
}

export function LiveRunRail({ state, client, onDraft, onSelect, trustedLocal = false }: { state: LiveAgentState; client: AgentBridgeClient; onDraft: () => void; onSelect?: (runId: string) => void; trustedLocal?: boolean }) {
  const notice = cockpitAgentNotice(state, trustedLocal);
  return <div className="rail-section agent-rail">
    <div className="section-heading"><span>Agent runs</span><b>{state.snapshot?.runs.length ?? "—"}</b></div>
    {notice ? <p className="empty-rail" role="status">{notice}</p> : null}
    {state.snapshot?.runs.map((run) => <button key={run.runId} className={`agent-run-select ${state.selectedRunId === run.runId ? "selected" : ""}`}
      aria-label={`Select run: ${displayAgentText(run.taskLabel)}`} aria-pressed={state.selectedRunId === run.runId} onClick={() => onSelect ? onSelect(run.runId) : client.select(run.runId)}>
      <span className={`agent-state agent-state-${run.state}`}>{run.state}</span><strong>{displayAgentText(run.taskLabel)}</strong><small>{displayAgentText(run.focusLabel)}</small>
    </button>)}
    <button className="agent-primary" onClick={onDraft} disabled={Boolean(state.draft)}>Ask an agent about this focus</button>
    <button className="agent-secondary" disabled={!state.connected} onClick={() => { void client.refresh(); }}>Refresh agent state</button>
    {!trustedLocal ? <p className="empty-rail">One active run. No automatic queue or replay.</p> : null}
  </div>;
}
