import { useEffect, useRef, useState } from "react";
import type { SwarmBridge } from "../electron/preload";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../protocol/schema";
import { WorktreeInspectionRequestSchema, type WorktreeInspectionResult } from "../../protocol/worktree-inspection";

export interface WorktreeSelection { sessionId: string; path: string; patch?: string }

/** Inspection never enters the editable buffer store or sends a write request. */
export function WorktreeInspection({ selection, bridge, generation, onReturn }: {
  selection: WorktreeSelection; bridge: SwarmBridge | undefined; generation: number; onReturn(): void;
}) {
  const [result, setResult] = useState<WorktreeInspectionResult | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<"source" | "diff" | "patch">(selection.patch ? "patch" : "source");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [selection]);
  useEffect(() => {
    let current = true;
    setResult(null); setNotice("");
    if (!bridge) { setNotice("Local core unavailable. Try again when connected."); return; }
    const parsed = WorktreeInspectionRequestSchema.safeParse({ protocolVersion: PROTOCOL_VERSION,
      requestId: `worktree:${crypto.randomUUID()}`, type: "worktree.inspect", sessionId: selection.sessionId, path: selection.path });
    if (!parsed.success) { setNotice("This event does not name a repository-relative file. Open the agent to inspect its command."); return; }
    const request = parsed.data;
    void bridge.request(request).then((raw) => {
      const response = parseCoreResponseForRequest(raw, request);
      if (!response.ok) throw new Error(response.error.message);
      if (!response.worktreeInspection) throw new Error("Worktree file unavailable");
      if (current) setResult(response.worktreeInspection);
    }).catch((error: unknown) => { if (current) setNotice(error instanceof Error ? error.message : "Worktree file unavailable"); });
    return () => { current = false; };
  }, [bridge, generation, selection.sessionId, selection.path, refresh]);
  const shown = result?.sessionId === selection.sessionId && result.path === selection.path ? result : null;
  const diff = view === "patch" ? selection.patch ?? "" : shown?.diff ?? "";
  return <section className="worktree-inspection" aria-label="Agent worktree file">
    <header><div><small>{shown?.label ?? "Agent worktree"} · read-only</small><h2 ref={heading} tabIndex={-1}>{selection.path}</h2></div>
      <button onClick={onReturn}>Return to source</button></header>
    {shown ? <p className="worktree-location" title={shown.worktree}>{shown.worktree}</p> : null}
    <nav aria-label="Worktree file views"><button aria-pressed={view === "source"} onClick={() => setView("source")}>Source</button>
      {selection.patch ? <button aria-pressed={view === "patch"} onClick={() => setView("patch")}>Recorded patch</button> : null}
      <button aria-pressed={view === "diff"} onClick={() => setView("diff")}>Worktree diff</button>
      <button onClick={() => setRefresh((value) => value + 1)}>Refresh file</button></nav>
    {notice ? <p role="status">{notice}</p> : !shown ? <p role="status">Reading worktree…</p> : null}
    {view === "source" && shown ? shown.content === null ? <p>File no longer exists. See its worktree diff.</p> : <pre className="worktree-source" tabIndex={0}>{shown.content}</pre> : null}
    {view !== "source" && (view === "patch" ? selection.patch : shown) ? <div className="worktree-diff" tabIndex={0}>
      {view === "diff" ? <p>Current changes against HEAD in this worktree.</p> : null}
      {view === "diff" && shown?.diffNotice ? <p role="status">{shown.diffNotice}</p> : null}
      {diff ? <pre>{diff.split("\n").map((line, index) => <span key={index} className={line.startsWith("+") ? "patch-addition" : line.startsWith("-") ? "patch-deletion" : ""}>{line}{"\n"}</span>)}</pre> : view === "diff" && !shown?.diffNotice ? <p>No tracked changes for this file.</p> : null}
    </div> : null}
  </section>;
}
