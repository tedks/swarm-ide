import { z } from "zod";
import { ExternalMessageSchema, ExternalSessionId } from "../../../protocol/external-agents";

export const OUTBOX_KEY = "swarm.message-outbox.v1";
export const OUTBOX_MAX_MESSAGES = 100;
export const OUTBOX_MAX_BYTES = 512 * 1024;
export const OutgoingMessageSchema = z.object({
  id: z.string().uuid(), sessionId: ExternalSessionId, text: ExternalMessageSchema,
  at: z.string().datetime(), status: z.enum(["sending", "queued", "rejected", "delivery-unknown"]),
  receiptId: z.string().uuid().optional(),
}).strict();
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;
const SavedOutbox = z.object({ version: z.literal(1), messages: z.array(OutgoingMessageSchema).max(OUTBOX_MAX_MESSAGES) }).strict()
  .refine((value) => new Set(value.messages.map((row) => row.id)).size === value.messages.length, "Duplicate outgoing message");
export type OutboxStorage = Pick<Storage, "getItem" | "setItem">;

export function browserOutboxStorage(): OutboxStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Read failures are not an empty outbox: never overwrite recoverable text. */
export function readOutbox(storage: OutboxStorage | null): OutgoingMessage[] {
  if (!storage) throw new Error("Message storage is unavailable. Copy your draft before using the terminal.");
  const raw = storage.getItem(OUTBOX_KEY);
  if (raw === null) return [];
  if (new TextEncoder().encode(raw).byteLength > OUTBOX_MAX_BYTES) throw new Error("Message storage exceeds its limit.");
  return SavedOutbox.parse(JSON.parse(raw)).messages;
}

export function writeOutbox(storage: OutboxStorage | null, messages: OutgoingMessage[]): void {
  if (!storage) throw new Error("Message storage is unavailable.");
  const encoded = JSON.stringify(SavedOutbox.parse({ version: 1, messages }));
  if (new TextEncoder().encode(encoded).byteLength > OUTBOX_MAX_BYTES) throw new Error("Message storage is full.");
  storage.setItem(OUTBOX_KEY, encoded);
  if (storage.getItem(OUTBOX_KEY) !== encoded) throw new Error("Could not confirm saved message.");
}

export const outgoingPresentation = {
  sending: { symbol: "◌", label: "Sending", explanation: "Sending this saved message." },
  queued: { symbol: "↥", label: "Sent to queue", explanation: "Codex accepted this message into its queue. The IDE cannot yet confirm when the agent receives it." },
  rejected: { symbol: "⊘", label: "Not sent", explanation: "The message was not queued. Copy it to send in the terminal." },
  "delivery-unknown": { symbol: "?", label: "Unconfirmed", explanation: "Delivery could not be confirmed. Check the terminal before sending again." },
} as const;
