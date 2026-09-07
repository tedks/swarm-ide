import { useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import { TrustedRequestSchema, type TrustedRequest, type TrustedSnapshot } from "../../../protocol/trusted-local";
import type { LiveAgentState } from "./live-state";
import type { SwarmBridge } from "../../electron/preload";
import "./trusted-local.css";

export function TrustedLocalPane({ draft, bridge, generation = 0, connected }: {
  draft: LiveAgentState["draft"]; bridge?: SwarmBridge; generation?: number; connected: boolean;
}) {
  const [state, setState] = useState<TrustedSnapshot | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [inputKey, setInputKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [observing, setObserving] = useState(false);
  const busy = useRef(false), epoch = useRef(0), watermark = useRef(-1);
  const input = draft ? { worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
    model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null },
    ...(draft.taskReference ? { taskReference: draft.taskReference } : {}) } : null;
  const key = JSON.stringify(input);
  const keyRef = useRef(key); keyRef.current = key;
  const make = (value: Omit<TrustedRequest, "protocolVersion" | "requestId">) => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: `trusted-ui:${crypto.randomUUID()}`, ...value });
  const accept = (next: TrustedSnapshot, sequence: number) => {
    if (sequence < watermark.current) return;
    watermark.current = sequence; setState(next);
  };
  useEffect(() => {
    ++epoch.current;
    watermark.current = -1; busy.current = false; setPending(false); setConfirmed(false); setInputKey(null);
    return () => { ++epoch.current; };
  }, [bridge, connected, generation]);
  useEffect(() => {
    const current = epoch.current;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!connected || !bridge) { setNotice("Local core unavailable. No command will be replayed."); return; }
    const read = async () => {
      let continueObserving = observing || Boolean(state && ["starting", "ready", "running", "stopping"].includes(state.status));
      try {
        const request = make({ type: "trusted.snapshot" });
        const response = parseCoreResponseForRequest(await bridge.request(request), request);
        if (!alive || epoch.current !== current) return;
        if (response.ok && response.trusted) {
          accept(response.trusted.snapshot, response.sequence);
          if (["closed", "failed"].includes(response.trusted.snapshot.status)) { setObserving(false); continueObserving = false; }
          else continueObserving = observing || ["starting", "ready", "running", "stopping"].includes(response.trusted.snapshot.status);
        }
        else if (!response.ok) setNotice(response.error.message);
      } catch { if (alive && epoch.current === current) setNotice("Conversation observation unavailable; no command was replayed."); }
      if (alive && epoch.current === current && continueObserving) timer = setTimeout(read, 800);
    };
    void read();
    return () => { alive = false; clearTimeout(timer); };
  }, [bridge, connected, generation, state?.runToken, observing]);
  useEffect(() => { setConfirmed(false); }, [key]);
  const dispatch = async (request: TrustedRequest, preparedKey?: string) => {
    if (!bridge || !connected || busy.current) return;
    if (request.type === "trusted.prepare" || request.type === "trusted.launch") setObserving(true);
    busy.current = true; setPending(true); setNotice("");
    const current = epoch.current;
    try {
      const response = parseCoreResponseForRequest(await bridge.request(request), request);
      if (epoch.current !== current) return;
      if (!response.ok) { setNotice(response.error.message); return; }
      if (response.trusted) {
        accept(response.trusted.snapshot, response.sequence);
        if (preparedKey !== undefined && keyRef.current === preparedKey) setInputKey(preparedKey);
        if (request.type === "trusted.send") setMessage("");
      }
    } catch { if (epoch.current === current) setNotice("Outcome unconfirmed. Observe this conversation; the command will not be repeated automatically."); }
    finally { if (epoch.current === current) { busy.current = false; setPending(false); } }
  };
  const preparation = state?.preparation;
  const active = state && ["starting", "running", "ready", "stopping"].includes(state.status);
  return <section className="trusted-local" aria-label="Trusted-local Codex">
    <header><strong>Codex · trusted local</strong><small>{state?.status ?? "unobserved"}</small></header>
    <p className="trusted-profile">Normal account, tools and approvals. Not the isolated read-only profile.</p>
    <button type="button" disabled={!connected} onClick={() => setObserving(true)}>Observe conversation</button>
    {state ? <p className="trusted-workspace">Workspace: {state.workspace}</p> : null}
    {!active ? <>
      <button type="button" disabled={!connected || pending || !input || draft?.focus.domain !== "repo" || !draft.focus.path}
        onClick={() => { if (input) { setConfirmed(false); void dispatch(make({ type: "trusted.prepare", input } as TrustedRequest), key); } }}>Prepare trusted-local context</button>
      {!draft ? <small>Open an agent draft from a source file to choose instructions.</small> : <small>Uses the fixed draft source and attached task. Save first to include editor changes.</small>}
      {preparation && inputKey === key ? <div className="trusted-review">
        <details><summary>Exact prompt · {preparation.model ?? "configured model"}</summary><pre>{preparation.prompt}</pre></details>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Launch in this workspace with normal Codex permissions</label>
        <button type="button" className="agent-primary" disabled={!confirmed || pending || !connected} onClick={() => {
          setConfirmed(false); void dispatch(make({ type: "trusted.launch", token: preparation.token } as TrustedRequest));
        }}>Launch trusted-local Codex</button>
      </div> : null}
    </> : null}
    {state?.runToken ? <>
      {state.output ? <pre className="trusted-output" aria-label="Codex conversation">{state.output}</pre> : null}
      {state.approvals.map((approval) => <article className="trusted-approval" key={approval.id}>
        <strong>Codex requests your approval</strong><pre>{approval.summary}</pre>
        {approval.choices.map((choice) => <button type="button" key={choice} disabled={pending || !connected} onClick={() => void dispatch(make({ type: "trusted.decide", token: state.runToken!, approvalId: approval.id, choice } as TrustedRequest))}>{choice === "accept" ? "Allow once" : choice === "decline" ? "Decline" : choice}</button>)}
      </article>)}
      {active ? <><form onSubmit={(event) => { event.preventDefault(); if (message.trim()) void dispatch(make({ type: "trusted.send", token: state.runToken!, text: message } as TrustedRequest)); }}>
        <label>Message Codex<textarea rows={2} value={message} maxLength={16384} onChange={(event) => setMessage(event.target.value)} /></label>
        <button disabled={pending || !connected || !message.trim() || !["ready", "running"].includes(state.status)}>{state.status === "running" ? "Steer current turn" : "Send next turn"}</button>
      </form><button type="button" disabled={!connected || pending || state.status === "stopping"} onClick={() => void dispatch(make({ type: "trusted.stop", token: state.runToken! } as TrustedRequest))}>Stop conversation</button></> : null}
    </> : null}
    <p role="status" className="trusted-notice">{notice || state?.message}</p>
    <small>Conversation survives a renderer refresh while the core stays alive. App/core shutdown stops it; this preview does not automatically resume a past conversation.</small>
  </section>;
}
