import { execFile, spawn } from "node:child_process";
import { isAbsolute, normalize } from "node:path";
import { z } from "zod";
import { AGENT_LIMITS, PreparedAgentContextSchema, utf8Bytes, type AgentError } from "../../protocol/agents";
import type { AdapterCapabilities, AdapterEvent, AgentAdapter, AgentHandle, AgentOperation, CleanupEvidence, PreparedAgentContext } from "./adapter";
import { ProviderJsonl, ProviderLineLimit } from "./jsonl";

// Stable schema generated from the complete installed 0.153.4 package. New
// versions must earn conformance; a --version response is not policy evidence.
export const CODEX_ADAPTER_VERSION = "0.153.4";
const bound = (max: number) => z.string().max(max).refine((v) => utf8Bytes(v) <= max);
const identity = bound(256).min(1).refine((v) => !/[\p{White_Space}\p{Cc}\p{Cf}]/u.test(v));
const display = (max: number) => bound(max).min(1).refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v));
const object = z.record(z.string(), z.unknown());
const turn = z.object({ id: identity, status: z.enum(["inProgress", "completed", "failed", "interrupted"]) });
const correlated = z.object({ threadId: identity, turnId: identity });
const threadResult = z.object({
  thread: z.object({ id: identity }), model: display(256), modelProvider: display(128),
  cwd: display(4096), approvalPolicy: z.literal("never"),
  sandbox: z.object({ type: z.literal("readOnly"), networkAccess: z.literal(false).optional() }).strict(),
  instructionSources: z.array(display(4096)).max(32).default([]),
  reasoningEffort: bound(64).nullable().optional(),
});
const messageItem = z.object({ type: z.literal("agentMessage"), id: identity,
  text: bound(AGENT_LIMITS.providerLineBytes), phase: z.enum(["commentary", "final_answer"]).nullable().optional() });
const errorFor = (code: AgentError["code"], message: string): AgentError => ({ code, message });
const unknownError = () => errorFor("AGENT_OUTCOME_UNKNOWN", "Provider acknowledgement or outcome could not be established; do not replay.");
class Fault extends Error {
  constructor(readonly error: AgentError) { super(error.message); }
}

export interface CodexTransportSink {
  stdout(chunk: Uint8Array): void;
  stderr(chunk: Uint8Array): void;
  end(): void;
  exit(code: number | null): void;
  error(): void;
}
/** Trusted core injection, never exposed as renderer RPC. R2 supplies an owned
 * lifetime transport; close must not claim descendants exited without proof. */
export interface CodexTransport {
  write(line: string): void;
  close(): Promise<CleanupEvidence>;
}
export interface CodexAdapterOptions {
  root: string;
  executable: string;
  /** E1/R2 owns effective-profile inspection. Missing evidence is unavailable. */
  probe?: () => Promise<AdapterCapabilities>;
  connect?: (sink: CodexTransportSink) => CodexTransport;
  requestTimeoutMs?: number;
}

function stdio(executable: string, root: string, sink: CodexTransportSink): CodexTransport {
  const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
    cwd: root, stdio: ["pipe", "pipe", "pipe"], shell: false,
  });
  child.stdout.on("data", sink.stdout);
  child.stderr.on("data", sink.stderr);
  child.stdout.on("end", sink.end);
  child.on("exit", sink.exit);
  child.on("error", sink.error);
  child.stdin.on("error", sink.error);
  child.stdout.on("error", sink.error);
  child.stderr.on("error", sink.error);
  return {
    write(line) {
      if (child.stdin.destroyed || child.stdin.writableLength + utf8Bytes(line) > AGENT_LIMITS.pageBytes) {
        throw new Error("Provider stdin unavailable or backed up");
      }
      child.stdin.write(line);
    },
    async close() {
      child.stdin.end();
      // Only this live ChildProcess, never a persisted PID or kill-by-name.
      child.kill("SIGTERM");
      return { status: "unknown", observedAt: new Date().toISOString(),
        detail: "Direct server termination requested; descendant cleanup requires the R2 process owner." };
    },
  };
}

async function unavailableProbe(executable: string): Promise<AdapterCapabilities> {
  const version = await new Promise<string>((resolve) => {
    execFile(executable, ["--version"], { timeout: 3000, maxBuffer: 1024, encoding: "utf8" }, (error, stdout) => {
      resolve(!error && /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+)\s*$/.test(stdout) ? stdout.trim().slice(10) : "unknown");
    });
  });
  return { provider: "codex", version, executable, available: false,
    reason: errorFor(version === CODEX_ADAPTER_VERSION ? "ADAPTER_POLICY_UNAVAILABLE" : "ADAPTER_UNAVAILABLE",
      version === CODEX_ADAPTER_VERSION ? "The effective limited-capability profile has not been verified." : "Installed Codex version has not passed adapter conformance."),
    supports: { steer: false, interrupt: false, readOnly: false } };
}

