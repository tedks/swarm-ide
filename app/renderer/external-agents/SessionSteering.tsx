import { useId, useRef, useState, useSyncExternalStore } from "react";
import type { SwarmBridge } from "../../electron/preload";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { EXTERNAL_MESSAGE_MAX_BYTES, parseExternalResult, type ExternalDetail, type ExternalRequest } from "../../../protocol/external-agents";
import "./session-steering.css";
import { SteeringMemory, type TargetState } from "./steering-memory";
import { outgoingPresentation } from "./message-outbox";
import { useChatSubmit } from "../use-chat-submit";

type Receipt = { status: "queued" | "rejected" | "delivery-unknown"; message: string; receiptId?: string };
const emptyTarget: TargetState = { draft: "" };

/** Drafts and receipts belong to their target, never to the current selection. */
export function SessionSteering({ detail, bridge, memory }: { detail: ExternalDetail | null; bridge: SwarmBridge | undefined; memory?: SteeringMemory }) {
  const [local] = useState(() => new SteeringMemory());
  const owner = memory ?? local;
  const { targets, pending } = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const fieldId = useId();
  const composer = useRef<HTMLTextAreaElement>(null);
  const chatKeys = useChatSubmit();
  // Keep this component mounted while observations load: pending sends and
  // per-session drafts must outlive temporary absence of selection detail.
  if (!detail) return pending ? <p className="session-steering" role="status">Sending to {pending.label} ({pending.id})…</p> : null;
  const session = detail.session, target = targets.get(session.id) ?? emptyTarget;
  const bytes = new TextEncoder().encode(target.draft).length;
  const invalid = target.draft.includes("\0") ? "Messages cannot contain NUL characters."
    : bytes > EXTERNAL_MESSAGE_MAX_BYTES ? `Message exceeds ${EXTERNAL_MESSAGE_MAX_BYTES} UTF-8 bytes.`
    : !target.draft.trim() ? "Enter a non-blank message." : "";
  const available = !!bridge && session.evidence === "local" && session.status === "observed" && detail.handoff === "available";
  const update = (id: string, change: (prior: TargetState) => TargetState) => owner.update(id, change);
  const send = async () => {
    if (!available || !bridge || invalid || owner.getSnapshot().pending) return;
    const id = session.id, text = target.draft;
    const outgoingId = owner.beginSend(id, text, session.label);
    if (!outgoingId) return;
    // An explicit button send gives focus back now, never when a late receipt
    // arrives. Read-only pending input keeps Chromium from blurring this node.
    composer.current?.focus({ preventScroll: true });
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
    owner.finishSend(id, outgoingId, receipt);
  };
  return <section className="session-steering" aria-label="Session steering">
    <h3>Message <strong>{session.label}</strong></h3>
    {!available ? <p>Read-only. Refresh or open the session in your terminal.</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label htmlFor={fieldId}>Message to {session.label}</label>
      <div className="session-composer">
        <textarea {...chatKeys} ref={composer} id={fieldId} value={target.draft} rows={3}
          disabled={!available} readOnly={pending?.id === session.id}
          title="Enter to send · Shift-Enter for a new line"
          aria-describedby={target.draft && invalid ? `${fieldId}-limit` : undefined} aria-invalid={target.draft.length > 0 && !!invalid}
          onChange={(event) => { const draft = event.target.value; update(session.id, (prior) => ({ ...prior, draft })); }} />
        <button className="session-send" type="submit" aria-label="Send message" title="Send message"
          disabled={!available || !!invalid || !!pending}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 19V5m-6 6 6-6 6 6" />
          </svg>
        </button>
      </div>
      {target.draft && invalid ? <p id={`${fieldId}-limit`}>{invalid}</p> : null}
    </form>
    {pending ? <p role="status">Sending to {pending.label} ({pending.id})…</p> : null}
    {target.receipt ? <span role="status" data-delivery-status={target.receipt.status}
      aria-label={outgoingPresentation[target.receipt.status].label} title={outgoingPresentation[target.receipt.status].explanation}>
      {outgoingPresentation[target.receipt.status].symbol}
    </span> : null}
  </section>;
}
