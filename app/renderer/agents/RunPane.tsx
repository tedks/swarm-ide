import { useState } from "react";
import { AGENT_LIMITS, utf8Bytes } from "../../../protocol/agents";
import type { FocusRef } from "../../../protocol/schema";
import type { AgentWorkbenchState, FixtureAction } from "./state";

export function RunPane({ state, dispatch, onReveal, onClose, height, onHeight }: {
  state: AgentWorkbenchState; dispatch: (action: FixtureAction) => void; onReveal: (focus: FocusRef) => void;
  onClose: () => void; height: number; onHeight: (height: number) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [outcome, setOutcome] = useState<"accepted" | "rejected" | "delivery-unknown">("accepted");
  const run = state.run;
  if (!run) return null;
  const steerEnabled = run.state === "running" && run.instructions.length < AGENT_LIMITS.receipts && Boolean(instruction.trim()) && utf8Bytes(instruction) <= AGENT_LIMITS.taskBytes;
  return <section className="agent-pane" aria-label="Selected agent run">
    <div className="agent-resize"><label>Run pane height<input aria-label="Run pane height" type="range" min={230} max={420} step={10} value={height} onChange={(event) => onHeight(Number(event.target.value))} /></label></div>
    <header className="agent-pane-header"><div><span className="agent-demo-badge">FIXTURE / DEMO</span><strong>Focus analysis</strong><span className={`agent-state agent-state-${run.state}`}>{run.state}</span></div><div><button onClick={() => onReveal(run.launchContext.focus)}>Reveal launch focus</button><button onClick={() => dispatch({ type: "stop" })} disabled={run.state !== "running" && run.state !== "starting"}>Stop</button><button aria-label="Close run pane" onClick={onClose}>×</button></div></header>
    <div className="agent-pane-body"><div className="agent-output">
      <div className="agent-evidence">Turn: {run.state} · process: {run.processState} · cleanup: {run.cleanup.status} · model / usage / performance: unknown</div>
      <div className="agent-transcript" role="log" aria-label="Fixture transcript" aria-live="polite" aria-relevant="additions">
        {run.transcript.truncated ? <p className="agent-gap">Earlier fixture display records omitted; showing at most {AGENT_LIMITS.tailRecords}. No history fetch in W1.</p> : null}
        {state.records.map((record) => <div key={record.recordId} className={`agent-record agent-record-${record.kind}`}><small>{record.kind} / {record.recordId}</small><p>{record.text}</p></div>)}
      </div>
    </div><aside className="agent-controls">
      <button className="agent-primary" disabled={run.processState === "exited" || (run.state === "cancelled" && run.processState === "not-started")} onClick={() => dispatch({ type: "advance" })}>Next fixture event</button>
      <small>Manual scripted playback · never a live provider stream.</small>
      <details><summary>Submitted context</summary><p>{run.launchContext.focus.path ?? run.launchContext.focus.key}</p><p>Disk only, no file bytes attached. Requested model: {run.launchContext.requested.model ?? "provider default (unresolved)"}; reasoning: {run.launchContext.requested.effort ?? "provider default (unresolved)"}. Root, digests and timestamps are synthetic. No verified policy or measured usage.</p><pre>{run.launchContext.submittedPrompt}</pre></details>
      <form onSubmit={(event) => { event.preventDefault(); if (steerEnabled) dispatch({ type: "steer", text: instruction, outcome }); }}>
        <label>Instruction to this run<textarea aria-label="Instruction to this run" value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={AGENT_LIMITS.taskBytes} rows={2} /></label>
        <div className="agent-steer-actions"><select aria-label="Fixture steering outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="accepted">Accepted</option><option value="delivery-unknown">Delivery unknown</option><option value="rejected">Rejected</option></select><button disabled={!steerEnabled}>Send to this run</button></div>
      </form>
      <div className="agent-receipts" aria-label="Instruction receipts">{run.instructions.slice(-4).map((receipt) => <details key={receipt.requestId}><summary>{receipt.status}</summary><p>{receipt.text}</p><p>{receipt.error?.message ?? "Provider acknowledgement simulated; not turn completion."}</p></details>)}{run.instructions.length > 4 ? <small>Showing last 4 of {run.instructions.length} receipts.</small> : null}</div>
    </aside></div>
  </section>;
}
