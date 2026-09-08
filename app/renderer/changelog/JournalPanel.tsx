import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import { ChangelogRequestSchema, entryEvidence, type ChangelogResult } from "../../../protocol/changelog";
import "./journal.css";
import { GithubPullRequests, type GithubPrState } from "./GithubPullRequests";
import { ActivityTime } from "../ActivityTime";

const kinds = { "git-observation": "Git observation", "agent-report": "Agent reported", "recorded-check": "Recorded check · not rerun",
  "recorded-artifact": "Recorded artifact", synthetic: "Synthetic evidence" };

export function useJournal(repositoryId: string | null, coreGeneration: number | null) {
  const [observation, setObservation] = useState<ChangelogResult | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), prior = useRef<ChangelogResult | null>(null);
  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    if (!window.swarm || !repositoryId || coreGeneration === null) { setNotice("Local core unavailable; retained entries are not a fresh observation."); setBusy(false); return; }
    setBusy(true); setNotice("");
    const request = ChangelogRequestSchema.parse({ type: "changelog.read", repositoryId,
      protocolVersion: PROTOCOL_VERSION, requestId: `journal:${crypto.randomUUID()}` });
    try {
      const response = parseCoreResponseForRequest(await window.swarm.request(request), request);
      if (current !== epoch.current) return;
      if (!response.ok) throw new Error(response.error.message);
      if (!response.changelog) throw new Error("Journal observation missing");
      const next = response.changelog;
      if (prior.current?.repositoryId === repositoryId && Date.parse(next.bundle.exportedAt) < Date.parse(prior.current.bundle.exportedAt))
        throw new Error("An older evidence export was offered; newer retained entries were not replaced.");
      prior.current = next; setObservation(next);
    } catch (error) {
      if (current === epoch.current) setNotice(error instanceof Error ? error.message : "Journal unavailable; previous observation retained.");
    } finally { if (current === epoch.current) setBusy(false); }
  }, [repositoryId, coreGeneration]);
  useEffect(() => {
    void refresh();
    return () => { ++epoch.current; };
  }, [refresh]);
  return { observation: observation?.repositoryId === repositoryId ? observation : null, notice, busy, refresh };
}
export type JournalState = ReturnType<typeof useJournal>;

function EvidenceTime({ entry, observation }: { entry: ChangelogResult["document"]["entries"][number]; observation: ChangelogResult }) {
  const times = entryEvidence(entry, observation.bundle).map((item) => Date.parse(item.at)).filter(Number.isFinite);
  if (!times.length) return <span className="journal-entry-time">Evidence time not recorded</span>;
  const first = Math.min(...times), last = Math.max(...times);
  return <span className="journal-entry-time">Evidence <ActivityTime at={new Date(first).toISOString()} />{last !== first ? <> – <ActivityTime at={new Date(last).toISOString()} /></> : null}</span>;
}

function JournalFreshness({ observation }: { observation: ChangelogResult }) {
  return <div className="journal-freshness">
    <span>Generated <ActivityTime at={observation.document.generatedAt} /></span>
    <span>Last read <ActivityTime at={observation.observedAt} /></span>
    <span>Saved report · not live · Refresh reads the report</span>
  </div>;
}

export function JournalActivity({ state, onOpen }: { state: JournalState; onOpen(entryId?: string): void }) {
  return <div className="journal-activity">
    {state.notice ? <p>{state.observation ? "Retained account · refresh needed" : "No recorded summary available"}</p> : null}
    {state.observation ? <JournalFreshness observation={state.observation} /> : null}
    {state.observation?.document.entries.slice(0, 5).map((entry) => <button className="journal-activity-entry" key={entry.id} onClick={() => onOpen(entry.id)}><span>{entry.headline}</span><small>Recorded · {entry.state}</small><EvidenceTime entry={entry} observation={state.observation!} /></button>)}
    {state.busy ? <p>Reading recorded changes…</p> : null}
  </div>;
}

