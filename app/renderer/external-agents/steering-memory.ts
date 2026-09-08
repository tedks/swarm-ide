import { ExternalMessageSchema, ExternalSessionId } from "../../../protocol/external-agents";
import { browserOutboxStorage, OUTBOX_MAX_MESSAGES, readOutbox, writeOutbox, type OutboxStorage, type OutgoingMessage } from "./message-outbox";

export type Receipt = { status: "queued" | "rejected" | "delivery-unknown"; message: string; receiptId?: string };
export type TargetState = { draft: string; receipt?: Receipt };
type State = { targets: Map<string, TargetState>; pending: { id: string; label: string } | null; outgoing: OutgoingMessage[]; storageNotice: string };

/** App retains this owner across development remounts; it never sends on its own. */
export class SteeringMemory {
  private state: State = { targets: new Map(), pending: null, outgoing: [], storageNotice: "" };
  private listeners = new Set<() => void>();
  constructor(private readonly storage: OutboxStorage | null = browserOutboxStorage()) {
    try {
      // A restarted renderer does not know whether the prior transport ran.
      this.state.outgoing = readOutbox(storage).map((row) => row.status === "sending" ? { ...row, status: "delivery-unknown" } : row);
    } catch { this.state.storageNotice = "Saved messages could not be loaded. Your draft will not be sent without a saved copy."; }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(id: string, change: (prior: TargetState) => TargetState) {
    const targets = new Map(this.state.targets);
    targets.set(id, change(targets.get(id) ?? { draft: "" }));
    this.publish({ ...this.state, targets });
  }
  pending(value: State["pending"]) { this.publish({ ...this.state, pending: value }); }
  beginSend(id: string, text: string, label: string): string | null {
    if (this.state.pending) return null;
    if (!ExternalSessionId.safeParse(id).success || !ExternalMessageSchema.safeParse(text).success) return null;
    let capacity = false;
    try {
      const saved = readOutbox(this.storage).map((row): OutgoingMessage => row.status === "sending" ? { ...row, status: "delivery-unknown" } : row);
      if (saved.length >= OUTBOX_MAX_MESSAGES) { capacity = true; throw new Error("Outbox full"); }
      const row: OutgoingMessage = { id: crypto.randomUUID(), sessionId: id, text, at: new Date().toISOString(), status: "sending" };
      const outgoing = [...saved, row];
      writeOutbox(this.storage, outgoing);
      const targets = new Map(this.state.targets);
      targets.set(id, { ...(targets.get(id) ?? { draft: text }), receipt: undefined });
      this.publish({ ...this.state, targets, pending: { id, label }, outgoing, storageNotice: "" });
      return row.id;
    } catch {
      const message = capacity ? "Saved messages are full (100). Nothing was sent; copy your draft to the terminal."
        : "Could not save this message. Nothing was sent; copy your draft to the terminal.";
      this.update(id, (prior) => ({ ...prior, receipt: { status: "rejected", message } }));
      this.publish({ ...this.state, storageNotice: message });
      return null;
    }
  }
  finishSend(id: string, localId: string, receipt: Receipt): void {
    const original = this.state.outgoing.find((row) => row.id === localId && row.sessionId === id);
    if (!original || original.status !== "sending") return;
    const settled: OutgoingMessage = { ...original, status: receipt.status, ...(receipt.receiptId ? { receiptId: receipt.receiptId } : {}) };
    let outgoing = this.state.outgoing.map((row) => row.id === localId ? settled : row);
    let storageNotice = "";
    try {
      const saved = readOutbox(this.storage);
      if (!saved.some((row) => row.id === localId && row.sessionId === id && row.text === original.text)) throw new Error("Saved message changed");
      outgoing = saved.map((row) => row.id === localId ? settled
        : row.status === "sending" ? { ...row, status: "delivery-unknown" } : row);
      writeOutbox(this.storage, outgoing);
    } catch { storageNotice = "The delivery update could not be saved. The original message remains available for recovery."; }
    const targets = new Map(this.state.targets), prior = targets.get(id) ?? { draft: original.text };
    targets.set(id, { ...prior, draft: receipt.status === "queued" && prior.draft === original.text ? "" : prior.draft, receipt });
    this.publish({ ...this.state, targets, outgoing, storageNotice,
      pending: this.state.pending?.id === id ? null : this.state.pending });
  }
  private publish(state: State) { this.state = state; this.listeners.forEach((listener) => listener()); }
}
