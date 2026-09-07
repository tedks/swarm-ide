/** TEST-ONLY autonomous in-process responder. No executable, network, tools,
 * private settlement command, or model exists here. Context and durable run
 * decisions are the unmodified production implementations. */
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { AgentAdapter, AgentHandle, AgentOperation, CleanupEvidence } from "../../core/agents/adapter";
import { RegisteredAgentContextProvider } from "../../core/agents/context";
import { createFileRunStore } from "../../core/agents/file-store";
import type { createProductionAgentService, ProductionAgentService } from "../../core/agents/production";
import { createAgentService } from "../../core/agents/service";
import { createAgentTaskResolver } from "../../core/tasks/draft-context";
import { AGENT_LIMITS, AgentCapabilitiesSchema, utf8Bytes, type AgentError } from "../../protocol/agents";

export const REHEARSAL_LIMITS = Object.freeze({ runs: AGENT_LIMITS.history, outputBytes: 350 * 1024,
  streamRecords: 80, chunkBytes: 4096, previewBytes: 256, timers: 4,
  tickMs: 250, steerMs: 700, delayedSteerMs: 1500, interruptMs: 150, terminalMs: 600, cleanupMs: 200 });
const at = () => new Date().toISOString();
const capabilities = () => AgentCapabilitiesSchema.parse({
  availability: "available", reason: null, provider: "deterministic-rehearsal", version: "test-only",
  controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only",
});
const bad = <T>(code: AgentError["code"], message: string): AgentOperation<T> => ({ ok: false, error: { code, message } });
const unavailable = <T>(): AgentOperation<T> => bad("AGENT_OUTCOME_UNKNOWN", "Rehearsal closed before delivery was established; do not replay.");
function prefix(text: string, byteLimit: number): string {
  let bytes = 0, result = "";
  for (const point of text) {
    const length = utf8Bytes(point);
    if (bytes + length > byteLimit) break;
    bytes += length; result += point;
  }
  return result;
}
type Timer = ReturnType<typeof setTimeout>;
type Counters = { start: number; steer: number; interrupt: number; dispose: number };
type Entry = {
  runId: string; timers: Set<Timer>; peakTimers: number; streamTimer?: Timer;
  emittedRecords: number; emittedBytes: number; streamRecords: number;
  pendingSteer: boolean; pendingInterrupt: boolean; interruptAcknowledged: boolean;
  terminal: boolean; disposing: boolean; cleanupSettled: boolean; calls: Counters;
  settleSteer?: (result: AgentOperation<{ status: "accepted" }>) => void;
  settleInterrupt?: (result: AgentOperation<{ status: "requested" }>) => void;
  disposal?: Promise<CleanupEvidence>; handle?: AgentHandle;
};
export interface RehearsalDiagnostics {
  fixture: "TEST-ONLY autonomous in-process rehearsal / R2 service / E1 disk context";
  externalProcesses: 0;
  totals: Counters;
  runs: { runId: string; activeTimers: number; peakTimers: number; emittedRecords: number; emittedBytes: number;
    pendingSteer: boolean; pendingInterrupt: boolean; interruptAcknowledged: boolean;
    terminal: boolean; disposing: boolean; cleanupSettled: boolean; calls: Counters }[];
}
export interface RehearsalAgentService extends ProductionAgentService {
  /** Read-only direct test evidence, not exposed as bridge/control authority. */
  diagnostics(): RehearsalDiagnostics;
}

