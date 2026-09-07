import {
  AGENT_LIMITS, AgentEventSchema, AgentPrepareInputSchema, AgentRequestSchema, isTerminalRunState, utf8Bytes,
  type AgentRequest, type AgentSnapshot,
} from "../../../protocol/agents";
import { FocusRefSchema, parseCoreResponseForRequest, PROTOCOL_VERSION, type CoreResponse, type FocusRef } from "../../../protocol/schema";
import { canonicalJsonV1, formatRepositoryTask, sameAgentTaskReference, taskUtf8Bytes, TASK_CONTEXT_BYTES } from "../../../protocol/agent-task";
import { isRepositoryPath } from "../../../protocol/repository";
import type { TaskAttachmentCandidate } from "../tasks/client";
import type { SwarmBridge } from "../../electron/preload";
import type { Lifecycle, LifecycleBridge } from "../../lifecycle";
import { displayAgentText, emptyLiveAgentState, recoverLiveAgentState, unresolvedOperation, type LiveAgentState, type LocalOperation } from "./live-state";

// This class is an observer/client, never a provider selector. Only the core can
// supply prepared context, admitted runs, policy and durable delivery receipts.
export class AgentBridgeClient {
  private state: LiveAgentState;
  private listeners = new Set<() => void>();
  private bridge: SwarmBridge | undefined;
  private epoch = 0;
  private generation = -1;
  private watermark = -1;
  private detailSequence = -1;
  private readTicket = 0;
  private snapshotTicket = 0;
  private prepareTicket = 0;
  private draftEditGeneration = 0;
  private attachmentReview: { id: string; valid: () => boolean; invoker?: HTMLElement } | null = null;
  private readAgain = false;
  private reconciling = new Map<string, symbol>();

  constructor(checkpoint?: LiveAgentState, private readonly persistCheckpoint?: (state: LiveAgentState) => void,
    private readonly activateCheckpoint?: () => void) {
    this.state = checkpoint ? recoverLiveAgentState(checkpoint) : emptyLiveAgentState();
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<LiveAgentState>) {
    this.state = { ...this.state, ...patch };
    this.persistCheckpoint?.(this.state);
    for (const listener of this.listeners) listener();
  }

  connect(bridge: SwarmBridge | undefined, lifecycle?: LifecycleBridge): () => void {
    this.reconciling.clear();
    this.activateCheckpoint?.();
    this.bridge = bridge;
    const connection = ++this.epoch;
    let live = true;
    let statusEvents = 0;
    // Subscribe before either status or snapshot read to close the initial race.
    const offEvent = bridge?.onEvent((event) => {
      if (!live || !this.state.connected || event.type !== "agent.changed") return;
      const parsed = AgentEventSchema.safeParse(event);
      if (!parsed.success) { this.update({ notice: "INVALID_CORE_MESSAGE: invalid agent event ignored." }); return; }
      this.acceptSnapshot(parsed.data.snapshot, parsed.data.sequence);
    });
    const acceptStatus = (status: Lifecycle) => {
      if (!live || status.core.generation < this.generation) return;
      const changed = status.core.generation !== this.generation;
      if (changed || status.core.phase !== "ready") {
        this.reconciling.clear();
        ++this.epoch;
        ++this.readTicket;
        ++this.prepareTicket;
        this.readAgain = false;
        this.generation = status.core.generation;
        if (changed) { this.watermark = -1; this.detailSequence = -1; }
        this.update({ ...recoverLiveAgentState(this.state), notice: displayAgentText(status.core.message) });
      }
      const ready = status.core.phase === "ready" && Boolean(bridge);
      const reconnect = ready && !this.state.connected;
      this.update({ connected: ready });
      if (reconnect) void this.refresh();
    };
    const offStatus = lifecycle?.onStatus((status) => { statusEvents++; acceptStatus(status); });
    if (!bridge) this.update({ connected: false, notice: "ADAPTER_UNAVAILABLE: local bridge is unavailable outside the desktop shell." });
    else if (lifecycle) {
      const before = statusEvents;
      void lifecycle.status().then((status) => { if (statusEvents === before) acceptStatus(status); })
        .catch(() => { if (live && statusEvents === before) this.update({ connected: false, notice: "CORE_UNAVAILABLE: cannot observe core lifecycle." }); });
    } else {
      this.generation = 0;
      this.update({ connected: true });
      void this.refresh();
    }
    return () => {
      live = false; offEvent?.(); offStatus?.();
      // Connection epochs, not UI selection, invalidate dispatched promises.
      if (connection <= this.epoch) {
        this.reconciling.clear();
        ++this.epoch; ++this.readTicket; ++this.prepareTicket;
        this.bridge = undefined;
        this.update(recoverLiveAgentState(this.state));
      }
    };
  }

