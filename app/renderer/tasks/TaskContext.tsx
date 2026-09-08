import { useEffect, useState } from "react";
import { TaskDetail, type TaskDetailProps } from "./TaskDetail";
import { displayTaskText } from "./display";
import { sameGitObject } from "../../../protocol/tasks";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { type TaskActivity, type TaskActivityRequest } from "../../../protocol/task-activity";
import { entryEvidence, type ChangelogResult } from "../../../protocol/changelog";
import type { Run, TranscriptRecord } from "../../../protocol/agents";
import { TaskTrustedRuns } from "./TaskTrustedRuns";
import type { TaskTrustedObservation } from "./trusted-runs";

export interface TaskContextProps extends TaskDetailProps {
  connected: boolean; generation: number; journal: ChangelogResult | null; journalRetained: boolean;
  run: Run | null; runRecords?: TranscriptRecord[]; runRetained?: boolean; onJournal: (id: string) => void;
  trustedObservation?: TaskTrustedObservation; onOpenTrustedRun?: (token: string) => void;
}
export function TaskContext(props: TaskContextProps) {
  const { snapshot, detail, detailRevision, selectedTaskId, connected, generation, journal, run } = props;
  const [history, setHistory] = useState<{ key: string; activity: TaskActivity | null; notice: string } | null>(null);
  const key = snapshot && detail && detail.id === selectedTaskId && detailRevision
    ? JSON.stringify([snapshot.worldId, snapshot.repositoryId, detailRevision, detail.id, detail.blob, generation]) : null;
  useEffect(() => {
    let current = true;
    if (!key || !snapshot || !detail || !detailRevision || !connected || !window.swarm) return;
    const request: TaskActivityRequest = { type: "taskActivity.read", protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(), worldId: snapshot.worldId, repositoryId: snapshot.repositoryId,
      metadataCommit: detailRevision, taskId: detail.id };
    setHistory({ key, activity: null, notice: "Reading recorded updates…" });
    void window.swarm.request(request).then((wire) => {
      const response = parseCoreResponseForRequest(wire, request);
      if (!response.ok || !response.taskActivity?.activity || !sameGitObject(response.taskActivity.activity.blob, detail.blob))
        throw new Error("Unavailable history");
      if (current) setHistory({ key, activity: response.taskActivity.activity, notice: "" });
    }).catch(() => { if (current) setHistory({ key, activity: null, notice: "Update history unavailable for this revision." }); });
    return () => { current = false; };
  }, [key, connected]);
  const activity = history?.key === key ? history.activity : null;
  const associations = snapshot && journal?.repositoryId === snapshot.repositoryId && selectedTaskId
    ? journal.document.entries.filter((entry) => entryEvidence(entry, journal.bundle).some((evidence) => evidence.taskIds.includes(selectedTaskId))) : [];
  const reference = run && "contextVersion" in run.launchContext ? run.launchContext.repositoryTask?.reference : null;
  const linkedRun = reference && snapshot && reference.taskId === selectedTaskId && reference.repositoryId === snapshot.repositoryId && reference.worldId === snapshot.worldId ? run : null;
  const latest = activity?.events.reduce<string | null>((time, event) => !time || Date.parse(event.time) > Date.parse(time) ? event.time : time, null);
  return <section className="task-context" aria-label="Task context">
    <TaskDetail {...props} compact afterMetadata={<section className="task-detail-section"><h3>Issue update log</h3>
        <p className="task-hint">Recorded Ditz metadata · {props.detailStale || !connected ? "retained revision" : "displayed revision"}. Not agent execution.</p>
        {activity ? <>
          <dl className="task-properties"><dt>Created</dt><dd>{activity.createdAt ?? "Not recorded"}</dd>
            <dt>Latest shown event</dt><dd>{latest ?? "Not recorded"}</dd></dl>
          {activity.status !== "complete" ? <p className="task-hint">{activity.status === "unavailable" ? "History fields unavailable." : `${activity.events.length}/${activity.total} recorded events shown; ${activity.omitted} omitted or unsupported.`}</p> : null}
          {activity.events.length ? <ol className="task-update-log">{[...activity.events].reverse().map((event) => <li key={event.ordinal}>
            <strong>{displayTaskText(event.what)}</strong><small><time>{event.time}</time> · {displayTaskText(event.who)}</small>
            {event.comment ? <p className="task-literal">{displayTaskText(event.comment)}</p> : null}
          </li>)}</ol> : activity.status === "complete" ? <p className="task-empty">No recorded updates.</p> : null}
        </> : <p className="task-empty">{!connected ? "Update history unavailable while disconnected." : history?.key === key ? history.notice : "No update history loaded."}</p>}
      </section>} />
    <div className="task-ui task-context-supplement">
      {snapshot && selectedTaskId ? <TaskTrustedRuns scope={{ worldId: snapshot.worldId, repositoryId: snapshot.repositoryId, taskId: selectedTaskId }}
        observation={props.trustedObservation} connected={connected} onOpen={props.onOpenTrustedRun} /> : null}
      <section className="task-detail-section"><h3>Isolated run & recorded activity</h3>
        <p className="task-hint">The loaded isolated/rehearsal run and repository activity log, separate from trusted conversations.</p>
        {linkedRun ? <>
          <p>Loaded run · {linkedRun.state}{props.runRetained ? " · retained observation" : ""} · <code>{linkedRun.runId}</code><br />Task attached at metadata {reference!.metadataCommit.hex.slice(0, 8)}.</p>
          <details><summary>Loaded agent output · last {Math.min(8, props.runRecords?.length ?? 0)} records</summary>
            <p className="task-hint">Excerpts from the loaded run only, not complete session history.</p>
            <ol className="task-update-log">{(props.runRecords ?? []).slice(-8).map((record) => <li key={record.recordId}>
              <small>{record.timestamp} · {record.kind}</small><p className="task-literal">{displayTaskText(record.text).slice(0, 1000)}{record.text.length > 1000 ? "…" : ""}</p>
            </li>)}</ol>
          </details>
        </> : null}
        {associations.length ? <ul className="task-dependencies">{associations.map((entry) => <li key={entry.id}>
          <button onClick={() => props.onJournal(entry.id)}>{entry.headline}</button><small>Recorded {entry.reasoning} · {entry.state}{props.journalRetained ? " · retained observation" : ""} · {journal ? [...new Set(entryEvidence(entry, journal.bundle).map((evidence) => evidence.kind))].join(", ") : ""}</small>
        </li>)}</ul> : null}
        {!linkedRun && !associations.length ? <p className="task-empty">No isolated run or recorded activity in this scope.</p> : null}
      </section>
    </div>
  </section>;
}
