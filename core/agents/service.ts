import { createHash } from "node:crypto";
import {
  AGENT_LIMITS, AgentCapabilitiesSchema, AgentRequestSchema, AgentResultSchema, AgentSnapshotSchema,
  PreparedAgentContextSchema, RunSchema, isTerminalRunState, utf8Bytes,
  type AgentCapabilities, type AgentError, type AgentRequest, type AgentResult, type AgentSnapshot,
  type InstructionReceipt, type PreparedAgentContext, type Run, type TranscriptRecord,
} from "../../protocol/agents";
import type { AdapterEvent, AgentAdapter, AgentHandle, AgentOperation, CleanupEvidence } from "./adapter";
import type { AgentContextProvider } from "./context-provider";
import type { RunStore } from "./store";

const good = <T>(value: T): AgentOperation<T> => ({ ok: true, value });
const bad = (code: AgentError["code"], message: string): AgentOperation<never> => ({ ok: false, error: { code, message } });
const unknown = (): AgentError => ({ code: "AGENT_OUTCOME_UNKNOWN", message: "Command delivery or execution is uncertain; do not replay." });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export interface AgentServiceOptions {
  store: RunStore;
  context: AgentContextProvider;
  adapter: AgentAdapter;
  capabilities(): Promise<AgentCapabilities>;
  emit?(snapshot: AgentSnapshot): void;
  now?(): number;
  /** Core-only deterministic test controls, never bridge payloads. */
  cancelGraceMs?: number;
  deadlineMs?: number;
}

/** Serialized durable decisions; provider promises never hold the state lock.
 * Adapter callbacks are bounded before enqueueing. A subscriber cannot block
 * dispatch and a terminal turn does not imply that its process was cleaned up.
 * A store failure latches admission closed; volatile unknown evidence is shown
 * honestly rather than claiming that failed persistence succeeded.
 */
export class AgentService {
  private readonly runs = new Map<string, Run>();
  private readonly handles = new Map<string, AgentHandle>();
  private readonly cleaning = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private queue: Promise<unknown> = Promise.resolve();
  private draft: PreparedAgentContext | null = null;
  private closed = false;
  private storageError: AgentError | null = null;
  private lastSnapshot: AgentSnapshot | null = null;
  private queuedBytes = 0;
  private queuedEvents = 0;
  private queuedRequests = 0;
  private requestBytes = 0;
  private pendingSteers = new Map<string, () => void>();
  private overflow = new Set<string>();
  private publishTimer?: ReturnType<typeof setTimeout>;
  private shutdownPromise?: Promise<void>;
  private readonly now: () => number;
  private readonly grace: number;
  private readonly deadline: number;

  private constructor(private readonly options: AgentServiceOptions, private readonly capabilities: AgentCapabilities) {
    this.now = options.now ?? Date.now;
    this.grace = options.cancelGraceMs ?? 5000;
    this.deadline = options.deadlineMs ?? AGENT_LIMITS.deadlineMs;
    if (!Number.isSafeInteger(this.grace) || this.grace < 1 || this.grace > 5000 ||
        !Number.isSafeInteger(this.deadline) || this.deadline < 1 || this.deadline > AGENT_LIMITS.deadlineMs) {
      throw new Error("Invalid bounded agent timing");
    }
  }

  static async create(options: AgentServiceOptions): Promise<AgentService> {
    const service = new AgentService(options, AgentCapabilitiesSchema.parse(await options.capabilities()));
    const snapshot = await options.store.snapshot();
    if (!snapshot.ok) throw new Error("Agent store could not be loaded safely");
    service.lastSnapshot = snapshot.value;
    for (const summary of snapshot.value.runs) {
      const detail = await options.store.read(summary.runId, 0);
      if (!detail.ok) throw new Error("Agent history could not be loaded safely");
      service.runs.set(summary.runId, RunSchema.parse(detail.value.run));
    }
    // A store implementation is expected to recover. Test/custom stores cannot
    // bypass conservative core-restart recovery by returning live state.
    for (const run of [...service.runs.values()]) {
      if (!isTerminalRunState(run.state) || run.instructions.some((r) => r.status === "pending")) {
        const recovered = service.uncertain(run, "Core restarted; execution outcome is unknown and transcript tail may be lost.");
        recovered.transcript.tailMayBeLost = true;
        if (recovered.processState !== "not-started") {
          recovered.processState = "unknown"; recovered.exitCode = null;
          recovered.cleanup = { status: "unknown", observedAt: service.at(run), detail: "Previous owned process termination has not been established." };
        }
        await service.persist(recovered);
      }
    }
    return service;
  }