export function createCodexAppServerAdapter(options: CodexAdapterOptions): AgentAdapter {
  const { executable, root } = options;
  if ([root, executable].some((p) => !isAbsolute(p) || normalize(p) !== p || /[\p{Cc}\p{Cf}]/u.test(p))) {
    throw new Error("Adapter requires canonical operator-owned absolute paths");
  }
  const timeout = options.requestTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) throw new Error("Invalid adapter request timeout");
  const probe = async (): Promise<AdapterCapabilities> => {
    const result = await (options.probe?.() ?? unavailableProbe(executable));
    if (result.executable !== executable || result.version !== CODEX_ADAPTER_VERSION || result.provider !== "codex" ||
        (result.available && (!result.supports.readOnly || result.reason))) {
      return { provider: "codex", executable, version: CODEX_ADAPTER_VERSION, available: false,
        reason: errorFor("ADAPTER_POLICY_UNAVAILABLE", "Adapter identity or verified policy evidence does not match."),
        supports: { steer: false, interrupt: false, readOnly: false } };
    }
    return result;
  };
  return { probe, async start(input, emit) {
    const context = PreparedAgentContextSchema.parse(input);
    if (context.launchContext.root !== root) throw new Fault(errorFor("STALE_CONTEXT", "Launch root differs from the registered world."));
    if (context.launchContext.requested.effort !== null) throw new Fault(errorFor("UNSUPPORTED_CONTROL", "Reasoning effort requires model-specific capability evidence, not yet available in R1."));
    const capabilities = await probe();
    if (!capabilities.available) throw new Fault(capabilities.reason ?? errorFor("ADAPTER_UNAVAILABLE", "Adapter unavailable."));
    const session = new CodexSession(root, context, capabilities, timeout, emit);
    session.connect(options.connect ?? ((sink) => stdio(executable, root, sink)));
    return session;
  } };
}

