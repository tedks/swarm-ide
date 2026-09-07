import type { SwarmBridge } from "../../electron/preload";
import { LifecycleSchema, type LifecycleBridge } from "../../lifecycle";
import { parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import {
  sameGitObject, TaskIdSchema, TaskRequestSchema, TaskBacklinkTargetSchema,
  type GitObjectId, type TaskDetail, type TaskObservation, type TaskRequest, type TaskResult, type TaskSummary, type TaskBacklinkTarget,
} from "../../../protocol/tasks";
import { indexTaskBacklinks, type TaskBacklinkIndex, type TaskBacklinkAssociation } from "./backlinks";
import { AgentTaskReferenceSchema, type AgentTaskReference } from "../../../protocol/agent-task";

/** Read-only UI preview, not core task-materialization authority. The predicate
 * revokes a proposed edit when its exact observation or client lifetime ends. */
export interface TaskAttachmentCandidate {
  reference: AgentTaskReference;
  title: string;
  description: string;
  isCurrent: () => boolean;
}

export interface TaskClientState {
  observation: TaskObservation | null;
  selectedTaskId: string | null;
  detail: TaskDetail | null;
  detailRevision: GitObjectId | null;
  detailStale: boolean;
  reading: boolean;
  refreshing: boolean;
  connected: boolean;
  notice: string | null;
  detailNotice: string | null;
  backlinks: TaskBacklinkIndex | null;
  pin: TaskBacklinkTarget | null;
  backlinkNotice: string | null;
}

const emptyState = (): TaskClientState => ({ observation: null, selectedTaskId: null, detail: null,
  detailRevision: null, detailStale: true, reading: false, refreshing: false, connected: false,
  notice: null, detailNotice: null, backlinks: null, pin: null, backlinkNotice: null });
const expiredLink = "Link revision unavailable; refresh and select again.";
const safeMessage = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu,
  (char) => `\\u{${char.codePointAt(0)!.toString(16)}}`);
class TaskClientFailure extends Error {}
const sameSummary = (a: TaskSummary, b: TaskSummary) => a.id === b.id && sameGitObject(a.blob, b.blob) &&
  a.title === b.title && a.type === b.type && a.status === b.status && a.component === b.component &&
  a.counts.blocks === b.counts.blocks && a.counts.blockedBy === b.counts.blockedBy && a.counts.fileRefs === b.counts.fileRefs;

/** Read-only task observer. Incidental workspace responses are validated, never
 * adopted as source focus. A connection epoch and selection ticket revoke old
 * promises; provider sequences order observations, not Git hash strings. */
