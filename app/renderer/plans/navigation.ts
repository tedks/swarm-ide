import { useCallback, useEffect, useRef, useState } from "react";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import type { PlanIndex, PlanNode, PlanReadResult } from "../../../protocol/plans";

export interface PlanNavigationOptions {
  visible: boolean; worldId: string; repositoryId: string; generation: number; connected: boolean;
  autoLoad?: boolean;
  changeToken?: string;
}
export interface PlanNavigation {
  index: PlanIndex | null; node: PlanNode | undefined; selected: string | null;
  select: (id: string) => void; read: () => Promise<void>;
  current: boolean; loading: boolean; notice: string; result: PlanReadResult | undefined;
  breadcrumbs: PlanNode[]; scopeKey: string;
}

/** One plan observation and selected component for document, outline and graphs.
 * A new core/workspace invalidates link authority before any effect executes. */
export function usePlanNavigation({ visible, worldId, repositoryId, generation, connected, autoLoad = true, changeToken }: PlanNavigationOptions): PlanNavigation {
  const scopeKey = `${worldId}\0${repositoryId}`;
  const identity = `${scopeKey}\0${generation}\0${connected}`;
  const boundary = useRef({ identity, epoch: 0 });
  if (boundary.current.identity !== identity) boundary.current = { identity, epoch: boundary.current.epoch + 1 };
  const lifetime = `${identity}\0${boundary.current.epoch}`;
  const live = useRef(lifetime); live.current = lifetime;
  const serial = useRef(0);
  const attempted = useRef<string | null>(null);
  const inFlight = useRef<{ lifetime: string; ticket: number; promise: Promise<void> } | null>(null);
  const [resumed, setResumed] = useState(0);
  const inputKey = JSON.stringify([lifetime, changeToken, resumed]);
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) setResumed((version) => version + 1);
    wasVisible.current = visible;
    const resume = () => { if (visible && connected && !document.hidden) setResumed((version) => version + 1); };
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [visible, connected]);
  const [observation, setObservation] = useState<{ lifetime: string; scopeKey: string; result: PlanReadResult } | null>(null);
  const [selection, setSelection] = useState<{ scopeKey: string; id: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ lifetime: string; message: string } | null>(null);
  useEffect(() => () => {
    ++serial.current; attempted.current = null; inFlight.current = null; setPending(null);
  }, []);
  const read = useCallback(async () => {
    const bridge = window.swarm;
    if (!connected || !bridge) return;
    if (inFlight.current?.lifetime === lifetime) return inFlight.current.promise;
    const ticket = ++serial.current, origin = lifetime;
    attempted.current = inputKey; setPending(origin); setFailure(null);
    const valid = () => ticket === serial.current && live.current === origin;
    const request = { protocolVersion: PROTOCOL_VERSION, type: "plans.read" as const,
      requestId: `plans:${crypto.randomUUID()}`, worldId, repositoryId };
    const operation = (async () => { try {
      const reply = parseCoreResponseForRequest(await bridge.request(request), request);
      if (!valid()) return;
      if (!reply.ok || !reply.plans) throw new Error("Unavailable plan response");
      const next = reply.plans;
      setObservation((prior) => ({ lifetime: origin, scopeKey, result:
        prior?.scopeKey === scopeKey && prior.result.status === "observed" && next.status === "observed" &&
        JSON.stringify(prior.result.index) === JSON.stringify(next.index)
          ? { ...next, index: prior.result.index } : next }));
    } catch {
      if (valid()) {
        setFailure({ lifetime: origin, message: "Could not read the plan. Refresh to try again." });
      }
    } finally {
      if (inFlight.current?.ticket === ticket) inFlight.current = null;
      if (valid()) setPending(null);
    } })();
    inFlight.current = { lifetime: origin, ticket, promise: operation };
    return operation;
  }, [connected, lifetime, repositoryId, scopeKey, worldId, inputKey]);
  useEffect(() => {
    if (autoLoad && visible && !document.hidden && connected && pending !== lifetime && attempted.current !== inputKey) void read();
  }, [autoLoad, visible, connected, lifetime, read, inputKey, pending]);
  const result = observation?.scopeKey === scopeKey ? observation.result : undefined;
  const index = result?.status === "observed" ? result.index : null;
  const selected = index?.nodes.find((node) => selection?.scopeKey === scopeKey && node.id === selection.id)?.id
    ?? index?.nodes.find((node) => node.parentId === null && node.design)?.id
    ?? index?.nodes.find((node) => node.parentId === null)?.id ?? null;
  const node = index?.nodes.find((entry) => entry.id === selected);
  const loading = pending === lifetime;
  const current = Boolean(connected && observation?.lifetime === lifetime && result?.status === "observed" && !loading && failure?.lifetime !== lifetime);
  const select = (id: string) => { if (current && index?.nodes.some((entry) => entry.id === id)) setSelection({ scopeKey, id }); };
  const breadcrumbs: PlanNode[] = [];
  for (let item = node; item && breadcrumbs.length < 128; item = index?.nodes.find((entry) => entry.id === item!.parentId)) breadcrumbs.unshift(item);
  const notice = failure?.lifetime === lifetime ? failure.message
    : result?.status === "unavailable" ? result.code === "PLAN_INDEX_UNAVAILABLE"
      ? "Add .swarm/plans.json and a design document to map this project."
      : result.code === "PLAN_INDEX_MALFORMED" ? "The plan needs a correction. Open its index to check the component links."
      : "The plan index is too large. Keep it within 64 KiB."
    : "";
  return { index, node, selected, select, read, current, loading, notice, result, breadcrumbs, scopeKey };
}
