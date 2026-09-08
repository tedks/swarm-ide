import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../../protocol/schema";
import { TrustedRequestSchema, type TrustedRequest, type TrustedSnapshot } from "../../../protocol/trusted-local";
import type { SwarmBridge } from "../../electron/preload";
import { acknowledgeFleetComposer, editFleetComposer, emptyComposer, emptyFleet, observeFleet,
  resetFleetAuthority, selectFleetRun, type FleetState, type FleetSnapshot } from "./fleet-state";
import { readNativeOutbox, saveNativeOutgoing, type NativeOutgoing } from "./native-outbox";

export interface TrustedSelection { id: string; runToken: string | null }
const PREPARE = "@prepare", OBSERVATION = "@observation";
const request = (value: unknown): TrustedRequest => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION,
  requestId: `trusted-ui:${crypto.randomUUID()}`, ...(typeof value === "object" && value !== null ? value : {}) });

/** All bridge input/output passes the actual shared schemas. No local wire parser. */
export function useTrustedFleet({ bridge, connected, generation, selection, onSnapshot }: {
  bridge?: SwarmBridge; connected: boolean; generation: number; selection?: TrustedSelection;
  onSnapshot?: (snapshot: TrustedSnapshot | null) => void;
}) {
  const [fleet, setFleet] = useState(emptyFleet), fleetRef = useRef(fleet);
  const update = useCallback((change: (state: FleetState) => FleetState) => {
    fleetRef.current = change(fleetRef.current); setFleet(fleetRef.current);
  }, []);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [newConversation, setNewConversation] = useState(false);
  const [prepared, setPrepared] = useState<{ value: NonNullable<TrustedSnapshot["preparation"]>; inputKey: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [outgoing, setOutgoing] = useState<NativeOutgoing[]>(() => { try { return readNativeOutbox(); } catch { return []; } });
  const epoch = useRef(0), selectionVersion = useRef(0), pendingRef = useRef(new Map<string, string>());
  const refreshRef = useRef<((catalog?: boolean) => void) | null>(null), callback = useRef(onSnapshot), callbackSequence = useRef(-1);
  callback.current = onSnapshot;
  const notice = useCallback((key: string, value: string) => setNotices((old) => ({ ...old, [key]: value })), []);
  const accept = useCallback((next: FleetSnapshot, sequence: number) => {
    update((state) => observeFleet(state, next, sequence));
    if (sequence >= callbackSequence.current) {
      callbackSequence.current = sequence; setWorkspace(next.launchWorkspace ?? (!next.runToken ? next.workspace : null)); callback.current?.(next);
    }
  }, [update]);
  useLayoutEffect(() => {
    ++epoch.current; pendingRef.current.clear(); setPending({}); setPrepared(null); setConfirmed(false);
    callbackSequence.current = -1; setWorkspace(null); setNotices({}); update(resetFleetAuthority); callback.current?.(null);
    return () => { ++epoch.current; };
  }, [bridge, connected, generation, update]);

  useEffect(() => {
    if (!bridge || !connected) { notice(OBSERVATION, "Local core unavailable. No command will be replayed."); return; }
    const current = epoch.current;
    let alive = true, reading = false, requested = false, catalogNeeded = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (!alive) return;
      if (reading) { requested = true; return; }
      clearTimeout(timer); reading = true; requested = false;
      const token = catalogNeeded ? null : fleetRef.current.selected;
      const selectionAtRead = selectionVersion.current;
      catalogNeeded = false;
      try {
        const command = request({ type: "trusted.snapshot", ...(token ? { token } : {}) });
        const response = parseCoreResponseForRequest(await bridge.request(command), command);
        if (!alive || current !== epoch.current) return;
        if (!response.ok) {
          notice(token ? `@read:${token}` : OBSERVATION, response.error.message); callback.current?.(null);
          if (token) catalogNeeded = true; // Missing retained selection must not trap catalogue discovery.
          return;
        }
        if (response.trusted) {
          accept(response.trusted.snapshot, response.sequence); notice(OBSERVATION, "");
          if (response.trusted.snapshot.runToken) notice(`@read:${response.trusted.snapshot.runToken}`, "");
          if (!fleetRef.current.selected && response.trusted.snapshot.runToken && selectionAtRead === selectionVersion.current)
            update((state) => selectFleetRun(state, response.trusted!.snapshot.runToken!));
        }
      } catch { if (alive && current === epoch.current) { notice(OBSERVATION, "Conversation observation unavailable; no command was replayed."); callback.current?.(null); } }
      finally {
        reading = false;
        if (alive && current === epoch.current) timer = setTimeout(read, requested ? 0 : 800);
      }
    };
    refreshRef.current = (catalog = false) => { catalogNeeded ||= catalog; requested = true; void read(); };
    void read();
    return () => { alive = false; clearTimeout(timer); refreshRef.current = null; };
  }, [bridge, connected, generation, accept, notice, update]);

  const select = useCallback((token: string) => {
    ++selectionVersion.current; update((state) => selectFleetRun(state, token)); setNewConversation(false);
    refreshRef.current?.();
  }, [update]);
  const begin = useCallback(() => { ++selectionVersion.current; setNewConversation(true); setConfirmed(false); }, []);
  useEffect(() => { if (selection) { if (selection.runToken) select(selection.runToken); else begin(); } }, [selection?.id, select, begin]);
  const dispatch = async (command: TrustedRequest, options: { inputKey?: string; composerRevision?: number; workspace?: string; continuation?: () => string } = {}): Promise<boolean> => {
    const key = command.type === "trusted.prepare" || command.type === "trusted.launch" || command.type === "trusted.start" ? PREPARE
      : "token" in command ? command.token ?? OBSERVATION : OBSERVATION;
    if (!bridge || !connected || pendingRef.current.has(key)) return false;
    const current = epoch.current, selectedAtDispatch = selectionVersion.current;
    pendingRef.current.set(key, command.requestId); setPending((old) => ({ ...old, [key]: true })); notice(key, "");
    let saved: NativeOutgoing | undefined;
    let dispatched = false;
    const settle = (status: NativeOutgoing["status"]) => {
      if (!saved) return;
      try { setOutgoing(saveNativeOutgoing({ ...saved, status })); }
      catch { notice(key, "The result could not be saved. Your submitted message is still available below."); }
    };
    try {
      if (command.type === "trusted.start" || command.type === "trusted.send") {
        saved = { id: crypto.randomUUID(), token: command.token, workspace: options.workspace ?? workspace ?? "Opened project", text: command.text,
          at: new Date().toISOString(), status: "sending", kind: command.type === "trusted.start" ? "start" : "send" };
        setOutgoing(saveNativeOutgoing(saved));
      }
      dispatched = true;
      const response = parseCoreResponseForRequest(await bridge.request(command), command);
      settle(response.ok ? "sent" : "unknown");
      if (current !== epoch.current) return false;
      if (!response.ok) { notice(key, response.error.message); return false; }
      if (!response.trusted) return false;
      accept(response.trusted.snapshot, response.sequence);
      if (command.type === "trusted.prepare" && response.trusted.snapshot.preparation && options.inputKey !== undefined)
        setPrepared({ value: response.trusted.snapshot.preparation, inputKey: options.inputKey });
      if (command.type === "trusted.launch" || command.type === "trusted.start") {
        setPrepared(null);
        if (selectedAtDispatch === selectionVersion.current && response.trusted.snapshot.runToken) {
          if (command.type === "trusted.start" && options.continuation) {
            const nextText = options.continuation();
            if (nextText) update((state) => editFleetComposer(state, command.token, nextText));
          }
          select(response.trusted.snapshot.runToken);
        }
      }
      if (command.type === "trusted.fork" && selectedAtDispatch === selectionVersion.current)
        select(command.childToken);
      if (command.type === "trusted.send" && options.composerRevision !== undefined)
        update((state) => acknowledgeFleetComposer(state, command.token, options.composerRevision!));
      return true;
    } catch (error) {
      if (dispatched) settle("unknown");
      if (current === epoch.current) notice(key, dispatched ? "Connection interrupted. Your message is saved below; check the conversation before sending again."
        : error instanceof Error ? error.message : "Could not save this message. Nothing was sent.");
      return false;
    } finally {
      if (current === epoch.current && pendingRef.current.get(key) === command.requestId) {
        pendingRef.current.delete(key); setPending((old) => ({ ...old, [key]: false })); refreshRef.current?.(command.type === "trusted.launch" || command.type === "trusted.start" || command.type === "trusted.fork");
      }
    }
  };
  const safeRequest = (value: unknown, key: string): TrustedRequest | null => {
    try { return request(value); }
    catch { notice(key, "Instructions exceed the supported input bounds or the request is invalid. Nothing was sent."); return null; }
  };
  const prepare = (input: unknown, inputKey: string) => {
    setConfirmed(false); setPrepared(null);
    const command = safeRequest({ type: "trusted.prepare", input }, PREPARE);
    if (command) void dispatch(command, { inputKey });
  };
  const launch = () => {
    if (!prepared || !confirmed) return;
    const token = prepared.value.token;
    setConfirmed(false); setPrepared(null); // One-shot UI authority, including uncertain outcomes.
    void dispatch(request({ type: "trusted.launch", token }));
  };
  const start = async (text: string, model: string | null, root: string, continuation?: () => string) => {
    const command = safeRequest({ type: "trusted.start", token: crypto.randomUUID(), text, model }, PREPARE);
    // A catalogue read may discover the reserved run before its start reply.
    // Keep one composer until that reply, so later typing never moves between
    // two independently editable drafts during admission.
    if (command) setNewConversation(true);
    return command ? dispatch(command, { workspace: root, continuation }) : false;
  };
  const selected = fleet.selected ? fleet.details[fleet.selected]?.snapshot ?? null : null;
  const fork = async (fields: Omit<Extract<TrustedRequest, { type: "trusted.fork" }>, "type" | "protocolVersion" | "requestId">) => {
    const snapshot = fleetRef.current.details[fields.token]?.snapshot;
    if (fleetRef.current.selected !== fields.token || !snapshot || snapshot.instanceId !== fields.expectedInstanceId ||
        snapshot.archived || snapshot.status !== "ready" || snapshot.forkPoint?.threadId !== fields.expectedThreadId || snapshot.forkPoint.turnId !== fields.expectedTurnId)
      throw new Error("Parent changed; refresh the completed conversation before forking.");
    const command = safeRequest({ type: "trusted.fork", ...fields }, fields.token);
    if (!command || !await dispatch(command)) throw new Error("Fork was not acknowledged; inspect conversations before a new explicit attempt.");
  };
  const control = (observed: TrustedSnapshot, kind: "send" | "stop" | "decide", approvalId?: string, choice?: string) => {
    const token = observed.runToken;
    if (!token) return;
    const snapshot = fleetRef.current.details[token]?.snapshot;
    if (!snapshot || snapshot.instanceId !== observed.instanceId || snapshot.archived || !["ready", "running", "starting"].includes(snapshot.status)) return;
    if (kind === "send") {
      if (snapshot.status !== observed.status || snapshot.turnId !== observed.turnId) {
        notice(token, "Conversation advanced. Review the current turn before sending; your draft is retained."); return;
      }
      const composer = fleetRef.current.composers[token] ?? emptyComposer;
      if (!composer.text.trim() || !["running", "ready"].includes(snapshot.status) || (snapshot.status === "running" && !snapshot.turnId)) return;
      const command = safeRequest({ type: "trusted.send", token, text: composer.text,
        expectedTurnId: observed.status === "running" ? observed.turnId : null }, token);
      if (command) void dispatch(command, { composerRevision: composer.revision });
    } else if (kind === "stop") void dispatch(request({ type: "trusted.stop", token }));
    else if (snapshot.approvals.some((approval) => approval.id === approvalId && approval.choices.includes(choice ?? "")))
      void dispatch(request({ type: "trusted.decide", token, approvalId, choice }));
  };
  return { fleet, selected, workspace, pending, newConversation, prepared, confirmed, setConfirmed, outgoing,
    select, begin, prepare, launch, start, fork, control, refresh: () => refreshRef.current?.(true),
    preparationPending: pending[PREPARE] ?? false,
    preparationNotice: notices[PREPARE] ?? "", observationNotice: notices[OBSERVATION] ?? "",
    selectedNotice: fleet.selected ? notices[fleet.selected] || notices[`@read:${fleet.selected}`] || "" : "",
    edit: (token: string, text: string) => update((state) => editFleetComposer(state, token, text)) };
}
