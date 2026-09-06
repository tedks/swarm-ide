import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RepositoryEntry, RepositoryObservation } from "../../../protocol/repository";
import { repositoryBreadcrumbs, type RepositoryNavigationActions } from "./navigation";
import "./repository.css";

export function RepositoryNavigation({ observation, actions, onActivate, onOpenPath }: {
  observation: RepositoryObservation; actions: RepositoryNavigationActions;
  onActivate: (entry: RepositoryEntry) => void; onOpenPath: (path: string) => void;
}) {
  const [filter, setFilter] = useState(observation.filter);
  const [path, setPath] = useState("");
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { setFilter(observation.filter); }, [observation.observationId, observation.filter]);
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && ["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "ArrowUp" && observation.directory) void actions.up();
      else if (event.key === "ArrowLeft" && actions.backEnabled) void actions.back();
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("ol") === list.current && !event.altKey && !event.ctrlKey && !event.metaKey &&
      ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const buttons = [...list.current!.querySelectorAll<HTMLButtonElement>("button")];
      if (!buttons.length) return;
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
      event.preventDefault(); event.stopPropagation(); buttons[next]?.focus();
    }
  };
  return <div className="repository-navigation" role="region" aria-label="Repository navigation" onKeyDown={keyboard} aria-busy={actions.pending}>
    <nav className="repository-controls" aria-label="Directory controls">
      <button aria-label="Repository Back" disabled={!actions.backEnabled} onClick={() => void actions.back()} title="Alt-Left within repository navigation">←</button>
      <button aria-label="Repository Up" disabled={!observation.directory} onClick={() => void actions.up()} title="Alt-Up within repository navigation">↑</button>
      <div className="repository-breadcrumbs">{repositoryBreadcrumbs(observation.directory).map((crumb) => <button key={crumb.path} aria-label={crumb.path ? `Directory ${crumb.path}` : "Repository root"} aria-current={crumb.path === observation.directory ? "location" : undefined} onClick={() => void actions.enter(crumb.path)}>{crumb.label}</button>)}</div>
      <button aria-label="Refresh directory" onClick={() => void actions.refresh()}>↻</button>
    </nav>
    <div className="repository-observation" role="status" title={`Captured ${observation.capturedAt}; ${observation.observationId}`}>
      {actions.pending ? "Observing… · " : ""}{observation.state} · {observation.complete ? "directory" : "partial directory"} · {observation.capturedCount} captured
      {observation.notice ? <span>{observation.notice}</span> : null}
      {observation.reveal?.status === "outside-capture" ? <span>{observation.reveal.path} is outside this partial directory capture. Source opening is independent.</span> : null}
      {observation.reveal?.status === "absent" ? <span>{observation.reveal.path} is absent from this observation; Refresh to observe current entries.</span> : null}
      {observation.reveal?.status === "unsupported" ? <span>{observation.reveal.path} cannot be activated in this repository slice.</span> : null}
    </div>
    {actions.notice ? <div className="repository-notice" role="status">{actions.notice}{actions.retryEnabled ? <button onClick={() => void actions.retry()}>Retry directory</button> : null}</div> : null}
    <div className="repository-query-row">
      <form onSubmit={(event) => { event.preventDefault(); void actions.filter(filter); }}>
        <input aria-label="Filter captured directory" value={filter} maxLength={256} placeholder="Filter captured names" onChange={(event) => setFilter(event.target.value)} />
        <button type="submit">Filter</button>
      </form>
      <details className="repository-open-path"><summary>Open path</summary><form onSubmit={(event) => { event.preventDefault(); onOpenPath(path); }}>
        <input aria-label="Open repository path" value={path} maxLength={4096} placeholder="core/files.ts" onChange={(event) => setPath(event.target.value)} />
        <button type="submit">Open path</button>
      </form></details>
    </div>
    <div className="repository-page-controls"><button aria-label="Previous directory page" disabled={observation.page === 0} onClick={() => void actions.page(observation.page - 1)}>‹</button><span>Page {observation.page + 1} / {observation.pageCount} · {observation.filteredCount} matching captured entries</span><button aria-label="Next directory page" disabled={observation.page + 1 >= observation.pageCount} onClick={() => void actions.page(observation.page + 1)}>›</button></div>
    <ol ref={list} aria-label="Directory entries" className="repository-entries">
      {observation.entries.map((entry) => <li key={entry.id} className={`repository-entry git-${entry.git}`}><button data-path={entry.path ?? undefined} aria-disabled={!entry.actionable} title={entry.reason ?? `${entry.kind} · ${entry.git}`} aria-label={entry.actionable ? `${entry.kind === "directory" ? "Enter directory" : "Open file"} ${entry.path}` : `Unavailable ${entry.label}: ${entry.reason}`} onClick={() => { if (entry.actionable) onActivate(entry); }}>
        <span>{entry.label}{entry.kind === "directory" ? "/" : ""}</span><small>{entry.reason ?? (entry.kind === "directory" ? "directory" : entry.git)}</small>
      </button></li>)}
      {!observation.entries.length ? <li className="repository-empty">{observation.state === "loading" ? "Observing directory…" : observation.filter ? "No captured names match this filter." : "No entries in this observation."}</li> : null}
    </ol>
  </div>;
}
