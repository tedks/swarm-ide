import { useEffect, useState } from "react";
import type { ExternalAgentSummary } from "../../../protocol/external-agents";

export interface RegisteredConversations {
  /** null means unavailable/reconnecting, not an authoritative empty registry. */
  sessions: readonly ExternalAgentSummary[] | null;
  selected: string | null;
  onSelect(id: string): void;
}

/** Local views, not another registry or lifecycle classifier. */
export function useConversationTabs(registry: RegisteredConversations | undefined, version?: string) {
  const [state, setState] = useState(() => ({ open: [] as string[], dismissed: new Set<string>(), selected: null as string | null, version,
    known: [] as readonly ExternalAgentSummary[] }));
  const sessions = registry?.sessions;
  const selected = registry?.selected ?? null;
  useEffect(() => {
    if (!sessions) return;
    setState((old) => {
      const ids = new Set(sessions.map((session) => session.id));
      const dismissed = new Set([...old.dismissed].filter((id) => ids.has(id)));
      const open = old.open.filter((id) => ids.has(id));
      for (const session of sessions) {
        if (session.evidence === "local" && session.status === "observed"
          && (session.lifecycle?.state === "working" || session.lifecycle?.state === "waiting")
          && !dismissed.has(session.id) && !open.includes(session.id)) open.push(session.id);
      }
      // Explicit selection reopens history/dismissed tabs. Ordinary refresh does not.
      if (selected && ids.has(selected) && (old.selected !== selected || old.version !== version)) {
        dismissed.delete(selected);
        if (!open.includes(selected)) open.push(selected);
      }
      if (old.known === sessions && old.selected === selected && old.version === version && old.open.join() === open.join()
        && old.dismissed.size === dismissed.size) return old;
      return { open, dismissed, selected, version, known: sessions };
    });
  }, [sessions, selected, version]);
  return {
    tabs: registry ? state.open.flatMap((id) => (sessions ?? state.known).find((session) => session.id === id) ?? []) : [],
    dismiss(id: string) {
      setState((old) => ({ ...old, open: old.open.filter((entry) => entry !== id), dismissed: new Set([...old.dismissed, id]) }));
    },
  };
}
