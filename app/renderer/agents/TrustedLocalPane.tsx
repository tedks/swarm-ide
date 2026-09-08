import { useEffect, useRef, useState } from "react";
import type { TrustedSnapshot } from "../../../protocol/trusted-local";
import type { LiveAgentState } from "./live-state";
import type { SwarmBridge } from "../../electron/preload";
import { emptyComposer } from "./fleet-state";
import { useTrustedFleet, type TrustedSelection } from "./use-trusted-fleet";
import { TrustedForkControl } from "../../components/TrustedForkControl";
import { useChatSubmit } from "../use-chat-submit";
import "./trusted-local.css";

export function TrustedLocalPane({ draft, bridge, generation = 0, connected, selection, onSnapshot, workspaceRoot }: {
  draft: LiveAgentState["draft"]; bridge?: SwarmBridge; generation?: number; connected: boolean;
  selection?: TrustedSelection; onSnapshot?: (snapshot: TrustedSnapshot | null) => void;
  workspaceRoot?: string;
}) {
  const cockpit = useTrustedFleet({ bridge, connected, generation, selection, onSnapshot });
  const chatKeys = useChatSubmit();
  const { fleet, selected: state, prepared, confirmed } = cockpit;
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const textRef = useRef(text); textRef.current = text;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [focusIntent, setFocusIntent] = useState(0);
  const focusedIntent = useRef(0);
  const newRoot = workspaceRoot ?? cockpit.workspace ?? "Opened project";
  const input = draft ? { worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
    model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null },
    ...(draft.taskReference ? { taskReference: draft.taskReference } : {}) } : null;
  const inputKey = JSON.stringify(input);
  useEffect(() => { cockpit.setConfirmed(false); }, [inputKey, cockpit.setConfirmed]);
  const active = state && !state.archived && ["starting", "running", "ready", "stopping"].includes(state.status);
  const composer = fleet.selected ? fleet.composers[fleet.selected] ?? emptyComposer : emptyComposer;
  const runPending = fleet.selected ? cockpit.pending[fleet.selected] ?? false : false;
  const showPreparation = cockpit.newConversation || (!fleet.summaries.length && !state?.runToken);
  const showComposer = showPreparation || active;
  useEffect(() => {
    if (selection && selection.runToken === null) setFocusIntent((version) => version + 1);
  }, [selection?.id]);
  useEffect(() => {
    if (showPreparation && focusIntent !== focusedIntent.current && composerRef.current) {
      focusedIntent.current = focusIntent; composerRef.current.focus();
    }
  }, [showPreparation, focusIntent]);
  const submit = async () => {
    if (showPreparation) {
      const submitted = textRef.current;
      if (!submitted.trim() || !connected || cockpit.preparationPending) return;
      if (await cockpit.start(submitted, model.trim() || null, newRoot, () => {
        const continuation = textRef.current === submitted ? "" : textRef.current;
        setText(""); return continuation;
      })) {
        if (textRef.current === submitted) setText("");
      }
    } else if (state) cockpit.control(state, "send");
  };
  const outgoing = cockpit.outgoing.filter((message) => showPreparation ? message.workspace === newRoot && message.status !== "sent" : message.token === state?.runToken);
  const lineage = state?.runToken ? fleet.summaries.find((run) => run.runToken === state.runToken)?.fork : undefined;
  const parent = lineage ? fleet.summaries.find((run) => run.runToken === lineage.parentRunToken) : undefined;
  return <section className="trusted-local" aria-label="Trusted-local Codex">
    <header><strong>{showPreparation ? "New agent" : "Codex"}</strong><small>{showPreparation ? "" : state?.status}</small></header>
    <div className="trusted-fleet-toolbar">
      {fleet.summaries.length ? <button type="button" disabled={!connected} aria-label="Refresh conversations" title="Refresh conversations" onClick={cockpit.refresh}>↻</button> : null}
      {fleet.summaries.length ? <button type="button" onClick={() => { cockpit.begin(); setFocusIntent((version) => version + 1); }}>New agent</button> : null}
    </div>
    <p className="trusted-workspace" title={showPreparation ? newRoot : state?.workspace}>Workspace: {showPreparation ? newRoot : state?.workspace}</p>
    {fleet.summaries.length ? <nav className="trusted-fleet-list" aria-label="Trusted-local conversations">
      {fleet.summaries.map((run) => <button key={run.runToken} type="button" aria-pressed={fleet.selected === run.runToken}
        data-run-token={run.runToken} onClick={() => cockpit.select(run.runToken)} title={run.message}>
        <span>{run.title}</span><small>{run.archived ? "Archived · " : ""}{run.status}{run.approvalCount ? ` · ${run.approvalCount} approval${run.approvalCount === 1 ? "" : "s"}` : ""}</small>
        {run.fork ? <small>{run.fork.confirmed ? "Child conversation" : "Fork requested"}</small> : null}
      </button>)}
    </nav> : null}
    {showPreparation && draft ? <details className="trusted-new-conversation"><summary>Use attached source or task</summary>
      <button type="button" disabled={!connected || cockpit.preparationPending || !input || draft?.focus.domain !== "repo" || !draft.focus.path}
        onClick={() => { if (input) cockpit.prepare(input, inputKey); }}>Prepare trusted-local context</button>
      {!draft ? <small>Open an agent draft from a source file to choose instructions.</small> : <small>Uses the fixed draft source and attached task. Save first to include editor changes.</small>}
      {prepared && prepared.inputKey === inputKey ? <div className="trusted-review">
        <details><summary>Exact prompt · {prepared.value.model ?? "configured model"}</summary><pre>{prepared.value.prompt}</pre></details>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => cockpit.setConfirmed(event.target.checked)} />Launch in this workspace with normal Codex permissions</label>
        <button type="button" className="agent-primary" disabled={!confirmed || cockpit.preparationPending || !connected} onClick={cockpit.launch}>Launch trusted-local Codex</button>
      </div> : null}
    </details> : null}
    {cockpit.preparationNotice ? <p role="status">{cockpit.preparationNotice}</p> : null}
    {!showPreparation && fleet.selected && !state ? <p role="status">Loading conversation…</p> : null}
    {!showPreparation && state?.runToken ? <div className="trusted-selected-run" data-run-token={state.runToken}>
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
      {active ? <button type="button" disabled={!connected || runPending || state.status === "stopping"} onClick={() => cockpit.control(state, "stop")}>Stop conversation</button> : composer.text ? <details><summary>Unsent draft</summary><pre>{composer.text}</pre></details> : null}
      {!state.archived ? <TrustedForkControl parent={state} disabled={!connected || runPending} onFork={cockpit.fork} /> : null}
    </div> : null}
    {outgoing.length ? <section className="trusted-outgoing" aria-label="Your messages">{outgoing.map((message) => <article key={message.id}>
      <small title={message.status === "sending" ? "Submitted; check the conversation if startup was interrupted" : message.status}>{message.status === "sent" ? "✓" : message.status === "failed" ? "⊘" : "◌"} You</small><pre>{message.text}</pre>
      <button type="button" aria-label="Copy message" onClick={() => { void navigator.clipboard?.writeText(message.text); }}>Copy</button>
    </article>)}</section> : !showPreparation && state?.initialText ? <section className="trusted-outgoing" aria-label="Your messages"><small>You</small><pre>{state.initialText}</pre></section> : null}
    {showComposer ? <form className="trusted-message-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="trusted-composer">
        <textarea ref={composerRef} {...chatKeys} aria-label={showPreparation ? "New agent message" : "Message Codex"}
          title="Enter to send · Shift-Enter for a new line" placeholder={showPreparation ? "What would you like Codex to do?" : "Message Codex…"}
          rows={3} value={showPreparation ? text : composer.text} maxLength={16384}
          onChange={(event) => { if (showPreparation) setText(event.target.value); else if (state?.runToken) cockpit.edit(state.runToken, event.target.value); }} />
        <button type="submit" className="trusted-send" aria-label={showPreparation ? "Start agent" : "Send message"} title="Send · Enter"
          onMouseDown={(event) => event.preventDefault()} disabled={!connected || (showPreparation ? cockpit.preparationPending || !text.trim() : runPending || !composer.text.trim() || !state || !["ready", "running"].includes(state.status) || state.status === "running" && !state.turnId)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
        </button>
      </div>
      {showPreparation ? <details className="trusted-settings"><summary>Settings</summary><label>Model <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Use configured model" /></label><small>Uses your normal Codex account and approvals.</small></details> : null}
    </form> : null}
    <p role="status" className="trusted-notice">{cockpit.selectedNotice || cockpit.observationNotice || state?.message}</p>
  </section>;
}
