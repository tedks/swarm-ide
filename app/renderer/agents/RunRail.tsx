import { canPrepareFixture, type AgentWorkbenchState } from "./state";

export function RunRail({ state, fixtureEnabled, onDraft, onSelect }: { state: AgentWorkbenchState; fixtureEnabled: boolean; onDraft: () => void; onSelect: () => void }) {
  return <div className="rail-section agent-rail">
    <div className="section-heading"><span>Fixture rehearsal</span><b>{state.snapshot.runs.length}</b></div>
    {fixtureEnabled ? <span className="agent-demo-badge">FIXTURE / DEMO</span> : null}
    {state.snapshot.runs.map((run) => <button key={run.runId} className={`agent-run-select ${state.selected ? "selected" : ""}`} aria-pressed={state.selected} onClick={onSelect}>
      <span className={`agent-state agent-state-${run.state}`}>{run.state}</span><strong>{run.taskLabel}</strong><small>{run.focusLabel}</small>
    </button>)}
    <p className="empty-rail">{state.snapshot.capabilities.reason?.message}</p>
    {fixtureEnabled ? <button className="agent-primary" disabled={!canPrepareFixture(state)} onClick={onDraft}>Preview agent fixture</button>
      : <button disabled className="agent-primary">Agent harness unavailable</button>}
    {fixtureEnabled && state.run ? <p className="empty-rail">One local rehearsal; a new fixture replaces the previous one. No retained history or model activity.</p> : null}
  </div>;
}
