import { isAbsolute, normalize } from "node:path";
import type { CodexTransport, CodexTransportSink } from "./codex-app-server";
import { ProviderJsonl } from "./jsonl";

export interface TrustedLocalSessionSnapshot {
  status: "starting" | "ready" | "running" | "stopping" | "closed" | "failed";
  threadId: string | null;
  turnId: string | null;
  output: string;
  approvals: Array<{ id: string; method: string; summary: string; choices: string[] }>;
  message: string;
}
/** Observation only: a completed tool call does not complete its turn or task.
 * Structurally matches the fleet's optional wire activity; snapshot stays stable. */
export interface TrustedLocalActivity {
  id: string;
  at: string;
  turnId: string | null;
  kind: "command" | "fileChange" | "tool" | "turn";
  status: "running" | "completed" | "failed";
  summary: string;
}
export interface TrustedLocalSessionOptions {
  root: string;
  executable: string;
  /** Core-owned injection, never supplied by renderer RPC. */
  openTransport: (sink: CodexTransportSink) => CodexTransport;
}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider object");
  return value as ObjectValue;
};
const string = (value: unknown, limit = 1024 * 1024): string => {
  if (typeof value !== "string" || Buffer.byteLength(value) > limit) throw new Error("Invalid provider text");
  return value;
};
const identity = (value: unknown): string => {
  const result = string(value, 256);
  if (!result || /[\p{White_Space}\p{Cc}\p{Cf}]/u.test(result)) throw new Error("Invalid provider identity");
  return result;
};
const requestId = (value: unknown): string | number => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  const id = identity(value);
  if (Buffer.byteLength(id) > 248) throw new Error("Provider request identity limit");
  return id;
};
const key = (value: string | number) => `${typeof value}:${value}`;
const byteTail = (value: string, limit: number): string => {
  const bytes = Buffer.from(value);
  let start = Math.max(0, bytes.length - limit);
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return bytes.toString("utf8", start);
};
const visible = (value: string): string => value.replace(/[\p{Cc}\p{Cf}]/gu, (point) =>
  point === "\n" || point === "\t" ? point : `[U+${point.codePointAt(0)!.toString(16).toUpperCase()}]`);
const input = (text: string, limit = 16 * 1024) => {
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > limit || text.includes("\0")) {
    throw new Error(`Message must contain between 1 and ${limit} UTF-8 bytes, without NUL.`);
  }
  return [{ type: "text", text, text_elements: [] }];
};

// Deliberately summarize structure, not arbitrary command strings, tool names,
// arguments, output, paths, diffs, errors or configuration. Those may be secrets.
function activityLabel(item: ObjectValue): { kind: TrustedLocalActivity["kind"]; label: string } | null {
  switch (item.type) {
    case "commandExecution": {
      const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
      const types = actions.slice(0, 64).map((action: unknown) => action && typeof action === "object" ? (action as ObjectValue).type : null);
      const labels: Record<string, string> = { read: "Reading files", listFiles: "Listing files", search: "Searching files" };
      const label = types.length === 1 && Object.hasOwn(labels, String(types[0])) ? labels[String(types[0])] : undefined;
      return { kind: "command", label: label ? `${label} (shell command)` : "Shell command" };
    }
    case "fileChange": return { kind: "fileChange", label: Array.isArray(item.changes)
      ? `File changes (${item.changes.length} ${item.changes.length === 1 ? "file" : "files"})` : "File changes" };
    case "mcpToolCall": return { kind: "tool", label: "MCP tool" };
    case "dynamicToolCall": return { kind: "tool", label: "Dynamic tool" };
    case "collabAgentToolCall": {
      const labels: Record<string, string> = { spawnAgent: "Spawn agent request", sendInput: "Send agent input request",
        resumeAgent: "Resume agent request", wait: "Wait for agents request", closeAgent: "Close agent request",
        sendMessage: "Message agent request", followupTask: "Follow-up task request", interruptAgent: "Interrupt agent request", listAgents: "List agents request" };
      return { kind: "tool", label: Object.hasOwn(labels, String(item.tool)) ? labels[String(item.tool)]! : "Agent coordination request" };
    }
    case "webSearch": return { kind: "tool", label: "Web search" };
    default: return null;
  }
}

