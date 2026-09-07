import { useEffect, useRef, useState, type RefObject } from "react";
import { FILE_SEARCH_STALE_MS, type RepositorySearchResult } from "../../../protocol/repository-search";

interface Command { label: string; detail: string; run(): void }
interface Props {
  query: string; onQuery(query: string): void; exact: boolean; commands: Command[];
  inputRef: RefObject<HTMLInputElement | null>; focusLabel: string; onCancel(): void; onOpen(path: string): void;
  search: { loading: boolean; result?: RepositorySearchResult; error?: string; refresh(): void };
}
export function FileSearchPalette({ query, onQuery, exact, commands, inputRef, focusLabel, onCancel, onOpen, search }: Props) {
  const [selection, setSelection] = useState(0);
  const [aged, setAged] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const result = search.result;
  const paths = exact ? [] : result?.paths ?? [];
  const count = commands.length + paths.length;
  const active = Math.min(selection, Math.max(0, count - 1));
  useEffect(() => { setSelection(0); }, [query, exact]);
  useEffect(() => {
    setAged(false);
    if (!result) return;
    const timer = setTimeout(() => setAged(true), Math.max(0, Date.parse(result.capturedAt) + FILE_SEARCH_STALE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [result]);
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  const run = (index: number) => {
    const command = commands[index];
    if (command) command.run();
    else if (paths[index - commands.length]) onOpen(paths[index - commands.length]!);
  };
  const stale = aged || result?.state === "stale";
  return <div className="palette-scrim" onMouseDown={onCancel}>
    <section className="command-palette" aria-label="Command and file search" onMouseDown={(event) => event.stopPropagation()}>
      <header><span>⌕</span><input ref={inputRef} aria-label={exact ? "Exact repository path" : "Workspace command"}
        aria-controls="workspace-search-results" aria-activedescendant={count ? `workspace-search-${active}` : undefined}
        value={query} onChange={(event) => { setSelection(0); onQuery(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setSelection((active + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, count)) % Math.max(1, count));
          }
          if (event.key === "Enter" && count) { event.preventDefault(); run(active); }
        }} placeholder={exact ? "Exact relative path, e.g. core/files.ts" : "Find a filename, path fragment or command…"} /><kbd>esc</kbd></header>
      {!exact && query ? <div className="file-search-status" role="status">
        <span>{search.loading ? "Finding repository filenames…" : search.error ? `Search unavailable: ${search.error}` : result ?
          `${stale ? "Stale" : "Captured"} · ${result.complete ? "complete" : "partial"} Git name inventory · ${result.capturedCount} names · ${new Date(result.capturedAt).toLocaleTimeString()}` : "Filename search unavailable"}</span>
        {result ? <small>{result.notice}{stale && result.state !== "stale" ? " Capture is now stale; Refresh explicitly." : ""}</small> : null}
        {!search.loading ? <button onClick={search.refresh}>Refresh filenames</button> : null}
      </div> : null}
      <div className="command-results" id="workspace-search-results" ref={list} aria-label="Commands and repository files">
        {commands.map((command, index) => <button id={`workspace-search-${index}`} aria-current={active === index} key={command.label} onClick={() => run(index)}>
          <span>{command.label}<small>{command.detail}</small></span><kbd>↵</kbd></button>)}
        {paths.map((path, offset) => <button id={`workspace-search-${commands.length + offset}`} aria-current={active === commands.length + offset} key={`file:${path}`}
          data-file-search-path={path} onClick={() => onOpen(path)}>
          <span>{path.slice(path.lastIndexOf("/") + 1)}<small>{path}</small></span><kbd>file ↵</kbd></button>)}
        {!exact && result && !paths.length ? <p className="file-search-empty">{result.complete && result.matchesComplete ? "No matching eligible file in this captured inventory." : "No match in this partial search; this does not prove the file is absent."} Use Refresh or exact Open path.</p> : null}
      </div>
      <footer><span>Current focus: {focusLabel}</span><span>{exact ? "exact path · file opener" : "↑↓ choose · Enter opens · Escape cancels"}</span></footer>
    </section>
  </div>;
}
