import { useMemo, useState } from "react";
import type { TaskObservation, TaskObservationStatus } from "../../../protocol/tasks";
import { displayTaskText, taskRevisionLabel } from "./display";
import "./tasks.css";

export interface TaskPanelProps {
  observation: TaskObservation | null;
  refreshing: boolean;
  connected: boolean;
  notice: string | null;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onShowDetails: () => void;
  onOpen?: (id: string) => void;
}

const stateLabels: Record<TaskObservationStatus, string> = {
  unobserved: "Tasks not observed", loading: "Loading tasks", observed: "Tasks observed",
  stale: "Task snapshot stale", unavailable: "Tasks unavailable", malformed: "Task metadata malformed",
  limited: "Task observation limited", error: "Task observation failed",
};

export function TaskPanel({ observation, refreshing, connected, notice, selectedTaskId, onSelect, onRefresh, onShowDetails, onOpen }: TaskPanelProps) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [query, setQuery] = useState("");
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const snapshot = observation?.snapshot ?? null;
  const summaries = snapshot?.summaries;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (summaries ?? []).filter((task) => (filter === "all" || task.status !== "closed") &&
      (!needle || task.id.toLowerCase().includes(needle) || task.title.toLowerCase().includes(needle)))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }, [summaries, filter, query]);
  const selectedPresent = selectedTaskId !== null && summaries?.some((task) => task.id === selectedTaskId);
  const selectedVisible = selectedTaskId !== null && visible.some((task) => task.id === selectedTaskId);
  const status = observation?.status ?? "unobserved";
  const retainedAfterFailure = status === "observed" && notice !== null;

  return <section className="rail-section task-ui task-panel" aria-label="Tasks">
    <header className="task-heading"><h2>Tasks</h2><button type="button" onClick={onRefresh} disabled={!connected || refreshing}>Refresh tasks</button></header>
    <div className="task-observation" role="status" data-task-status={status}>
      <strong>{retainedAfterFailure ? "Task snapshot retained" : stateLabels[status]}</strong>
      {!connected ? <span>Local core disconnected.</span> : null}
      {refreshing ? <span>Checking tasks…</span> : null}
      {observation?.reason ? <span>{observation.reason.code}: {displayTaskText(observation.reason.message)}</span> : null}
      {notice ? <span>{displayTaskText(notice)}</span> : null}
      {retainedAfterFailure ? <span className="task-warning">Latest check failed or was ignored; retained data is not confirmed current.</span> : null}
    </div>
    {snapshot ? <details className="task-revision"><summary>Snapshot · {snapshot.metadataCommit.hex.slice(0, 8)}</summary>
      <p>Observed at <code>{taskRevisionLabel(snapshot.metadataCommit)}</code></p>
      <p>Observed {snapshot.observedAt}</p>
      <p>Local ref checked {observation?.checkedAt ?? "not checked"}</p>
      <p>Repository {displayTaskText(snapshot.repositoryId)} · provider {snapshot.provider}</p>
      {status !== "observed" || retainedAfterFailure ? <p>Retained snapshot; the latest attempt does not establish that it is current.</p> : null}
    </details> : null}
    <label className="task-search">Search tasks by title or full ID<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title or full ID" /></label>
    <div className="task-filters" role="group" aria-label="Task filter">
      <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Open</button>
      <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
    </div>
    <p className="task-hint">Open means not closed, not ready to dispatch.</p>
    {snapshot ? <>
      <p className="task-count">{visible.length} shown · {summaries!.length} in snapshot</p>
      {selectedTaskId !== null && !selectedPresent ? <p className="task-warning">Selected task {displayTaskText(selectedTaskId)} is not present in this revision.</p>
        : selectedPresent && !selectedVisible ? <p className="task-hint">Selected task is hidden by the current filters.</p> : null}
      {summaries!.length === 0 ? <p className="task-empty">No tasks in this snapshot.</p>
        : visible.length === 0 ? <p className="task-empty">No matches in this snapshot.</p>
          : <ul className="task-list" aria-label="Repository tasks">{visible.map((task) => <li key={task.id}>
            <button type="button" className="task-select" aria-label={`Select task ${task.id}`} aria-pressed={selectedTaskId === task.id} aria-expanded={expandedTitle === task.id} title={`${displayTaskText(task.title)}\n${task.id} · ${task.status} · ${task.type}${task.component ? ` · ${displayTaskText(task.component)}` : ""}\nClick to expand title · double-click or Enter to open task document`} onClick={() => { onSelect(task.id); setExpandedTitle((id) => id === task.id ? null : task.id); }} onDoubleClick={() => onOpen?.(task.id)} onKeyDown={(event) => { if (event.key === "Enter" && onOpen) { event.preventDefault(); onOpen(task.id); } }}>
              <span className={`task-row-status task-status-${task.status}`} aria-label={task.status}>{task.status === "closed" ? "✓" : task.status === "in_progress" ? "◐" : task.status === "paused" ? "Ⅱ" : "○"}</span><strong>{displayTaskText(task.title)}</strong>
            </button>
          </li>)}</ul>}
    </> : <p className="task-empty">No task snapshot has been loaded.</p>}
    <button className="task-show-details" type="button" disabled={selectedTaskId === null} onClick={onShowDetails}>Show task details</button>
  </section>;
}
