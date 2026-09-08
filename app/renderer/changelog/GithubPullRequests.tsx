import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import { GithubPrRequestSchema, type GithubPrObservation } from "../../../protocol/github-prs";

export function useGithubPullRequests(repositoryId: string | null, worldId: string | null, coreGeneration: number | null) {
  const [retained, setRetained] = useState<{ observation: GithubPrObservation; generation: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useLayoutEffect(() => { ++epoch.current; setBusy(false); setNotice(""); return () => { ++epoch.current; }; }, [repositoryId, worldId, coreGeneration]);
  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    if (!window.swarm || !repositoryId || !worldId || coreGeneration === null) { setNotice("Local core unavailable."); setBusy(false); return; }
    setBusy(true); setNotice("");
    const request = GithubPrRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: `github-prs:${crypto.randomUUID()}`,
      type: "githubPrs.refresh", repositoryId, worldId });
    try {
      const response = parseCoreResponseForRequest(await window.swarm.request(request), request);
      if (current !== epoch.current) return;
      if (!response.ok || !response.githubPrs) throw new Error("Unavailable");
      setRetained({ observation: response.githubPrs, generation: coreGeneration });
    } catch {
      if (current === epoch.current) setNotice("GitHub unavailable. Check origin, gh login, or connection; then Refresh.");
    } finally { if (current === epoch.current) setBusy(false); }
  }, [repositoryId, worldId, coreGeneration]);
  const observation = retained?.observation.repositoryId === repositoryId && retained.observation.worldId === worldId ? retained.observation : null;
  return { observation, notice, busy, refresh, stale: Boolean(observation && (busy || notice || retained?.generation !== coreGeneration)) };
}
export type GithubPrState = ReturnType<typeof useGithubPullRequests>;

export function GithubPullRequests({ state, onOpenSource }: { state: GithubPrState; onOpenSource(path: string): void }) {
  const { observation, busy, notice, stale, refresh } = state;
  return <section className="github-prs" aria-label="GitHub pull requests">
    <header><div><h3>Pull requests</h3><p>{observation ? observation.githubRepository : "Opened repository · GitHub origin"}</p></div>
      <button onClick={() => void refresh()} disabled={busy} aria-label="Refresh pull requests">{busy ? "Fetching…" : "Refresh PRs"}</button></header>
    {notice ? <p role="status" className="github-pr-notice">{observation ? "Showing previous results. " : ""}{notice}</p> : null}
    {!observation && !notice ? <p className="github-pr-empty">{busy ? "Reading GitHub…" : "Choose Refresh PRs to load pull requests."}</p> : null}
    {observation ? <><p className="github-pr-coverage">{stale ? "Previous results" : "Fetched from GitHub"} · {new Date(observation.observedAt).toLocaleString()} · up to 20 recent PRs, all states</p>
      {!observation.pullRequests.length ? <p className="github-pr-empty">No pull requests</p> : <ol>{observation.pullRequests.map((pr) => <li key={pr.number}><details>
        <summary><span className={`github-pr-state github-pr-${pr.state.toLowerCase()}`}>{pr.isDraft && pr.state === "OPEN" ? "Draft" : pr.state.toLowerCase()}</span><strong>{pr.title}</strong><span>#{pr.number}</span></summary>
        <div className="github-pr-detail"><p>{pr.author} · updated {new Date(pr.updatedAt).toLocaleString()}</p><p className="github-pr-url">{pr.url}</p>
          <p>{pr.changedFiles} changed files{pr.paths.length < pr.changedFiles ? ` · showing ${pr.paths.length}` : ""}</p>
          <div className="journal-paths">{pr.paths.map((path) => <button key={path} onClick={() => onOpenSource(path)} title="Open the current working file, not the PR version. The file may have moved or been deleted.">Open working file · {path}</button>)}</div>
        </div></details></li>)}</ol>}
      <details className="journal-provenance"><summary>PR coverage</summary><p>These PR details come from GitHub. File links open your current working copy, not the PR version; deleted or branch-only files may be unavailable.</p></details>
    </> : null}
  </section>;
}
