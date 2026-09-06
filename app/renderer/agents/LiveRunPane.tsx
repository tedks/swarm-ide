import { AGENT_LIMITS, utf8Bytes } from "../../../protocol/agents";
import type { FocusRef } from "../../../protocol/schema";
import { LaunchContextView } from "./LaunchContextView";
import { displayAgentText, type LiveAgentState, type LocalOperation } from "./live-state";

const unresolved = (status: LocalOperation["status"]) => status === "pending" || status === "delivery-unknown";

function operationMeaning(operation: LocalOperation): string {
  if (operation.status === "delivery-unknown") return "Delivery is unknown. This command is never resent automatically.";
  if (operation.status === "pending") return "Awaiting acknowledgement; execution outcome is not established.";
  if (operation.status === "rejected") return "Command rejected; retained text has not been retried.";
  if (operation.kind === "launch") return "Admission acknowledged; this is not provider start or turn completion.";
  if (operation.kind === "cancel") return "Stop request acknowledged; interruption and process cleanup are separate evidence.";
  return "Provider acknowledged this instruction; this is not turn completion.";
}

export function LiveRunPane({ state, onInstruction, onSteer, onStop, onRead, onFollow, onReveal, onClose, onHeight, currentFingerprint, currentWorldId }: {
  state: LiveAgentState;
  onInstruction: (text: string) => void;
  onSteer: () => void;
  onStop: () => void;
  onRead: (fromStart?: boolean) => void;
  onFollow?: () => void;
  onReveal: (focus: FocusRef) => void;
  onClose: () => void;
  onHeight: (height: number) => void;
  currentFingerprint?: string;
  currentWorldId?: string;
}) {
  const selectedId = state.selectedRunId;
  if (!selectedId) return null;
  const run = state.run?.runId === selectedId ? state.run : null;
  const summary = state.snapshot?.runs.find((candidate) => candidate.runId === selectedId);
  const operations = state.operations.filter((operation) => operation.runId === selectedId);
  const receipts = run?.instructions ?? [];
  const receiptIds = new Set(receipts.map((receipt) => receipt.requestId));
  // Durable receipts supersede the same local command, including recovered uncertainty.
  const localOperations = operations.filter((operation) => operation.kind !== "steer" || !receiptIds.has(operation.requestId));
  const instruction = state.instructions[selectedId] ?? "";
  const instructionBytes = utf8Bytes(instruction);
  const capabilities = state.snapshot?.capabilities;
  const active = state.snapshot?.activeRunId === selectedId;
  const fresh = state.connected && !state.detailStale && Boolean(run);
  const controlsAvailable = fresh && active && capabilities?.availability === "available";
  const unsettledSteer = localOperations.some((operation) => operation.kind === "steer" && unresolved(operation.status)) || receipts.some((receipt) => unresolved(receipt.status));
  const unsettledStop = operations.some((operation) => operation.kind === "cancel" && unresolved(operation.status));
  const stopRequested = operations.some((operation) => operation.kind === "cancel" && operation.status !== "rejected");
  const steerEnabled = controlsAvailable && capabilities?.controls.steer === true && run?.state === "running" && run.processState === "live" && Boolean(run.providerThreadId && run.providerTurnId) && !unsettledSteer && !stopRequested && run.instructions.length < AGENT_LIMITS.receipts && Boolean(instruction.trim()) && instructionBytes <= AGENT_LIMITS.taskBytes;
  const stopEnabled = controlsAvailable && capabilities?.controls.cancel === true && (run?.state === "starting" || run?.state === "running") && !stopRequested;
  const canRead = state.connected && !state.reading;
  const worldAdvanced = run && ((currentWorldId !== undefined && currentWorldId !== run.launchContext.worldId) || (currentFingerprint !== undefined && currentFingerprint !== run.launchContext.workingFingerprint));
  const records = run ? state.records.slice(0, AGENT_LIMITS.pageRecords) : [];
  const missingEarlierRecords = (records[0]?.recordId ?? 1) > 1;
  const stateLabel = run?.state ?? summary?.state ?? "awaiting admission evidence";

  return <section className="agent-pane" aria-label="Selected agent run">
    <div className="agent-resize"><label>Run pane height<input aria-label="Run pane height" type="range" min={230} max={420} step={10} value={state.height} onChange={(event) => onHeight(Number(event.target.value))} /></label></div>
    <header className="agent-pane-header"><div><strong>{displayAgentText(summary?.taskLabel ?? "Selected agent run")}</strong><span className={`agent-state agent-state-${run?.state ?? summary?.state ?? "unknown"}`}>{stateLabel}</span></div><div>
      <button title="Explicitly reveal the launch focus in the current working revision; selecting a run does not move source or graphs" disabled={!run} onClick={() => { if (run) onReveal(run.launchContext.focus); }}>Reveal launch focus</button>
      <button disabled={!stopEnabled} onClick={() => { if (stopEnabled) onStop(); }}>Stop</button>
      <button aria-label="Close run pane" onClick={onClose}>×</button>
    </div></header>
    <div className="agent-pane-body"><div className="agent-output">
      <div className="agent-evidence">
        <div>Turn: {stateLabel} · process: {run?.processState ?? "unobserved"} · cleanup: {run?.cleanup.status ?? "unobserved"}</div>
        <div>Requested model: {run ? displayAgentText(run.launchContext.requested.model ?? "provider default (unresolved)") : "unobserved"} · Observed model: {run?.providerObservation ? displayAgentText(run.providerObservation.model) : "unobserved"} · usage / performance: unavailable</div>
        {run ? <div>Cleanup evidence: {displayAgentText(run.cleanup.detail)} · {run.cleanup.observedAt}{run.exitCode !== null ? ` · exit code ${run.exitCode}` : ""}</div> : null}
        {run ? <div>Outcome evidence: {run.providerOutcome.kind}{run.providerOutcome.kind === "turn" ? ` · ${run.providerOutcome.status} · ${run.providerOutcome.observedAt}` : ""}</div> : null}
        {run?.terminalReason ? <div>Terminal reason: {displayAgentText(run.terminalReason)}</div> : null}
        {run?.state === "completed" && operations.some((operation) => operation.kind === "cancel" && operation.status === "accepted") ? <div>Turn completed despite the Stop request; Stop did not establish interruption.</div> : null}
        {run?.cleanup.status === "unknown" ? <div>A process may still be consuming resources. Cleanup has not been established.</div> : null}
        {!fresh ? <div role="status">{state.connected ? "Run detail is stale or loading; mutation controls are disabled." : "Disconnected; retained evidence may be stale. Commands are not replayed."}</div> : null}
        {worldAdvanced ? <div>World advanced since launch. Historical context is unchanged; Reveal uses the current working revision.</div> : null}
      </div>
      <div className="agent-transcript" role="log" aria-label="Agent transcript" aria-live="polite" aria-relevant="additions text" aria-busy={state.reading}>
        {missingEarlierRecords ? <p className="agent-gap">Earlier records are outside this displayed page. Read transcript from start to inspect retained history.</p> : null}
        {state.pageTruncated || run?.transcript.truncated ? <p className="agent-gap">This transcript or page reports truncation. Read retained history to inspect available records.</p> : null}
        {run?.transcript.tailMayBeLost ? <p className="agent-gap">The final buffered transcript tail may have been lost during recovery.</p> : null}
        {state.records.length > AGENT_LIMITS.pageRecords ? <p className="agent-gap">Display record limit reached; additional records are not mounted.</p> : null}
        {records.length === 0 ? <p className="agent-gap">{state.reading ? "Reading transcript…" : "No transcript records on this page."}</p> : records.map((record, index) => <div key={record.recordId}>
          {index > 0 && record.recordId > records[index - 1]!.recordId + 1 ? <p className="agent-gap">Record gap: {records[index - 1]!.recordId + 1}–{record.recordId - 1} not present on this page.</p> : null}
          <div className={`agent-record agent-record-${record.kind}`}><small>{record.kind} / {record.recordId}<br />{record.timestamp}</small><p>{displayAgentText(record.text)}</p></div>
        </div>)}
      </div>
      <div className="agent-evidence agent-pagination"><button disabled={!canRead} onClick={() => onRead(true)}>Read transcript from start</button><button disabled={!canRead || !run || state.pageCursor >= run.transcript.lastRecord} onClick={() => onRead()}>Read next transcript page</button>{onFollow ? <button disabled={!state.connected || !active || state.following} onClick={onFollow}>Follow live output</button> : null}<small>{state.following && active ? "Following active tail" : "One bounded page at a time"} · cursor {state.pageCursor}</small></div>
    </div><aside className="agent-controls">
      {capabilities?.availability === "unavailable" ? <p role="status">{capabilities.reason?.code}: {displayAgentText(capabilities.reason?.message ?? "Agent controls unavailable.")}</p> : null}
      {run ? <details><summary>Submitted context</summary><LaunchContextView context={run.launchContext} /></details> : <p>Run detail is not available yet. Local command evidence is retained below.</p>}
      {run?.providerObservation ? <details><summary>Observed provider settings</summary><p>Provider: {displayAgentText(run.providerObservation.provider)} · {displayAgentText(run.providerObservation.version)}<br />Observed model: {displayAgentText(run.providerObservation.model)}<br />Observed directory: {displayAgentText(run.providerObservation.cwd)}<br />Policy: {run.providerObservation.policy}<br />Observed at: {run.providerObservation.observedAt}</p><p>Reasoning effort: unobserved; unsupported reasoning controls are disabled.</p>{run.providerObservation.instructionSources.map((source, index) => <p key={`${source.path}-${index}`}>{displayAgentText(source.path)} · {source.observation}<br />Digest: {source.digest ?? "unobserved"}<br />Before: {source.before ?? "unobserved"}<br />After: {source.after ?? "unobserved"}</p>)}</details> : <p>Provider settings have not been observed.</p>}
      <form onSubmit={(event) => { event.preventDefault(); if (steerEnabled) onSteer(); }}>
        <label>Instruction to this run<textarea aria-label="Instruction to this run" value={instruction} onChange={(event) => onInstruction(event.target.value)} maxLength={AGENT_LIMITS.taskBytes} rows={2} /></label>
        <small>{instructionBytes} / {AGENT_LIMITS.taskBytes} UTF-8 bytes. Text is retained; sending does not clear or replay it.</small>
        <div className="agent-steer-actions"><button disabled={!steerEnabled}>Send to this run</button></div>
      </form>
      {unsettledSteer ? <p>An instruction is pending or delivery-unknown. Inspect its receipt; another instruction is blocked to avoid duplicate delivery.</p> : null}
      {unsettledStop ? <p>A Stop request is pending or delivery-unknown. It is not resent, and does not prove the run stopped.</p> : null}
      {stopRequested && !unsettledStop ? <p>Stop request acknowledged; awaiting separate outcome and process-cleanup evidence.</p> : null}
      <p>Only a confirmed active turn accepts steering. Admission, acknowledgement, completion and process cleanup are different states.</p>
      <section className="agent-receipts" aria-label="Instruction receipts">
        {localOperations.map((operation) => <details key={operation.requestId} open={unresolved(operation.status)}><summary>{operation.kind === "cancel" ? "Stop" : operation.kind} · {operation.status}</summary>{operation.text !== null ? <pre>{displayAgentText(operation.text)}</pre> : null}<p>{displayAgentText(operation.message)}</p><p>{operationMeaning(operation)}</p><small>Request: {displayAgentText(operation.requestId)}</small></details>)}
        {receipts.map((receipt) => <details key={receipt.requestId} open={unresolved(receipt.status)}><summary>Instruction · {receipt.status}</summary><pre>{displayAgentText(receipt.text)}</pre><p>{receipt.error ? `${receipt.error.code}: ${displayAgentText(receipt.error.message)}` : receipt.status === "accepted" ? "Provider acknowledged this instruction; this is not turn completion." : receipt.status === "pending" ? "Awaiting provider acknowledgement." : "Delivery is unknown. This instruction is never resent automatically."}</p><small>Request: {displayAgentText(receipt.requestId)}<br />Expected turn: {displayAgentText(receipt.expectedTurnId)}<br />Submitted: {receipt.submittedAt}<br />Settled: {receipt.settledAt ?? "pending"}<br />Text hash: {receipt.textHash}</small></details>)}
        {localOperations.length === 0 && receipts.length === 0 ? <small>No command receipts recorded.</small> : null}
      </section>
    </aside></div>
  </section>;
}
