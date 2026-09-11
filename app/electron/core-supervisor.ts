import { PROTOCOL_VERSION, parseCoreRequest, parseCoreResponse, parseCoreResponseForRequest, uncertainMutationCode, parseCoreEvent, parseFileEvent, type CoreRequest, type CoreResponse, type CoreEvent, type FileEvent } from "../../protocol/schema";
import { parseAgentEvent, type AgentEvent } from "../../protocol/agents";
import type { CoreState } from "../lifecycle";

export interface CoreProcess {
  // Private main-to-core control; never accepted from the renderer bridge.
  postMessage(message: CoreRequest | { type: "core.shutdown" }): void;
  kill(): boolean;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
}
interface Pending {
  request: CoreRequest;
  resolve(response: CoreResponse): void;
  timer: ReturnType<typeof setTimeout> | null;
}
const failure = (requestId: string, code: string, message: string): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId, ok: false, error: { code, message } });

// One authority for process identity, readiness and commit-bearing requests.
// A replacement is never launched until the previous process actually exits.
export class CoreSupervisor {
  state: CoreState = { generation: 0, phase: "stopped", message: "Core has not started" };
  private process: CoreProcess | null = null;
  private pending = new Map<string, Pending>();
  private closing = false;
  private replace = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessTimer: ReturnType<typeof setTimeout> | null = null;
  private agentDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownRequested = false;
  private replacementKillRequested = false;
  constructor(private readonly hooks: {
    launch(): CoreProcess;
    status(state: CoreState): void;
    event(generation: number, event: CoreEvent | FileEvent | AgentEvent): void;
  }) {}

