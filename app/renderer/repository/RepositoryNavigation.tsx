import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { RepositoryEntry, RepositoryObservation } from "../../../protocol/repository";
import { repositoryBreadcrumbs, type RepositoryNavigationActions } from "./navigation";
import { repositoryTree, retainDirectory, type DirectoryCache, type TreeRow } from "./tree";
import "./repository.css";

function EntryIcon({ directory, expanded }: { directory: boolean; expanded: boolean }) {
  return <svg className={`repository-icon ${directory ? "folder" : "file"}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {directory ? <path d={expanded ? "M2 5V3h4l2 2h6v2H4l-2 6H1V5Zm2 2h11l-2 6H2Z" : "M2 4h4l2 2h6v7H2Z"} /> : <path d="M4 2h5l3 3v9H4Zm5 0v4h3" />}
  </svg>;
}

export function RepositoryNavigation({ observation, actions, onActivate, onOpenPath, rootLabel = "Repository", focusedPath }: {
  observation: RepositoryObservation; actions: RepositoryNavigationActions;
  onActivate: (entry: RepositoryEntry) => void; onOpenPath: (path: string) => void;
  rootLabel?: string; focusedPath?: string;
}) {
  const [filter, setFilter] = useState(observation.filter);
  const [path, setPath] = useState("");
  const [cache, setCache] = useState<DirectoryCache>(() => retainDirectory(new Map(), observation));
  const [expanded, setExpanded] = useState(() => new Set(repositoryBreadcrumbs(observation.directory).map((crumb) => crumb.path)));
  const [selected, setSelected] = useState<string>(focusedPath ?? observation.directory);
  const list = useRef<HTMLOListElement>(null);
  const previousDirectory = useRef(observation.directory);
  const expandedIntent = useRef<number | null>(null);
  const foldedPending = useRef(new Set<string>());
  useEffect(() => { setFilter(observation.filter); }, [observation.observationId, observation.filter]);
  useEffect(() => {
    setCache((prior) => retainDirectory(prior, observation));
    if (observation.state === "loading") return;
    const intent = actions.expansionIntent;
    const explicit = intent && intent.serial !== expandedIntent.current && intent.directory === observation.directory;
    if (previousDirectory.current !== observation.directory || explicit) {
      previousDirectory.current = observation.directory;
      const suppressed = new Set(foldedPending.current);
      setExpanded((prior) => {
        const next = new Set(prior);
        for (const crumb of repositoryBreadcrumbs(observation.directory)) {
          if (!suppressed.has(crumb.path)) next.add(crumb.path);
        }
        return next;
      });
    }
    if (explicit) expandedIntent.current = intent.serial;
    // A fold veto belongs only to the in-flight navigation, never the next
    // explicit Reveal. Refresh/background observations do not unfold folders.
    if (!actions.pending) foldedPending.current.clear();
  }, [observation, actions.pending, actions.expansionIntent]);
  useEffect(() => { if (focusedPath) setSelected(focusedPath); }, [focusedPath]);
  const tree = repositoryTree(cache, observation, expanded, rootLabel);
  const buttons = () => [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-tree-key]") ?? [])];
  const focusRow = (key: string) => buttons().find((button) => button.dataset.treeKey === key)?.focus();
  const fold = (row: TreeRow) => {
    if (actions.pending) foldedPending.current.add(row.key);
    setExpanded((prior) => { const next = new Set(prior); next.delete(row.key); return next; });
  };
  const activate = (row: TreeRow) => {
    if (!row.entry.actionable) return;
    setSelected(row.key);
    if (row.entry.kind !== "directory") { onActivate(row.entry); return; }
    if (row.expanded) { fold(row); return; }
    foldedPending.current.delete(row.key);
    setExpanded((prior) => new Set(prior).add(row.key));
    if (row.key === "" || row.recipe) void actions.enter(row.key);
    else onActivate(row.entry);
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && ["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "ArrowUp" && observation.directory) void actions.up();
      else if (event.key === "ArrowLeft" && actions.backEnabled) void actions.back();
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.matches("button[data-tree-key]") || event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = buttons(), index = rows.indexOf(target as HTMLButtonElement), row = tree.rows[index];
    if (!row || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "ArrowLeft") {
      if (row.expanded) fold(row); else if (row.parent !== null) focusRow(row.parent);
    } else if (event.key === "ArrowRight") {
      if (row.entry.kind === "directory" && !row.expanded) activate(row);
      else if (row.expanded && tree.rows[index + 1]?.parent === row.key) rows[index + 1]?.focus();
    } else {
      const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
      rows[next]?.focus();
    }
  };
  return <div className="repository-navigation" role="region" aria-label="Repository navigation" onKeyDown={keyboard} aria-busy={actions.pending}>
    <nav className="repository-controls" aria-label="Directory controls">
      <button aria-label="Repository Back" disabled={!actions.backEnabled} onClick={() => void actions.back()} title="Back · Alt-Left">←</button>
      <button aria-label="Repository Up" disabled={!observation.directory} onClick={() => void actions.up()} title="Up · Alt-Up">↑</button>
      <div className="repository-breadcrumbs">{repositoryBreadcrumbs(observation.directory).map((crumb) => <button key={crumb.path} aria-label={crumb.path ? `Directory ${crumb.path}` : "Repository root"} aria-current={crumb.path === observation.directory ? "location" : undefined} onClick={() => void actions.enter(crumb.path)}>{crumb.label === "/" ? rootLabel : crumb.label}</button>)}</div>
      <button aria-label="Collapse folders" title="Collapse folders" onClick={() => { if (actions.pending) for (const key of expanded) foldedPending.current.add(key); setExpanded(new Set([""])); }}>⊟</button>
      <button aria-label="Refresh directory" title="Refresh current directory" onClick={() => void actions.refresh()}>↻</button>
      <details className="repository-options"><summary aria-label="Repository options" title="Filter and exact path">⋯</summary>
        <div className="repository-query-row"><form onSubmit={(event) => { event.preventDefault(); void actions.filter(filter); }}>
          <input aria-label="Filter captured directory" value={filter} maxLength={256} placeholder="Filter this folder" onChange={(event) => setFilter(event.target.value)} /><button type="submit">Filter</button>
        </form><details className="repository-open-path"><summary>Open path</summary><form onSubmit={(event) => { event.preventDefault(); onOpenPath(path); }}>
          <input aria-label="Open repository path" value={path} maxLength={4096} placeholder="core/files.ts" onChange={(event) => setPath(event.target.value)} /><button type="submit">Open path</button>
        </form></details></div>
      </details>
    </nav>
    {actions.notice ? <div className="repository-notice" role="status">{actions.notice}{actions.retryEnabled ? <button onClick={() => void actions.retry()}>Retry directory</button> : null}</div> : null}
    <ol ref={list} role="tree" aria-label="Directory entries" className="repository-entries">
      {tree.rows.map((row) => <li key={row.key} role="treeitem" aria-level={row.depth + 1} aria-expanded={row.entry.kind === "directory" ? row.expanded : undefined} aria-selected={selected === row.key} className={`repository-entry git-${row.entry.git} ${selected === row.key ? "is-selected" : ""}`} style={{ "--tree-depth": row.depth } as CSSProperties}>
        <button data-path={row.entry.path ?? undefined} data-tree-key={row.key} aria-disabled={!row.entry.actionable} title={row.entry.reason ?? `${row.entry.path || rootLabel}${row.observation ? ` · Captured ${row.observation.capturedAt}${row.key !== observation.directory ? " · retained observation; expand to refresh" : ""}` : ""}`}
          aria-label={row.entry.actionable ? row.key === "" ? "Toggle repository root" : `${row.entry.kind === "directory" ? "Enter directory" : "Open file"} ${row.entry.path}` : `Unavailable ${row.entry.label}: ${row.entry.reason}`} onClick={() => activate(row)}>
          <span className="repository-chevron" aria-hidden="true">{row.entry.kind === "directory" ? row.expanded ? "⌄" : "›" : ""}</span>
          <EntryIcon directory={row.entry.kind === "directory"} expanded={row.expanded} />
          <span className="repository-entry-name">{row.entry.label}</span>
          {row.observation && (!row.observation.complete || row.observation.filter || row.observation.pageCount > 1) ? <small title="This branch shows a bounded directory page">{row.observation.filter ? "filtered" : !row.observation.complete ? "partial" : `${row.observation.page + 1}/${row.observation.pageCount}`}</small> : null}
          {row.entry.git === "untracked" ? <small title="Untracked">U</small> : !row.entry.actionable ? <small title={row.entry.reason}>⊘</small> : null}
        </button>
        {row.expanded && row.observation?.entries.length === 0 ? <div className="repository-empty">{row.observation.state === "loading" ? "Observing…" : row.observation.filter ? "No captured names match." : "Empty folder"}</div> : null}
        {row.expanded && !row.observation ? <div className="repository-empty">{actions.pending ? "Observing…" : "Not loaded · collapse and expand to retry"}</div> : null}
      </li>)}
    </ol>
    {tree.truncated ? <div className="repository-notice">Visible tree limit reached. Collapse folders to see more; exact Open path remains available.</div> : null}
    <div className="repository-observation" role="status" title={`Captured ${observation.capturedAt}; ${observation.observationId}`}>
      {actions.pending ? "Observing… · " : ""}{observation.state === "observed" ? "" : `${observation.state} · `}{observation.complete ? `${observation.capturedCount} entries` : `partial directory · ${observation.capturedCount} captured`}{observation.filter ? ` · filter: ${observation.filter}` : ""}
      {observation.notice ? <span>{observation.notice}</span> : null}
      {observation.reveal?.status === "outside-capture" ? <span>{observation.reveal.path} is outside this partial directory capture. Source opening is independent.</span> : null}
      {observation.reveal?.status === "absent" ? <span>{observation.reveal.path} is absent from this observation; Refresh to observe current entries.</span> : null}
      {observation.reveal?.status === "unsupported" ? <span>{observation.reveal.path} cannot be activated in this repository slice.</span> : null}
    </div>
    {observation.pageCount > 1 ? <div className="repository-page-controls"><button aria-label="Previous directory page" disabled={observation.page === 0} onClick={() => void actions.page(observation.page - 1)}>‹</button><span>Page {observation.page + 1} / {observation.pageCount} · {observation.filteredCount} matching captured entries</span><button aria-label="Next directory page" disabled={observation.page + 1 >= observation.pageCount} onClick={() => void actions.page(observation.page + 1)}>›</button></div> : null}
  </div>;
}
