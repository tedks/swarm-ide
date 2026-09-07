import { useCallback, useEffect, useRef, useState } from "react";
import type { SwarmBridge } from "../../electron/preload";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { parseExternalResult, type ExternalRequest, type ExternalSnapshot, type ExternalDetail } from "../../../protocol/external-agents";

export function useExternalAgents(bridge: SwarmBridge | undefined, ready: boolean, generation: number) {
  const [snapshot, setSnapshot] = useState<ExternalSnapshot | null>(null);
  const [detail, setDetail] = useState<ExternalDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const epoch = useRef(0), ticket = useRef(0), active = useRef(false), selectedRef = useRef<string | null>(null);
  const current = useRef({ bridge, ready, generation }); current.current = { bridge, ready, generation };
  const call = useCallback(async (request: ExternalRequest) => {
    const captured = current.current, stamp = epoch.current;
    if (!captured.bridge || !captured.ready || !active.current) throw new Error("Local core is unavailable; refresh after recovery.");
    const response = parseCoreResponseForRequest(await captured.bridge.request(request), request);
    if (!active.current || stamp !== epoch.current || current.current.generation !== captured.generation || !current.current.ready) return null;
    if (!response.ok) throw new Error("External observation unavailable; refresh deliberately. No agent was launched or messaged.");
    return parseExternalResult(response.external, request);
  }, []);
  const read = useCallback(async (id: string) => {
    const own = ++ticket.current;
    selectedRef.current = id; setSelected(id); setDetail(null); setBusy(true); setNotice("");
    try {
      const result = await call({ protocolVersion: PROTOCOL_VERSION, requestId: `external:${crypto.randomUUID()}`, type: "externalAgents.read", sessionId: id });
      if (own === ticket.current && result?.kind === "read") setDetail(result.detail);
    } catch { if (active.current && own === ticket.current) setNotice("Registered conversation could not be read safely. Refresh to try again."); }
    finally { if (active.current && own === ticket.current) setBusy(false); }
  }, [call]);
  const refresh = useCallback(async () => {
    const own = ++ticket.current; setBusy(true); setNotice(""); setDetail(null);
    try {
      const result = await call({ protocolVersion: PROTOCOL_VERSION, requestId: `external:${crypto.randomUUID()}`, type: "externalAgents.snapshot" });
      if (own !== ticket.current || result?.kind !== "snapshot") return;
      setSnapshot(result.snapshot);
      const id = selectedRef.current;
      if (id && result.snapshot.sessions.some((row) => row.id === id)) await read(id);
      else { selectedRef.current = null; setSelected(null); }
    } catch { if (active.current && own === ticket.current) { setSnapshot(null); setNotice("External registry observation unavailable. No retained handoff authority."); } }
    finally { if (active.current && own === ticket.current) setBusy(false); }
  }, [call, read]);
  const handoff = useCallback(async () => {
    if (!detail || detail.session.id !== selectedRef.current || detail.handoff !== "available" || busy) return;
    const own = ++ticket.current; setBusy(true); setNotice("");
    try {
      const result = await call({ protocolVersion: PROTOCOL_VERSION, requestId: `external:${crypto.randomUUID()}`, type: "externalAgents.handoff",
        sessionId: detail.session.id, observationId: detail.session.observationId });
      if (own === ticket.current && result?.kind === "handoff") setNotice(result.message);
    } catch { if (active.current && own === ticket.current) setNotice("Conversation handoff could not be confirmed. Check tmux; nothing was launched or messaged."); }
    finally { if (active.current && own === ticket.current) { setBusy(false); setDetail((prior) => prior ? { ...prior, handoff: "unavailable" } : null); } }
  }, [call, detail, busy]);
  useEffect(() => {
    active.current = true; ++epoch.current; ++ticket.current; setBusy(false); setDetail(null); setSnapshot(null);
    if (ready) void refresh(); else setNotice("External observation paused while the local core recovers.");
    return () => { active.current = false; ++epoch.current; ++ticket.current; };
  }, [bridge, ready, generation, refresh]);
  return { snapshot, detail, selected, busy, notice, read, refresh, handoff };
}
export type ExternalClient = ReturnType<typeof useExternalAgents>;
