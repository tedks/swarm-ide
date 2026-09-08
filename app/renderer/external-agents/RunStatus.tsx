import "./run-status.css";
import { AGENT_EXECUTION_LABELS, type AgentExecutionState } from "../../../protocol/agent-lifecycle";

// Presentation only. The local core supplies the lifecycle; no timers or
// transcript heuristics in the renderer turn an idle session into a completion.
export function RunStatus({ state = "unknown", prefix, id }: { state?: AgentExecutionState; prefix?: string; id?: string }) {
  return <span id={id} className={`run-status is-${state}`} data-run-state={state}>
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {state === "working" ? <rect x="3" y="3" width="10" height="10" /> :
        state === "completed" ? <circle cx="8" cy="8" r="5" /> :
        state === "failed" ? <><circle className="run-status-outline" cx="8" cy="8" r="5.5" /><path d="M4 12L12 4" /></> :
        state === "waiting" ? <><rect x="3" y="3" width="3" height="10" /><rect x="10" y="3" width="3" height="10" /></> :
        <circle className="run-status-outline" cx="8" cy="8" r="5" />}
    </svg><span>{prefix ? `${prefix} · ` : ""}{AGENT_EXECUTION_LABELS[state]}</span>
  </span>;
}
