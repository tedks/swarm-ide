import { useEffect } from "react";
import type { TrustedSnapshot } from "../../../protocol/trusted-local";
import type { LiveAgentState } from "./live-state";
import type { SwarmBridge } from "../../electron/preload";
import { emptyComposer } from "./fleet-state";
import { useTrustedFleet, type TrustedSelection } from "./use-trusted-fleet";
import { TrustedForkControl } from "../../components/TrustedForkControl";
import "./trusted-local.css";

export function TrustedLocalPane({ draft, bridge, generation = 0, connected, selection, onSnapshot }: {
  draft: LiveAgentState["draft"]; bridge?: SwarmBridge; generation?: number; connected: boolean;
  selection?: TrustedSelection; onSnapshot?: (snapshot: TrustedSnapshot | null) => void;
}) {
  const cockpit = useTrustedFleet({ bridge, connected, generation, selection, onSnapshot });
  const { fleet, selected: state, prepared, confirmed } = cockpit;
  const input = draft ? { worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
    model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null },
    ...(draft.taskReference ? { taskReference: draft.taskReference } : {}) } : null;
  const inputKey = JSON.stringify(input);
  useEffect(() => { cockpit.setConfirmed(false); }, [inputKey, cockpit.setConfirmed]);
  const active = state && !state.archived && ["starting", "running", "ready", "stopping"].includes(state.status);
  const composer = fleet.selected ? fleet.composers[fleet.selected] ?? emptyComposer : emptyComposer;
  const runPending = fleet.selected ? cockpit.pending[fleet.selected] ?? false : false;
  const showPreparation = cockpit.newConversation || !fleet.summaries.length;
  const lineage = state?.runToken ? fleet.summaries.find((run) => run.runToken === state.runToken)?.fork : undefined;
  const parent = lineage ? fleet.summaries.find((run) => run.runToken === lineage.parentRunToken) : undefined;
  return <section className="trusted-local" aria-label="Trusted-local Codex">
    <header><strong>Codex · trusted local</strong><small>{state?.status ?? "unobserved"}</small></header>
    <p className="trusted-profile">Uses your normal Codex account, tools and approvals.</p>
    <div className="trusted-fleet-toolbar">
      <button type="button" disabled={!connected} onClick={cockpit.refresh}>Observe conversations</button>
      {fleet.summaries.length ? <button type="button" onClick={cockpit.begin}>New conversation</button> : null}
    </div>
    {cockpit.workspace ? <p className="trusted-workspace">Workspace: {cockpit.workspace}</p> : null}
    {fleet.summaries.length ? <nav className="trusted-fleet-list" aria-label="Trusted-local conversations">
      {fleet.summaries.map((run) => <button key={run.runToken} type="button" aria-pressed={fleet.selected === run.runToken}
        data-run-token={run.runToken} onClick={() => cockpit.select(run.runToken)} title={run.message}>
        <span>{run.title}</span><small>{run.archived ? "Archived · " : ""}{run.status}{run.approvalCount ? ` · ${run.approvalCount} approval${run.approvalCount === 1 ? "" : "s"}` : ""}</small>
        {run.fork ? <small>{run.fork.confirmed ? "Child conversation" : "Fork requested"}</small> : null}
      </button>)}
    </nav> : null}
    {showPreparation ? <div className="trusted-new-conversation">
      <button type="button" disabled={!connected || cockpit.preparationPending || !input || draft?.focus.domain !== "repo" || !draft.focus.path}
        onClick={() => { if (input) cockpit.prepare(input, inputKey); }}>Prepare trusted-local context</button>
      {!draft ? <small>Open an agent draft from a source file to choose instructions.</small> : <small>Uses the fixed draft source and attached task. Save first to include editor changes.</small>}
      {prepared && prepared.inputKey === inputKey ? <div className="trusted-review">
        <details><summary>Exact prompt · {prepared.value.model ?? "configured model"}</summary><pre>{prepared.value.prompt}</pre></details>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => cockpit.setConfirmed(event.target.checked)} />Launch in this workspace with normal Codex permissions</label>
        <button type="button" className="agent-primary" disabled={!confirmed || cockpit.preparationPending || !connected} onClick={cockpit.launch}>Launch trusted-local Codex</button>
      </div> : null}
    </div> : null}
    {cockpit.preparationNotice ? <p role="status">{cockpit.preparationNotice}</p> : null}
    {fleet.selected && !state ? <p role="status">Loading conversation… Controls will be available when it is connected.</p> : null}
    {state?.runToken ? <div className="trusted-selected-run" data-run-token={state.runToken}>
      {lineage ? <p className="trusted-fork-lineage">{lineage.confirmed ? "Fork of" : "Fork requested from"} {parent?.title || "earlier conversation"} · shared workspace
        {parent ? <> <button type="button" onClick={() => cockpit.select(parent.runToken)}>View parent</button></> : null}
      </p> : null}
      {state.archived ? <p className="trusted-archive">Archived conversation · {state.status}. View-only history.</p> : null}
      {state.output ? <pre className="trusted-output" aria-label="Codex conversation">{state.output}</pre> : <p className="trusted-empty">No output yet.</p>}
      {state.activities?.length ? <section className="trusted-live-activity" aria-label="Selected conversation activity"><h4>Activity</h4>
        <ol>{state.activities.slice(-12).map((item) => <li key={item.id}><span>{item.summary}</span><small>{item.kind} · {item.status}</small></li>)}</ol>
      </section> : null}
      {!state.archived ? state.approvals.map((approval) => <article className="trusted-approval" key={approval.id}>
        <strong>Codex requests your approval</strong><pre>{approval.summary}</pre>
        {approval.choices.map((choice) => <button type="button" key={choice} disabled={runPending || !connected || !active}
          onClick={() => cockpit.control(state, "decide", approval.id, choice)}>{choice === "accept" ? "Allow once" : choice === "decline" ? "Decline" : choice}</button>)}
      </article>) : null}
      {active ? <><form onSubmit={(event) => { event.preventDefault(); cockpit.control(state, "send"); }}>
        <label>Message Codex<textarea rows={2} value={composer.text} maxLength={16384} onChange={(event) => cockpit.edit(state.runToken!, event.target.value)} /></label>
        <button disabled={runPending || !connected || !composer.text.trim() || !["ready", "running"].includes(state.status) || (state.status === "running" && !state.turnId)}>{state.status === "running" ? "Steer current turn" : "Send next turn"}</button>
      </form><button type="button" disabled={!connected || runPending || state.status === "stopping"} onClick={() => cockpit.control(state, "stop")}>Stop conversation</button></> : composer.text ? <details><summary>Unsent draft</summary><pre>{composer.text}</pre></details> : null}
      {!state.archived ? <TrustedForkControl parent={state} disabled={!connected || runPending} onFork={cockpit.fork} /> : null}
    </div> : null}
    <p role="status" className="trusted-notice">{cockpit.selectedNotice || cockpit.observationNotice || state?.message}</p>
    <small>Conversations keep running during a UI refresh. Closing the app or stopping its core stops them; their history remains view-only.</small>
  </section>;
}
