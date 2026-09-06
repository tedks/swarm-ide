import { AGENT_LIMITS, AgentPrepareInputSchema } from "../../../protocol/agents";
import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";
import { LaunchContextView } from "./LaunchContextView";

export function PreparedLaunchDraft({ state, client, dirtyPaths }: { state: LiveAgentState; client: AgentBridgeClient; dirtyPaths: string[] }) {
  const draft = state.draft;
  if (!draft) return null;
  const inputValid = Boolean(draft.task.trim()) && AgentPrepareInputSchema.safeParse({ worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
    model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null } }).success;
  const prepared = draft.prepared;
  const launchBlocked = !state.connected || !prepared?.capabilities.controls.launch || !state.snapshot?.capabilities.controls.launch ||
    !draft.confirmed || Boolean(state.snapshot?.activeRunId) || state.operations.some((op) => op.kind === "launch" && op.runId === prepared?.runId && op.status !== "rejected");
  return <form className="agent-draft" onSubmit={(event) => { event.preventDefault(); void client.prepare(); }}>
    <header><strong>Launch draft</strong><button type="button" aria-label="Close launch draft" onClick={() => client.closeDraft()}>×</button></header>
    <p className="agent-context-path">{displayAgentText(draft.focus.path ?? draft.focus.key)}</p>
    <p>Focus captured when opened; navigation does not retarget this draft.</p>
    <label>Task<textarea autoFocus rows={3} value={draft.task} maxLength={AGENT_LIMITS.taskBytes} onChange={(event) => client.editDraft({ task: event.target.value })} /></label>
    <label>Requested model<input placeholder="Provider default (unresolved)" value={draft.model} maxLength={256} onChange={(event) => client.editDraft({ model: event.target.value })} /></label>
    <label>Requested reasoning<select disabled aria-describedby="agent-reasoning-unavailable"><option>Provider default; not selectable</option></select></label>
    <p id="agent-reasoning-unavailable">Reasoning controls are unavailable until model-specific support is verified. No reasoning override is sent.</p>
    <p>Disk version only; unsaved edits are not included.</p>
    {dirtyPaths.length ? <p className="agent-gap" role="note">Unsaved or unresolved buffers: {dirtyPaths.map(displayAgentText).join(", ")}. Save and prepare again to include those changes.</p> : null}
    <button className="agent-primary" disabled={!state.connected || draft.preparing || !inputValid}>{draft.preparing ? "Preparing disk context…" : "Prepare disk context"}</button>
    {!inputValid ? <p role="alert">Use a working-world focus and a nonempty task/model within UTF-8 limits. Built/deployed focus needs explicit working-world mapping.</p> : null}
    {prepared ? <>
      <LaunchContextView context={prepared.launchContext} />
      <p>Prepared {prepared.preparedAt}; expires {prepared.expiresAt}. Inputs are revalidated by the core at launch.</p>
      <p>Policy: {prepared.capabilities.policy}. {prepared.capabilities.reason ? `${prepared.capabilities.reason.code}: ${displayAgentText(prepared.capabilities.reason.message)}` : "Verified limited policy reported by core."}</p>
      <label className="agent-confirm"><input type="checkbox" checked={draft.confirmed} onChange={(event) => client.confirmDraft(event.target.checked)} />I inspected this context and read scope</label>
      <button className="agent-primary" type="button" disabled={launchBlocked} onClick={() => { void client.launch(); }}>Launch read-only run</button>
    </> : null}
  </form>;
}
