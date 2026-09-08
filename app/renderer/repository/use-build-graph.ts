import { useCallback, useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import { BUILD_GRAPH_LIMITS, type BuildGraphObservation } from "../../../protocol/build-graph";
import type { BuildLinkSnapshot } from "./layers";

export interface AutomaticBuildContextOptions {
  /** Existing working-source revision, never a render/camera counter. */
  changeToken?: string;
}

export const BUILD_CONTEXT_TIMING = { changeMs: 2000, pendingMs: 500, cycleMs: 40_000 } as const;

/** One opened-project observation chain. Only pending work is polled. */
export function useBuildGraph(repositoryId: string | undefined, worldId: string | undefined, realm: string, enabled: boolean,
  { changeToken }: AutomaticBuildContextOptions = {}) {
  const [observation, setObservation] = useState<BuildGraphObservation>();
  const current = useRef({ repositoryId, worldId, realm, enabled });
  current.current = { repositoryId, worldId, realm, enabled };
  const controls = useRef<{ refresh(force: boolean): Promise<void>; cancel(): Promise<void>; changed(): void } | undefined>(undefined);
  const refresh = useCallback(async (force = true) => { await controls.current?.refresh(force); }, []);
  const cancel = useCallback(async () => { await controls.current?.cancel(); }, []);
  useEffect(() => {
    setObservation((old) => old && old.repositoryId === repositoryId && old.worldId === worldId ? { ...old, status: "stale", message: "Core/view lifetime changed; observation requires revalidation." } : undefined);
    if (!enabled || !repositoryId || !worldId || !window.swarm) return;
    let disposed = false, foreground = document.hasFocus(), pending = false, queued = false, forceQueued = false;
    let timer: ReturnType<typeof setTimeout> | undefined, deadline = 0, setupGeneration: number | undefined;
    const valid = () => !disposed && current.current.enabled && current.current.repositoryId === repositoryId &&
      current.current.worldId === worldId && current.current.realm === realm;
    const active = () => valid() && foreground && document.visibilityState !== "hidden";
    const clear = () => { clearTimeout(timer); timer = undefined; };
    const retain = (status: "error" | "stale", message: string) => {
      if (valid()) setObservation((old) => ({ repositoryId, worldId, generation: old?.generation ?? 0,
        graph: old?.repositoryId === repositoryId && old.worldId === worldId ? old.graph : undefined, status, message }));
    };
    const schedule = (milliseconds: number) => {
      clear();
      if (active()) timer = setTimeout(() => { timer = undefined; void run(false); }, milliseconds);
    };
    const begin = (milliseconds: number) => {
      if (!active()) return;
      deadline = Math.max(deadline, Date.now() + BUILD_CONTEXT_TIMING.cycleMs);
      if (pending) { queued = true; return; }
      schedule(milliseconds);
    };
    async function run(force: boolean): Promise<void> {
      if (!active()) return;
      if (pending) { queued = true; forceQueued ||= force; return; }
      clear(); pending = true;
      let follow = false;
      try {
        const request = { protocolVersion: PROTOCOL_VERSION, requestId: `build-graph:${crypto.randomUUID()}`, type: "buildGraph.observe" as const, repositoryId: repositoryId!, worldId: worldId!, refresh: force };
        const response = parseCoreResponseForRequest(await window.swarm!.request(request), request);
        if (!valid()) return;
        if (response.ok && response.buildGraph) {
          const next = response.buildGraph;
          if (next.loadingDependencies && setupGeneration !== next.generation) { setupGeneration = next.generation; deadline = Math.max(deadline, Date.now() + BUILD_GRAPH_LIMITS.setupMs + 5000); }
          follow = next.status === "refreshing" || next.status === "stale";
          setObservation((old) => old?.repositoryId === next.repositoryId && old.worldId === next.worldId &&
            old.generation === next.generation && old.status === next.status && old.message === next.message &&
            old.graph?.observedAt === next.graph?.observedAt && old.graph?.inputDigest === next.graph?.inputDigest ? old : next);
        } else retain("error", response.ok ? "Build graph response unavailable." : response.error.message.slice(0, 512));
      } catch { retain("error", "Build graph response unavailable; retained data is not current."); }
      finally {
        pending = false;
        if (active()) {
          if (queued) {
            const forceNext = forceQueued; queued = false; forceQueued = false;
            if (forceNext) { deadline = Date.now() + BUILD_CONTEXT_TIMING.cycleMs; void run(true); }
            else begin(BUILD_CONTEXT_TIMING.changeMs);
          } else if (follow) {
            if (Date.now() >= deadline) retain("stale", "Build context is still updating. Refresh to check again.");
            else schedule(BUILD_CONTEXT_TIMING.pendingMs);
          }
        }
      }
    }
    const controller = { async refresh(force: boolean) { deadline = Date.now() + (force ? BUILD_GRAPH_LIMITS.setupMs + 5000 : BUILD_CONTEXT_TIMING.cycleMs); await run(force); },
      async cancel() {
        if (!valid()) return;
        forceQueued = false; queued = false;
        const request = { protocolVersion: PROTOCOL_VERSION, requestId: `build-graph:${crypto.randomUUID()}`, type: "buildGraph.observe" as const, repositoryId, worldId, refresh: false, cancel: true };
        try {
          const response = parseCoreResponseForRequest(await window.swarm!.request(request), request);
          if (valid() && response.ok && response.buildGraph) { setObservation(response.buildGraph); begin(0); }
        } catch { retain("error", "Could not confirm cancellation. Check again before starting more work."); }
      },
      changed() { begin(BUILD_CONTEXT_TIMING.changeMs); } };
    controls.current = controller;
    const blur = () => { foreground = false; clear(); queued = false; forceQueued = false; };
    const focus = () => { foreground = true; begin(BUILD_CONTEXT_TIMING.changeMs); };
    const visibility = () => {
      if (document.visibilityState === "hidden") { clear(); queued = false; forceQueued = false; }
      else begin(BUILD_CONTEXT_TIMING.changeMs);
    };
    window.addEventListener("blur", blur); window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    deadline = Date.now() + BUILD_CONTEXT_TIMING.cycleMs;
    void run(false);
    return () => {
      disposed = true; clear();
      if (controls.current === controller) controls.current = undefined;
      window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [repositoryId, worldId, realm, enabled]);
  const previousToken = useRef(changeToken);
  useEffect(() => {
    if (previousToken.current === changeToken) return;
    previousToken.current = changeToken;
    controls.current?.changed();
  }, [changeToken]);
  return { observation: observation && observation.repositoryId === repositoryId && observation.worldId === worldId ? observation : undefined, refresh, cancel };
}

export function buildGraphLinks(observation: BuildGraphObservation | undefined): BuildLinkSnapshot | undefined {
  const graph = observation?.graph;
  if (!graph) return undefined;
  const targets = new Map(graph.targets.map((target) => [target.label, target]));
  return { repositoryId: graph.repositoryId, revision: graph.inputDigest, capturedAt: graph.observedAt, command: graph.command,
    targets: graph.targets, graphEdges: graph.edges, observation: { status: observation.status, coverage: graph.coverage, complete: graph.complete },
    links: graph.edges.flatMap((edge) => {
      const from = targets.get(edge.from), to = targets.get(edge.to);
      return from?.path !== null && to?.path !== null && from && to ? [{ ...edge, fromPath: from.path, toPath: to.path }] : [];
    }) };
}
