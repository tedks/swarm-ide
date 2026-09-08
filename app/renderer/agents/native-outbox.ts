import { z } from "zod";
import { utf8Bytes } from "../../../protocol/agents";
import { browserOutboxStorage, type OutboxStorage } from "../external-agents/message-outbox";

const Message = z.object({
  id: z.string().uuid(), token: z.string().uuid(), workspace: z.string().min(1).max(4096),
  text: z.string().refine((text) => Boolean(text.trim()) && !text.includes("\0") && utf8Bytes(text) <= 16384),
  at: z.string().datetime(), status: z.enum(["sending", "sent", "failed", "unknown"]),
  kind: z.enum(["start", "send"]),
}).strict();
export type NativeOutgoing = z.infer<typeof Message>;
const Saved = z.object({ version: z.literal(1), messages: z.array(Message).max(100) }).strict();
export const NATIVE_OUTBOX_KEY = "swarm.native-outbox.v1";

export function readNativeOutbox(storage: OutboxStorage | null = browserOutboxStorage()): NativeOutgoing[] {
  if (!storage) throw new Error("Cannot save messages in this profile. Copy your text before closing the window.");
  const raw = storage.getItem(NATIVE_OUTBOX_KEY);
  if (raw === null) return [];
  if (utf8Bytes(raw) > 2 * 1024 * 1024) throw new Error("Saved messages are full. Your existing text has been kept.");
  return Saved.parse(JSON.parse(raw)).messages;
}

/** Save before dispatch. Never evict uncertain submissions to make room. */
export function saveNativeOutgoing(row: NativeOutgoing, storage: OutboxStorage | null = browserOutboxStorage()): NativeOutgoing[] {
  const old = readNativeOutbox(storage);
  const index = old.findIndex((message) => message.id === row.id);
  const messages = [...old];
  if (index >= 0) messages[index] = row;
  else {
    while (messages.length >= 100) {
      const settled = messages.findIndex((message) => message.status === "sent");
      if (settled < 0) throw new Error("Saved messages are full. Copy unresolved messages before starting another agent.");
      messages.splice(settled, 1);
    }
    messages.push(row);
  }
  const encoded = JSON.stringify(Saved.parse({ version: 1, messages }));
  if (utf8Bytes(encoded) > 2 * 1024 * 1024) throw new Error("Saved messages are full. Your text has not been sent.");
  storage!.setItem(NATIVE_OUTBOX_KEY, encoded);
  if (storage!.getItem(NATIVE_OUTBOX_KEY) !== encoded) throw new Error("Could not save this message. Your text has not been sent.");
  return messages;
}
