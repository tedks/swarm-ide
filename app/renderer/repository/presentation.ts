import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Present one coherent latest value before the browser measures graph nodes.
 * Authoritative events are still reduced immediately by the workspace owner. */
export function useFramePresentation<T>(value: T): T {
  const [presented, setPresented] = useState(() => value);
  const latest = useRef(value);
  const frame = useRef<number | null>(null);
  const alive = useRef(false);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    latest.current = value;
    if (presented === value || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!alive.current) return;
      // ReactFlow's controlled StoreUpdater uses passive effects. Flush this
      // whole presentation before ResizeObserver delivery, not from it.
      flushSync(() => setPresented(() => latest.current));
    });
  }, [presented, value]);
  return presented;
}
