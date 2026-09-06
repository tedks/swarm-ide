/** TEST-ONLY privileged composition. Never import from a production entry.
 * Real disk context and durable lifecycle; E2 is only the manually driven
 * in-process adapter. No provider executable, authentication or network exists.
 */
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import type { AgentAdapter, AgentHandle } from "../../core/agents/adapter";
import { RegisteredAgentContextProvider } from "../../core/agents/context";
import { createFileRunStore } from "../../core/agents/file-store";
import type { createProductionAgentService, ProductionAgentService } from "../../core/agents/production";
import { createAgentService } from "../../core/agents/service";
import { AGENT_FIXTURE_THREAD, AGENT_FIXTURE_TURN, agentFixtureRecords, createAgentAdapterFixture } from "../../fixtures/agents";
import { AGENT_LIMITS, AgentCapabilitiesSchema, utf8Bytes } from "../../protocol/agents";
import { PROTOCOL_VERSION } from "../../protocol/common";

const target = { runId: z.string().uuid().optional() };
export const JourneyControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnostics") }).strict(),
  z.object({ action: z.literal("start-observed"), ...target }).strict(),
  z.object({ action: z.literal("output"), ...target,
    count: z.number().int().min(1).max(64).default(40),
    repeat: z.number().int().min(1).max(256).default(1) }).strict(),
  z.object({ action: z.literal("steer-accepted"), ...target }).strict(),
  z.object({ action: z.literal("steer-stale"), ...target }).strict(),
  z.object({ action: z.literal("interrupt-accepted"), ...target }).strict(),
  z.object({ action: z.literal("terminal-completed"), ...target }).strict(),
  z.object({ action: z.literal("cleanup-confirmed"), ...target }).strict(),
]);
export type JourneyControl = z.input<typeof JourneyControlSchema>;

const capabilities = () => AgentCapabilitiesSchema.parse({
  availability: "available", reason: null, provider: "deterministic-fixture", version: "test-only",
  controls: { launch: true, steer: true, cancel: true }, policy: "verified-read-only",
});
const at = () => new Date().toISOString();
const cleanupDetail = "TEST FIXTURE ONLY: in-process adapter disposed; no external process existed. This is not process-owner or live-provider proof.";
type OutputBatch = { requestedCount: number; repeat: number; emittedCount: number; emittedBytes: number };
type Entry = {
  runId: string; fixture: ReturnType<typeof createAgentAdapterFixture>;
  observed: boolean; disposing: boolean; cleanupSettled: boolean;
  pendingSteer: boolean; pendingInterrupt: boolean; output: OutputBatch[];
};
export interface JourneyDiagnostics {
  fixture: "TEST-ONLY E2 adapter / R2 service / E1 disk context";
  externalProcesses: 0;
  ledgerComplete: true;
  runs: {
    runId: string; observed: boolean; disposing: boolean; cleanupSettled: boolean;
    pendingSteer: boolean; pendingInterrupt: boolean; output: OutputBatch[];
    invocations: { method: "start" | "steer" | "interrupt" | "dispose"; turnId?: string; textBytes?: number }[];
  }[];
  totals: { start: number; steer: number; interrupt: number; dispose: number };
}
export interface JourneyAgentService extends ProductionAgentService {
  control(input: unknown): Promise<JourneyDiagnostics>;
  diagnostics(): JourneyDiagnostics;
}

