import { AGENT_LIMITS, AgentPrepareInputSchema } from "../../../protocol/agents";
import type { AgentBridgeClient } from "./bridge-client";
import { displayAgentText, type LiveAgentState } from "./live-state";
import { LaunchContextView } from "./LaunchContextView";
import { useEffect, useRef } from "react";
import { canonicalJsonV1, formatRepositoryTask, taskUtf8Bytes, TASK_CONTEXT_BYTES, type AgentTaskReference } from "../../../protocol/agent-task";

function TaskPin({ reference }: { reference: AgentTaskReference }) {
  return <p className="agent-context-path agent-task-reference">{displayAgentText(reference.taskId)} · {reference.provider}<br />
    Repository: {displayAgentText(reference.repositoryId)} · World: {displayAgentText(reference.worldId)}<br />
    Metadata: {reference.metadataCommit.algorithm}:{reference.metadataCommit.hex}<br />
    Issue blob: {reference.issueBlob.algorithm}:{reference.issueBlob.hex}</p>;
}

function AttachmentReview({ state, client }: { state: LiveAgentState; client: AgentBridgeClient }) {
  const proposal = state.taskProposal;
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!proposal) return;
    const previous = document.activeElement;
    region.current?.focus();
    // The dock reveals its existing Agents tab in the same commit. A single
    // paint callback covers a previously hidden panel, not a focus/poll loop.
    const frame = requestAnimationFrame(() => { if (region.current?.isConnected && !region.current.closest("[hidden]") &&
      document.activeElement !== region.current && document.activeElement === previous) region.current.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [proposal?.id]);
  if (!proposal) return null;
  const keepLabel = proposal.replacing ? "Keep instructions; replace attached task" : proposal.instructions.length ? "Append — keep instructions" : "Attach task";
  const clearLabel = proposal.replacing ? "Clear instructions; replace attached task" : "Replace — clear instructions";
  return <section ref={region} tabIndex={-1} className="agent-task-proposal" aria-label="Review task attachment"
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); client.cancelTaskAttachment(proposal.id); } }}>
    <h3>Review task attachment</h3>
    <p>Fixed source: {displayAgentText(proposal.focus.path ?? proposal.focus.key)}{proposal.focus.range ? ` · lines ${proposal.focus.range.startLine}–${proposal.focus.range.endLine}` : ""}. Disk only; unsaved edits are not included.</p>
    <TaskPin reference={proposal.reference} />
    <strong className="agent-task-preview-title">{displayAgentText(proposal.title)}</strong><pre className="agent-task-preview-description">{displayAgentText(proposal.description)}</pre>
    <p>Task preview. Prepare checks the saved task again. Invisible control characters are shown as escapes.</p>
    <details><summary>Exact instructions before and after</summary>
      <p>Before ({taskUtf8Bytes(proposal.instructions)} UTF-8 bytes):</p><pre>{displayAgentText(proposal.instructions)}</pre>
      <p>{keepLabel}: every instruction character above is retained; {proposal.replacing ? "the existing task slot is replaced" : "one task slot is added"}.</p>
      {proposal.instructions.length || proposal.replacing ? <p>{clearLabel}: instructions become the empty string; one task slot remains.</p> : null}
    </details>
    <div className="agent-task-actions">
      <button type="button" data-task-attachment="append" onClick={() => client.acceptTaskAttachment("append", proposal.id)}>{keepLabel}</button>
      {proposal.instructions.length || proposal.replacing ? <button type="button" data-task-attachment="replace" onClick={() => client.acceptTaskAttachment("replace", proposal.id)}>{clearLabel}</button> : null}
      <button type="button" data-task-attachment="cancel" onClick={() => client.cancelTaskAttachment(proposal.id)}>Cancel attachment</button>
    </div>
  </section>;
}