class CodexSession implements AgentHandle {
  private transport?: CodexTransport;
  private framer = new ProviderJsonl();
  private threadId: string | null = null;
  private turnId: string | null = null;
  private turnSent = false;
  private ended = false;
  private stopped = false;
  private exited = false;
  private nextId = 0;
  private receivedBytes = 0;
  private outputBytes = 0;
  private messages = 0;
  private steering = false;
  private interrupting = false;
  private cleanup?: Promise<CleanupEvidence>;
  private deadline?: ReturnType<typeof setTimeout>;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Fault) => void; timer: ReturnType<typeof setTimeout> }>();
  private items = new Map<string, { text: string; completed: boolean }>();
  private early: { method: string; params: unknown }[] = [];
  private earlyBytes = 0;

  constructor(private root: string, private context: PreparedAgentContext, private capabilities: AdapterCapabilities,
    private timeout: number, private emit: (event: AdapterEvent) => void) {}
  private at(): string { return new Date().toISOString(); }

  connect(open: (sink: CodexTransportSink) => CodexTransport): void {
    try {
      this.transport = open({
        stdout: (bytes) => {
          if (this.stopped) return;
          try {
            this.receivedBytes += bytes.length;
            if (this.receivedBytes > AGENT_LIMITS.transcriptBytes * 4) throw new Fault(errorFor("OUTPUT_LIMIT", "Provider stream byte limit reached."));
            this.framer.push(bytes, (message) => { if (!this.stopped) this.receive(message); });
          } catch (error) { this.fail(error instanceof Fault ? error.error : error instanceof ProviderLineLimit
            ? errorFor("OUTPUT_LIMIT", "Provider JSONL line limit reached.") : errorFor("AGENT_OUTCOME_UNKNOWN", "Invalid provider JSONL message.")); }
        },
        // Drain, but do not publish stderr: it can contain credentials or private diagnostics.
        stderr: (bytes) => {
          this.receivedBytes += bytes.length;
          if (this.receivedBytes > AGENT_LIMITS.transcriptBytes * 4) this.fail(errorFor("OUTPUT_LIMIT", "Provider stream byte limit reached."));
        },
        end: () => {
          try { this.framer.end(); } catch { this.fail(unknownError()); }
          if (!this.ended && !this.stopped) this.fail(unknownError());
          else this.rejectPending();
        },
        exit: (exitCode) => {
          if (this.exited) return;
          this.exited = true;
          this.publish({ type: "process-exit", exitCode, at: this.at() });
          if (!this.ended) this.fail(unknownError());
          else this.rejectPending();
        },
        error: () => this.fail(unknownError()),
      });
      // A test transport (or a future owner) can report synchronous open failure.
      if (this.stopped) { this.cleanup = undefined; void this.close(); return; }
      this.deadline = setTimeout(() => this.fail(errorFor("AGENT_OUTCOME_UNKNOWN", "Run deadline reached without complete outcome evidence.")), AGENT_LIMITS.deadlineMs);
      void this.initialize().catch((error: unknown) => this.fail(error instanceof Fault ? error.error : unknownError()));
    } catch { this.fail(errorFor("ADAPTER_UNAVAILABLE", "Could not establish provider transport.")); }
  }

  private publish(event: AdapterEvent): void {
    try { this.emit(event); } catch { /* An observer is not provider evidence; stop safely. */
      this.stopped = true;
      this.rejectPending();
      if (this.deadline) clearTimeout(this.deadline);
      void this.close();
    }
  }
  private send(message: unknown): void {
    if (this.stopped || !this.transport) throw new Fault(unknownError());
    const line = JSON.stringify(message) + "\n";
    if (utf8Bytes(line) > AGENT_LIMITS.pageBytes) throw new Fault(errorFor("OUTPUT_LIMIT", "Provider request exceeds byte limit."));
    this.transport.write(line);
  }
  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.stopped || this.pending.size >= 3 || this.nextId >= AGENT_LIMITS.receipts + 8) {
        reject(new Fault(errorFor("INSTRUCTION_LIMIT", "Adapter control limit reached or connection stopped."))); return;
      }
      const id = ++this.nextId;
      const timer = setTimeout(() => this.fail(unknownError()), this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch { this.fail(unknownError()); }
    });
  }
  private rejectPending(): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Fault(unknownError())); }
    this.pending.clear();
  }
  private fail(error: AgentError): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.deadline) clearTimeout(this.deadline);
    this.rejectPending();
    this.early = []; this.earlyBytes = 0;
    if (!this.ended) {
      this.publish({ type: "error", error, dispatch: this.turnSent ? "unknown" : "not-sent", at: this.at() });
      if (!this.turnSent) {
        this.ended = true;
        this.publish({ type: "terminal", outcome: { kind: "setup-rejected", detail: error.message }, at: this.at() });
      }
    }
    void this.close();
  }
  private close(): Promise<CleanupEvidence> {
    return this.cleanup ??= (this.transport?.close() ?? Promise.resolve({ status: "not-needed" as const, observedAt: this.at(), detail: "No transport created." }))
      .catch(() => ({ status: "unknown" as const, observedAt: this.at(), detail: "Transport cleanup could not be confirmed." }));
  }
  async dispose(): Promise<CleanupEvidence> {
    if (!this.stopped) this.fail(unknownError());
    return this.close();
  }

  private async initialize(): Promise<void> {
    const hello = await this.request("initialize", { clientInfo: { name: "swarm_ide", version: "0.1.0" }, capabilities: { experimentalApi: false } });
    z.object({ userAgent: display(512) }).parse(hello);
    this.send({ method: "initialized", params: {} });
    const requested = this.context.launchContext.requested;
    const result = await this.request("thread/start", { cwd: this.root, approvalPolicy: "never", sandbox: "read-only",
      ...(requested.model === null ? {} : { model: requested.model }), ephemeral: true });
    const parsed = threadResult.safeParse(result);
    if (!parsed.success || parsed.data.cwd !== this.root) throw new Fault(errorFor("ADAPTER_POLICY_UNAVAILABLE", "Provider returned mismatched or unverified thread policy or directory."));
    const thread = parsed.data;
    this.threadId = thread.thread.id;
    this.publish({ type: "started", threadId: this.threadId, model: thread.model, cwd: thread.cwd,
      policy: "read-only", instructionPaths: thread.instructionSources, at: this.at() });
    if (this.stopped) return;
    this.turnSent = true;
    const response = await this.request("turn/start", { threadId: this.threadId,
      input: [{ type: "text", text: this.context.launchContext.submittedPrompt, text_elements: [] }],
      ...(requested.effort === null ? {} : { effort: requested.effort }) });
    const started = z.object({ turn }).parse(response);
    this.confirmTurn(started.turn.id);
    // Even a terminal status in this response is not a turn/completed notification.
  }

  private confirmTurn(id: string): void {
    if (!this.threadId || !this.turnSent) throw new Fault(unknownError());
    if (this.turnId && this.turnId !== id) throw new Fault(unknownError());
    if (!this.turnId && !this.ended && !this.stopped) {
      this.turnId = id;
      this.publish({ type: "turn-started", threadId: this.threadId, turnId: id, at: this.at() });
      const early = this.early; this.early = []; this.earlyBytes = 0;
      for (const event of early) this.notification(event.method, event.params);
    }
  }
  private matches(params: unknown): boolean {
    const ids = correlated.parse(params);
    return ids.threadId === this.threadId && ids.turnId === this.turnId;
  }
  private text(itemId: string | null, text: string, kind: "message" | "tool" | "status" = "message"): void {
    this.outputBytes += utf8Bytes(text);
    if (this.outputBytes > AGENT_LIMITS.transcriptBytes) throw new Fault(errorFor("OUTPUT_LIMIT", "Normalized provider output limit reached."));
    // Count code points so no record cuts a surrogate pair; UTF-8 limit <=64 KiB.
    let part = "", bytes = 0;
    for (const point of text) {
      const size = utf8Bytes(point);
      if (bytes + size > AGENT_LIMITS.recordBytes) {
        this.publish({ type: "item", itemId, kind, text: part, at: this.at() }); part = ""; bytes = 0;
      }
      part += point; bytes += size;
    }
    if (part) this.publish({ type: "item", itemId, kind, text: part, at: this.at() });
  }
  private item(id: string): { text: string; completed: boolean } {
    let item = this.items.get(id);
    if (!item) {
      if (this.items.size >= 2048) throw new Fault(errorFor("OUTPUT_LIMIT", "Provider item count limit reached."));
      item = { text: "", completed: false }; this.items.set(id, item);
    }
    return item;
  }

  private receive(value: unknown): void {
    if (++this.messages > 32_768) throw new Fault(errorFor("OUTPUT_LIMIT", "Provider message count limit reached."));
    const message = object.parse(value);
    if ("method" in message) {
      const method = display(256).parse(message.method);
      if ("id" in message) {
        const id = z.union([identity, z.number().int().safe()]).parse(message.id);
        if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
          this.send({ id, result: { decision: "cancel" } });
        } else this.send({ id, error: { code: -32601, message: "Unsupported provider request in read-only analysis." } });
        this.fail(errorFor("ADAPTER_POLICY_UNAVAILABLE", "Provider requested an unsupported capability; no approval granted."));
        return;
      }
      if ("result" in message || "error" in message) throw new Fault(unknownError());
      this.notification(method, message.params);
      return;
    }
    const id = z.number().int().positive().safe().parse(message.id);
    if (id > this.nextId || ("result" in message) === ("error" in message)) throw new Fault(unknownError());
    const pending = this.pending.get(id);
    if (!pending) return; // duplicate/late reply to one of our bounded request IDs
    if ("error" in message) {
      z.object({ code: z.number().int().safe(), message: bound(AGENT_LIMITS.providerLineBytes) }).parse(message.error);
      pending.reject(new Fault(errorFor("RUN_NOT_ACTIVE", "Provider rejected the command; its private error text was withheld.")));
    } else pending.resolve(message.result);
    clearTimeout(pending.timer); this.pending.delete(id);
  }

  private notification(method: string, params: unknown): void {
    if (this.ended) return; // terminal turn evidence is immutable
    if (!this.turnId && this.turnSent && ["item/agentMessage/delta", "item/started", "item/completed", "error", "model/rerouted"].includes(method)) {
      const ids = correlated.parse(params);
      if (ids.threadId !== this.threadId) return;
      this.earlyBytes += utf8Bytes(JSON.stringify(params));
      if (this.early.length >= 32 || this.earlyBytes > AGENT_LIMITS.tailBytes) throw new Fault(errorFor("OUTPUT_LIMIT", "Pre-turn notification buffer limit reached."));
      this.early.push({ method, params }); return;
    }
    if (method === "turn/started" || method === "turn/completed") {
      const event = z.object({ threadId: identity, turn }).parse(params);
      if (event.threadId !== this.threadId) return;
      if (this.turnId && this.turnId !== event.turn.id) return; // another/stale turn
      if (method === "turn/started" && event.turn.status !== "inProgress") throw new Fault(unknownError());
      if (method === "turn/completed" && event.turn.status === "inProgress") throw new Fault(unknownError());
      this.confirmTurn(event.turn.id);
      if (method === "turn/completed" && event.turn.status !== "inProgress") {
        this.ended = true;
        if (this.deadline) clearTimeout(this.deadline);
        const at = this.at();
        this.publish({ type: "terminal", outcome: { kind: "turn", threadId: event.threadId,
          turnId: event.turn.id, status: event.turn.status, observedAt: at }, at });
      }
      return;
    }
    if (method === "item/agentMessage/delta") {
      const event = correlated.extend({ itemId: identity, delta: bound(AGENT_LIMITS.providerLineBytes) }).parse(params);
      if (!this.matches(event)) return;
      const item = this.item(event.itemId);
      if (item.completed) return;
      if (utf8Bytes(item.text) + utf8Bytes(event.delta) > AGENT_LIMITS.providerLineBytes) throw new Fault(errorFor("OUTPUT_LIMIT", "Provider message item limit reached."));
      item.text += event.delta; this.text(event.itemId, event.delta);
      return;
    }
    if (method === "item/started" || method === "item/completed") {
      const event = correlated.extend({ item: z.object({ type: display(128), id: identity }) }).parse(params);
      if (!this.matches(event)) return;
      if (event.item.type === "agentMessage") {
        const data = messageItem.parse(object.parse(params).item);
        const item = this.item(data.id);
        if (item.completed) return;
        if (method === "item/started" && item.text.startsWith(data.text)) return;
        if (!data.text.startsWith(item.text)) throw new Fault(unknownError());
        this.text(data.id, data.text.slice(item.text.length)); item.text = data.text;
        if (method === "item/completed") item.completed = true;
      } else if (event.item.type === "commandExecution") {
        // A bounded generic summary, never private command output or raw reasoning.
        this.text(event.item.id, method === "item/started" ? "Shell tool started." : "Shell tool finished.", "tool");
      }
      return;
    }
    if (method === "error") {
      const event = correlated.extend({ willRetry: z.boolean(), error: z.object({ message: bound(AGENT_LIMITS.providerLineBytes) }) }).parse(params);
      if (this.matches(event)) this.text(null, event.willRetry ? "Provider reported a retryable error." : "Provider reported an error; awaiting terminal evidence.", "status");
      return;
    }
    if (method === "model/rerouted") {
      const event = correlated.extend({ fromModel: display(256), toModel: display(256), reason: display(128) }).parse(params);
      if (this.matches(event)) this.text(null, `Provider model rerouted from ${event.fromModel} to ${event.toModel}.`, "status");
    }
    // Optional telemetry, thread/started (not the policy-bearing response), and
    // unfamiliar notifications convey no consumed lifecycle or permission fact.
  }

  async steer(expectedTurnId: string, text: string): Promise<AgentOperation<{ status: "accepted" }>> {
    if (!this.capabilities.supports.steer) return { ok: false, error: errorFor("UNSUPPORTED_CONTROL", "Steering is unavailable.") };
    if (!identity.safeParse(expectedTurnId).success || !bound(AGENT_LIMITS.taskBytes).min(1).safeParse(text).success) return { ok: false, error: errorFor("UNSUPPORTED_CONTROL", "Invalid steering input.") };
    if (this.ended || this.stopped || !this.turnId) return { ok: false, error: errorFor("RUN_NOT_ACTIVE", "No confirmed active turn.") };
    if (expectedTurnId !== this.turnId) return { ok: false, error: errorFor("STALE_TURN", "Steering targets a different turn.") };
    if (this.steering) return { ok: false, error: errorFor("BUSY", "One steering acknowledgement is already pending.") };
    this.steering = true;
    try {
      const response = z.object({ turnId: identity }).parse(await this.request("turn/steer", {
        threadId: this.threadId, expectedTurnId, input: [{ type: "text", text, text_elements: [] }],
      }));
      if (response.turnId !== expectedTurnId) throw new Error("Wrong acknowledgement turn");
      return { ok: true, value: { status: "accepted" } };
    } catch (error) {
      if (!(error instanceof Fault)) this.fail(unknownError());
      return { ok: false, error: error instanceof Fault ? error.error : unknownError() };
    } finally { this.steering = false; }
  }
  async interrupt(): Promise<AgentOperation<{ status: "requested" }>> {
    if (!this.capabilities.supports.interrupt) return { ok: false, error: errorFor("UNSUPPORTED_CONTROL", "Interruption is unavailable.") };
    if (this.ended || this.stopped || !this.turnId) return { ok: false, error: errorFor("RUN_NOT_ACTIVE", "No confirmed active turn; use disposal to prevent setup dispatch.") };
    if (this.interrupting) return { ok: false, error: errorFor("BUSY", "An interrupt acknowledgement is already pending.") };
    this.interrupting = true;
    try {
      z.object({}).strict().parse(await this.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId }));
      return { ok: true, value: { status: "requested" } };
    } catch (error) {
      if (!(error instanceof Fault)) this.fail(unknownError());
      return { ok: false, error: error instanceof Fault ? error.error : unknownError() };
    } finally { this.interrupting = false; }
  }
}
