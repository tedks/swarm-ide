import { useLayoutEffect, useRef } from "react";

/** One mounted list, bounded view memory. Loading a different tail cannot save
 * its temporary empty viewport as the previous conversation's reading position. */
export function useConversationScroll(sessionId: string | null, ready: boolean, tail: string) {
  const ref = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, { top: number; follow: boolean }>());
  useLayoutEffect(() => {
    const node = ref.current;
    if (!sessionId || !ready || !node) return;
    const saved = positions.current.get(sessionId);
    positions.current.delete(sessionId);
    positions.current.set(sessionId, saved ?? { top: 0, follow: true });
    if (positions.current.size > 64) positions.current.delete(positions.current.keys().next().value!);
    node.scrollTop = !saved || saved.follow ? node.scrollHeight : saved.top;
  }, [sessionId, ready, tail]);
  const onScroll = () => {
    const node = ref.current;
    // Hidden tabs and loading placeholders are not user reading positions.
    if (!sessionId || !ready || !node || node.clientHeight <= 0) return;
    positions.current.set(sessionId, { top: node.scrollTop, follow: node.scrollHeight - node.scrollTop - node.clientHeight < 36 });
  };
  return { ref, onScroll };
}