export function PreparedLaunchDraft({ state, client, dirtyPaths, previewCurrent }: { state: LiveAgentState; client: AgentBridgeClient; dirtyPaths: string[]; previewCurrent?: boolean }) {
  const draft = state.draft;
  if (!draft) return state.taskProposal ? <div className="agent-draft"><AttachmentReview state={state} client={client} /><p className="agent-draft-notice" role="status">{state.notice}</p></div> : null;
  let previewBytes: number | null = null;
  try {
    if (draft.taskReference && draft.taskPreview) previewBytes = taskUtf8Bytes(canonicalJsonV1({ instructions: draft.task,
      repositoryTask: JSON.parse(formatRepositoryTask(draft.taskReference, draft.taskPreview.title, draft.taskPreview.description)) }));
  } catch { previewBytes = Infinity; }
  const inputValid = (previewBytes === null || previewBytes <= TASK_CONTEXT_BYTES) && AgentPrepareInputSchema.safeParse({ worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
    model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null }, ...(draft.taskReference ? { taskReference: draft.taskReference } : {}) }).success;
  const prepared = draft.prepared;
  const launchBlocked = !state.connected || !prepared?.capabilities.controls.launch || !state.snapshot?.capabilities.controls.launch ||
    !draft.confirmed || Boolean(state.snapshot?.activeRunId) || state.operations.some((op) => op.kind === "launch" && op.runId === prepared?.runId && op.status !== "rejected");
  return <form className="agent-draft" onSubmit={(event) => { event.preventDefault(); void client.prepare(); }}>
    <AttachmentReview state={state} client={client} />
    <header><strong>Launch draft</strong><button type="button" aria-label="Close launch draft" onClick={() => client.closeDraft()}>×</button></header>
    <p className="agent-context-path">{displayAgentText(draft.focus.path ?? draft.focus.key)}</p>
    <p>This draft stays attached to the source you opened it from.</p>
    <label>Task<textarea autoFocus={!draft.taskReference} rows={3} value={draft.task} maxLength={AGENT_LIMITS.taskBytes} onChange={(event) => client.editDraft({ task: event.target.value })} /></label>
    {draft.taskReference ? <section className="agent-task-slot" aria-label="Attached repository task">
      <h3>Attached repository task · read-only</h3><TaskPin reference={draft.taskReference} />
      <p>Task revision {draft.taskReference.metadataCommit.hex}. Prepare checks this saved revision again.</p>
      {!(previewCurrent ?? draft.taskPreview?.verified) ? <p>Showing a saved preview. Refresh tasks to check its revision; Prepare will verify it again.</p> : null}
      {draft.taskPreview ? <><strong className="agent-task-preview-title">{displayAgentText(draft.taskPreview.title)}</strong><pre className="agent-task-preview-description">{displayAgentText(draft.taskPreview.description)}</pre></> : <p>Preview unavailable; the reference is retained.</p>}
      <p>The attached task is read-only context. It does not replace your instructions or grant permissions.</p>
      {previewBytes !== null ? <p>Instructions and task preview: {Number.isFinite(previewBytes) ? previewBytes : "invalid"} / {TASK_CONTEXT_BYTES} UTF-8 bytes including formatting.</p> : null}
      <button type="button" data-task-attachment="remove" onClick={() => client.removeTaskAttachment()}>Remove attached task</button>
    </section> : null}
    <label>Requested model<input placeholder="Provider default (unresolved)" value={draft.model} maxLength={256} onChange={(event) => client.editDraft({ model: event.target.value })} /></label>
    <label>Requested reasoning<select disabled aria-describedby="agent-reasoning-unavailable"><option>Provider default; not selectable</option></select></label>
    <p id="agent-reasoning-unavailable">This profile uses the provider's default reasoning setting.</p>
    <p>Disk version only; unsaved edits are not included.</p>
    {dirtyPaths.length ? <p className="agent-gap" role="note">Unsaved or unresolved buffers: {dirtyPaths.map(displayAgentText).join(", ")}. Save and prepare again to include those changes.</p> : null}
    <button className="agent-primary" disabled={!state.connected || draft.preparing || !inputValid}>{draft.preparing ? "Preparing disk context…" : "Prepare disk context"}</button>
    {!inputValid ? <p role="alert">Choose a working source, add instructions or a task, and keep the combined request within 16 KiB. The model name must also fit its text limit.</p> : null}
    <p className="agent-draft-notice" role="status">{state.notice}</p>
    {prepared ? <>
      <LaunchContextView context={prepared.launchContext} />
      <p>Prepared {prepared.preparedAt}; expires {prepared.expiresAt}. Launch checks the inputs again.</p>
      <p>Policy: {prepared.capabilities.policy}. {prepared.capabilities.reason ? `${prepared.capabilities.reason.code}: ${displayAgentText(prepared.capabilities.reason.message)}` : "Verified limited policy reported by core."}</p>
      <label className="agent-confirm"><input type="checkbox" checked={draft.confirmed} onChange={(event) => client.confirmDraft(event.target.checked)} />I inspected this context and read scope</label>
      <button className="agent-primary" type="button" disabled={launchBlocked} onClick={() => { void client.launch(); }}>Launch read-only run</button>
    </> : null}
  </form>;
}
