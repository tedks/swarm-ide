import { useEffect, useState } from "react";
import type { SwarmBridge } from "../electron/preload";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../protocol/schema";
import { WorktreeBrowseRequestSchema, type WorktreeBrowseResult } from "../../protocol/worktree-inspection";
import { WorktreeInspection } from "./WorktreeInspection";
import "./agent-worktree-browser.css";

/** This surface never enters the original workspace buffer store. */
export function AgentWorktreeBrowser(props: {
  sessionId: string; bridge: SwarmBridge | undefined; generation: number; onReturn(): void; initialPath?: string;
}) {
  // An agent change remounts navigation before a previous agent's path can be queried.
  return <Browser key={props.sessionId} {...props} />;
}

function Browser({ sessionId, bridge, generation, onReturn, initialPath }: {
  sessionId: string; bridge: SwarmBridge | undefined; generation: number; onReturn(): void; initialPath?: string;
}) {
  const [directory, setDirectory] = useState(initialPath?.split("/").slice(0, -1).join("/") ?? "");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ path: string; diff: boolean } | null>(initialPath ? { path: initialPath, diff: false } : null);
  const [result, setResult] = useState<WorktreeBrowseResult | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setNotice(""); setResult(null);
    const parsed = WorktreeBrowseRequestSchema.safeParse({ protocolVersion: PROTOCOL_VERSION,
      requestId: `browse-worktree:${crypto.randomUUID()}`, type: "worktree.browse", sessionId, directory, page });
    if (!bridge || !parsed.success) { setNotice("Worktree browsing is unavailable. Reconnect or select a registered agent."); setLoading(false); return; }
    const request = parsed.data;
    void bridge.request(request).then((raw) => {
      const response = parseCoreResponseForRequest(raw, request);
      if (!response.ok) throw new Error(response.error.message);
      if (current) setResult(response.worktreeBrowse!);
    }).catch((error: unknown) => { if (current) setNotice(error instanceof Error ? error.message : "Worktree unavailable"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [sessionId, bridge, generation, directory, page, refresh]);
  const shown = result?.sessionId === sessionId && result.directory.directory === directory && result.directory.page === page ? result : null;
  const navigate = (path: string) => { setDirectory(path); setPage(0); };
  return <section className="agent-worktree-browser" aria-label="Agent worktree browser">
    <header className="agent-worktree-heading"><div><strong>{shown?.label ?? "Agent"} / Worktree</strong>
      <p>{shown?.branch ?? "Detached checkout"} · Compare with {shown?.base ?? "master"}</p>
      {shown ? <small title={shown.worktree}>{shown.worktree}</small> : null}</div>
      <button onClick={onReturn}>Return to workspace</button></header>
    <div className="agent-worktree-columns"><aside aria-label="Worktree navigation">
      <nav aria-label="Worktree directories"><button onClick={() => navigate("")}>Root</button>
        <button disabled={!directory} onClick={() => navigate(directory.split("/").slice(0, -1).join("/"))}>Up</button>
        <button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button></nav>
      <h3>{directory || "/"}</h3>
      {notice ? <p role="status">{notice}</p> : loading ? <p role="status">Reading worktree…</p> : null}
      {shown ? <><ul className="worktree-file-list">{shown.directory.entries.map((entry) => <li key={entry.id}>
        <button disabled={!entry.actionable} title={entry.reason ?? entry.path ?? entry.label} onClick={() => {
          if (!entry.path) return;
          if (entry.kind === "directory") navigate(entry.path); else setSelected({ path: entry.path, diff: false });
        }}>{entry.kind === "directory" ? "▸ " : ""}{entry.label}</button>
      </li>)}</ul>
        {shown.directory.pageCount > 1 ? <nav aria-label="Directory pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page + 1} / {shown.directory.pageCount}</span><button disabled={page + 1 >= shown.directory.pageCount} onClick={() => setPage(page + 1)}>Next</button></nav> : null}
        {shown.directory.notice || !shown.directory.complete ? <p>{shown.directory.notice ?? "Partial directory listing"}</p> : null}
        <h3>Changes vs {shown.base ?? "master"}</h3>
        {shown.notice ? <p role="status">{shown.notice}</p> : null}
        {shown.changes.length === 0 && shown.changesComplete ? <p className="worktree-muted">No changes</p> : null}
        <ul className="worktree-change-list">{shown.changes.map((change) => <li key={`${change.status}:${change.path}`}>
          <button title={change.previousPath ? `${change.previousPath} → ${change.path}` : change.path}
            onClick={() => setSelected({ path: change.path, diff: change.status !== "untracked" })}>
            <small>{change.status}</small> {change.path}{change.previousPath ? <span> ← {change.previousPath}</span> : null}
          </button></li>)}</ul>
      </> : null}
    </aside><main>
      {selected ? <WorktreeInspection key={`${sessionId}:${selected.path}:${selected.diff}:${refresh}`} selection={{ sessionId, path: selected.path }}
        bridge={bridge} generation={generation} comparison="master" initialView={selected.diff ? "diff" : "source"} onReturn={() => setSelected(null)} />
        : <div className="worktree-empty"><h2>Explore this agent’s worktree</h2><p>Open a directory, file, or change. Your original workspace stays where you left it.</p></div>}
    </main></div>
  </section>;
}