/** One owned conversation, with inherited Codex settings. No configuration,
 * credential, sandbox or approval-policy overrides are manufactured here. */
export class TrustedLocalSession {
  private state: TrustedLocalSessionSnapshot = { status: "starting", threadId: null, turnId: null,
    output: "", approvals: [], message: "Starting local Codex." };
  private transport?: CodexTransport;
  private started = false;
  private busy = false;
  private nextId = 0;
  private receivedBytes = 0;
  private framer = new ProviderJsonl();
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private approvals = new Map<string, { wireId: string | number; turnId: string; itemId: string }>();
  private items = new Map<string, { text: string; completed: boolean; summary?: string; activityId?: string; type?: string }>();
  private activities: TrustedLocalActivity[] = [];
  private nextActivityId = 0;
  private completedTurns = new Set<string>();
  private dispatch?: { id: string | null; done: boolean; early: Array<{ method: string; params: unknown }>; earlyBytes: number; activityId?: string };
  private closePromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private interrupted?: () => void;
  private exitTimer?: ReturnType<typeof setTimeout>;
  private stdoutEnded = false;
  private model: string | null = null;

  constructor(private options: TrustedLocalSessionOptions, private onChange: () => void) {
    for (const path of [options.root, options.executable]) {
      if (!isAbsolute(path) || normalize(path) !== path || /[\p{Cc}\p{Cf}]/u.test(path)) throw new Error("Expected canonical absolute core-owned path");
    }
  }
  snapshot(): TrustedLocalSessionSnapshot {
    return { ...this.state, approvals: this.state.approvals.map((approval) => ({ ...approval, choices: [...approval.choices] })) };
  }
  activity(): TrustedLocalActivity[] { return this.activities.map((entry) => ({ ...entry })); }
  private recordActivity(id: string | undefined, value: Omit<TrustedLocalActivity, "id" | "at">): string {
    const existing = id ? this.activities.find((entry) => entry.id === id) : undefined;
    // Never revive a trimmed row or regress a terminal observation.
    if (id && (!existing || existing.status !== "running")) return id;
    if (existing) Object.assign(existing, value);
    else {
      id = `activity:${++this.nextActivityId}`;
      this.activities.push({ id, at: new Date().toISOString(), ...value });
    }
    this.trimActivities();
    return id!;
  }
  private trimActivities(): void {
    while (this.activities.length > 128 || Buffer.byteLength(JSON.stringify(this.activities)) > 64 * 1024) this.activities.shift();
  }
  private unfinishedActivities(reason: string): void {
    for (const entry of this.activities) if (entry.status === "running") {
      entry.status = "failed";
      entry.summary += ` — outcome unconfirmed (${reason})`;
    }
    this.trimActivities();
  }
  private change(): void {
    try { this.onChange(); } catch { this.fail("Session observer failed; local execution is stopping.", false); }
  }
  private active(): boolean { return !["stopping", "closed", "failed"].includes(this.state.status); }
  private append(text: string): void {
    const combined = this.state.output + visible(text);
    // Keep a bounded UTF-8 tail; never split a code point.
    this.state.output = Buffer.byteLength(combined) > 256 * 1024
      ? "[Earlier output omitted]\n" + byteTail(combined, 256 * 1024 - 32) : combined;
    this.change();
  }
  private write(message: unknown): void {
    if (!this.transport || ["closed", "failed"].includes(this.state.status)) throw new Error("Local Codex connection is closed.");
    const line = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(line) > 256 * 1024) throw new Error("Provider request limit exceeded.");
    this.transport.write(line);
  }
  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.transport || ["closed", "failed"].includes(this.state.status) ||
        (this.state.status === "stopping" && method !== "turn/interrupt")) return Promise.reject(new Error("Local Codex connection is closing."));
    if (this.pending.size >= 4 || this.nextId >= 4096) return Promise.reject(new Error("Session request limit reached."));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => this.fail("Codex acknowledgement timed out; delivery is unknown. Do not replay."), 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch {
        this.fail("Codex connection failed; delivery is unknown. Do not replay.");
        // A synchronous callback may already have failed/closed the session.
        if (this.pending.delete(id)) { clearTimeout(timer); reject(new Error(this.state.message)); }
      }
    });
  }
  private rejectPending(): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(this.state.message)); }
    this.pending.clear();
  }
  private clearApprovals(): void { this.approvals.clear(); this.state.approvals = []; }
  private fail(message: string, publish = true): void {
    if (["closed", "failed"].includes(this.state.status)) return;
    this.state.status = "failed"; this.state.message = message; this.clearApprovals();
    this.unfinishedActivities("connection ended");
    this.rejectPending(); this.interrupted?.();
    if (publish) this.change();
    void this.close();
  }
  private close(): Promise<void> {
    return this.closePromise ??= Promise.resolve().then(async () => {
      clearTimeout(this.exitTimer); this.rejectPending();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([this.transport?.close() ?? Promise.resolve({ status: "not-needed" }),
          new Promise<{ status: string }>((resolve) => { timer = setTimeout(() => resolve({ status: "unknown" }), 5000); })]);
        if (this.state.status !== "failed") {
          this.state.status = result.status === "confirmed" || result.status === "not-needed" ? "closed" : "failed";
          this.state.message = this.state.status === "closed" ? "Local session closed." : "Session closed, but owned process cleanup is unconfirmed.";
        }
      } catch {
        this.state.status = "failed"; this.state.message = "Owned process cleanup could not be confirmed.";
      } finally { clearTimeout(timer); this.unfinishedActivities("session closed"); this.change(); }
    });
  }

  async start(prompt: string, model: string | null): Promise<void> {
    if (this.started || !this.active()) throw new Error("This session cannot be started again.");
    this.started = true; this.busy = true; this.model = model;
    try {
      input(prompt, 128 * 1024);
      if (model !== null) identity(model);
      this.transport = this.options.openTransport({
        stdout: (chunk) => {
          if (["closed", "failed"].includes(this.state.status)) return;
          try {
            this.receivedBytes += chunk.length;
            if (this.receivedBytes > 32 * 1024 * 1024) throw new Error("Stream limit");
            this.framer.push(chunk, (value) => { if (!["closed", "failed"].includes(this.state.status)) this.receive(value); });
          } catch { this.fail("Invalid or oversized Codex stream; delivery or outcome is unknown."); }
        },
        stderr: (chunk) => {
          // Drain without publishing potentially private runtime diagnostics.
          this.receivedBytes += chunk.length;
          if (this.receivedBytes > 32 * 1024 * 1024) this.fail("Codex diagnostic stream limit reached.");
        },
        end: () => {
          this.stdoutEnded = true;
          try { this.framer.end(); } catch { this.fail("Codex stream ended mid-message; outcome is unknown."); }
          if (this.active()) this.fail("Codex connection ended; no commands will be replayed.");
        },
        exit: () => {
          // Exit may precede stdout EOF; leave time for buffered terminal evidence.
          if (!this.stdoutEnded && !this.exitTimer) this.exitTimer = setTimeout(() => {
            if (this.active()) this.fail("Codex process exited; no commands will be replayed.");
          }, 1000);
        },
        error: () => this.fail("Codex transport failed; delivery or outcome is unknown."),
      });
      if (!this.active()) throw new Error(this.state.message);
      const hello = object(await this.request("initialize", { clientInfo: { name: "swarm_ide", version: "0.1.0" } }));
      string(hello.userAgent, 512);
      if (!this.active()) return;
      this.write({ method: "initialized", params: {} });
      if (!this.active()) return;
      const response = object(await this.request("thread/start", { cwd: this.options.root }));
      if (!this.active()) return;
      if (response.cwd !== this.options.root) throw new Error("Codex returned a different working directory.");
      this.state.threadId = identity(object(response.thread).id);
      await this.begin(prompt, 128 * 1024);
    } catch (error) {
      if (this.active()) this.fail(error instanceof Error && error.message === "Codex returned a different working directory."
        ? error.message : "Codex setup failed; no automatic retry was attempted.");
      throw new Error(this.state.message);
    } finally { this.busy = false; }
  }
  private async begin(text: string, limit = 16 * 1024): Promise<void> {
    const content = input(text, limit);
    if (!this.active()) throw new Error("Session is not active.");
    this.dispatch = { id: null, done: false, early: [], earlyBytes: 0 };
    this.items.clear(); this.clearApprovals(); this.state.turnId = null;
    this.state.status = "running"; this.state.message = "Sending message to local Codex.";
    this.append(`\nYou: ${text}\n\n`);
    if (!this.active()) throw new Error("Session stopped before dispatch.");
    const response = object(await this.request("turn/start", { threadId: this.state.threadId, input: content,
      ...(this.model === null ? {} : { model: this.model }) }));
    this.confirm(identity(object(response.turn).id));
  }
  private confirm(id: string): void {
    const dispatch = this.dispatch;
    if (!dispatch || (dispatch.id !== null && dispatch.id !== id)) throw new Error("Mismatched turn acknowledgement");
    dispatch.id = id; this.state.turnId = id;
    if (!dispatch.activityId) dispatch.activityId = this.recordActivity(undefined, { turnId: id, kind: "turn", status: "running", summary: "Codex turn" });
    if (!dispatch.done && this.state.status === "running") this.state.message = "Local Codex is working.";
    const early = dispatch.early; dispatch.early = []; dispatch.earlyBytes = 0;
    for (const message of early) this.notification(message.method, message.params);
    this.change();
  }
  async send(text: string): Promise<void> {
    const content = input(text);
    if (this.busy) throw new Error("A message acknowledgement is still pending; do not resend it.");
    if (!["ready", "running"].includes(this.state.status)) throw new Error("Session is not ready for input.");
    if (this.state.approvals.length) throw new Error("Answer the pending approval before sending another message.");
    this.busy = true;
    try {
      if (this.state.status === "ready") await this.begin(text);
      else {
        const turnId = this.state.turnId;
        if (!turnId) throw new Error("The active turn has not been acknowledged.");
        this.append(`\nYou (steering): ${text}\n\n`);
        if (!this.active()) throw new Error("Session stopped before dispatch.");
        const response = object(await this.request("turn/steer", { threadId: this.state.threadId, expectedTurnId: turnId, input: content }));
        if (response.turnId !== turnId) throw new Error("Mismatched steering acknowledgement");
      }
    } catch {
      if (this.active()) this.fail("Message delivery could not be confirmed; no automatic replay was attempted.");
      throw new Error(this.state.message);
    } finally { this.busy = false; }
  }
  async decide(id: string, choice: string): Promise<void> {
    const pending = this.approvals.get(id), shown = this.state.approvals.find((approval) => approval.id === id);
    if (this.state.status !== "running" || !pending || pending.turnId !== this.state.turnId || !shown?.choices.includes(choice)) {
      throw new Error("Approval is stale or its decision is unsupported.");
    }
    // Remove before writing: synchronous transport callbacks cannot answer twice.
    this.approvals.delete(id); this.state.approvals = this.state.approvals.filter((approval) => approval.id !== id);
    try { this.write({ id: pending.wireId, result: { decision: choice } }); }
    catch { this.fail("Approval delivery is unknown; do not replay it."); throw new Error(this.state.message); }
    this.change();
  }
  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    // Reserve the promise before publishing: observers can reenter Stop.
    let resolve!: () => void;
    this.stopPromise = new Promise<void>((done) => { resolve = done; });
    const wasActive = this.active();
    if (wasActive) { this.state.status = "stopping"; this.state.message = "Stopping local Codex."; }
    this.clearApprovals(); this.change();
    void (async () => {
      if (wasActive && this.state.turnId && !this.dispatch?.done) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const terminal = new Promise<void>((done) => { this.interrupted = done; timer = setTimeout(done, 1000); });
        // Ack is not completion. The bounded grace also covers a missing ack.
        void this.request("turn/interrupt", { threadId: this.state.threadId, turnId: this.state.turnId }).catch(() => {});
        await terminal; clearTimeout(timer); this.interrupted = undefined;
      }
      await this.close(); resolve();
    })();
    return this.stopPromise;
  }

  private receive(value: unknown): void {
    const message = object(value);
    if (typeof message.method === "string") {
      if ("id" in message) this.serverRequest(requestId(message.id), message.method, message.params);
      else this.notification(message.method, message.params);
      return;
    }
    if (!Number.isSafeInteger(message.id) || ("error" in message) === ("result" in message)) throw new Error("Invalid provider response");
    const pending = this.pending.get(message.id as number);
    if (!pending) {
      if ((message.id as number) <= 0 || (message.id as number) > this.nextId) throw new Error("Unrequested response");
      return;
    }
    this.pending.delete(message.id as number); clearTimeout(pending.timer);
    if ("error" in message) pending.reject(new Error("Codex rejected the request."));
    else pending.resolve(message.result);
  }
  private serverRequest(id: string | number, method: string, value: unknown): void {
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)) {
      this.write({ id, error: { code: -32601, message: "This client does not support this interactive request." } });
      this.fail(`Unsupported Codex interactive request: ${visible(string(method, 256))}. Session stopped without granting approval.`);
      return;
    }
    const params = object(value), turnId = identity(params.turnId), itemId = identity(params.itemId);
    if (this.completedTurns.has(turnId) || params.threadId !== this.state.threadId || this.state.status !== "running" ||
        this.dispatch?.done || (this.dispatch?.id !== null && turnId !== this.dispatch?.id)) {
      this.write({ id, result: { decision: "cancel" } }); return;
    }
    // A correlated approval may arrive before turn/start's response.
    if (this.dispatch?.id === null) this.confirm(turnId);
    if (this.state.status !== "running") { this.write({ id, result: { decision: "cancel" } }); return; }
    const approvalId = key(id);
    if (this.approvals.has(approvalId) || this.approvals.size >= 16) throw new Error("Duplicate or excess approval requests");
    const choices = ["accept", "decline"].filter((decision) => params.availableDecisions === undefined ||
      (Array.isArray(params.availableDecisions) && params.availableDecisions.includes(decision)));
    if (!choices.includes("decline")) throw new Error("Unsupported approval decisions");
    const network = params.networkApprovalContext === undefined || params.networkApprovalContext === null ? null : object(params.networkApprovalContext);
    const cwd = params.cwd == null ? null : string(params.cwd, 4096);
    if (cwd !== null && (!isAbsolute(cwd) || /[\p{Cc}\p{Cf}]/u.test(cwd))) throw new Error("Invalid command working directory");
    const summary = network ? `Network access: ${string(network.protocol, 32)} ${string(network.host, 1024)}` :
      method.includes("commandExecution") ? `Working directory: ${cwd ?? "Unavailable (not inferred from the session root)"}\nRun command: ${params.command == null ? "Command details unavailable" : string(params.command, 16 * 1024)}` :
        `File changes: ${this.items.get(itemId)?.summary ?? "Change details unavailable"}`;
    const reason = params.reason == null ? "" : `\n${string(params.reason, 4096)}`;
    // No blind accept if the actual command/change proposal was not supplied.
    const canInspect = network !== null || (method.includes("commandExecution") ? typeof params.command === "string" && cwd !== null : Boolean(this.items.get(itemId)?.summary));
    this.approvals.set(approvalId, { wireId: id, turnId, itemId });
    const preview = visible(summary + reason), truncated = Buffer.byteLength(preview) > 16 * 1024;
    this.state.approvals.push({ id: approvalId, method,
      summary: truncated ? "[Preview truncated; approval unavailable]\n" + byteTail(preview, 16 * 1024 - 64) : preview,
      choices: canInspect && !truncated ? choices : ["decline"] });
    this.change();
  }
  private notification(method: string, value: unknown): void {
    if (method === "serverRequest/resolved") {
      const params = object(value);
      if (params.threadId !== this.state.threadId) return;
      const id = key(requestId(params.requestId));
      this.approvals.delete(id); this.state.approvals = this.state.approvals.filter((approval) => approval.id !== id); this.change(); return;
    }
    if (!["turn/started", "turn/completed", "item/agentMessage/delta", "item/started", "item/completed"].includes(method)) return;
    const params = object(value), dispatch = this.dispatch;
    if (!dispatch || params.threadId !== this.state.threadId || dispatch.done) return;
    if (method === "turn/started" || method === "turn/completed") {
      const turn = object(params.turn), id = identity(turn.id);
      if (this.completedTurns.has(id)) return;
      if (dispatch.id !== null && dispatch.id !== id) return;
      if (method === "turn/started" ? turn.status !== "inProgress" : !["completed", "failed", "interrupted"].includes(String(turn.status))) throw new Error("Invalid turn status");
      this.confirm(id);
      if (method === "turn/completed") {
        dispatch.done = true; this.clearApprovals();
        this.completedTurns.add(id);
        this.recordActivity(dispatch.activityId, { turnId: id, kind: "turn", status: turn.status === "completed" ? "completed" : "failed",
          summary: `Codex turn — ${turn.status}` });
        this.unfinishedActivities("turn ended without item completion");
        if (this.state.status === "running") { this.state.status = "ready"; this.state.message = `Codex turn ${turn.status}. You can send another message.`; }
        this.interrupted?.(); this.change();
      }
      return;
    }
    if (dispatch.id === null) {
      dispatch.earlyBytes += Buffer.byteLength(JSON.stringify(value));
      if (dispatch.early.length >= 32 || dispatch.earlyBytes > 256 * 1024) throw new Error("Early event limit");
      dispatch.early.push({ method, params: value }); return;
    }
    if (params.turnId !== dispatch.id) return;
    const item = method === "item/agentMessage/delta" ? null : object(params.item);
    const id = identity(item ? item.id : params.itemId);
    if (this.items.size >= 2048 && !this.items.has(id)) throw new Error("Item limit");
    let tracked = this.items.get(id);
    if (!tracked) { tracked = { text: "", completed: false }; this.items.set(id, tracked); }
    if (tracked.completed) return;
    if (item) {
      if (tracked.type !== undefined && tracked.type !== item.type) throw new Error("Provider item type changed");
      tracked.type = string(item.type, 128);
    }
    if (!item || item.type === "agentMessage") {
      const next = item ? string(item.text) : tracked.text + string(params.delta);
      if (Buffer.byteLength(next) > 1024 * 1024 || !next.startsWith(tracked.text)) throw new Error("Invalid message accumulation");
      this.append(next.slice(tracked.text.length)); tracked.text = next;
    } else if (item.type === "fileChange" && Array.isArray(item.changes)) {
      if (item.changes.length > 64) throw new Error("File change limit");
      tracked.summary = item.changes.map((value) => { const change = object(value); return `${string(change.path, 4096)}\n${string(change.diff, 32 * 1024)}`; }).join("\n");
      if (Buffer.byteLength(tracked.summary) > 64 * 1024) throw new Error("File change preview limit");
    }
    const activity = item ? activityLabel(item) : null;
    if (activity && item) {
      const completed = method === "item/completed";
      const nonzeroExit = item.type === "commandExecution" && Number.isSafeInteger(item.exitCode) && item.exitCode !== 0;
      const failed = ["failed", "declined", "interrupted"].includes(String(item.status)) || nonzeroExit ||
        (item.type === "dynamicToolCall" && item.success === false);
      const knownTerminal = ["completed", "failed", "declined", "interrupted"].includes(String(item.status)) || item.type === "webSearch";
      const status = !completed ? "running" : failed || !knownTerminal ? "failed" : "completed";
      const outcome = !knownTerminal ? "outcome unconfirmed" : ["declined", "interrupted"].includes(String(item.status)) ? String(item.status) : failed ? "failed" : "completed";
      const exit = completed && item.type === "commandExecution" && Number.isSafeInteger(item.exitCode) ? ` (exit ${item.exitCode})` : "";
      tracked.activityId = this.recordActivity(tracked.activityId, { turnId: dispatch.id, kind: activity.kind, status,
        summary: activity.label + (completed ? ` — ${outcome}${exit}` : "") });
    }
    if (method === "item/completed") {
      tracked.completed = true;
      for (const [approvalId, approval] of this.approvals) if (approval.itemId === id) {
        this.approvals.delete(approvalId); this.state.approvals = this.state.approvals.filter((entry) => entry.id !== approvalId);
      }
      this.change();
    } else if (activity) this.change();
  }
}
