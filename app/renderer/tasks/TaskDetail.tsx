import { sameGitObject, type GitObjectId, type TaskDetail as TaskDetailData, type TaskFileRef, type TaskSnapshot } from "../../../protocol/tasks";
import { canRevealTaskRef, displayTaskText, taskRevisionLabel } from "./display";
import "./tasks.css";
import type { Ref } from "react";

export interface TaskDetailProps {
  selectedTaskId: string | null;
  snapshot: TaskSnapshot | null;
  detail: TaskDetailData | null;
  detailRevision: GitObjectId | null;
  detailStale: boolean;
  reading: boolean;
  notice: string | null;
  onSelect: (id: string) => void;
  onReveal: (ref: TaskFileRef) => void;
  onReturnToSource: () => void;
  returnButtonRef?: Ref<HTMLButtonElement>;
  surface?: "information" | "editor";
  onShowDocument?: () => void;
  onRefresh?: () => void;
  compact?: boolean;
  attachment?: { eligible: boolean; alreadyAttached: boolean; notice: string | null; onAttach: (origin: HTMLButtonElement) => void };
}

function Dependencies({ title, rows, onSelect, snapshot }: { title: string; rows: TaskDetailData["blocks"]; onSelect: (id: string) => void; snapshot: TaskSnapshot | null }) {
  return <section className="task-detail-section"><h3>{title}</h3>
    {rows.length ? <ul className="task-dependencies">{rows.map((row) => <li key={row.taskId}>
      <button type="button" title={row.taskId} onClick={() => onSelect(row.taskId)} aria-label={`Select dependency ${row.taskId}`}>{displayTaskText(snapshot?.summaries.find((task) => task.id === row.taskId)?.title ?? row.taskId)}</button>
      <span>{row.status ?? "not present in snapshot"}</span>
      {row.diagnostics.length ? <span className="task-warning">Recorded dependency: {row.diagnostics.join(", ")}</span> : null}
    </li>)}</ul> : <p className="task-hint">None recorded.</p>}
  </section>;
}

export function TaskDetail({ selectedTaskId, snapshot, detail, detailRevision, detailStale, reading, notice, onSelect, onReveal, onReturnToSource, returnButtonRef, surface = "information", onShowDocument, onRefresh, attachment, compact = false }: TaskDetailProps) {
  // The client validates all wire identities; never display another selection's
  // cached detail during a parent render transition, even for a single frame.
  const selectedDetail = detail?.id === selectedTaskId && detailRevision !== null ? detail : null;
  const missing = selectedTaskId !== null && snapshot !== null && !snapshot.summaries.some((task) => task.id === selectedTaskId);
  const retained = detailStale || (detailRevision !== null && snapshot !== null && !sameGitObject(detailRevision, snapshot.metadataCommit));
  return <section className={`task-ui task-detail ${surface === "editor" ? "task-document" : ""}`} aria-label={surface === "editor" ? "Task document" : "Task details"}>
    <header className="task-heading"><h2>{surface === "editor" ? "Task · read-only" : "Task details"}</h2><button ref={returnButtonRef} type="button" onClick={onReturnToSource}>{surface === "editor" ? "Return to source" : "Return to source information"}</button></header>
    {selectedTaskId === null ? <p className="task-empty">Select a task in Work to inspect its metadata.</p> : <code className="task-selected-id">{displayTaskText(selectedTaskId)}</code>}
    {selectedDetail && onShowDocument ? <button type="button" onClick={onShowDocument}>Show task document</button> : null}
    {onRefresh ? <button type="button" onClick={onRefresh}>Refresh tasks</button> : null}
    {selectedDetail && attachment ? <div className="task-attach">
      <button type="button" disabled={!attachment.eligible || attachment.alreadyAttached} onClick={(event) => attachment.onAttach(event.currentTarget)}>
        {attachment.alreadyAttached ? "Already attached" : "Attach this task to draft"}</button>
      {!attachment.eligible ? <p className="task-warning">Attachment unavailable: Refresh tasks and inspect a current complete detail. Retained previews are not attachment authority.</p> : null}
      {attachment.notice ? <p role="status" className="task-warning">{attachment.notice}</p> : null}
    </div> : null}
    <div role="status" className="task-detail-status">
      {reading ? <p>Reading selected task…</p> : null}
      {notice ? <p className="task-warning">{displayTaskText(notice)}</p> : null}
      {missing ? <p className="task-warning">Task not present in this revision. Selection is retained.</p> : null}
      {selectedDetail && retained ? <p className="task-warning">Retained details from the labelled metadata revision; not confirmed current.</p> : null}
    </div>
    {selectedTaskId !== null && !selectedDetail && !reading ? <p className="task-empty">No details loaded for this selection.</p> : null}
    {selectedDetail && detailRevision ? <>
      <h3 className="task-title">{displayTaskText(selectedDetail.title)}</h3>
      <dl className="task-properties">
        <dt>Status</dt><dd>{selectedDetail.status}</dd><dt>Type</dt><dd>{selectedDetail.type}</dd>
        <dt>Component</dt><dd>{selectedDetail.component ? displayTaskText(selectedDetail.component) : "not specified"}</dd>
        <dt>Disposition</dt><dd>{selectedDetail.disposition === null ? "not recorded" : displayTaskText(selectedDetail.disposition)}</dd>
      </dl>
      <details className="task-revision"><summary>Detail revision · {detailRevision.hex.slice(0, 8)}</summary>
        <p>Metadata <code>{taskRevisionLabel(detailRevision)}</code></p>
        <p>Issue blob <code>{taskRevisionLabel(selectedDetail.blob)}</code></p>
      </details>
      {!compact ? <section className="task-detail-section"><h3>Description</h3><p className="task-literal">{selectedDetail.description ? displayTaskText(selectedDetail.description) : "No description recorded."}</p></section> : null}
      <p className="task-hint">Recorded dependencies describe metadata, not dispatch readiness.</p>
      <Dependencies title="Blocking" rows={selectedDetail.blocks} onSelect={onSelect} snapshot={detailRevision && snapshot && sameGitObject(detailRevision, snapshot.metadataCommit) ? snapshot : null} />
      <Dependencies title="Blocked by" rows={selectedDetail.blockedBy} onSelect={onSelect} snapshot={detailRevision && snapshot && sameGitObject(detailRevision, snapshot.metadataCommit) ? snapshot : null} />
      <section className="task-detail-section"><h3>Explicit file references</h3>
        <p className="task-hint">Opens current working file; link recorded at metadata <code>{taskRevisionLabel(detailRevision)}</code>. A candidate is not proof that the file exists.</p>
        {selectedDetail.fileRefs.length ? <ul className="task-file-refs">{selectedDetail.fileRefs.map((ref, index) => <li key={index}>
          <code>{ref.path ? displayTaskText(ref.path) : "(empty path)"}{ref.line === null ? "" : `:${ref.line}`}</code>
          {ref.note !== null ? <p className="task-literal">{displayTaskText(ref.note)}</p> : null}
          {canRevealTaskRef(ref) ? <button type="button" onClick={() => onReveal(ref)} aria-label={`Reveal working file ${ref.path}${ref.line === null ? "" : ` at line ${ref.line}`}`}>Reveal working file</button>
            : <p className="task-warning">Unsupported source reference: expected a canonical repository-relative path and an optional positive line.</p>}
        </li>)}</ul> : <p className="task-empty">No explicit file references.</p>}
      </section>
    </> : null}
  </section>;
}
