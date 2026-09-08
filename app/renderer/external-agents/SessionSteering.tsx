import { useEffect, useId, useRef, useState } from "react";
import type { SwarmBridge } from "../../electron/preload";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { EXTERNAL_MESSAGE_MAX_BYTES, parseExternalResult, type ExternalDetail, type ExternalRequest } from "../../../protocol/external-agents";
import "./session-steering.css";

type Receipt = { status: "queued" | "rejected" | "delivery-unknown"; message: string; receiptId?: string };
type TargetState = { draft: string; receipt?: Receipt };
const emptyTarget: TargetState = { draft: "" };

/** Drafts and receipts belong to their target, never to the current selection. */
export function SessionSteering({ detail, bridge }: { detail: ExternalDetail | null; bridge: SwarmBridge | undefined }) {
  const [targets, setTargets] = useState(new Map<string, TargetState>());
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);
  const sending = useRef(false), mounted = useRef(false);
  const fieldId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Keep this component mounted while observations load: pending sends and
  // per-session drafts must outlive temporary absence of selection detail.
  if (!detail) return pending ? <p className="session-steering" role="status">Sending to {pending.label} ({pending.id})…</p> : null;
  const session = detail.session, target = targets.get(session.id) ?? emptyTarget;
  const bytes = new TextEncoder().encode(target.draft).length;
  const invalid = target.draft.includes("\0") ? "Messages cannot contain NUL characters."
    : bytes > EXTERNAL_MESSAGE_MAX_BYTES ? `Message exceeds ${EXTERNAL_MESSAGE_MAX_BYTES} UTF-8 bytes.`
    : !target.draft.trim() ? "Enter a non-blank message." : "";
  const available = !!bridge && session.evidence === "local" && session.status === "observed" && detail.handoff === "available";
  const update = (id: string, change: (prior: TargetState) => TargetState) => {
    setTargets((prior) => { const next = new Map(prior); next.set(id, change(prior.get(id) ?? emptyTarget)); return next; });
  };
  const send = async () => {
    if (!available || !bridge || invalid || sending.current) return;
    const id = session.id, text = target.draft;
    sending.current = true; setPending({ id, label: session.label });
    update(id, (prior) => ({ ...prior, receipt: undefined }));
    let receipt: Receipt;
    try {
      const request: ExternalRequest = { protocolVersion: PROTOCOL_VERSION, requestId: `external-send:${crypto.randomUUID()}`,
        type: "externalAgents.send", sessionId: id, observationId: session.observationId, text };
      const response = parseCoreResponseForRequest(await bridge.request(request), request);
      if (!response.ok) throw new Error("Delivery cannot be confirmed");
      const result = parseExternalResult(response.external, request);
      if (result.kind !== "send") throw new Error("Unexpected send result");
      receipt = { status: result.status, message: result.message, receiptId: result.receiptId };
    } catch {
      receipt = { status: "delivery-unknown", message: "Delivery could not be confirmed. Check the target conversation before sending again." };
    }
    sending.current = false;
    if (!mounted.current) return;
    setPending(null);
    update(id, (prior) => ({ draft: receipt.status === "queued" && prior.draft === text ? "" : prior.draft, receipt }));
  };
  return <section className="session-steering" aria-label="Session steering">
    <h3>Message existing session</h3>
    <p>To <strong>{session.label}</strong></p>
    {!available ? <p>Read-only. Refresh or open the session in your terminal.</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label htmlFor={fieldId}>Message to {session.label}</label>
      <textarea id={fieldId} value={target.draft} rows={3} disabled={!available || pending?.id === session.id}
        aria-describedby={`${fieldId}-limit`} aria-invalid={target.draft.length > 0 && !!invalid}
        onChange={(event) => { const draft = event.target.value; update(session.id, (prior) => ({ ...prior, draft })); }} />
      <p id={`${fieldId}-limit`}>{bytes} / {EXTERNAL_MESSAGE_MAX_BYTES} UTF-8 bytes{target.draft && invalid ? ` · ${invalid}` : ""}</p>
      <button type="submit" disabled={!available || !!invalid || !!pending}>Send message</button>
    </form>
    {pending ? <p role="status">Sending to {pending.label} ({pending.id})…</p> : null}
    {target.receipt ? <div role="status" data-delivery-status={target.receipt.status}>
      <p>{target.receipt.status === "queued" ? "Message queued."
        : target.receipt.status === "rejected" ? "Rejected — message not queued. Draft retained."
          : "Delivery unknown — draft retained. Check the conversation before sending again."}</p>
      <p>{target.receipt.message}</p>
      {target.receipt.receiptId ? <details><summary>Delivery details</summary><code>{target.receipt.receiptId}</code></details> : null}
    </div> : null}
  </section>;
}