export class TaskBridgeClient {
  private state = emptyState();
  private listeners = new Set<() => void>();
  private bridge: SwarmBridge | undefined;
  private disconnectCurrent: (() => void) | undefined;
  private context: { worldId: string; repositoryId: string } | null = null;
  private epoch = 0;
  // Snapshot and detail responses do not share completion order. A later ref
  // check must not invalidate a still-valid pinned detail (or vice versa).
  private snapshotWatermark = -1;
  private detailWatermark = -1;
  private detailTicket = 0;
  private pendingSnapshot: symbol | null = null;
  private refreshAgain = false;
  private needsInitial = true;
  private visible = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  getSnapshot = () => this.state;
  getAttachmentCandidate(taskId: string | null): TaskAttachmentCandidate | null {
    const context = this.context, state = this.state;
    const observation = state.observation, detail = state.detail, revision = state.detailRevision;
    const epoch = this.epoch, ticket = this.detailTicket, pin = state.pin;
    const eligible = () => {
      const current = this.state, snapshot = observation?.snapshot;
      if (!taskId || !context || !observation || !snapshot || !detail || !revision ||
          !this.bridge || !current.connected || this.epoch !== epoch || this.detailTicket !== ticket ||
          this.context !== context || current.observation !== observation || current.detail !== detail ||
          current.detailRevision !== revision || current.pin !== pin || current.selectedTaskId !== taskId ||
          current.refreshing || this.pendingSnapshot || this.refreshAgain || current.reading || current.detailStale ||
          current.notice || current.detailNotice || current.backlinkNotice || observation.status !== "observed" ||
          observation.reason || !observation.localRef || !observation.checkedAt ||
          observation.worldId !== context.worldId || observation.repositoryId !== context.repositoryId || observation.provider !== "ditz" ||
          snapshot.worldId !== context.worldId || snapshot.repositoryId !== context.repositoryId || snapshot.provider !== "ditz" ||
          !sameGitObject(observation.localRef, snapshot.metadataCommit) || !sameGitObject(revision, snapshot.metadataCommit) ||
          detail.id !== taskId) return false;
      const summary = snapshot.summaries.find((row) => row.id === taskId);
      return Boolean(summary && sameSummary(detail, summary) && (!pin ||
        pin.worldId === context.worldId && pin.repositoryId === context.repositoryId && pin.provider === "ditz" &&
        pin.taskId === taskId && sameGitObject(pin.metadataCommit, revision) && sameGitObject(pin.issueBlob, detail.blob)));
    };
    if (!eligible() || !context || !observation || !detail || !revision || !taskId) return null;
    // Parsing detaches the objects from the observer; freezing prevents a UI
    // consumer from turning a valid candidate into a different pin in place.
    const reference = AgentTaskReferenceSchema.parse({ version: 1, ...context, provider: "ditz", taskId,
      metadataCommit: revision, issueBlob: detail.blob });
    Object.freeze(reference.metadataCommit); Object.freeze(reference.issueBlob); Object.freeze(reference);
    const title = detail.title, description = detail.description, sequence = observation.sequence;
    return Object.freeze({ reference, title, description, isCurrent: () => eligible() &&
      observation.sequence === sequence && sameGitObject(revision, reference.metadataCommit) &&
      sameGitObject(detail.blob, reference.issueBlob) && detail.title === title && detail.description === description });
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<TaskClientState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  setContext(worldId: string, repositoryId: string) {
    if (this.context?.worldId === worldId && this.context.repositoryId === repositoryId) return;
    this.invalidate();
    this.context = { worldId, repositoryId };
    this.update({ ...emptyState(), connected: this.state.connected });
    this.resumeVisible();
  }

  connect(bridge: SwarmBridge | undefined, lifecycle?: LifecycleBridge): () => void {
    this.disconnectCurrent?.();
    this.bridge = bridge;
    let live = true;
    let generation = -1;
    let revision = -1;
    let statusEvents = 0;
    const status = (input: unknown) => {
      if (!live) return;
      const parsed = LifecycleSchema.safeParse(input);
      if (!parsed.success) { ++this.detailTicket; this.update({ reading: false, notice: "INVALID_CORE_MESSAGE: invalid core lifecycle ignored." }); return; }
      const next = parsed.data;
      if (next.core.generation < generation || next.revision < revision) return;
      const changed = next.core.generation !== generation;
      generation = next.core.generation; revision = next.revision;
      const ready = next.core.phase === "ready" && Boolean(bridge);
      if (changed || (!ready && this.state.connected)) {
        this.invalidate();
        this.markDisconnected(`TASK_RECONNECT_REQUIRED: ${safeMessage(next.core.message)}`);
      }
      const reconnect = ready && !this.state.connected;
      this.update({ connected: ready, ...(!ready ? { notice: `CORE_UNAVAILABLE: ${safeMessage(next.core.message)}` }
        : reconnect ? { notice: null } : {}) });
      if (reconnect) this.resumeVisible();
    };
    const offStatus = lifecycle?.onStatus((value) => { statusEvents++; status(value); });
    const onVisibility = () => this.resumeVisible();
    const onFocus = () => { if (this.isVisible()) void this.snapshot(false); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    if (!bridge) this.update({ connected: false, notice: "CORE_UNAVAILABLE: task reads require the local desktop bridge." });
    else if (lifecycle) {
      const before = statusEvents;
      void lifecycle.status().then((value) => { if (live && statusEvents === before) status(value); })
        .catch(() => { if (live && statusEvents === before) this.update({ connected: false,
          notice: "CORE_UNAVAILABLE: cannot observe core lifecycle." }); });
    } else { this.update({ connected: true }); this.resumeVisible(); }
    const disconnect = () => {
      if (!live) return;
      live = false; offStatus?.();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
      this.invalidate(); this.bridge = undefined;
      this.markDisconnected("CORE_UNAVAILABLE: task connection closed; retained data is not current.");
      if (this.disconnectCurrent === disconnect) this.disconnectCurrent = undefined;
    };
    this.disconnectCurrent = disconnect;
    return disconnect;
  }

  disconnect() { this.disconnectCurrent?.(); }
  dispose() { this.disconnect(); this.invalidate(); this.listeners.clear(); }
  private invalidate() {
    ++this.epoch; ++this.detailTicket;
    this.snapshotWatermark = -1; this.detailWatermark = -1;
    this.pendingSnapshot = null; this.refreshAgain = false; this.needsInitial = true;
    this.update({ backlinks: null, backlinkNotice: null });
    this.stopTimer();
  }
  private markDisconnected(notice: string) {
    const previous = this.state.observation;
    const observation = previous?.snapshot ? { ...previous, status: "stale" as const,
      reason: { code: "TASK_RECONNECT_REQUIRED" as const, message: "Core connection changed; refresh required." } } : previous;
    this.update({ observation, connected: false, refreshing: false, reading: false, detailStale: true, notice });
  }
  private isVisible() { return this.visible && (typeof document === "undefined" || !document.hidden); }
  private stopTimer() { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }
  private resumeVisible() {
    this.stopTimer();
    if (!this.isVisible() || !this.state.connected || !this.context) { this.refreshAgain = false; return; }
    void this.snapshot(this.needsInitial);
    this.timer = setInterval(() => { void this.snapshot(false); }, 5000);
  }
  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible; this.resumeVisible();
  }
  refresh = () => this.snapshot(true, true);

  private async request(input: TaskRequest): Promise<TaskResult> {
    if (!this.bridge) throw new TaskClientFailure("CORE_UNAVAILABLE: task bridge disconnected.");
    const response = parseCoreResponseForRequest(await this.bridge.request(TaskRequestSchema.parse(input)), input);
    if (!response.ok) throw new TaskClientFailure(`${response.error.code}: ${safeMessage(response.error.message)}`);
    // Shared parsing binds world/kind/request/revision; expected registered repo
    // is client context, not authority obtained from the response's workspace.
    const result = response.task!;
    const identity = result.kind === "snapshot" ? result.observation : result;
    if (identity.repositoryId !== this.context?.repositoryId || identity.provider !== "ditz")
      throw new TaskClientFailure("INVALID_CORE_MESSAGE: task repository/provider mismatch.");
    return result;
  }
  private failure(error: unknown) {
    // Never display raw thrown errors: they can contain task bodies or paths.
    return error instanceof TaskClientFailure ? safeMessage(error.message).slice(0, 700)
      : "INVALID_CORE_MESSAGE: task reply was invalid or transport failed; retained data is unchanged.";
  }
  private id() { return `task-ui:${crypto.randomUUID()}`; }
  private async snapshot(refresh: boolean, explicit = false): Promise<void> {
    const context = this.context;
    if (!context || !this.state.connected) return;
    if (this.pendingSnapshot) { if (explicit) this.refreshAgain = true; return; }
    const pending = Symbol("task-snapshot");
    this.pendingSnapshot = pending;
    const epoch = this.epoch;
    // An initial failed scan is still an attempted scan. Reopen/focus/timers
    // check only the ref; another full scan requires Refresh or a new lifetime.
    this.needsInitial = false;
    // Starting another request is not evidence that the previous failure has
    // recovered. Keep that warning visible throughout the bounded pending read.
    this.update({ refreshing: true, ...(this.state.pin ? { detailStale: true } : {}) });
    try {
      const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(),
        type: "tasks.snapshot", worldId: context.worldId, refresh });
      if (epoch !== this.epoch) return;
      if (result.kind !== "snapshot") throw new TaskClientFailure("INVALID_CORE_MESSAGE: unexpected task reply kind.");
      let observation = result.observation;
      const suppliedSnapshot = observation.snapshot;
      if (observation.sequence < this.snapshotWatermark) {
        this.update({ notice: "Stale task observation ignored; retained data is unchanged." }); return;
      }
      const retained = this.state.observation?.snapshot;
      if (!observation.snapshot && retained) {
        if (observation.status === "observed" || observation.status === "unobserved" ||
            (observation.checkedAt && Date.parse(observation.checkedAt) < Date.parse(retained.observedAt)) ||
            (observation.localRef && observation.localRef.algorithm !== retained.metadataCommit.algorithm))
          throw new TaskClientFailure("INVALID_CORE_MESSAGE: task observation cannot discard or predate retained data.");
        observation = { ...observation, snapshot: retained };
      }
      if (retained && observation.snapshot && sameGitObject(retained.metadataCommit, observation.snapshot.metadataCommit)) {
        const old = new Map(retained.summaries.map((row) => [row.id, row]));
        if (old.size !== observation.snapshot.summaries.length || observation.snapshot.summaries.some((row) =>
          !old.has(row.id) || !sameSummary(row, old.get(row.id)!)) ||
          this.state.backlinks && JSON.stringify(retained.backlinks) !== JSON.stringify(observation.snapshot.backlinks))
          throw new TaskClientFailure("INVALID_CORE_MESSAGE: immutable task revision changed its summaries or backlinks.");
      }
      const changed = retained && observation.snapshot && !sameGitObject(retained.metadataCommit, observation.snapshot.metadataCommit);
      if (changed) {
        ++this.detailTicket;
        this.update({ reading: false, detailStale: true });
      }
      this.snapshotWatermark = observation.sequence;
      // Domain outcomes already have observation.reason. notice is reserved
      // for client/transport failures, not a duplicate rendering of that reason.
      const backlinks = observation.snapshot && (suppliedSnapshot || this.state.backlinks)
        ? !changed && this.state.backlinks ? this.state.backlinks : indexTaskBacklinks(observation.snapshot) : null;
      this.update({ observation, backlinks, notice: null });
      this.reconcileDetail(refresh || Boolean(changed));
    } catch (error) { if (epoch === this.epoch) { ++this.detailTicket; this.update({ reading: false, notice: this.failure(error) }); } }
    finally {
      if (this.pendingSnapshot === pending) {
        this.pendingSnapshot = null; this.update({ refreshing: false });
        if (this.state.pin) this.reconcileDetail();
        if (this.refreshAgain) { this.refreshAgain = false; if (this.isVisible()) void this.snapshot(true); }
      }
    }
  }

  select(taskId: string) {
    if (!TaskIdSchema.safeParse(taskId).success) return;
    ++this.detailTicket;
    this.update({ pin: null, backlinkNotice: null, reading: false });
    if (taskId !== this.state.selectedTaskId) {
      ++this.detailTicket;
      this.update({ selectedTaskId: taskId, detail: null, detailRevision: null, reading: false,
        detailStale: true, detailNotice: null });
    }
    this.reconcileDetail(true);
  }

  async inspectPinned(input: TaskBacklinkTarget, association: TaskBacklinkAssociation, stillCurrent: () => boolean): Promise<boolean> {
    const ticket = ++this.detailTicket, epoch = this.epoch;
    const parsed = TaskBacklinkTargetSchema.safeParse(input);
    const target = parsed.success ? parsed.data : null;
    const valid = () => {
      const snapshot = this.state.observation?.snapshot;
      if (!target || !this.state.connected || this.state.notice || epoch !== this.epoch || ticket !== this.detailTicket ||
          !stillCurrent() || !snapshot || this.state.backlinks !== association.index ||
          snapshot.backlinks?.status !== "complete" || snapshot.provider !== target.provider ||
          snapshot.repositoryId !== target.repositoryId || snapshot.worldId !== target.worldId ||
          !sameGitObject(snapshot.metadataCommit, target.metadataCommit)) return undefined;
      return association.index.lookup(association.path).find((row) => row.target.taskId === target.taskId &&
        sameGitObject(row.target.issueBlob, target.issueBlob));
    };
    this.update({ reading: false, backlinkNotice: null });
    try {
      const row = valid();
      if (!row || !target) { this.update({ backlinkNotice: expiredLink }); return false; }
      this.update({ reading: true });
      const cached = this.state.detail && this.state.detailRevision && sameGitObject(this.state.detailRevision, target.metadataCommit) &&
        sameSummary(this.state.detail, row.summary) ? this.state.detail : null;
      const result = cached ? null : await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(),
        type: "tasks.read", worldId: target.worldId, metadataCommit: target.metadataCommit, taskId: target.taskId });
      if (!valid()) {
        if (epoch === this.epoch && ticket === this.detailTicket) this.update({ backlinkNotice: expiredLink });
        return false;
      }
      if (result && (result.kind !== "read" || !result.result.ok || result.sequence < this.detailWatermark)) {
        this.update({ backlinkNotice: expiredLink }); return false;
      }
      const detail = cached ?? (result?.kind === "read" && result.result.ok ? result.result.detail : null);
      const refs = association.index.references(target.taskId);
      if (!detail || !sameSummary(detail, row.summary) || detail.fileRefs.length !== refs.length ||
          detail.fileRefs.some((ref, index) => ref.path !== refs[index]?.path || ref.navigation !== refs[index]?.navigation))
        throw new TaskClientFailure("INVALID_CORE_MESSAGE: task detail differs from its explicit reference projection.");
      if (result) this.detailWatermark = result.sequence;
      this.update({ selectedTaskId: target.taskId, detail, detailRevision: target.metadataCommit, pin: target,
        detailStale: this.state.refreshing || this.state.observation?.status !== "observed", detailNotice: null, backlinkNotice: null });
      return true;
    } catch (error) {
      if (epoch === this.epoch && ticket === this.detailTicket) this.update({ notice: this.failure(error), backlinkNotice: expiredLink });
      return false;
    } finally { if (epoch === this.epoch && ticket === this.detailTicket) this.update({ reading: false }); }
  }
  private reconcileDetail(explicit = false) {
    const snapshot = this.state.observation?.snapshot;
    const taskId = this.state.selectedTaskId;
    if (!taskId) return;
    if (this.state.pin) {
      this.update({ detailStale: !this.state.connected || Boolean(this.state.notice) || this.state.refreshing ||
        this.state.observation?.status !== "observed" || !snapshot || !sameGitObject(snapshot.metadataCommit, this.state.pin.metadataCommit) });
      return;
    }
    const summary = snapshot?.summaries.find((item) => item.id === taskId);
    if (!summary || !snapshot) {
      ++this.detailTicket;
      this.update({ reading: false, detailStale: true, detailNotice: snapshot
        ? "Task not present in this revision. The selected full ID is retained." : "No complete task snapshot is available for this selection." });
      return;
    }
    const current = this.state.detailRevision && sameGitObject(this.state.detailRevision, snapshot.metadataCommit) &&
      this.state.detail && sameGitObject(this.state.detail.blob, summary.blob);
    if (current && !this.state.detailStale && !explicit) return;
    // Ref checks are invalidation, not a retry loop. A failed pinned detail
    // waits for an explicit selection/full refresh, reconnect or new revision.
    if (this.state.detailNotice && !explicit) return;
    if (!this.state.connected || this.state.reading) return;
    void this.readSelected();
  }
  private async readSelected() {
    const snapshot = this.state.observation?.snapshot;
    const taskId = this.state.selectedTaskId;
    const summary = snapshot?.summaries.find((item) => item.id === taskId);
    if (!snapshot || !taskId || !summary || !this.state.connected) return;
    const ticket = ++this.detailTicket;
    const epoch = this.epoch;
    this.update({ reading: true, detailStale: true, detailNotice: null });
    try {
      const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "tasks.read",
        worldId: snapshot.worldId, metadataCommit: snapshot.metadataCommit, taskId });
      if (epoch !== this.epoch || ticket !== this.detailTicket) return;
      if (result.kind !== "read") throw new TaskClientFailure("INVALID_CORE_MESSAGE: unexpected task detail kind.");
      const current = this.state.observation?.snapshot;
      if (!current || !sameGitObject(current.metadataCommit, snapshot.metadataCommit) || result.sequence < this.detailWatermark) {
        this.update({ detailNotice: "Task detail became stale; select it again or refresh to retry." }); return;
      }
      if (!result.result.ok) {
        this.detailWatermark = result.sequence;
        this.update({ detailNotice: `${result.result.error.code}: ${result.result.error.message}` }); return;
      }
      const detail = result.result.detail;
      if (!sameSummary(detail, summary))
        throw new TaskClientFailure("INVALID_CORE_MESSAGE: task detail does not match its observed summary/blob.");
      this.detailWatermark = result.sequence;
      this.update({ detail, detailRevision: snapshot.metadataCommit, detailStale: false, detailNotice: null });
    } catch (error) { if (epoch === this.epoch && ticket === this.detailTicket) this.update({ detailNotice: this.failure(error) }); }
    finally { if (epoch === this.epoch && ticket === this.detailTicket) this.update({ reading: false }); }
  }
}
