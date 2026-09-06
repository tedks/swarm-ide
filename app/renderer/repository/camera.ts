import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import type { RepositoryObservation } from "../../../protocol/repository";
import { DIRECTORY_HISTORY_LIMIT, directoryCameraKey, type RepositoryCameraIntent } from "./navigation";

/** Camera memory is deliberately bounded and keyed independently of revision,
 * capture freshness and interface zoom. Those observations cannot move a camera. */
export function useDirectoryCamera(observation: RepositoryObservation | undefined, intent: RepositoryCameraIntent | null | undefined) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const cameras = useRef(new Map<string, Viewport>());
  const displayed = useRef<{ key: string; loaded: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const key = observation ? directoryCameraKey(observation) : null;
  const loaded = Boolean(observation && observation.state !== "loading");
  const remember = useCallback((key: string, viewport: Viewport) => {
    cameras.current.delete(key); cameras.current.set(key, { ...viewport });
    if (cameras.current.size > DIRECTORY_HISTORY_LIMIT) cameras.current.delete(cameras.current.keys().next().value!);
  }, []);
  const cancelFrame = useCallback(() => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);
  useEffect(() => {
    if (!instance || !key) return;
    const before = displayed.current;
    if (before?.key === key && (before.loaded || !loaded)) return;
    // The normal ReactFlow mount fit owns the first already-populated slice.
    if (!before) { displayed.current = { key, loaded }; if (loaded) return; }
    if (!loaded) return;
    if (before?.loaded && typeof instance.getViewport === "function") remember(before.key, instance.getViewport());
    displayed.current = { key, loaded };
    const saved = intent?.restore && intent.directory === observation!.directory && intent.page === observation!.page ? cameras.current.get(key) : undefined;
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (saved) void instance.setViewport(saved, { duration: 0 });
        else void instance.fitView({ padding: 0.18, maxZoom: 1.35, duration: 0 });
      });
    });
    return cancelFrame;
  }, [instance, key, loaded, intent, remember, cancelFrame]);
  const onMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => { if (event) cancelFrame(); }, [cancelFrame]);
  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (displayed.current?.loaded) remember(displayed.current.key, viewport);
  }, [remember]);
  return { instance, onInit: setInstance, onMoveStart, onMoveEnd };
}