  private async request(request: AgentRequest): Promise<CoreResponse | null> {
    const bridge = this.bridge;
    if (!bridge || !this.state.connected) return null;
    const epoch = this.epoch;
    try {
      const response = await bridge.request(AgentRequestSchema.parse(request));
      if (epoch !== this.epoch) return null;
      return parseCoreResponseForRequest(response, request);
    } catch {
      if (epoch !== this.epoch) return null;
      return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: false,
        error: { code: request.type === "agent.launch" || request.type === "agent.steer" || request.type === "agent.cancel" ? "AGENT_OUTCOME_UNKNOWN" : "INVALID_CORE_MESSAGE",
          message: "The local bridge did not supply a valid reply. No command was automatically repeated." } };
    }
  }
  private id() { return `agent-ui:${crypto.randomUUID()}`; }
  private failure(response: CoreResponse | null) {
    if (response && !response.ok) this.update({ notice: `${response.error.code}: ${displayAgentText(response.error.message)}` });
  }
  async refresh() {
    if (!this.state.connected) return;
    const ticket = ++this.snapshotTicket;
    const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.snapshot" });
    if (ticket !== this.snapshotTicket || !result) return;
    if (result.ok && result.agent?.kind === "snapshot") this.acceptSnapshot(result.agent.snapshot, result.sequence);
    else this.failure(result);
  }
  private acceptSnapshot(snapshot: AgentSnapshot, sequence: number) {
    if (sequence < this.watermark) return;
    this.watermark = sequence;
    const selected = this.state.selectedRunId;
    const tail = this.state.following && selected === snapshot.activeRunId ? snapshot.tail : null;
    this.update({ snapshot, notice: snapshot.capabilities.reason
      ? `${snapshot.capabilities.reason.code}: ${displayAgentText(snapshot.capabilities.reason.message)}` : "Agent service connected. Launch is explicit; no task queue.",
      ...(tail ? { records: tail, pageCursor: tail.at(-1)?.recordId ?? 0, pageTruncated: (tail[0]?.recordId ?? 1) > 1 } : {}),
      detailStale: selected !== null && sequence > this.detailSequence });
    if (selected) void this.readDetail(false);
  }

  select(runId: string) {
    if (!this.state.snapshot?.runs.some((run) => run.runId === runId)) return;
    if (runId === this.state.selectedRunId) { this.update({ paneOpen: true }); return; }
    ++this.readTicket; this.readAgain = false; this.detailSequence = -1;
    this.update({ selectedRunId: runId, paneOpen: true, run: null, records: [], pageCursor: 0,
      pageTruncated: false, detailStale: true, reading: false, following: runId === this.state.snapshot.activeRunId });
    void this.readDetail(false);
  }
  closePane() { this.update({ paneOpen: false }); }
  resize(height: number) { this.update({ height: Math.max(180, Math.min(420, height)) }); }
  openDraft(focus: FocusRef) {
    if (this.state.draft) return; // Navigation cannot retarget an existing draft.
    ++this.draftEditGeneration;
    this.update({ draft: { focus: structuredClone(focus), task: "Explain this focus's inputs, outputs and failure cases.", model: "", prepared: null, confirmed: false, preparing: false } });
  }
  closeDraft() { ++this.prepareTicket; ++this.draftEditGeneration; this.attachmentReview = null; this.update({ draft: null, taskProposal: null }); }

  proposeTaskAttachment(candidate: TaskAttachmentCandidate, sourceChoice: { focus: FocusRef; isCurrent: () => boolean } | null, invoker?: HTMLElement): "review" | "already-attached" | "unavailable" {
    const draft = this.state.draft;
    const focus = draft?.focus ?? sourceChoice?.focus;
    if (!this.state.connected || !candidate.isCurrent()) {
      this.attachmentReview = null;
      this.update({ taskProposal: null, notice: "Task detail is not current; explicitly Refresh tasks and inspect it again." }); return "unavailable";
    }
    if (!focus || !FocusRefSchema.safeParse(focus).success || focus.revisionKind !== "working" || focus.domain !== "repo" ||
        !focus.path || !isRepositoryPath(focus.path) || focus.key !== `file:${focus.path}` || focus.worldId !== candidate.reference.worldId ||
        (!draft && !sourceChoice?.isCurrent())) {
      this.attachmentReview = null;
      this.update({ taskProposal: null, notice: draft ? "This draft has no unambiguous working-file target. Retain or close it explicitly, then choose a source file and Attach again."
        : "Choose a working source file using existing navigation, then Attach this task again. Task references do not choose a source." });
      return "unavailable";
    }
    if (sameAgentTaskReference(draft?.taskReference, candidate.reference)) return "already-attached";
    const epoch = this.epoch, edits = this.draftEditGeneration, id = this.id();
    this.attachmentReview = { id, invoker, valid: () => this.state.connected && this.epoch === epoch &&
      this.draftEditGeneration === edits && candidate.isCurrent() && (Boolean(draft) || Boolean(sourceChoice?.isCurrent())) };
    this.update({ taskProposal: { id, focus: structuredClone(focus), reference: structuredClone(candidate.reference),
      title: candidate.title, description: candidate.description, instructions: draft?.task ?? "", replacing: Boolean(draft?.taskReference), hasDraft: Boolean(draft) } });
    return "review";
  }
  cancelTaskAttachment(expectedId = this.state.taskProposal?.id) {
    if (expectedId !== this.state.taskProposal?.id) return;
    const invoker = this.attachmentReview?.invoker;
    this.attachmentReview = null;
    this.update({ taskProposal: null });
    if (invoker?.isConnected) invoker.focus();
  }
  acceptTaskAttachment(mode: "append" | "replace", expectedId = this.state.taskProposal?.id) {
    const proposal = this.state.taskProposal, review = this.attachmentReview;
    if (expectedId !== proposal?.id) { this.update({ notice: "Draft or task changed; review again." }); return; }
    if (!proposal || !review || proposal.id !== review.id || !review.valid()) {
      this.attachmentReview = null;
      this.update({ taskProposal: null, notice: "Draft or task changed; review again." }); return;
    }
    const task = mode === "replace" ? "" : proposal.instructions;
    try {
      const content = formatRepositoryTask(proposal.reference, proposal.title, proposal.description);
      if (taskUtf8Bytes(canonicalJsonV1({ instructions: task, repositoryTask: JSON.parse(content) })) > TASK_CONTEXT_BYTES) {
        this.update({ notice: "OUTPUT_LIMIT: Instructions and attached task exceed the 16 KiB task-context limit. Draft unchanged." }); return;
      }
    } catch {
      this.update({ notice: "INVALID_REQUEST: Task preview or instructions are outside the supported exact Unicode format. Draft unchanged." }); return;
    }
    ++this.prepareTicket; ++this.draftEditGeneration;
    this.attachmentReview = null;
    const draft = this.state.draft ?? { focus: proposal.focus, task: "", model: "", prepared: null, confirmed: false, preparing: false };
    this.update({ taskProposal: null, draft: { ...draft, task, taskReference: proposal.reference,
      taskPreview: { title: proposal.title, description: proposal.description, verified: true }, prepared: null, confirmed: false, preparing: false },
      notice: "Pinned task attached. Preview only; core independently verifies at Prepare. Source and task metadata are unchanged." });
  }
  removeTaskAttachment() {
    const draft = this.state.draft;
    if (!draft?.taskReference) return;
    const { taskReference: _reference, taskPreview: _preview, ...retained } = draft;
    ++this.prepareTicket; ++this.draftEditGeneration;
    this.update({ draft: { ...retained, prepared: null, confirmed: false, preparing: false }, notice: "Attached task removed; instructions, model and source retained." });
  }
  clearLocalIntent(observed: LiveAgentState, allowDocumentLoss = false) {
    // A click authorizes only what its rendered controls showed. Newer drafts,
    // text and receipts must remain protected, including between preflight and
    // actual unload. Do not remove mutation identities or change their outcome.
    const clearDraft = this.state.draft === observed.draft;
    const newerIntent = !clearDraft || this.state.instructions !== observed.instructions ||
      (allowDocumentLoss && this.state.operations.some((op) => unresolvedOperation(op) && !observed.operations.includes(op)));
    if (clearDraft && this.state.draft) { ++this.prepareTicket; ++this.draftEditGeneration; }
    this.update({
      ...(clearDraft ? { draft: null } : {}),
      instructions: this.state.instructions === observed.instructions ? {} : this.state.instructions,
      operations: this.state.operations.map((op) => allowDocumentLoss && unresolvedOperation(op) && observed.operations.includes(op)
        ? { ...op, text: null, documentLossAcknowledged: true } : op),
      notice: newerIntent ? "Newer local agent intent was preserved. Inspect the current text and receipts before clearing again."
        : "Local agent loss decision applied. Command outcomes and source buffers are unchanged; nothing was resent.",
    });
  }
  async reconcileOperation(requestId: string) {
    const operation = this.state.operations.find((op) => op.requestId === requestId);
    if (!operation || !unresolvedOperation(operation) || !this.state.connected) return;
    if (operation.kind === "cancel") { this.update({ notice: "Stop delivery cannot be reconciled by this protocol. Inspect separate run/cleanup evidence or explicitly acknowledge local receipt loss." }); return; }
    if (this.reconciling.has(requestId)) { this.update({ notice: "A read of this receipt is already pending; no command resent." }); return; }
    const ticket = Symbol("receipt-read");
    this.reconciling.set(requestId, ticket);
    try {
      // Inspect even a run missing from the bounded snapshot, without selecting
      // it, moving focus, replacing a transcript page, or replaying a mutation.
      const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.read", runId: operation.runId, afterRecord: 0 });
      if (!result || (result.ok && result.sequence < this.watermark)) {
        if (this.state.operations.some((op) => op.requestId === requestId && unresolvedOperation(op))) this.update({ notice: "Receipt read became stale or disconnected. Local evidence retained; refresh or reconcile again when connected. No command resent." });
        return;
      }
      if (!result.ok) { this.update({ notice: `${result.error.code}: ${displayAgentText(result.error.message)} Delivery remains unresolved; absence is not rejection. No command resent.` }); return; }
      if (result.agent?.kind !== "read") return;
      // This is authoritative read evidence too: an older overlapping detail
      // response/event must not undo the receipt we are about to reconcile.
      this.watermark = result.sequence;
      const run = result.agent.run;
      const receipt = operation.kind === "steer" ? run.instructions.find((r) => r.requestId === requestId) : null;
      // A durable run proves admission, not activity/completion. The contract
      // has no durable cancel request identity: terminal state cannot prove it.
      const status = operation.kind === "launch" ? "accepted" : receipt?.status;
      this.update({ operations: this.state.operations.map((op) => op.requestId === requestId && unresolvedOperation(op) && status
        ? { ...op, status, message: receipt?.error?.message ?? (op.kind === "launch" ? "Durable admission observed; not turn completion." : "Durable instruction receipt observed; not completion.") } : op),
        notice: status ? `Durable receipt observed: ${status}. This is not turn completion; no command resent.` : "No matching durable command receipt observed. Delivery remains unresolved; absence is not rejection. No command resent.",
        detailStale: this.state.selectedRunId !== null && result.sequence > this.detailSequence,
      });
      if (this.state.detailStale) void this.refresh();
    } finally { if (this.reconciling.get(requestId) === ticket) this.reconciling.delete(requestId); }
  }
  editDraft(patch: { task?: string; model?: string }) {
    if (!this.state.draft) return;
    ++this.prepareTicket; ++this.draftEditGeneration;
    this.update({ draft: { ...this.state.draft, ...patch, prepared: null, confirmed: false, preparing: false } });
  }
  confirmDraft(confirmed: boolean) { if (this.state.draft) this.update({ draft: { ...this.state.draft, confirmed } }); }
  async prepare() {
    const draft = this.state.draft;
    if (!draft || draft.preparing || !this.state.connected || (!draft.taskReference && !draft.task.trim())) return;
    const input = AgentPrepareInputSchema.safeParse({ worldId: draft.focus.worldId, focus: draft.focus, taskText: draft.task,
      model: draft.model.trim() || null, effort: null, links: { parentRunId: null, task: null, spec: null },
      ...(draft.taskReference ? { taskReference: draft.taskReference } : {}) });
    if (!input.success) { this.update({ notice: "INVALID_REQUEST: use a working focus and task/model within UTF-8 limits." }); return; }
    const ticket = ++this.prepareTicket;
    this.update({ draft: { ...draft, prepared: null, confirmed: false, preparing: true } });
    const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.prepare", ...input.data });
    if (ticket !== this.prepareTicket || !this.state.draft) return;
    this.update({ draft: { ...this.state.draft, preparing: false,
      prepared: result?.ok && result.agent?.kind === "prepare" ? result.agent.draft : null } });
    this.failure(result);
  }
  async launch() {
    const draft = this.state.draft;
    const prepared = draft?.prepared;
    if (!draft?.confirmed || !prepared || !this.state.connected || !prepared.capabilities.controls.launch ||
        !this.state.snapshot?.capabilities.controls.launch || this.state.snapshot.activeRunId ||
        this.state.operations.some((op) => op.kind === "launch" && op.runId === prepared.runId && op.status !== "rejected")) return;
    if (Date.parse(prepared.expiresAt) <= Date.now()) { this.update({ notice: "STALE_CONTEXT: prepared context expired. Prepare and inspect it again." }); return; }
    await this.mutate({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.launch", runId: prepared.runId, contextHash: prepared.contextHash });
  }
  instruction(text: string) {
    const runId = this.state.selectedRunId;
    if (!runId || utf8Bytes(text) > AGENT_LIMITS.taskBytes) return;
    if (!(runId in this.state.instructions) && Object.keys(this.state.instructions).length >= AGENT_LIMITS.history) return;
    this.update({ instructions: { ...this.state.instructions, [runId]: text } });
  }
  async steer() {
    const run = this.state.run;
    const text = run ? this.state.instructions[run.runId] ?? "" : "";
    if (!run || run.runId !== this.state.selectedRunId || this.state.detailStale || run.state !== "running" || !run.providerTurnId ||
        this.state.snapshot?.activeRunId !== run.runId || !this.state.snapshot?.capabilities.controls.steer || !text.trim() || utf8Bytes(text) > AGENT_LIMITS.taskBytes ||
        run.instructions.length >= AGENT_LIMITS.receipts || run.instructions.some((receipt) => receipt.status === "pending" || receipt.status === "delivery-unknown") ||
        this.state.operations.some((op) => op.runId === run.runId && ((op.kind === "cancel" && op.status !== "rejected") || (op.kind === "steer" &&
          (op.status === "pending" || op.status === "delivery-unknown"))))) return;
    await this.mutate({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.steer", runId: run.runId, expectedTurnId: run.providerTurnId, text });
  }
  async stop() {
    const run = this.state.run;
    if (!run || run.runId !== this.state.selectedRunId || this.state.detailStale || !["starting", "running"].includes(run.state) ||
        this.state.snapshot?.activeRunId !== run.runId || !this.state.snapshot?.capabilities.controls.cancel || this.state.operations.some((op) => op.runId === run.runId && op.kind === "cancel" && op.status !== "rejected")) return;
    await this.mutate({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.cancel", runId: run.runId });
  }
  private async mutate(request: Extract<AgentRequest, { type: "agent.launch" | "agent.steer" | "agent.cancel" }>) {
    if (!this.state.connected) return;
    if (request.type !== "agent.cancel" && this.state.operations.filter((op) => op.kind !== "cancel").length >= AGENT_LIMITS.receipts) {
      this.update({ notice: "INSTRUCTION_LIMIT: local receipt limit reached; inspect retained history. Stop remains available." }); return;
    }
    const kind = request.type.slice(6) as LocalOperation["kind"];
    // Reserve Stop independently of the instruction budget. There is one active
    // run and at most 20 retained runs. A definitively rejected Stop may be
    // deliberately retried; retain the latest transport receipt for that run.
    let operations = this.state.operations;
    if (request.type === "agent.cancel") operations = operations.filter((op) => !(op.kind === "cancel" && op.runId === request.runId && op.status === "rejected"));
    if (request.type === "agent.launch") {
      ++this.readTicket; this.readAgain = false; this.detailSequence = -1;
    }
    this.update({ operations: [...operations, { requestId: request.requestId, runId: request.runId, kind,
      text: request.type === "agent.steer" ? request.text : request.type === "agent.launch" ? this.state.draft?.task ?? null : null,
      status: "pending", message: "Waiting for acknowledgement; this is not completion." }],
      ...(request.type === "agent.launch" ? { selectedRunId: request.runId, paneOpen: true, run: null, records: [], pageCursor: 0,
        pageTruncated: false, reading: false, following: true, detailStale: true } : {}),
    });
    const result = await this.request(request);
    const status = !result || (!result.ok && ["AGENT_OUTCOME_UNKNOWN", "CORE_TIMEOUT", "CORE_GENERATION_CHANGED", "INVALID_CORE_MESSAGE"].includes(result.error.code)) ? "delivery-unknown"
      : !result.ok ? "rejected" : result.agent?.kind === "steer" ? result.agent.receipt.status : "accepted";
    const message = !result ? "Connection changed before acknowledgement. Do not replay this command."
      : !result.ok ? `${result.error.code}: ${displayAgentText(result.error.message)}`
        : result.agent?.kind === "steer" ? result.agent.receipt.error?.message ?? "Provider acknowledged the instruction; not turn completion."
          : kind === "launch" ? "Admission recorded; not provider activity or completion." : "Stop requested; interruption and cleanup are not yet confirmed.";
    this.update({ operations: this.state.operations.map((op) => op.requestId === request.requestId
      // An already observed durable receipt outranks a later ambiguous transport failure.
      && (op.status === "pending" || op.status === "delivery-unknown") ? { ...op, status, message } : op) });
    if (result?.ok && request.type === "agent.launch" && this.state.draft?.prepared?.runId === request.runId) {
      // The user may have moved elsewhere or changed this draft while awaiting
      // admission. A late acknowledgement cannot steal focus or erase new text.
      // Retire its proposal and tickets too: an unaccepted review must never
      // resurrect the admitted draft after this asynchronous acknowledgement.
      this.closeDraft();
    }
    this.failure(result);
    if (result) void this.refresh(); // Only reads, never mutation retries.
  }
  async read(fromStart = false) {
    this.update({ following: false });
    await this.readDetail(true, fromStart ? 0 : this.state.pageCursor);
  }
  follow() {
    if (!this.state.selectedRunId || this.state.snapshot?.activeRunId !== this.state.selectedRunId) return;
    this.update({ following: true });
    void this.readDetail(false);
  }
  private async readDetail(explicit: boolean, cursor?: number) {
    const runId = this.state.selectedRunId;
    if (!runId || !this.state.connected) return;
    if (this.state.reading) { if (!explicit) this.readAgain = true; return; }
    const ticket = ++this.readTicket;
    const afterRecord = cursor ?? (this.state.following ? Math.max(0, (this.state.records[0]?.recordId ?? 1) - 1) : 0);
    this.update({ reading: true });
    const result = await this.request({ protocolVersion: PROTOCOL_VERSION, requestId: this.id(), type: "agent.read", runId, afterRecord });
    if (ticket !== this.readTicket || runId !== this.state.selectedRunId) return;
    this.update({ reading: false });
    if (result?.ok && result.agent?.kind === "read" && result.sequence >= this.watermark && result.sequence >= this.detailSequence) {
      const { run, page } = result.agent;
      const previous = this.state.run;
      // Defend against a malformed stateful provider even behind schema checks.
      if (previous && isTerminalRunState(previous.state) && previous.state !== run.state) {
        this.update({ notice: "INVALID_CORE_MESSAGE: terminal run regression ignored.", detailStale: true });
      } else {
        this.detailSequence = result.sequence;
        this.watermark = Math.max(this.watermark, result.sequence);
        const tail = this.state.following && this.state.snapshot?.activeRunId === runId ? this.state.snapshot.tail : null;
        const replace = explicit || this.state.following || !previous;
        // The schema already caps each page at 256 KiB / 2048 records. Dropping
        // a prefix here while advancing the server cursor would make it unreadable.
        const records = tail ?? page.records;
        this.update({ run, detailStale: false,
          ...(replace ? { records, pageCursor: tail ? tail.at(-1)?.recordId ?? 0 : page.nextCursor,
            pageTruncated: page.truncated } : {}),
          operations: this.state.operations.map((op) => {
            const receipt = op.runId === runId ? run.instructions.find((r) => r.requestId === op.requestId) : null;
            return receipt ? { ...op, status: receipt.status, message: receipt.error?.message ?? "Durable instruction receipt observed; not completion." } : op;
          }),
        });
      }
    } else this.failure(result);
    const again = this.readAgain;
    this.readAgain = false;
    if (again && this.state.connected) void this.readDetail(false);
  }
}