  private at(run?: Run): string { return new Date(Math.max(this.now(), Date.parse(run?.updatedAt ?? "1970-01-01T00:00:00.000Z"))).toISOString(); }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async persist(run: Run): Promise<AgentOperation<Run>> {
    const parsed = RunSchema.safeParse(run);
    if (!parsed.success) throw new Error("Invalid internal run transition");
    const result = await this.options.store.update(parsed.data);
    if (result.ok) this.runs.set(run.runId, result.value);
    else this.storageFault(result.error);
    return result;
  }
  private storageFault(error: AgentError): void {
    if (this.storageError) return;
    this.storageError = error;
    for (const run of [...this.runs.values()]) {
      const uncertain = this.uncertain(run, "Storage failed; the latest outcome is not durable. Do not replay.");
      this.runs.set(run.runId, uncertain);
      void this.dispose(run.runId);
    }
    // A dispatch-intent write can fail after admission but before any handle
    // exists. Publication cannot depend on a later cleanup callback occurring.
    void this.serial(() => this.publish());
  }
  private admissionFault(cause?: AgentError): AgentOperation<never> {
    // A failed admit may have replaced the snapshot before directory sync
    // failed. Storage codes do not establish absence of admission. Keep the
    // command unknown and admission latched closed even if the store throws.
    const error: AgentError = { code: "AGENT_OUTCOME_UNKNOWN",
      message: `Admission could not be established safely (${cause?.code ?? "STORAGE_UNAVAILABLE"}); inspect run history. Do not replay.` };
    this.storageFault(error);
    return { ok: false, error };
  }
  private uncertain(run: Run, reason: string): Run {
    const at = this.at(run);
    return { ...run, updatedAt: at,
      ...(!isTerminalRunState(run.state) ? { state: "unknown" as const, endedAt: at, terminalReason: reason, providerOutcome: { kind: "none" as const } } : {}),
      instructions: run.instructions.map((receipt) => receipt.status !== "pending" ? receipt :
        { ...receipt, status: "delivery-unknown" as const, settledAt: at, error: unknown() }),
    };
  }
  private blocked(): AgentError | null {
    if (this.storageError) return this.storageError;
    if (this.closed) return unknown();
    if ([...this.runs.values()].some((r) => r.cleanup.status === "unknown" ||
        (isTerminalRunState(r.state) && r.cleanup.status === "pending"))) {
      return { code: "AGENT_OUTCOME_UNKNOWN", message: "Previous owned-process cleanup is not confirmed; another launch is blocked." };
    }
    return null;
  }
  private async snapshot(): Promise<AgentOperation<AgentSnapshot>> {
    let snapshot = await this.options.store.snapshot();
    if (!snapshot.ok) {
      this.storageFault(snapshot.error);
      if (!this.lastSnapshot) return snapshot;
      snapshot = good(this.lastSnapshot);
    }
    if (!snapshot.ok) return snapshot;
    this.lastSnapshot = snapshot.value;
    const blocker = this.blocked();
    const capabilities = blocker ? { ...this.capabilities, availability: "unavailable" as const, reason: blocker,
      controls: { launch: false, steer: false, cancel: false } } : this.capabilities;
    const summaries = snapshot.value.runs.map((summary) => {
      const run = this.runs.get(summary.runId);
      const at = new Date(Math.max(this.now(), Date.parse(summary.updatedAt))).toISOString();
      return run ? { ...summary, state: run.state, updatedAt: run.updatedAt, endedAt: run.endedAt } :
        { ...summary, state: "unknown" as const, updatedAt: at, endedAt: at };
    });
    const activeRunId = summaries.find((r) => !isTerminalRunState(r.state))?.runId ?? null;
    return good(AgentSnapshotSchema.parse({ ...snapshot.value, runs: summaries, activeRunId,
      tail: activeRunId === snapshot.value.activeRunId ? snapshot.value.tail : [], capabilities }));
  }
  private async publish(immediate = true): Promise<void> {
    if (!immediate) {
      this.publishTimer ??= setTimeout(() => {
        this.publishTimer = undefined;
        void this.serial(() => this.publish());
      }, 100);
      return;
    }
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = undefined;
    const snapshot = await this.snapshot();
    if (snapshot.ok) { try { this.options.emit?.(snapshot.value); } catch { /* Renderer observer is not authority. */ } }
  }

