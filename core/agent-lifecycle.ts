import type { AgentLifecycle } from "../protocol/agent-lifecycle";

type Dict = Record<string, unknown>;
const object = (value: unknown): Dict | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Dict : undefined;
const id = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 && value.length <= 160 ? value : undefined;
const date = (value: unknown): number => typeof value === "string" ? Date.parse(value) : NaN;

/** A bounded observation, not an idle-time or process-liveness heuristic.
 * Forked rollouts rewrite outer timestamps on inherited records. started_at
 * remains the original epoch time and is the authority for a fork's turn. */
export class AgentLifecycleProjection {
  private current: AgentLifecycle = { state: "unknown" };
  private pending = new Set<string>();
  private ownTurn = false;
  private terminal = false;
  private latestStart = -Infinity;
  private readonly born: number;
  constructor(meta: { timestamp?: string; forked_from_id?: string | null }) {
    this.born = date(meta.timestamp);
    this.forked = Boolean(meta.forked_from_id);
  }
  private readonly forked: boolean;
  snapshot(): AgentLifecycle { return { ...this.current }; }
  clone(): AgentLifecycleProjection {
    const next = new AgentLifecycleProjection({ timestamp: Number.isFinite(this.born) ? new Date(this.born).toISOString() : undefined,
      forked_from_id: this.forked ? "fork" : null });
    next.current = this.snapshot(); next.pending = new Set(this.pending); next.ownTurn = this.ownTurn;
    next.terminal = this.terminal; next.latestStart = this.latestStart;
    return next;
  }
  /** Returns true only when this record independently establishes lifecycle.
   * A terminal without started_at can update an already-owned turn, but its
   * checkpoint must retain the earlier owned start. */
  consume(input: unknown): boolean {
    const record = object(input), payload = object(record?.payload);
    if (!record || !payload) return false;
    const at = date(record.timestamp);
    if (!Number.isFinite(at)) return false;
    if (record.type === "session_meta") { this.ownTurn = false; return false; }
    if (record.type === "event_msg" && ["task_started", "task_complete", "turn_aborted"].includes(String(payload.type))) {
      const turnId = id(payload.turn_id);
      if (!turnId) return false;
      const started = typeof payload.started_at === "number" && Number.isFinite(payload.started_at) ? payload.started_at * 1000 : NaN;
      // Seconds-only starts in the birth second are ambiguous: do not round
      // birth down and accidentally adopt a parent's concurrently copied turn.
      const ownedTerminal = payload.type !== "task_started" && !Number.isFinite(started) && this.ownTurn && turnId === this.current.turnId;
      if (this.forked && (!Number.isFinite(this.born) || !ownedTerminal && (!Number.isFinite(started) || started < this.born))) return false;
      if (!this.forked && Number.isFinite(this.born) && at < this.born) return false;
      const order = Number.isFinite(started) ? started : ownedTerminal ? this.latestStart : at;
      if (order < this.latestStart) return false;
      if (payload.type === "task_started") {
        if (turnId === this.current.turnId && this.terminal) return false;
        this.current = { state: "working", at: new Date(at).toISOString(), turnId };
        this.latestStart = order; this.ownTurn = true; this.terminal = false; this.pending.clear();
      } else {
        if (this.ownTurn && this.current.turnId !== turnId && order <= this.latestStart) return false;
        this.current = { state: payload.type === "turn_aborted" ? "unknown" : object(payload.error) ? "failed" : "completed",
          at: new Date(at).toISOString(), turnId };
        this.latestStart = order; this.ownTurn = true; this.terminal = true; this.pending.clear();
      }
      return payload.type === "task_started" || Number.isFinite(started);
    }
    if (!this.ownTurn || this.terminal || (this.current.at && at < Date.parse(this.current.at))) return false;
    // Only blocking human-input calls stop work. Async request acceptance is
    // not an answer, and an async question does not pause the owning turn.
    if (record.type === "response_item" && payload.type === "function_call" &&
        /(?:^|[._])request_user_input$/.test(String(payload.name))) {
      const callId = id(payload.call_id);
      if (callId && this.pending.size < 16) { this.pending.add(callId); this.current = { ...this.current, state: "waiting", at: new Date(at).toISOString() }; }
    }
    if (record.type === "response_item" && payload.type === "function_call_output") {
      const callId = id(payload.call_id);
      if (callId && this.pending.delete(callId) && !this.pending.size)
        this.current = { ...this.current, state: "working", at: new Date(at).toISOString() };
    }
    return false;
  }
}