  private publish(phase: CoreState["phase"], message: string) {
    this.state = { ...this.state, phase, message };
    this.hooks.status(this.state);
  }
  start() {
    if (this.closing || this.process || this.timer) return;
    this.state = { ...this.state, generation: this.state.generation + 1 };
    this.publish("starting", "Opening the local core; previous information is stale");
    let child: CoreProcess;
    try { child = this.hooks.launch(); } catch { this.retry("Local core could not be launched"); return; }
    this.process = child;
    child.on("message", (message) => { if (this.process === child && !this.closing) this.message(message); });
    child.on("exit", (code) => {
      if (this.process !== child) return;
      this.process = null;
      this.clearReadiness();
      this.clearReplacementTimers();
      this.shutdownRequested = false;
      this.replacementKillRequested = false;
      if (this.stableTimer) clearTimeout(this.stableTimer);
      this.settleAll(`Local core exited (${code}); save outcome may be unknown`);
      if (this.closing) return;
      if (this.replace) { this.replace = false; this.start(); }
      else this.retry(`Local core exited (${code})`);
    });
    this.readinessTimer = setTimeout(() => this.failProcess("Local core readiness timed out"), 15_000);
  }
  private clearReadiness() {
    if (this.readinessTimer) clearTimeout(this.readinessTimer);
    this.readinessTimer = null;
  }
  private clearReplacementTimers() {
    if (this.agentDrainTimer) clearTimeout(this.agentDrainTimer);
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.agentDrainTimer = null;
    this.shutdownTimer = null;
  }
  private retry(message: string) {
    if (this.closing) return;
    const delay = [100, 500, 1_500][this.attempts++];
    if (delay === undefined) { this.publish("failed", `${message}; automatic recovery exhausted. A successful core rebuild or deliberate app restart is required.`); return; }
    this.publish("unavailable", `${message}; retrying in ${delay}ms. Previous information is stale.`);
    this.timer = setTimeout(() => { this.timer = null; this.start(); }, delay);
  }
  private failProcess(message: string) {
    this.clearReadiness();
    this.clearReplacementTimers();
    this.publish("unavailable", message);
    this.settleAll(message);
    this.process?.kill();
  }
  restart() {
    // A second rebuild must not extend the first acknowledgement deadline.
    if (this.closing || this.replace) return;
    this.attempts = 0;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.process) { this.start(); return; }
    this.replace = true;
    this.publish("draining", "Core update pending; draining saves and briefly waiting for agent acknowledgements. Previous information is stale.");
    for (const [id, item] of this.pending) {
      if (uncertainMutationCode(item.request) === null) {
        this.settle(id, failure(id, "CORE_UNAVAILABLE", "Core is updating; retry the read after recovery"));
      }
    }
    if (this.hasAgentMutations()) {
      this.agentDrainTimer = setTimeout(() => {
        this.agentDrainTimer = null;
        for (const [id, item] of this.pending) {
          if (uncertainMutationCode(item.request) === "AGENT_OUTCOME_UNKNOWN") {
            this.settle(id, failure(id, "AGENT_OUTCOME_UNKNOWN", "Core update acknowledgement deadline expired; command outcome is unknown. Do not replay."));
          }
        }
        this.finishDrain();
      }, 1_000);
    }
    this.finishDrain();
  }
  private hasAgentMutations() {
    return [...this.pending.values()].some((item) => uncertainMutationCode(item.request) === "AGENT_OUTCOME_UNKNOWN");
  }
  private finishDrain() {
    if (!this.replace || this.closing || this.hasAgentMutations()) return;
    if (this.agentDrainTimer) clearTimeout(this.agentDrainTimer);
    this.agentDrainTimer = null;
    // File writes keep their existing protection; the agent grace never caps a save.
    if ([...this.pending.values()].some((item) => item.request.type === "file.write") || !this.process || this.shutdownRequested) return;
    this.clearReadiness();
    this.shutdownRequested = true;
    // Acknowledgement drain is not a whole-turn wait. The core now persists
    // uncertain run state and closes its owned lifetime before confirming ready.
    this.shutdownTimer = setTimeout(() => {
      this.publish("unavailable", "Core shutdown was not confirmed; unfinished agent outcomes and cleanup remain unknown.");
      this.killReplacement();
    }, 2_000);
    try { this.process.postMessage({ type: "core.shutdown" }); } catch {
      this.publish("unavailable", "Core shutdown transport failed; unfinished agent outcomes and cleanup remain unknown.");
      this.killReplacement();
    }
  }
  private killReplacement() {
    this.clearReplacementTimers();
    if (this.process && !this.replacementKillRequested) {
      this.replacementKillRequested = true;
      this.process.kill();
    }
  }
  private settle(id: string, response: CoreResponse) {
    const item = this.pending.get(id);
    if (!item) return;
    if (item.timer) clearTimeout(item.timer);
    this.pending.delete(id);
    item.resolve(response);
  }
  private settleAll(message: string) {
    for (const [id, item] of this.pending) this.settle(id, failure(id, uncertainMutationCode(item.request) ?? "CORE_UNAVAILABLE", message));
  }
  private message(message: unknown) {
    if (typeof message === "object" && message !== null && "type" in message) {
      if (message.type === "core.shutdown.ready") {
        if (this.replace && this.shutdownRequested) this.killReplacement();
        return;
      }
      if (message.type === "core.ready") {
        if (this.state.phase !== "starting") return;
        this.clearReadiness();
        this.publish("ready", "Local core ready");
        this.stableTimer = setTimeout(() => { this.attempts = 0; }, 30_000);
        return;
      }
      if (message.type === "core.failed") { this.failProcess("Local core failed to open the workspace"); return; }
    }
    try {
      const response = parseCoreResponse(message);
      const pending = this.pending.get(response.requestId);
      if (pending) this.settle(response.requestId, parseCoreResponseForRequest(message, pending.request));
      this.finishDrain();
      return;
    } catch { /* It may be an event. */ }
    if (this.state.phase === "ready") {
      try { this.hooks.event(this.state.generation, parseCoreEvent(message)); return; } catch { /* Try file event. */ }
      try { this.hooks.event(this.state.generation, parseFileEvent(message)); return; } catch { /* Try agent event. */ }
      try { this.hooks.event(this.state.generation, parseAgentEvent(message)); return; } catch { /* Invalid response is terminal for its pending request. */ }
    }
    if (typeof message === "object" && message !== null && "requestId" in message && typeof message.requestId === "string") {
      const item = this.pending.get(message.requestId);
      this.settle(message.requestId, failure(message.requestId, (item && uncertainMutationCode(item.request)) ?? "INVALID_CORE_MESSAGE", "Local core returned an invalid message"));
      this.finishDrain();
    }
  }
  request(input: unknown): Promise<CoreResponse> {
    const request = parseCoreRequest(input);
    if (this.state.phase !== "ready" || !this.process || this.closing) return Promise.resolve(failure(request.requestId, "CORE_UNAVAILABLE", "Local core is unavailable; no operation was sent"));
    if (this.pending.has(request.requestId)) return Promise.resolve(failure(request.requestId, "DUPLICATE_REQUEST", "Request is already pending"));
    return new Promise((resolve) => {
      // Attached Prepare allows capability (5s) plus shared context (30s) work
      // and bridge margin. Launch still becomes uncertain at 5s; task reads
      // retain their 12s allowance for a bounded 10s provider observation.
      const timeoutMs = request.type === "trusted.prepare" || request.type === "agent.prepare" && request.taskReference !== undefined ? 40_000
        : request.type === "workspace.open" ? request.identityOnly ? 5_000 : 15_000
        : request.type === "tasks.snapshot" || request.type === "tasks.read" ? 12_000 : 5_000;
      const timer = request.type === "file.write" ? null : setTimeout(() => {
        this.settle(request.requestId, failure(request.requestId,
          uncertainMutationCode(request) ?? "CORE_TIMEOUT", uncertainMutationCode(request)
            ? "Local core did not respond in time; do not replay uncertain mutations"
            : "Local core did not respond in time; retry the read after recovery"));
        this.finishDrain();
      }, timeoutMs);
      this.pending.set(request.requestId, { request, resolve, timer });
      try { this.process!.postMessage(request); } catch {
        this.settle(request.requestId, failure(request.requestId, uncertainMutationCode(request) ?? "CORE_UNAVAILABLE", "Local core transport failed"));
      }
    });
  }
  stop() {
    this.closing = true;
    this.replace = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.clearReadiness();
    this.clearReplacementTimers();
    this.settleAll("Application is shutting down");
    this.publish("stopped", "Application is shutting down");
    this.process?.kill();
  }
}