export async function createJourneyAgentService(
  options: Parameters<typeof createProductionAgentService>[0],
): Promise<JourneyAgentService> {
  if (!isAbsolute(options.storeRoot)) throw new Error("The test harness must supply an absolute private store root");
  const root = await realpath(options.root);
  const identity = createHash("sha256").update(root).digest("hex");
  const store = await createFileRunStore(join(options.storeRoot, identity));
  const entries = new Map<string, Entry>();
  let shuttingDown = false;
  let closing: Promise<void> | undefined;
  const settleCleanup = (entry: Entry) => {
    if (!entry.disposing || entry.cleanupSettled) throw new Error("Fixture disposal is not awaiting cleanup evidence");
    entry.fixture.settleCleanup({ status: "confirmed", observedAt: at(), detail: cleanupDetail });
    entry.cleanupSettled = true;
  };
  const diagnostics = (): JourneyDiagnostics => {
    const totals = { start: 0, steer: 0, interrupt: 0, dispose: 0 };
    const runs = [...entries.values()].map((entry) => {
      // E2 throws when its bounded ledger is incomplete. Never attest a partial
      // invocation history or expose steering text, context or filesystem paths.
      const invocations = entry.fixture.calls().map(({ method, turnId, text }) => {
        totals[method]++;
        return { method, ...(turnId === undefined ? {} : { turnId }),
          ...(text === undefined ? {} : { textBytes: utf8Bytes(text) }) };
      });
      return { runId: entry.runId, observed: entry.observed, disposing: entry.disposing,
        cleanupSettled: entry.cleanupSettled, pendingSteer: entry.pendingSteer,
        pendingInterrupt: entry.pendingInterrupt, output: structuredClone(entry.output), invocations };
    });
    return { fixture: "TEST-ONLY E2 adapter / R2 service / E1 disk context", externalProcesses: 0, ledgerComplete: true, runs, totals };
  };
  try {
    const context = await RegisteredAgentContextProvider.create({
      root, repositoryId: `repository:${identity}`, worldId: options.snapshot().world.id,
      workingRevision: () => options.snapshot().revisions.working.fingerprint || null,
      async resolveFocus(focus) {
        // Same registered mapping rules as production; no harness path override.
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
      // Deliberately real disk-context time, NOT E2's expired synthetic draft.
    });
    const adapter: AgentAdapter = {
      async probe() { return { provider: "deterministic-fixture", version: "test-only", executable: "no-executable",
        available: true, reason: null, supports: { steer: true, interrupt: true, readOnly: true } }; },
      async start(prepared, emit) {
        if (entries.has(prepared.runId) || entries.size >= AGENT_LIMITS.history) throw new Error("Duplicate or excessive fixture dispatch");
        const entry: Entry = { runId: prepared.runId, fixture: createAgentAdapterFixture(), observed: false,
          disposing: false, cleanupSettled: false, pendingSteer: false, pendingInterrupt: false, output: [] };
        entries.set(entry.runId, entry);
        const handle = await entry.fixture.adapter.start(prepared, emit);
        return {
          async steer(turnId, text) {
            entry.pendingSteer = true;
            try { return await handle.steer(turnId, text); }
            finally { entry.pendingSteer = false; }
          },
          async interrupt() {
            entry.pendingInterrupt = true;
            try { return await handle.interrupt(); }
            finally { entry.pendingInterrupt = false; }
          },
          dispose() {
            entry.disposing = true;
            const result = handle.dispose();
            if (shuttingDown && !entry.cleanupSettled) settleCleanup(entry);
            return result;
          },
        } satisfies AgentHandle;
      },
    };
    const service = await createAgentService({ store, context, adapter, capabilities: async () => capabilities(), emit: options.emit });
    const barrier = async () => {
      const result = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type: "agent.snapshot" });
      if (!result.ok) throw new Error("Test control could not observe the durable service");
    };
    return {
      request: (request) => service.request(request), diagnostics,
      async control(input) {
        const control = JourneyControlSchema.parse(input);
        if (control.action === "diagnostics") return diagnostics();
        if (shuttingDown) throw new Error("Test controls are closed during shutdown");
        const entry = control.runId ? entries.get(control.runId) : [...entries.values()].at(-1);
        if (!entry) throw new Error("No dispatched fixture run matches this control");
        switch (control.action) {
          case "start-observed":
            if (entry.observed || entry.disposing) throw new Error("Fixture start has already been observed or disposed");
            entry.observed = true;
            entry.fixture.emit({ type: "started", threadId: AGENT_FIXTURE_THREAD, model: "TEST-FIXTURE-NO-MODEL",
              cwd: root, policy: "read-only", instructionPaths: [], at: at() });
            entry.fixture.emit({ type: "turn-started", threadId: AGENT_FIXTURE_THREAD, turnId: AGENT_FIXTURE_TURN, at: at() });
            break;
          case "output": {
            if (!entry.observed || entry.disposing) throw new Error("Output requires a live observed fixture");
            if (entry.output.length >= 64) throw new Error("Bounded output-control ledger is full");
            const batch: OutputBatch = { requestedCount: control.count, repeat: control.repeat, emittedCount: 0, emittedBytes: 0 };
            entry.output.push(batch);
            // Reuse E2's literal HTML/multibyte messages. Its synthetic gap is
            // excluded: emitting data here must not claim actual output loss.
            const records = agentFixtureRecords().filter((record) => record.kind === "message");
            for (let index = 0; index < control.count; index++) {
              const text = `${records[index % records.length]!.text}\n`.repeat(control.repeat);
              if (utf8Bytes(text) > AGENT_LIMITS.recordBytes) throw new Error("Fixture record exceeded byte bound");
              entry.fixture.emit({ type: "item", itemId: null, kind: "message", text, at: at() });
              batch.emittedCount++; batch.emittedBytes += utf8Bytes(text);
              await barrier(); // Bound the real service's queue, not just the fixture array.
            }
            break;
          }
          case "steer-accepted": entry.fixture.settleSteer({ ok: true, value: { status: "accepted" } }); break;
          case "steer-stale": entry.fixture.settleSteer({ ok: false,
            error: { code: "STALE_TURN", message: "TEST FIXTURE: instruction arrived after its accepted turn boundary; not resent." } }); break;
          case "interrupt-accepted": entry.fixture.settleInterrupt({ ok: true, value: { status: "requested" } }); break;
          case "terminal-completed":
            if (!entry.observed) throw new Error("Terminal evidence requires an observed fixture turn");
            entry.fixture.emit({ type: "terminal", at: at(), outcome: { kind: "turn", threadId: AGENT_FIXTURE_THREAD,
              turnId: AGENT_FIXTURE_TURN, status: "completed", observedAt: at() } });
            break;
          case "cleanup-confirmed": settleCleanup(entry); break;
        }
        await barrier();
        // These are adapter-control diagnostics, not an optimistic durable
        // receipt. The harness must assert state through agent.read/snapshot.
        return diagnostics();
      },
      shutdown() {
        if (closing) return closing;
        shuttingDown = true;
        // Existing disposal gates and any gates opened by service.shutdown are
        // settled explicitly. A failed scenario must not leave cleanup timers.
        for (const entry of entries.values()) if (entry.disposing && !entry.cleanupSettled) settleCleanup(entry);
        closing = service.shutdown().finally(() => store.close());
        return closing;
      },
    };
  } catch (error) { await store.close(); throw error; }
}