export async function createRehearsalAgentService(
  options: Parameters<typeof createProductionAgentService>[0],
): Promise<RehearsalAgentService> {
  if (!isAbsolute(options.storeRoot)) throw new Error("Rehearsal requires an absolute private store root");
  const root = await realpath(options.root);
  const identity = createHash("sha256").update(root).digest("hex");
  const store = await createFileRunStore(join(options.storeRoot, identity));
  let context: RegisteredAgentContextProvider | undefined;
  const entries = new Map<string, Entry>();
  let closing: Promise<void> | undefined;
  let closed = false;
  const diagnostics = (): RehearsalDiagnostics => {
    const totals = { start: 0, steer: 0, interrupt: 0, dispose: 0 };
    const runs = [...entries.values()].map((entry) => {
      for (const method of ["start", "steer", "interrupt", "dispose"] as const) totals[method] += entry.calls[method];
      return { runId: entry.runId, activeTimers: entry.timers.size, peakTimers: entry.peakTimers,
        emittedRecords: entry.emittedRecords, emittedBytes: entry.emittedBytes,
        pendingSteer: entry.pendingSteer, pendingInterrupt: entry.pendingInterrupt,
        interruptAcknowledged: entry.interruptAcknowledged, terminal: entry.terminal,
        disposing: entry.disposing, cleanupSettled: entry.cleanupSettled, calls: { ...entry.calls } };
    });
    return { fixture: "TEST-ONLY autonomous in-process rehearsal / R2 service / E1 disk context", externalProcesses: 0, totals, runs };
  };
  try {
    const repositoryId = `repository:${identity}`, worldId = options.snapshot().world.id;
    context = await RegisteredAgentContextProvider.create({
      root, repositoryId, worldId,
      taskResolver: createAgentTaskResolver({ root, repositoryId, worldId }),
      workingRevision: () => options.snapshot().revisions.working.fingerprint || null,
      async resolveFocus(focus) {
        const snapshot = options.snapshot();
        const matches = snapshot.graphs.flatMap((graph) => graph.nodes).filter((node) =>
          node.focus.domain === focus.domain && node.focus.key === focus.key && node.focus.path === focus.path &&
          node.focus.worldId === focus.worldId && node.focus.revisionId === focus.revisionId);
        if (matches.length !== 1) return [];
        const sourcePaths = [...new Set(snapshot.mappings.filter((mapping) =>
          mapping.from.domain === focus.domain && mapping.from.key === focus.key).flatMap((mapping) =>
          mapping.candidates.flatMap((candidate) => candidate.focus.path ? [candidate.focus.path] : [])))];
        return [{ attachmentPath: focus.domain === "repo" ? focus.path ?? null : null, sourcePaths }];
      },
      provenance: async () => ({ instructions: [], configuration: [] }),
      knownParent: async (runId) => (await store.read(runId, 0)).ok,
      capabilities: async () => capabilities(),
    });
    const adapter: AgentAdapter = {
      async probe() { return { provider: "deterministic-rehearsal", version: "test-only", executable: "no-executable",
        available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }; },
      async start(prepared, emit) {
        if (closed || entries.has(prepared.runId) || entries.size >= REHEARSAL_LIMITS.runs) {
          throw new Error("Rehearsal dispatch is closed, duplicate, or at its session limit");
        }
        const entry: Entry = { runId: prepared.runId, timers: new Set(), peakTimers: 0,
          emittedRecords: 0, emittedBytes: 0, streamRecords: 0, pendingSteer: false, pendingInterrupt: false,
          interruptAcknowledged: false, terminal: false, disposing: false, cleanupSettled: false,
          calls: { start: 1, steer: 0, interrupt: 0, dispose: 0 } };
        entries.set(entry.runId, entry);
        const threadId = `rehearsal-thread-${prepared.runId}`, turnId = `rehearsal-turn-${prepared.runId}`;
        const schedule = (milliseconds: number, callback: () => void): Timer => {
          if (entry.timers.size >= REHEARSAL_LIMITS.timers) throw new Error("Rehearsal timer bound exceeded");
          const timer = setTimeout(() => { entry.timers.delete(timer); callback(); }, milliseconds);
          entry.timers.add(timer); entry.peakTimers = Math.max(entry.peakTimers, entry.timers.size);
          return timer;
        };
        const cancelStream = () => {
          if (entry.streamTimer) { clearTimeout(entry.streamTimer); entry.timers.delete(entry.streamTimer); }
          entry.streamTimer = undefined;
        };
        const output = (text: string, kind: "message" | "status" = "message") => {
          if (entry.disposing || entry.terminal) return;
          const bounded = prefix(text, REHEARSAL_LIMITS.outputBytes - entry.emittedBytes);
          if (!bounded) return;
          entry.emittedRecords++; entry.emittedBytes += utf8Bytes(bounded);
          emit({ type: "item", itemId: null, kind, text: bounded, at: at() });
        };
        const terminal = (status: "completed" | "interrupted") => {
          if (entry.disposing || entry.terminal) return;
          cancelStream(); entry.terminal = true;
          emit({ type: "terminal", at: at(), outcome: { kind: "turn", threadId, turnId, status, observedAt: at() } });
        };
        const stream = () => {
          if (entry.disposing || entry.terminal) return;
          const header = `REHEARSAL — synthetic progress ${entry.streamRecords + 1}/${REHEARSAL_LIMITS.streamRecords}; no intelligence or tools.\n`;
          const line = "Literal demonstration: réponse 🧪 <img src=x onerror=alert('rehearsal')> — no model, no external agent process.\n";
          output(prefix(header + line.repeat(40), REHEARSAL_LIMITS.chunkBytes));
          entry.streamRecords++;
          entry.streamTimer = schedule(REHEARSAL_LIMITS.tickMs, () => {
            if (entry.streamRecords === REHEARSAL_LIMITS.streamRecords) terminal("completed");
            else stream();
          });
        };
        const handle: AgentHandle = {
          steer(expectedTurnId, text) {
            if (entry.disposing || entry.terminal || expectedTurnId !== turnId) return Promise.resolve(bad("STALE_TURN", "Rehearsal turn is no longer current."));
            if (entry.pendingSteer) return Promise.resolve(bad("BUSY", "One rehearsal instruction is already pending."));
            if (entry.calls.steer >= AGENT_LIMITS.receipts) return Promise.resolve(bad("INSTRUCTION_LIMIT", "Rehearsal instruction limit reached."));
            entry.calls.steer++; entry.pendingSteer = true;
            return new Promise((resolve) => {
              entry.settleSteer = (value) => { entry.pendingSteer = false; entry.settleSteer = undefined; resolve(value); };
              schedule(text.startsWith("[delay]") ? REHEARSAL_LIMITS.delayedSteerMs : REHEARSAL_LIMITS.steerMs, () => {
                if (entry.disposing || entry.terminal) entry.settleSteer?.(bad("STALE_TURN", "Rehearsal turn ended before the delayed instruction was accepted."));
                else {
                  output(`REHEARSAL — Steer accepted (deterministic echo): ${prefix(text, REHEARSAL_LIMITS.previewBytes)}\n`);
                  entry.settleSteer?.({ ok: true, value: { status: "accepted" } });
                }
              });
            });
          },
          interrupt() {
            if (entry.disposing || entry.terminal) return Promise.resolve(bad("RUN_NOT_ACTIVE", "Rehearsal turn has ended."));
            if (entry.calls.interrupt) return Promise.resolve(bad("BUSY", "Rehearsal interruption was already requested."));
            entry.calls.interrupt++; entry.pendingInterrupt = true; cancelStream();
            schedule(REHEARSAL_LIMITS.terminalMs, () => terminal("interrupted"));
            return new Promise((resolve) => {
              entry.settleInterrupt = (value) => { entry.pendingInterrupt = false; entry.settleInterrupt = undefined; resolve(value); };
              schedule(REHEARSAL_LIMITS.interruptMs, () => {
                entry.interruptAcknowledged = true;
                entry.settleInterrupt?.({ ok: true, value: { status: "requested" } });
              });
            });
          },
          dispose() {
            if (entry.disposal) return entry.disposal;
            entry.calls.dispose++; entry.disposing = true;
            for (const timer of entry.timers) clearTimeout(timer);
            entry.timers.clear(); entry.streamTimer = undefined;
            entry.settleSteer?.(unavailable()); entry.settleInterrupt?.(unavailable());
            entry.disposal = new Promise((resolve) => schedule(REHEARSAL_LIMITS.cleanupMs, () => {
              entry.cleanupSettled = true;
              resolve({ status: "confirmed", observedAt: at(),
                detail: "TEST REHEARSAL ONLY: all in-process responder timers were disposed; no external process existed. This is not live-provider or process-owner evidence." });
            }));
            return entry.disposal;
          },
        };
        entry.handle = handle;
        // The service must receive its handle before asynchronous start evidence.
        entry.streamTimer = schedule(25, () => {
          if (entry.disposing || closed) return;
          emit({ type: "started", threadId, model: "REHEARSAL-NO-MODEL", cwd: root, policy: "read-only", instructionPaths: [], at: at() });
          emit({ type: "turn-started", threadId, turnId, at: at() });
          output(`REHEARSAL — deterministic output — no model or external agent process.\nTask preview (at most 256 UTF-8 bytes; literal data): ${prefix(prepared.launchContext.taskText, REHEARSAL_LIMITS.previewBytes)}\n`, "status");
          stream();
        });
        return handle;
      },
    };
    const service = await createAgentService({ store, context, adapter, capabilities: async () => capabilities(), emit: options.emit });
    const ownedContext = context;
    return {
      request: (request) => service.request(request), diagnostics,
      shutdown() {
        if (closing) return closing;
        let resolveClosing!: () => void, rejectClosing!: (error: unknown) => void;
        closing = new Promise<void>((resolve, reject) => { resolveClosing = resolve; rejectClosing = reject; });
        const drain = <T>(operation: () => Promise<T>): Promise<T> => {
          try { return operation(); } catch (error) { return Promise.reject(error); }
        };
        closed = true;
        // Service owns durable uncertainty and receipt settlement. Repeated
        // disposal is idempotent; reserve the promise before reentrant abort
        // callbacks. Waiting all entries also covers a late handle.
        const serviceDrain = drain(() => service.shutdown()), contextDrain = drain(() => ownedContext.dispose());
        void Promise.allSettled([serviceDrain, contextDrain]).then(async (settlements) => {
          const entriesDrained = await Promise.allSettled([...entries.values()].map((entry) => drain(() => entry.handle!.dispose())));
          const [storage] = await Promise.allSettled([drain(() => store.close())]);
          const failures = [...settlements, ...entriesDrained, storage].filter((result) => result.status === "rejected");
          if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Rehearsal shutdown cleanup failed");
        }).then(resolveClosing, rejectClosing);
        return closing;
      },
    };
  } catch (error) {
    try { await context?.dispose(); } finally { await store.close(); }
    throw error;
  }
}
