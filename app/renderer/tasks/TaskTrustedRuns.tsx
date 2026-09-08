import { displayTaskText } from "./display";
import { selectedTaskRunDetail, taskRunStatus, taskTrustedRuns, type TaskRunScope, type TaskTrustedObservation } from "./trusted-runs";
import "./task-trusted-runs.css";

export function TaskTrustedRuns({ scope, observation, connected, onOpen }: {
  scope: TaskRunScope;
  observation?: TaskTrustedObservation;
  connected: boolean;
  onOpen?: (token: string) => void;
}) {
  const snapshot = observation?.snapshot ?? null;
  const runs = taskTrustedRuns(snapshot, scope);
  const retained = !connected || Boolean(observation?.retained);
  const available = snapshot?.runs !== undefined;
  return <section className="task-detail-section task-trusted-runs" aria-label="Trusted task runs">
    <h3>Trusted conversations <span className="task-trusted-count">{runs.length || ""}</span></h3>
    <p className="task-hint">Linked at launch to this task. A finished turn does not close the issue.</p>
    {retained && snapshot ? <p className="task-hint">Retained observation · activity may have changed.</p> : null}
    {!runs.length ? <p className="task-empty">{available ? "No trusted conversations linked to this task." : "Trusted task history not observed."}</p> :
      <ul className="task-trusted-list">{runs.map((run) => {
        const detail = selectedTaskRunDetail(snapshot, run);
        return <li key={run.runToken} data-trusted-task-run={run.runToken}>
          <div className="task-trusted-run-heading"><strong>{displayTaskText(run.title)}</strong><span>{taskRunStatus(run)}</span></div>
          <small>Task attached at metadata <code title={`${run.taskReference!.metadataCommit.algorithm}:${run.taskReference!.metadataCommit.hex}`}>{run.taskReference!.metadataCommit.hex.slice(0, 8)}</code> · <time dateTime={run.updatedAt}>{run.updatedAt}</time></small>
          {run.archived ? <p className="task-hint">Saved history, not a running conversation. No automatic resume.</p> : null}
          {!run.archived && run.approvalCount > 0 ? <p className="task-warning">{run.approvalCount} approval request{run.approvalCount === 1 ? "" : "s"} · open conversation to review.</p> : null}
          {run.message ? <p className="task-trusted-message">{displayTaskText(run.message).slice(0, 300)}</p> : null}
          {detail ? <details className="task-trusted-excerpt"><summary>Recent output & activity</summary>
            <p className="task-hint">Bounded excerpts from this conversation{retained || run.archived ? " · retained" : ""}.</p>
            {detail.output ? <pre aria-label="Trusted task output">{detail.output.length > 1600 ? "…" : ""}{displayTaskText(detail.output).slice(-1600)}</pre> : <p className="task-empty">No output recorded.</p>}
            {detail.activities.length ? <ol className="task-update-log">{detail.activities.slice(-4).map((item, index) => <li key={`${item.id}:${index}`}>
              <small><time>{item.at}</time> · {item.kind} · {item.status}</small><p className="task-literal">{displayTaskText(item.summary).slice(0, 400)}</p>
            </li>)}</ol> : null}
          </details> : null}
          <button type="button" disabled={!connected || !onOpen} onClick={() => onOpen?.(run.runToken)} aria-label={`Open trusted conversation ${displayTaskText(run.title)}`}>{run.archived ? "Open saved conversation" : "Open conversation"}</button>
        </li>;
      })}</ul>}
  </section>;
}
