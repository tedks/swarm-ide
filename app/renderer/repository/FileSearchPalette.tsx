import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FILE_SEARCH_STALE_MS, type RepositorySearchResult } from "../../../protocol/repository-search";
import type { BazelPaletteOperation, BazelPaletteTarget, BazelTargetCatalogue } from "../build-resources/bazel-palette";

export interface PaletteCommand { label: string; detail: string; run(): void }
interface TargetMode {
  operation: BazelPaletteOperation;
  catalogue: BazelTargetCatalogue;
  workspace: string;
  diskOnly: boolean;
  refreshDisabled: boolean;
  blockedReason?: string;
  onRefresh(): void;
  onActivate(target: BazelPaletteTarget): void;
}
interface Props {
  query: string; onQuery(query: string): void; exact: boolean; commands: PaletteCommand[]; target?: TargetMode;
  inputRef: RefObject<HTMLInputElement | null>; focusLabel: string; onCancel(): void; onOpen(path: string): void;
  search: { loading: boolean; result?: RepositorySearchResult; error?: string; refresh(): void };
}
export function FileSearchPalette({ query, onQuery, exact, commands, target, inputRef, focusLabel, onCancel, onOpen, search }: Props) {
  const [selection, setSelection] = useState(0);
  const [aged, setAged] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const targetActivated = useRef(false);
  const lastResultHeight = useRef(0);
  const result = search.result;
  const shownCommands = target ? [] : commands;
  const paths = exact || target ? [] : result?.paths ?? [];
  const targets = target?.catalogue.rows ?? [];
  const count = shownCommands.length + paths.length + targets.length;
  const active = Math.min(selection, Math.max(0, count - 1));
  useEffect(() => { setSelection(0); }, [query, exact, target?.operation, target?.catalogue.authority]);
  useEffect(() => { targetActivated.current = false; }, [target?.operation, target?.catalogue.authority]);
  useEffect(() => {
    setAged(false);
    if (!result) return;
    const timer = setTimeout(() => setAged(true), Math.max(0, Date.parse(result.capturedAt) + FILE_SEARCH_STALE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [result]);
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  useLayoutEffect(() => { if (!search.loading) lastResultHeight.current = list.current?.getBoundingClientRect().height ?? 0; }, [search.loading, result, shownCommands.length, targets.length]);
  const run = (index: number) => {
    if (index < shownCommands.length) { shownCommands[index]!.run(); return; }
    const pathIndex = index - shownCommands.length;
    if (pathIndex < paths.length) { onOpen(paths[pathIndex]!); return; }
    const candidate = targets[pathIndex - paths.length];
    if (!candidate?.ready || targetActivated.current || !target) return;
    targetActivated.current = true;
    target.onActivate(candidate);
  };
  const stale = aged || result?.state === "stale";
  return <div className="palette-scrim" onMouseDown={onCancel}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command and file search" onMouseDown={(event) => event.stopPropagation()}>
      <header><span>⌕</span><input ref={inputRef} aria-label={exact ? "Exact repository path" : target ? `Bazel ${target.operation} target` : "Workspace command"}
        aria-controls="workspace-search-results" aria-activedescendant={count ? `workspace-search-${active}` : undefined}
        value={query} onChange={(event) => { setSelection(0); onQuery(event.target.value); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); event.stopPropagation(); setSelection((active + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, count)) % Math.max(1, count)); return;
          }
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!event.repeat && count) run(active); }
        }} placeholder={exact ? "Exact relative path, e.g. core/files.ts" : target ? "Filter exact Bazel labels…" : "Find a filename, path fragment or command…"} /><kbd>esc</kbd></header>
      {target ? <div className="bazel-palette-status" role="status" data-catalogue-state={target.catalogue.state}>
        <strong>{target.operation === "test" ? "Bazel test" : "Bazel build"} · {target.workspace}</strong>
        <span>{target.catalogue.message}</span>
        {target.blockedReason ? <small className="bazel-palette-blocked">{target.blockedReason}</small> : null}
        {target.diskOnly ? <small>Uses files on disk · unsaved source changes are not included.</small> : <small>Uses the current worktree's files on disk.</small>}
        <button type="button" disabled={target.refreshDisabled || target.catalogue.state === "refreshing"} onClick={() => { inputRef.current?.focus({ preventScroll: true }); target.onRefresh(); }}>Refresh Bazel targets</button>
      </div> : !exact && query ? <div className="file-search-status" role="status">
        <span>{search.loading ? "Finding repository filenames…" : search.error ? `Search unavailable: ${search.error}` : result ?
          `${stale ? "Needs refresh" : "Last scanned"} · ${result.complete ? "complete" : "partial"} file list · ${result.capturedCount} names · ${new Date(result.capturedAt).toLocaleTimeString()}` : "Filename search unavailable"}</span>
        {result ? <small>{result.notice}{stale && result.state !== "stale" ? " Refresh to check for newer files." : ""}</small> : null}
        {!search.loading ? <button onClick={() => { inputRef.current?.focus({ preventScroll: true }); search.refresh(); }}>Refresh filenames</button> : null}
      </div> : null}
      <div className="command-results" id="workspace-search-results" ref={list} aria-label="Commands and repository files"
        style={{ minHeight: search.loading ? Math.min(lastResultHeight.current, 320) : undefined }}>
        {shownCommands.map((command, index) => <button id={`workspace-search-${index}`} aria-current={active === index} key={command.label} onClick={() => run(index)}>
          <span>{command.label}<small>{command.detail}</small></span><kbd>↵</kbd></button>)}
        {paths.map((path, offset) => <button id={`workspace-search-${shownCommands.length + offset}`} aria-current={active === shownCommands.length + offset} key={`file:${path}`}
          data-file-search-path={path} onClick={() => onOpen(path)}>
          <span>{path.slice(path.lastIndexOf("/") + 1)}<small>{path}</small></span><kbd>file ↵</kbd></button>)}
        {targets.map((candidate, offset) => { const index = shownCommands.length + paths.length + offset; return <button id={`workspace-search-${index}`}
          aria-current={active === index} aria-label={`${candidate.operation === "test" ? "Test" : "Build"} ${candidate.label}`} key={`${candidate.operation}:${candidate.label}`}
          disabled={!candidate.ready} onClick={() => run(index)}>
          <span><code>{candidate.label}</code><small>{candidate.ruleClass}</small></span><kbd>{candidate.operation} ↵</kbd></button>; })}
        {!target && !exact && result && !paths.length ? <p className="file-search-empty">{result.complete && result.matchesComplete ? "No matching file in the last scan." : "No match in the files searched so far."} Refresh filenames or use Open repository path.</p> : null}
        {target && !targets.length ? <p className="file-search-empty">No matching observed {target.operation === "test" ? "test" : "build"} rule. Try another literal label fragment or refresh the catalogue.</p> : null}
      </div>
      <footer><span>Current focus: {focusLabel}</span><span>{exact ? "exact path · file opener" : target ? "↑↓ choose · Enter runs one exact target · Escape cancels" : "↑↓ choose · Enter opens · Escape cancels"}</span></footer>
    </section>
  </div>;
}
