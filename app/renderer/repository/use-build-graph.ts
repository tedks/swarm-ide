import { useCallback, useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import type { BuildGraphObservation } from "../../../protocol/build-graph";
import type { BuildLinkSnapshot } from "./layers";

/** A single demand timer for coordinated consumers, never tied to camera/focus motion. */
export function useBuildGraph(repositoryId: string | undefined, worldId: string | undefined, realm: string, enabled: boolean) {
  const [observation, setObservation] = useState<BuildGraphObservation>();
  const current = useRef({ repositoryId, worldId, realm, enabled });
  current.current = { repositoryId, worldId, realm, enabled };
  const serial = useRef(0), pending = useRef(false);
  const refresh = useCallback(async (force = true) => {
    if (!repositoryId || !worldId || !window.swarm || pending.current || !current.current.enabled) return;
    const identity = current.current, generation = ++serial.current;
    pending.current = true;
    try {
      const request = { protocolVersion: PROTOCOL_VERSION, requestId: `build-graph:${crypto.randomUUID()}`, type: "buildGraph.observe" as const, repositoryId, worldId, refresh: force };
      const response = parseCoreResponseForRequest(await window.swarm.request(request), request);
      if (current.current.repositoryId !== identity.repositoryId || current.current.worldId !== identity.worldId || current.current.realm !== identity.realm || serial.current !== generation) return;
      if (response.ok && response.buildGraph) setObservation(response.buildGraph);
      else if (!response.ok) setObservation((old) => ({ repositoryId, worldId, generation: old?.generation ?? 0, graph: old?.repositoryId === repositoryId && old?.worldId === worldId ? old.graph : undefined, status: "error", message: response.error.message.slice(0, 512) }));
    } catch {
      if (serial.current === generation) setObservation((old) => ({ repositoryId, worldId, generation: old?.generation ?? 0, graph: old?.repositoryId === repositoryId && old?.worldId === worldId ? old.graph : undefined, status: "error", message: "Build graph response unavailable; retained data is not current." }));
    } finally { if (serial.current === generation) pending.current = false; }
  }, [repositoryId, worldId, realm]);
  useEffect(() => {
    ++serial.current; pending.current = false;
    setObservation((old) => old && old.repositoryId === repositoryId && old.worldId === worldId ? { ...old, status: "stale", message: "Core/view lifetime changed; observation requires revalidation." } : undefined);
    if (!enabled) return;
    void refresh(false);
    const timer = setInterval(() => { void refresh(false); }, 2000);
    return () => { clearInterval(timer); ++serial.current; pending.current = false; };
  }, [repositoryId, worldId, realm, enabled, refresh]);
  return { observation: observation && observation.repositoryId === repositoryId && observation.worldId === worldId ? observation : undefined, refresh };
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
