import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, protectsAgentIntent, unresolvedOperation, type LiveAgentState } from "./live-state";

export function AgentReloadGuard({ state, client }: { state: LiveAgentState; client: AgentBridgeClient }) {
  const unresolved = state.operations.filter(unresolvedOperation);
  if (!protectsAgentIntent(state) && !unresolved.length) return null;
  return <section className="agent-reload-guard" aria-label="Local agent reload protection">
    <strong>{protectsAgentIntent(state) ? "Agent intent protects this document" : "Local receipt loss acknowledged"}</strong>
    <details><summary>Inspect local agent intent / refresh options</summary>
    <p>Local text and receipts stay in memory, not browser storage. Document refresh is deferred until you clear or explicitly discard them. Forced quit or a crash can still lose them.</p>
      {state.draft ? <p>Launch draft remains in the launch form below.</p> : null}
      {Object.entries(state.instructions).filter(([, text]) => text.length > 0).map(([id, text]) => <details key={id}><summary>Local instruction text · {displayAgentText(id)}</summary><pre>{displayAgentText(text)}</pre></details>)}
      {unresolved.map((op) => <details key={op.requestId}><summary>{op.kind} · {op.status} · {displayAgentText(op.requestId)}</summary>
        <p>Run: {displayAgentText(op.runId)}</p>{op.text !== null ? <pre>{displayAgentText(op.text)}</pre> : null}<p>{displayAgentText(op.message)}</p>
        {op.documentLossAcknowledged ? <p>Local text discarded; loss of this local receipt on refresh acknowledged. Delivery is still unresolved.</p> : null}
        <button disabled={!state.connected} onClick={() => { void client.reconcileOperation(op.requestId); }}>Reconcile receipt {op.requestId}</button>
      </details>)}
    <p>Discard removes local text only. It does not stop a run, deny execution, resend anything or delete core history. Unresolved delivery may not be recoverable after refresh. Dirty files remain protected separately.</p>
    <p>A pending preload refresh resumes when safe; otherwise retry refresh yourself.</p>
    <button onClick={() => client.clearLocalIntent(state)}>Clear local agent drafts and instruction text</button>
    <button onClick={() => client.clearLocalIntent(state, true)}>Discard local agent intent and allow refresh</button>
    </details>
  </section>;
}
