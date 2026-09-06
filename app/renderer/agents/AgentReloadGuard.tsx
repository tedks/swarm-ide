import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, protectsAgentIntent, unresolvedOperation, type LiveAgentState } from "./live-state";

export function AgentReloadGuard({ state, client }: { state: LiveAgentState; client: AgentBridgeClient }) {
  const unresolved = state.operations.filter(unresolvedOperation);
  const protectedIntent = protectsAgentIntent(state);
  if (!protectedIntent && !unresolved.length) return null;
  return <section className="agent-reload-guard" aria-label="Local agent reload protection">
    <strong>{protectedIntent ? "Agent intent protects this document" : "Local receipt loss acknowledged"}</strong>
    <details><summary>Inspect local agent intent / refresh options</summary>
    <p>Local text and receipts stay in memory, not browser storage. {protectedIntent ? "Document refresh is deferred until you clear or explicitly discard them." : "These acknowledged local receipts no longer block refresh; delivery is still unresolved."} Forced quit or a crash can still lose them.</p>
      {state.draft ? <details><summary>Local launch draft</summary><p>Focus: {displayAgentText(state.draft.focus.path ?? state.draft.focus.key)}</p><pre>{displayAgentText(state.draft.task)}</pre><p>Requested model: {displayAgentText(state.draft.model || "Provider default (unresolved)")}</p></details> : null}
      {Object.entries(state.instructions).filter(([, text]) => text.length > 0).map(([id, text]) => <details key={id}><summary>Local instruction text · {displayAgentText(id)}</summary><pre>{displayAgentText(text)}</pre></details>)}
      {unresolved.map((op) => <details key={op.requestId}><summary>{op.kind} · {op.status} · {displayAgentText(op.requestId)}</summary>
        <p>Run: {displayAgentText(op.runId)}</p>{op.text !== null ? <pre>{displayAgentText(op.text)}</pre> : null}<p>{displayAgentText(op.message)}</p>
        {op.documentLossAcknowledged ? <p>Local text discarded; loss of this local receipt on refresh acknowledged. Delivery is still unresolved.</p> : null}
        {op.kind === "cancel" ? <p>This protocol cannot reconcile Stop delivery by request ID. Inspect separate run/cleanup evidence; local loss acknowledgment does not prove interruption.</p>
          : <button disabled={!state.connected} onClick={() => { void client.reconcileOperation(op.requestId); }}>Reconcile receipt {displayAgentText(op.requestId)}</button>}
      </details>)}
    <p>Discard removes local text only. It does not stop a run, deny execution, resend anything or delete core history. Unresolved delivery may not be recoverable after refresh. Dirty files remain protected separately.</p>
    <p>A pending preload refresh resumes when safe; otherwise retry refresh yourself.</p>
    {protectedIntent ? <><button onClick={() => client.clearLocalIntent(state)}>Clear local agent drafts and instruction text</button>
    <button onClick={() => client.clearLocalIntent(state, true)}>Discard local agent intent and allow refresh</button></> : null}
    </details>
  </section>;
}