export function JournalPanel({ open, state, selectedEntry, selectionVersion = 0, onClose, onOpenSource, pullRequests }: {
  open: boolean; state: JournalState; selectedEntry: string | null; selectionVersion?: number; onClose(): void; onOpenSource(path: string): void;
  pullRequests?: GithubPrState;
}) {
  const { observation, notice, busy, refresh } = state;
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"changes" | "prs">("changes");
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [pendingEntry, setPendingEntry] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (selectedEntry) { setView("changes"); setFilter(""); setPendingEntry(selectedEntry); }
    else heading.current?.focus();
  }, [selectedEntry, selectionVersion, open, observation?.document.inputDigest]);
  useLayoutEffect(() => {
    if (!open || !pendingEntry || filter) return;
    const element = [...(body.current?.querySelectorAll<HTMLDetailsElement>("[data-change-id]") ?? [])].find((node) => node.dataset.changeId === pendingEntry);
    if (element) { element.open = true; element.scrollIntoView?.({ block: "nearest" }); element.querySelector("summary")?.focus(); setPendingEntry(null); }
  }, [pendingEntry, filter, open, view, observation?.document.inputDigest]);

  const bundle = observation?.bundle;
  const paths = [...new Set(bundle?.evidence.flatMap((item) => item.paths) ?? [])].sort();
  const entries = observation?.document.entries.filter((entry) => !filter || entryEvidence(entry, observation.bundle).some((item) => item.paths.includes(filter))) ?? [];
  return <section className="journal-panel" aria-label="Activity log" hidden={!open} data-journal-digest={observation?.document.inputDigest ?? ""}>
    <header className="journal-header"><div><h2 ref={heading} tabIndex={-1}>Activity log</h2></div>
      <div className="journal-controls"><button onClick={() => void refresh()} disabled={busy} aria-label="Refresh logical changes">{busy ? "Reading…" : "Refresh"}</button><button onClick={onClose} aria-label="Close logical changes">×</button></div></header>
    {pullRequests ? <nav className="journal-view-tabs" aria-label="Activity views"><button aria-pressed={view === "changes"} onClick={() => setView("changes")}>Changes</button><button aria-pressed={view === "prs"} onClick={() => setView("prs")}>Pull requests</button></nav> : null}
    <div className="journal-body" ref={body}>
      {pullRequests ? <div hidden={view !== "prs"}><GithubPullRequests state={pullRequests} onOpenSource={onOpenSource} /></div> : null}
      <div hidden={Boolean(pullRequests && view !== "changes")}>
      {notice ? <p role="status" className="journal-warning">{observation ? "Retained · " : "Unavailable · "}{notice}</p> : null}
      {busy && observation ? <p className="journal-warning">Retained while observing the current artifacts…</p> : null}
      {!observation && !busy ? <p className="journal-empty">No recorded activity summary. <code>docs/logical-changelog.md</code> describes how to add one.</p> : null}
      {observation ? <>
        <div className="journal-coverage"><span className="journal-badge">Recorded activity · {observation.state === "recorded-head" ? "through observed HEAD" : "earlier repository history"}</span><p>Summarized by {observation.document.generator.name}. Working edits are not included.</p></div>
        <JournalFreshness observation={observation} />
        <label className="journal-filter">Affected file <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All evidence</option>{paths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label>
        {!entries.length ? <p>No logical changes cite this exact path in the current bundle.</p> : null}
        <ol className="journal-cards">{entries.map((entry) => {
          const evidence = entryEvidence(entry, observation.bundle);
          return <li key={`${observation.document.inputDigest}:${entry.id}`}><details className="journal-card" data-change-id={entry.id}>
            <summary><span className="journal-card-top"><span className="journal-state">{entry.state}</span><span>{entry.reasoning === "reconstructed" ? "Reconstructed · not causal proof" : "Reported account"}</span></span><strong>{entry.headline}</strong><EvidenceTime entry={entry} observation={observation} /><p>{entry.outcome.text}</p><span className="journal-expand">{evidence.length} sources · inspect change ↗</span></summary>
            <div className="journal-details"><h4>Who / on what task</h4><p>Agents: {[...new Set(evidence.flatMap((item) => item.agentIds))].join(", ") || "No agent association in the supplied evidence"}</p><p>Tasks: {[...new Set(evidence.flatMap((item) => item.taskIds))].join(", ") || "No task association in the supplied evidence"}</p><p className="journal-fine">Associations are explicitly recorded, not inferred from file edits.</p><h4>Intent / rationale</h4><p>{entry.intent.text}</p><h4>Actions / observed outcome</h4><p>{entry.outcome.text}</p><h4>Suggested operator decision</h4><p>{entry.decision.text}</p>
              {entry.caveats.length ? <ul className="journal-caveats">{entry.caveats.map((caveat, index) => <li key={index}>{caveat}</li>)}</ul> : null}
              <h4>Evidence, not authority</h4><p className="journal-fine">Citations validate source membership, not the truth of generated prose. Imported checks are recorded, not rerun.</p>
              {evidence.map((item) => <details className="journal-evidence" key={item.id}><summary><span>{kinds[item.kind]}</span> {item.title}</summary><div><code>{item.id}</code><p>{item.detail}</p><p className="journal-fine">{item.source} · <ActivityTime at={item.at} /> · revision {item.revision}</p>
                <p className="journal-fine">Cited by {[['intent', entry.intent], ['outcome', entry.outcome], ['decision', entry.decision]].filter(([, claim]) => typeof claim !== "string" && claim.evidenceIds.includes(item.id)).map(([name]) => String(name)).join(", ")}</p>
                {item.paths.length ? <div className="journal-paths">{item.paths.map((path) => <button key={path} onClick={() => onOpenSource(path)} title="Open current working file; recorded bytes may differ">Open working file · {path}</button>)}</div> : null}
                {item.omittedPaths ? <p>{item.omittedPaths} paths outside this bounded record.</p> : null}
                {item.agentIds.length ? <p>Attributed agents: {item.agentIds.join(", ")}</p> : null}{item.taskIds.length ? <p>Recorded task IDs: {item.taskIds.join(", ")}</p> : null}
              </div></details>)}
            </div></details></li>;
        })}</ol>
        <details className="journal-provenance"><summary>Coverage & generation provenance</summary><p>{observation.bundle.coverage}</p><ul>{observation.bundle.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul><p>Exported {observation.bundle.exportedAt} · Generated {observation.document.generatedAt} · Observed {observation.observedAt}</p><p>Input digest <code>{observation.document.inputDigest}</code></p><p>Generator {observation.document.generator.name} · run {observation.document.generator.run}</p><p>Instructions digest <code>{observation.document.generator.instructionsDigest}</code></p></details>
      </> : null}
      </div>
    </div>
  </section>;
}