  async request(input: AgentRequest): Promise<AgentOperation<AgentResult>> {
    const request = AgentRequestSchema.parse(input);
    const size = utf8Bytes(JSON.stringify(request));
    if (this.queuedRequests >= 32 || this.requestBytes + size > AGENT_LIMITS.tailBytes) return bad("BUSY", "Agent command queue is full; no operation was sent.");
    this.queuedRequests++; this.requestBytes += size;
    try {
      if (request.type === "agent.steer") {
        const result = await this.steer(request);
        return result.ok ? good(AgentResultSchema.parse(result.value)) : result;
      }
      const result = await this.serial(() => this.command(request));
      return result.ok ? good(AgentResultSchema.parse(result.value)) : result;
    } catch {
      return bad("AGENT_OUTCOME_UNKNOWN", "Agent operation could not be established safely; do not replay mutations.");
    } finally { this.queuedRequests--; this.requestBytes -= size; }
  }
  private async command(request: Exclude<AgentRequest, { type: "agent.steer" }>): Promise<AgentOperation<AgentResult>> {
    if (request.type === "agent.snapshot") {
      const result = await this.snapshot();
      return result.ok ? good({ kind: "snapshot", snapshot: result.value }) : result;
    }
    if (request.type === "agent.read") {
      const result = await this.options.store.read(request.runId, request.afterRecord);
      return result.ok ? good({ kind: "read", ...result.value, run: this.runs.get(request.runId) ?? result.value.run }) : result;
    }
    if (request.type === "agent.launch") {
      const existing = this.runs.get(request.runId);
      if (existing) return existing.launchContext.contextHash !== request.contextHash ? bad("STALE_CONTEXT", "Run ID was already admitted with different context.") :
        good({ kind: "launch", receipt: { runId: existing.runId, contextHash: request.contextHash, admittedAt: existing.createdAt, status: "admitted" } });
    }
    if (request.type === "agent.cancel") return this.cancel(request);
    const blocker = this.blocked();
    if (blocker) return { ok: false, error: blocker };
    if ([...this.runs.values()].some((run) => !isTerminalRunState(run.state))) return bad("BUSY", "One agent run is already active; there is no hidden queue.");
    if (request.type === "agent.prepare") {
      const { protocolVersion: _version, requestId: _requestId, type: _type, ...input } = request;
      this.draft = null;
      const result = await this.options.context.prepare(input);
      if (!result.ok) return result;
      if (this.closed) return { ok: false, error: unknown() };
      this.draft = PreparedAgentContextSchema.parse(result.value);
      return good({ kind: "prepare", draft: this.draft });
    }
    if (this.capabilities.availability !== "available" || !this.capabilities.controls.launch) {
      return { ok: false, error: this.capabilities.reason ?? { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Launch policy is not verified." } };
    }
    if (!this.draft || this.draft.runId !== request.runId || this.draft.contextHash !== request.contextHash) return bad("STALE_CONTEXT", "Prepare and confirm a fresh launch draft.");
    const validation = await this.options.context.revalidate(this.draft);
    if (!validation.ok) return validation;
    if (this.closed) return { ok: false, error: unknown() };
    const context = PreparedAgentContextSchema.parse(validation.value);
    if (JSON.stringify(context) !== JSON.stringify(this.draft) || context.capabilities.availability !== "available" ||
        context.capabilities.policy !== "verified-read-only" || !context.capabilities.controls.launch ||
        this.now() < Date.parse(context.preparedAt) || this.now() >= Date.parse(context.expiresAt)) return bad("STALE_CONTEXT", "Launch context or capability evidence changed.");
    let admitted: Awaited<ReturnType<RunStore["admit"]>>;
    let read: Awaited<ReturnType<RunStore["read"]>>;
    try {
      admitted = await this.options.store.admit(context);
      if (!admitted.ok) {
        // These are admit's semantic pre-write rejections. In contrast, a
        // STORAGE_* failure cannot tell us which side of rename was reached.
        if (admitted.error.code === "STALE_CONTEXT" || admitted.error.code === "BUSY") return admitted;
        return this.admissionFault(admitted.error);
      }
      read = await this.options.store.read(context.runId, 0);
      if (!read.ok) return this.admissionFault(read.error);
    } catch {
      return this.admissionFault();
    }
    this.runs.set(context.runId, read.value.run);
    this.draft = null;
    await this.publish();
    if (!admitted.value.existing) {
      // Yield after durable admission so Stop can prevent dispatch entirely.
      const timer = setTimeout(() => { this.timers.delete(context.runId); void this.start(context); }, 0);
      this.timers.set(context.runId, timer);
    }
    return good({ kind: "launch", receipt: admitted.value.receipt });
  }

  private async start(context: PreparedAgentContext): Promise<void> {
    const dispatch = await this.serial(async () => {
      const run = this.runs.get(context.runId)!;
      if (this.closed || this.storageError || run.state !== "starting") return false;
      // Persist dispatch uncertainty BEFORE calling any adapter code.
      const at = this.at(run);
      const saved = await this.persist({ ...run, updatedAt: at, processState: "live",
        cleanup: { status: "pending", observedAt: at, detail: "Owned process dispatch is beginning; cleanup is pending." } });
      return saved.ok && !this.closed && !this.storageError;
    });
    if (!dispatch) return;
    this.timers.set(context.runId, setTimeout(() => {
      void this.serial(() => this.markUnknown(context.runId, "Run deadline exceeded; stopping owned work."));
    }, this.deadline));
    try {
      const handle = await this.options.adapter.start(context, (event) => this.receive(context.runId, event));
      await this.serial(async () => {
        this.handles.set(context.runId, handle);
        const run = this.runs.get(context.runId)!;
        if (this.closed || this.storageError || isTerminalRunState(run.state)) void this.dispose(run.runId);
        else if (run.state === "cancelling") {
          if (this.now() >= (this.cancelUntil.get(run.runId) ?? 0)) void this.dispose(run.runId);
          else void this.interrupt(run.runId);
        }
      });
    } catch {
      await this.serial(() => this.markUnknown(context.runId, "Adapter setup did not establish whether execution began."));
    }
  }
  private receive(runId: string, event: AdapterEvent): void {
    if (this.overflow.has(runId) || this.closed || this.storageError) return;
    const bytes = utf8Bytes(JSON.stringify(event));
    if (bytes > AGENT_LIMITS.recordBytes + 8192 || this.queuedBytes + bytes > AGENT_LIMITS.tailBytes || this.queuedEvents >= 256) {
      this.overflow.add(runId);
      void this.serial(() => this.markUnknown(runId, "Normalized provider event queue exceeded its limit; stopping owned work."));
      return;
    }
    this.queuedBytes += bytes; this.queuedEvents += 1;
    void this.serial(async () => {
      try { await this.event(runId, event); }
      catch { await this.markUnknown(runId, "Invalid adapter lifecycle evidence; stopping owned work."); }
      finally { this.queuedBytes -= bytes; this.queuedEvents -= 1; }
    });
  }
  private async event(runId: string, event: AdapterEvent): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || this.storageError || this.closed) return;
    if (event.type === "process-exit") {
      const next = !isTerminalRunState(run.state) ? this.uncertain(run, "Provider process exited without terminal turn evidence.") : run;
      await this.persist({ ...next, updatedAt: this.at(run), processState: "exited", exitCode: event.exitCode });
      void this.dispose(runId); await this.publish(); return;
    }
    if (isTerminalRunState(run.state)) return;
    const at = this.at(run);
    switch (event.type) {
      case "started": {
        if (run.providerThreadId !== null && run.providerThreadId !== event.threadId) throw new Error("Thread mismatch");
        if (run.providerThreadId !== null) return;
        if (event.cwd !== run.launchContext.root || event.policy !== "read-only") throw new Error("Observed authority mismatch");
        await this.persist({ ...run, updatedAt: at, providerThreadId: event.threadId,
          providerObservation: { provider: this.capabilities.provider!, version: this.capabilities.version!, model: event.model,
            cwd: event.cwd, policy: event.policy, observedAt: at,
            instructionSources: event.instructionPaths.map((path) => ({ path, digest: null, observation: "unobserved", before: null, after: null })) } });
        break;
      }
      case "turn-started": {
        if (run.providerThreadId !== event.threadId || (run.providerTurnId !== null && run.providerTurnId !== event.turnId)) throw new Error("Turn mismatch");
        if (run.providerTurnId !== null) return;
        await this.persist({ ...run, updatedAt: at, startedAt: run.startedAt ?? at, providerTurnId: event.turnId,
          state: run.state === "cancelling" ? "cancelling" : "running" });
        if (run.state === "cancelling") void this.interrupt(runId);
        break;
      }
      case "item": {
        const record: TranscriptRecord = { recordId: run.transcript.lastRecord + 1, timestamp: at,
          kind: event.kind, providerItemId: event.itemId, text: event.text };
        const appended = await this.options.store.append(runId, record);
        if (!appended.ok) {
          if (appended.error.code === "OUTPUT_LIMIT" || appended.error.code === "STORAGE_FULL") {
            // The store reserves terminal/gap capacity separately from output.
            const gap = await this.options.store.append(runId, { ...record, kind: "gap", providerItemId: null,
              text: "Transcript quota reached; further provider output was not retained." });
            if (gap.ok) {
              const current = await this.options.store.read(runId, 0);
              if (current.ok) this.runs.set(runId, current.value.run);
            }
            await this.markUnknown(runId, "Transcript limit reached; stopping owned work.");
          } else this.storageFault(appended.error);
          return;
        }
        const read = await this.options.store.read(runId, 0);
        if (read.ok) this.runs.set(runId, read.value.run); else this.storageFault(read.error);
        await this.publish(false); return;
      }
      case "terminal": {
        const outcome = event.outcome;
        if (outcome.kind === "turn" && (outcome.threadId !== run.providerThreadId || outcome.turnId !== run.providerTurnId)) throw new Error("Terminal mismatch");
        const state = outcome.kind === "setup-rejected" ? "failed" : outcome.status === "interrupted" ? "cancelled" : outcome.status;
        const next: Run = { ...run, updatedAt: at, endedAt: at, state, providerOutcome: outcome,
          terminalReason: outcome.kind === "setup-rejected" ? outcome.detail : `Provider reported turn ${outcome.status}.` };
        await this.persist(next);
        this.clearTimer(runId); void this.dispose(runId); break;
      }
      case "error":
        if (event.dispatch === "not-sent") {
          await this.persist({ ...run, state: "failed", updatedAt: at, endedAt: at, terminalReason: event.error.message,
            providerOutcome: { kind: "setup-rejected", detail: event.error.message } });
          this.clearTimer(runId); void this.dispose(runId);
        } else await this.markUnknown(runId, event.error.message);
        break;
    }
    await this.publish();
  }
  private clearTimer(runId: string): void { clearTimeout(this.timers.get(runId)); this.timers.delete(runId); }
  private async markUnknown(runId: string, reason: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.clearTimer(runId);
    if (!this.storageError) await this.persist(this.uncertain(run, reason));
    void this.dispose(runId);
    await this.publish();
  }
  private async cancel(request: Extract<AgentRequest, { type: "agent.cancel" }>): Promise<AgentOperation<AgentResult>> {
    const run = this.runs.get(request.runId);
    if (!run || isTerminalRunState(run.state)) return bad("RUN_NOT_ACTIVE", "Run is not active; cancellation is not replayed.");
    if (this.closed || this.storageError) return { ok: false, error: this.storageError ?? unknown() };
    const at = this.at(run);
    if (run.state !== "cancelling") {
      const saved = await this.persist({ ...run, state: "cancelling", updatedAt: at });
      if (!saved.ok) return saved;
      this.clearTimer(run.runId);
      if (run.processState === "not-started") {
        const prevented = await this.persist({ ...saved.value, state: "cancelled", endedAt: at,
          terminalReason: "Cancelled before provider dispatch.", providerOutcome: { kind: "dispatch-prevented", observedAt: at } });
        if (!prevented.ok) return prevented;
      } else {
        this.cancelUntil.set(run.runId, this.now() + this.grace);
        this.timers.set(run.runId, setTimeout(() => {
          this.timers.delete(run.runId);
          if (this.handles.has(run.runId)) void this.dispose(run.runId);
          else void this.serial(() => this.markUnknown(run.runId, "Stop deadline elapsed before an owned handle was established."));
        }, this.grace));
        void this.interrupt(run.runId);
      }
      await this.publish();
    }
    return good({ kind: "cancel", receipt: { runId: run.runId, requestId: request.requestId, requestedAt: at, status: "requested" } });
  }
  private interrupted = new Set<string>();
  private cancelUntil = new Map<string, number>();
  private async interrupt(runId: string): Promise<void> {
    const run = this.runs.get(runId), handle = this.handles.get(runId);
    if (!run || !handle || !run.providerTurnId || this.interrupted.has(runId) || isTerminalRunState(run.state)) return;
    this.interrupted.add(runId);
    try { await handle.interrupt(); } catch { /* Ack is not cancellation; the bounded Stop timer owns escalation. */ }
  }
  private async steer(request: Extract<AgentRequest, { type: "agent.steer" }>): Promise<AgentOperation<AgentResult>> {
    let handle: AgentHandle | undefined;
    const pending = await this.serial(async (): Promise<AgentOperation<InstructionReceipt>> => {
      const run = this.runs.get(request.runId);
      if (!run) return bad("RUN_NOT_ACTIVE", "Run is not known.");
      const existing = run.instructions.find((r) => r.requestId === request.requestId);
      if (existing) return existing.expectedTurnId === request.expectedTurnId && existing.text === request.text ? good(existing) : bad("STALE_TURN", "Instruction ID was already used with different text or turn.");
      if (this.closed || this.storageError) return { ok: false, error: this.storageError ?? unknown() };
      if (run.state !== "running" || !this.handles.has(run.runId)) return bad("RUN_NOT_ACTIVE", "Only a confirmed running turn accepts steering.");
      if (!this.capabilities.controls.steer) return bad("UNSUPPORTED_CONTROL", "Steering is unavailable for this provider.");
      if (run.providerTurnId !== request.expectedTurnId) return bad("STALE_TURN", "The selected provider turn is no longer current.");
      if (run.instructions.some((r) => r.status === "pending")) return bad("BUSY", "One instruction acknowledgement is already pending.");
      const receipt: InstructionReceipt = { requestId: request.requestId, expectedTurnId: request.expectedTurnId,
        text: request.text, textHash: hash(request.text), status: "pending", submittedAt: this.at(run), settledAt: null, error: null };
      const result = await this.options.store.instruction(run.runId, receipt);
      if (!result.ok) {
        if (!["INSTRUCTION_LIMIT", "BUSY", "STALE_TURN"].includes(result.error.code)) this.storageFault(result.error);
        return result;
      }
      const detail = await this.options.store.read(run.runId, 0);
      if (!detail.ok) { this.storageFault(detail.error); return detail; }
      this.runs.set(run.runId, detail.value.run);
      handle = this.handles.get(run.runId);
      await this.publish();
      return result;
    });
    if (!pending.ok) return pending;
    // Existing IDs return their durable receipt without another provider call.
    if (!handle) return good({ kind: "steer", runId: request.runId, receipt: pending.value });
    let reply: AgentOperation<{ status: "accepted" }>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsettled = new Promise<AgentOperation<{ status: "accepted" }>>((resolve) => {
      const expire = () => resolve({ ok: false, error: unknown() });
      this.pendingSteers.set(request.runId, expire);
      timer = setTimeout(expire, 5000);
    });
    try {
      // Shutdown can arrive while the pending intent is being fsynced. Recheck
      // immediately before the external call, not only before persistence.
      reply = this.closed || this.storageError ? { ok: false, error: unknown() } :
        await Promise.race([handle.steer(request.expectedTurnId, request.text), unsettled]);
    }
    catch { reply = { ok: false, error: unknown() }; }
    finally { clearTimeout(timer); this.pendingSteers.delete(request.runId); }
    return this.serial(async () => {
      const run = this.runs.get(request.runId)!;
      const current = run.instructions.find((r) => r.requestId === request.requestId)!;
      if (current.status !== "pending") return good({ kind: "steer" as const, runId: request.runId, receipt: current });
      const receipt: InstructionReceipt = { ...current, settledAt: this.at(run), status: reply.ok ? "accepted" :
        reply.error.code === "AGENT_OUTCOME_UNKNOWN" ? "delivery-unknown" : "rejected", error: reply.ok ? null : reply.error };
      const saved = await this.options.store.instruction(run.runId, receipt);
      if (!saved.ok) { this.storageFault(saved.error); return saved; }
      this.runs.set(run.runId, { ...run, updatedAt: receipt.settledAt!, instructions: run.instructions.map((r) => r.requestId === receipt.requestId ? receipt : r) });
      await this.publish();
      return good({ kind: "steer" as const, runId: run.runId, receipt: saved.value });
    });
  }

