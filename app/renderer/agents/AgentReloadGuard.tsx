import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, protectsAgentIntent, unresolvedOperation, type LiveAgentState } from "./live-state";

export function AgentReloadGuard({ state, client }: { state: LiveAgentState; client: AgentBridgeClient }) {
  const unresolved = state.operations.filter(unresolvedOperation);
  const protectedIntent = protectsAgentIntent(state);
  if (!protectedIntent && !unresolved.length) return null;
  return <section className="agent-reload-guard" aria-label="Local agent reload protection">
    <strong>{protectedIntent ? "Refresh paused to protect your agent drafts and pending messages" : "Refresh allowed; some message outcomes are still unknown"}</strong>
    <details><summary>Inspect local agent intent / refresh options</summary>
    <p>Drafts and message receipts are held in memory. {protectedIntent ? "Clear or discard them below before refreshing." : "You chose to allow refresh without confirming these messages."} A forced quit or crash can lose this information.</p>
      {state.draft ? <details><summary>Local launch draft</summary><p>Focus: {displayAgentText(state.draft.focus.path ?? state.draft.focus.key)}</p><pre>{displayAgentText(state.draft.task)}</pre><p>Requested model: {displayAgentText(state.draft.model || "Provider default (unresolved)")}</p></details> : null}
      {Object.entries(state.instructions).filter(([, text]) => text.length > 0).map(([id, text]) => <details key={id}><summary>Local instruction text · {displayAgentText(id)}</summary><pre>{displayAgentText(text)}</pre></details>)}
      {unresolved.map((op) => <details key={op.requestId}><summary>{op.kind} · {op.status} · {displayAgentText(op.requestId)}</summary>
        <p>Run: {displayAgentText(op.runId)}</p>{op.text !== null ? <pre>{displayAgentText(op.text)}</pre> : null}<p>{displayAgentText(op.message)}</p>
        {op.documentLossAcknowledged ? <p>You discarded the local text and allowed this receipt to be lost on refresh. Delivery is still unknown.</p> : null}
        {op.kind === "cancel" ? <p>Check the run and process status to see whether Stop worked. This receipt cannot confirm it.</p>
          : <button disabled={!state.connected} onClick={() => { void client.reconcileOperation(op.requestId); }}>Reconcile receipt {displayAgentText(op.requestId)}</button>}
      </details>)}
    <p>Discard removes local drafts, not saved run history, and does not stop or resend a command. After refreshing, you may be unable to check an uncertain delivery. Unsaved files are protected separately.</p>
    <p>A pending app update will refresh when safe. Otherwise, refresh again when you are ready.</p>
    {protectedIntent ? <><button onClick={() => client.clearLocalIntent(state)}>Clear local agent drafts and instruction text</button>
    <button onClick={() => client.clearLocalIntent(state, true)}>Discard local agent intent and allow refresh</button></> : null}
    </details>
  </section>;
}
