import { useEffect, useState, useSyncExternalStore } from "react";
import type { SwarmBridge } from "../../electron/preload";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { parseExternalResult, type ExternalRequest, type ExternalSnapshot, type ExternalDetail } from "../../../protocol/external-agents";

type State = {
  snapshot: ExternalSnapshot | null; detail: ExternalDetail | null; selected: string | null;
  busy: boolean; notice: string; observing?: boolean; refreshing?: boolean; stale?: boolean;
};
type Job = { kind: "snapshot" | "read" | "handoff"; id?: string; observationId?: string; done(): void; manual: boolean };
const registryInterval = 3_000, detailInterval = 1_000;

/** One transport lane, one latest explicit intention, one timer. The bridge has
 * no abort operation: hidden/recovered requests drain but cannot publish. */
class ExternalObserver {
  private state: State = { snapshot: null, detail: null, selected: null, busy: false, notice: "", observing: false, refreshing: false };
  private listeners = new Set<() => void>();
  private bridge: SwarmBridge | undefined;
  private ready = false;
  private generation = -1;
  private visible = false;
  private epoch = 0;
  private selection = 0;
  private inFlight = false;
  private pending: Job | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextRegistry = 0;
  private nextDetail = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()); }
  private enabled() { return Boolean(this.bridge && this.ready && this.visible); }
  private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private revoke(detail = this.state.detail) { return detail ? { ...detail, handoff: "unavailable" as const } : null; }

  configure(bridge: SwarmBridge | undefined, ready: boolean, generation: number, visible: boolean) {
    if (bridge === this.bridge && ready === this.ready && generation === this.generation && visible === this.visible) return;
    const coreChanged = bridge !== this.bridge || ready !== this.ready || generation !== this.generation;
    ++this.epoch; this.clearTimer(); this.pending?.done(); this.pending = null;
    this.bridge = bridge; this.ready = ready; this.generation = generation; this.visible = visible;
    this.nextRegistry = 0; this.nextDetail = 0;
    this.publish({ busy: false, refreshing: false, observing: this.enabled(),
      ...(coreChanged ? { snapshot: null, detail: null, stale: false } : { detail: this.revoke() }),
      notice: !ready ? "External observation paused while the local core recovers." : !visible ? "Observation paused while hidden; showing the last recorded tail." : "" });
    this.pump();
  }
  pause = () => this.configure(this.bridge, this.ready, this.generation, false);

  private enqueue(job: Omit<Job, "done" | "manual">) {
    if (!this.enabled()) return Promise.resolve();
    this.clearTimer(); this.pending?.done();
    const result = new Promise<void>((done) => { this.pending = { ...job, done, manual: true }; });
    this.publish({ busy: true, notice: "" }); this.pump();
    return result;
  }
  read = (id: string) => {
    if (!this.enabled()) return Promise.resolve();
    ++this.selection;
    this.publish({ selected: id, ...(id === this.state.selected ? {} : { detail: null }) });
    return this.enqueue({ kind: "read", id });
  };
  refresh = () => { this.nextDetail = 0; return this.enqueue({ kind: "snapshot" }); };
  handoff = () => {
    const detail = this.state.detail;
    if (!detail || detail.session.id !== this.state.selected || detail.handoff !== "available" || this.state.busy) return Promise.resolve();
    return this.enqueue({ kind: "handoff", id: detail.session.id, observationId: detail.session.observationId });
  };

  private pump = () => {
    this.clearTimer();
    if (!this.enabled() || this.inFlight) return;
    let job = this.pending; this.pending = null;
    const now = Date.now();
    if (!job && now >= this.nextRegistry) job = { kind: "snapshot", done() {}, manual: false };
    if (!job && this.state.selected && now >= this.nextDetail) job = { kind: "read", id: this.state.selected, done() {}, manual: false };
    if (job) { void this.run(job); return; }
    const due = this.state.selected ? Math.min(this.nextRegistry, this.nextDetail) : this.nextRegistry;
    this.timer = setTimeout(this.pump, Math.max(1, due - now));
  };

  private async run(job: Job) {
    this.inFlight = true;
    const epoch = this.epoch, selection = this.selection, bridge = this.bridge!;
    const current = () => this.enabled() && epoch === this.epoch;
    const selected = () => current() && selection === this.selection && job.id === this.state.selected;
    this.publish({ refreshing: true, busy: job.manual });
    const base = { protocolVersion: PROTOCOL_VERSION, requestId: `external:${crypto.randomUUID()}` };
    const request: ExternalRequest = job.kind === "snapshot" ? { ...base, type: "externalAgents.snapshot" }
      : job.kind === "read" ? { ...base, type: "externalAgents.read", sessionId: job.id! }
        : { ...base, type: "externalAgents.handoff", sessionId: job.id!, observationId: job.observationId! };
    try {
      const raw = await bridge.request(request);
      if (!current()) return;
      const response = parseCoreResponseForRequest(raw, request);
      if (!response.ok) throw new Error("Observation unavailable");
      const result = parseExternalResult(response.external, request);
      if (result.kind === "snapshot") {
        if (result.snapshot.status === "unavailable") {
          this.publish({ snapshot: this.state.snapshot ?? result.snapshot, detail: this.revoke(), stale: true,
            notice: "Registry unavailable; retaining the last recorded evidence. Automatic reads will retry while visible." });
        } else {
          const missing = selection === this.selection && this.state.selected && !result.snapshot.sessions.some((row) => row.id === this.state.selected);
          this.publish({ snapshot: result.snapshot, ...(missing ? { selected: null, detail: null, stale: false } : {}),
            notice: missing ? "Selected session is no longer registered. Choose another registered session." : this.state.stale ? this.state.notice : "" });
        }
      } else if (result.kind === "read" && selected()) {
        // IDs are offsets within this tail, not append identities. Replace it.
        if (result.detail.session.status === "unavailable") this.publish({ detail: this.revoke(this.state.detail ?? result.detail), stale: true,
          notice: "Transcript unavailable; retaining the last recorded evidence. Automatic reads will retry while visible." });
        else this.publish({ detail: result.detail, notice: "", stale: false });
      } else if (result.kind === "handoff" && selected()) this.publish({ notice: result.message, detail: this.revoke() });
    } catch {
      if (current() && (job.kind === "snapshot" || selected())) this.publish({ detail: this.revoke(), ...(job.kind !== "handoff" ? { stale: true } : {}), notice: job.kind === "handoff"
        ? "Conversation handoff could not be confirmed. Check tmux; nothing was launched or messaged."
        : "Observation unavailable; retaining the last recorded evidence. Automatic reads will retry while visible." });
    } finally {
      this.inFlight = false;
      if (current()) {
        if (job.kind === "snapshot") this.nextRegistry = Date.now() + registryInterval;
        if (job.kind === "read") this.nextDetail = Date.now() + detailInterval;
        this.publish({ busy: Boolean(this.pending), refreshing: false });
      }
      job.done(); this.pump();
    }
  }
}

export function useExternalAgents(bridge: SwarmBridge | undefined, ready: boolean, generation: number, visible = true) {
  const [observer] = useState(() => new ExternalObserver());
  const state = useSyncExternalStore(observer.subscribe, observer.getSnapshot);
  useEffect(() => {
    const configure = () => observer.configure(bridge, ready, generation, visible && document.visibilityState !== "hidden");
    configure(); document.addEventListener("visibilitychange", configure);
    return () => { document.removeEventListener("visibilitychange", configure); observer.pause(); };
  }, [observer, bridge, ready, generation, visible]);
  return { ...state, read: observer.read, refresh: observer.refresh, handoff: observer.handoff };
}
export type ExternalClient = ReturnType<typeof useExternalAgents>;
