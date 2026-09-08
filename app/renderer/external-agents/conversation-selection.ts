import { useEffect, useRef } from "react";
import { ExternalSessionId, type ExternalAgentSummary } from "../../../protocol/external-agents";
import type { ExternalClient } from "./client";

export const conversationPreference = "swarm.cockpit.selected-session.v1";
export function initialConversation(sessions: ExternalAgentSummary[], remembered: string | null): string | null {
  if (remembered && ExternalSessionId.safeParse(remembered).success && sessions.some((row) => row.id === remembered)) return remembered;
  const registered = new Set(sessions.map((row) => row.id));
  const roots = sessions.filter((row) => row.evidence === "local" && row.status === "observed" && (
    row.ancestry === "root" && row.parentId === null ||
    row.ancestry === "unknown-parent" && row.parentId !== null && !registered.has(row.parentId)));
  return roots.length === 1 ? roots[0]!.id : null;
}

/** One initial choice, not an effect that continually reselects the busiest root. */
export function useConversationSelection(client: ExternalClient) {
  const settled = useRef(false);
  useEffect(() => {
    if (client.selected) {
      settled.current = true;
      try { localStorage.setItem(conversationPreference, client.selected); } catch { /* Preferences are optional. */ }
      return;
    }
    if (settled.current || client.snapshot?.status !== "observed") return;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(conversationPreference); } catch { /* Continue without persistence. */ }
    const id = initialConversation(client.snapshot.sessions, remembered);
    if (id) { settled.current = true; void client.read(id); }
  }, [client.selected, client.snapshot, client.read]);
}
