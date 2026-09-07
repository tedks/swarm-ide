import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { GraphCamera } from "./camera";

/** Fit only for an explicit layout/navigation action, never a stream update. */
export function useGraphReframe(instance: RefObject<GraphCamera | null>, version: number) {
  const consumed = useRef(0), frame = useRef<number | null>(null);
  const cancel = useCallback(() => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);
  useEffect(() => {
    if (!version || version === consumed.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => {
      consumed.current = version; frame.current = null; void instance.current?.fitView({ padding: .18, maxZoom: 1.35, duration: 0 });
    }); });
    return cancel;
  }, [instance, version, cancel]);
  return cancel;
}
