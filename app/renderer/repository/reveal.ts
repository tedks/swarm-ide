import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getViewportForBounds, type NodeChange, type ReactFlowInstance } from "@xyflow/react";

/** Navigation identity is separate from graph data and freshness. */
export interface GraphRevealRequest { scope: string; nonce: number | string; nodeIds: readonly string[]; ready?: boolean }
export const GraphVisibility = createContext(true);
type RevealCamera = Pick<ReactFlowInstance, "getInternalNode" | "setViewport"> & {
  getNodesBounds: (ids: string[]) => { x: number; y: number; width: number; height: number };
};

/** One explicit request, consumed only when its actual nodes are measured.
 * ReactFlow's existing dimension events provide readiness; no new observer or
 * polling loop. A user move cancels both waiting and scheduled work. */
export function useGraphReveal(scope: string, canvas: RefObject<HTMLElement | null>, external?: GraphRevealRequest | null, visible = true, graphIdentity = "") {
  const paneVisible = useContext(GraphVisibility) && visible;
  const [instance, onInit] = useState<RevealCamera | null>(null);
  const [version, changed] = useState(0);
  const pending = useRef<{ scope: string; graphIdentity: string; nodeIds: string[]; externalNonce?: number | string } | null>(null);
  const currentScope = useRef(scope); currentScope.current = scope;
  const currentGraph = useRef(graphIdentity); currentGraph.current = graphIdentity;
  const frame = useRef<number | null>(null);
  const stopFrame = useCallback(() => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);
  const cancel = useCallback(() => { pending.current = null; stopFrame(); }, [stopFrame]);
  useLayoutEffect(() => { if (pending.current?.scope !== scope || pending.current?.graphIdentity !== graphIdentity) cancel(); }, [scope, graphIdentity, cancel]);
  const reveal = useCallback((nodeIds: readonly string[], externalNonce?: number | string) => {
    stopFrame();
    pending.current = nodeIds.length ? { scope: currentScope.current, graphIdentity: currentGraph.current, nodeIds: [...new Set(nodeIds)], externalNonce } : null;
    changed((value) => value + 1);
  }, [stopFrame]);
  // Only a new gesture may arm the camera. New node arrays, status and layout
  // measurements can complete that gesture but cannot manufacture another one.
  useEffect(() => {
    if (external && external.scope === currentScope.current) reveal(external.nodeIds, external.nonce);
    else if (pending.current?.externalNonce !== undefined) cancel();
    // Deliberately do not retry an old gesture against a later graph/scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external?.nonce, reveal]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (pending.current && changes.some((change) => change.type === "dimensions")) changed((value) => value + 1);
  }, []);
  useEffect(() => {
    const request = pending.current;
    if (!request || request.scope !== scope || !instance || !paneVisible ||
      request.externalNonce !== undefined && (external?.nonce !== request.externalNonce || external.ready === false)) return;
    frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current !== request || currentScope.current !== request.scope || currentGraph.current !== request.graphIdentity) return;
      const bounds = canvas.current?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height || canvas.current?.closest("[hidden]")) return;
      if (!request.nodeIds.every((id) => {
        const node = instance.getInternalNode?.(id);
        return node && !node.hidden && (node.measured?.width ?? 0) > 0 && (node.measured?.height ?? 0) > 0;
      })) return;
      pending.current = null;
      // fitView queues a later ReactFlow batch even with duration zero. Compute
      // the same node bounds here and apply immediately, so no library-owned
      // deferred fit can override a later user pan or workspace switch.
      const target = instance.getNodesBounds(request.nodeIds);
      void instance.setViewport(getViewportForBounds(target, bounds.width, bounds.height, .08, 1.2, .25), { duration: 0 });
    }); });
    return stopFrame;
  }, [scope, graphIdentity, instance, paneVisible, version, canvas, stopFrame, external?.ready, external?.nonce]);
  const onControlGesture = useCallback((event: { target: EventTarget | null }) => {
    if (event.target instanceof Element && event.target.closest(".react-flow__controls")) cancel();
  }, [cancel]);
  return { onInit, reveal, onNodesChange, cancel, onControlGesture };
}