  private dispose(runId: string): Promise<void> {
    const existing = this.cleaning.get(runId);
    if (existing) return existing;
    const handle = this.handles.get(runId);
    if (!handle) return Promise.resolve();
    const cleaning = this.cleanupHandle(runId, handle);
    this.cleaning.set(runId, cleaning);
    return cleaning;
  }
  private async cleanupHandle(runId: string, handle: AgentHandle): Promise<void> {
    this.pendingSteers.get(runId)?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleanup: CleanupEvidence;
    try {
      cleanup = await Promise.race([handle.dispose(), new Promise<CleanupEvidence>((resolve) => {
        timer = setTimeout(() => resolve({ status: "unknown", observedAt: this.at(), detail: "Owned cleanup exceeded its deadline." }), 2000);
      })]);
    } catch { cleanup = { status: "unknown", observedAt: this.at(), detail: "Owned cleanup could not be confirmed." }; }
    finally { clearTimeout(timer); }
    await this.serial(async () => {
      const run = this.runs.get(runId)!;
      const confirmed = cleanup.status === "confirmed";
      const at = this.at(run);
      let next: Run = { ...run, updatedAt: at, processState: confirmed ? "exited" : "unknown", exitCode: confirmed ? run.exitCode : null,
        cleanup: { status: confirmed ? "confirmed" : "unknown", observedAt: at, detail: cleanup.detail } };
      if (!isTerminalRunState(next.state)) {
        if (run.state === "cancelling" && confirmed) next = { ...next, state: "cancelled", endedAt: at,
          terminalReason: "Owned process termination was confirmed after cancellation.",
          providerOutcome: { kind: "owned-termination", afterCancellation: true, observedAt: at } };
        else next = this.uncertain(next, "Owned execution ended without terminal outcome evidence.");
      }
      next = this.uncertain(next, "Owned execution ended without terminal outcome evidence.");
      this.clearTimer(runId);
      if (this.storageError) this.runs.set(runId, next); else await this.persist(next);
      this.handles.delete(runId);
      await this.publish();
    });
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.closed = true; this.draft = null;
    for (const settle of this.pendingSteers.values()) settle();
    clearTimeout(this.publishTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.shutdownPromise = this.serial(async () => {
      for (const run of [...this.runs.values()]) {
        if (!this.storageError) await this.persist(this.uncertain(run, "Core is being replaced; unresolved execution is unknown. Do not replay."));
      }
    }).then(async () => {
      await Promise.all([...this.handles.keys()].map((id) => this.dispose(id)));
      await this.queue;
    });
    return this.shutdownPromise;
  }
}

export const createAgentService = (options: AgentServiceOptions): Promise<AgentService> => AgentService.create(options);
