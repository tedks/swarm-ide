/** TEST-ONLY read-only proof after the owned core has exited. Does not open a
 * RunStore, repair history, signal a process, or publish optimistic evidence. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { AGENT_LIMITS, AdmissionReceiptSchema, RunIdSchema, RunSchema, TranscriptRecordSchema, utf8Bytes } from "../../protocol/agents";
import { REHEARSAL_LIMITS } from "./agent-rehearsal-service";

const roles = ["first", "second", "third", "activeAtClose"] as const;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid evidence object");
  return input as Record<string, unknown>;
};
const count = z.number().int().min(0).max(AGENT_LIMITS.receipts);
const calls = z.object({ start: count, steer: count, interrupt: count, dispose: count });
const DiagnosticSchema = z.object({
  fixture: z.literal("TEST-ONLY autonomous in-process rehearsal / R2 service / E1 disk context"),
  externalProcesses: z.literal(0), totals: calls,
  runs: z.array(z.object({ runId: RunIdSchema, activeTimers: z.literal(0), peakTimers: z.number().int().min(1).max(REHEARSAL_LIMITS.timers),
    emittedRecords: z.number().int().min(1).max(REHEARSAL_LIMITS.streamRecords + AGENT_LIMITS.receipts + 1),
    emittedBytes: z.number().int().min(1).max(REHEARSAL_LIMITS.outputBytes),
    pendingSteer: z.literal(false), pendingInterrupt: z.literal(false),
    disposing: z.literal(true), cleanupSettled: z.literal(true), calls,
  })).length(4),
});
const ProofIdsSchema = z.object({ first: RunIdSchema, second: RunIdSchema, third: RunIdSchema, activeAtClose: RunIdSchema }).strict();

async function readSnapshot(profile: string, identity: string) {
  const handles: FileHandle[] = [];
  const directory = async (path: string) => {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    handles.push(handle);
    const stat = await handle.stat();
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error("Unsafe private directory");
    return handle;
  };
  try {
    const owner = await directory(profile);
    const runs = await directory(`/proc/self/fd/${owner.fd}/agent-runs`);
    const workspace = await directory(`/proc/self/fd/${runs.fd}/${identity}`);
    const file = await open(`/proc/self/fd/${workspace.fd}/snapshot.json`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    handles.push(file);
    const before = await file.stat();
    if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 ||
        before.size < 1 || before.size > AGENT_LIMITS.storeBytes) throw new Error("Unsafe bounded snapshot");
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    const after = await file.stat();
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("Snapshot changed during verification");
    return { input: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))) as unknown, bytes: length };
  } finally { await Promise.all(handles.reverse().map((handle) => handle.close())); }
}

export async function verifyRehearsalClose(options: { profile: string; workspace: string; diagnostics: unknown; proof: unknown }) {
  // Constant check identifiers only: never echo untrusted exception text, paths,
  // run IDs, diagnostics, prompts, or persisted content into the failure artifact.
  let check: "input" | "diagnostics-shape" | "diagnostics-schema" | "diagnostics-ledger" | "diagnostics-totals" |
    "snapshot-read" | "snapshot-shape" | "retained-bounds" | "retained-schema" | "retained-consistency" |
    "retained-record-count" | "retained-text-bytes" | "retained-identities" | "retained-outcome" = "input";
  try {
    if (!isAbsolute(options.profile) || !isAbsolute(options.workspace)) throw new Error("Absolute owned locations required");
    const root = await realpath(options.workspace), ids = ProofIdsSchema.parse(object(options.proof).runIds);
    const expected = roles.map((role) => ids[role]);
    if (new Set(expected).size !== 4) throw new Error("Expected run IDs must be unique");
    check = "diagnostics-shape";
    const rawDiagnostics = object(options.diagnostics);
    if (!Array.isArray(rawDiagnostics.runs) || rawDiagnostics.runs.length !== 4) throw new Error("Missing complete shutdown diagnostics");
    check = "diagnostics-schema";
    const diagnostics = DiagnosticSchema.parse(rawDiagnostics);
    check = "diagnostics-ledger";
    if (diagnostics.totals.start !== 4 || diagnostics.totals.dispose !== 4 ||
        new Set(diagnostics.runs.map((run) => run.runId)).size !== 4 || diagnostics.runs.some((run) => !expected.includes(run.runId) || run.calls.start !== 1 || run.calls.dispose !== 1)) throw new Error("Dispatch/cleanup ledger mismatch");
    check = "diagnostics-totals";
    for (const method of ["start", "steer", "interrupt", "dispose"] as const) {
      if (diagnostics.runs.reduce((sum, run) => sum + run.calls[method], 0) !== diagnostics.totals[method]) throw new Error("Incomplete invocation totals");
    }
    check = "snapshot-read";
    const snapshot = await readSnapshot(options.profile, hash(root)), raw = object(snapshot.input);
    check = "snapshot-shape";
    if (Object.keys(raw).sort().join() !== "entries,version" || raw.version !== 1 || !Array.isArray(raw.entries) || raw.entries.length !== 4) throw new Error("Incomplete retained snapshot");
    const checked = raw.entries.map((input) => {
      check = "retained-bounds";
      const entry = object(input), rawRun = object(entry.run), context = object(rawRun.launchContext);
      if (Object.keys(entry).sort().join() !== "receipt,records,run" || !Array.isArray(entry.records) || entry.records.length > REHEARSAL_LIMITS.streamRecords + AGENT_LIMITS.receipts + 1 ||
          !Array.isArray(rawRun.instructions) || rawRun.instructions.length > AGENT_LIMITS.receipts || utf8Bytes(JSON.stringify(context)) > AGENT_LIMITS.contextBytes) throw new Error("Unbounded retained run");
      check = "retained-schema";
      const run = RunSchema.parse(rawRun), receipt = AdmissionReceiptSchema.parse(entry.receipt);
      const records = entry.records.map((record) => TranscriptRecordSchema.parse(record));
      const diagnostic = diagnostics.runs.find((item) => item.runId === run.runId);
      check = "retained-consistency";
      if (!diagnostic || run.launchContext.root !== root || receipt.runId !== run.runId || receipt.contextHash !== run.launchContext.contextHash || receipt.admittedAt !== run.createdAt ||
          hash(run.launchContext.submittedPrompt) !== run.launchContext.contextHash || run.launchContext.attachments.some((item) => hash(item.content) !== item.digest) ||
          run.instructions.some((item) => hash(item.text) !== item.textHash || item.status === "pending" || item.expectedTurnId !== run.providerTurnId) ||
          run.cleanup.status !== "confirmed" || run.processState !== "exited" || run.exitCode !== null ||
          records.some((record, index) => record.recordId !== index + 1) || run.transcript.lastRecord !== records.length ||
          run.transcript.bytes !== (records.length ? utf8Bytes(JSON.stringify(records)) : 0)) throw new Error("Retained context, receipt, history, or cleanup mismatch");
      check = "retained-record-count";
      if (records.length !== diagnostic.emittedRecords) throw new Error("Retained record count mismatch");
      check = "retained-text-bytes";
      if (records.reduce((sum, record) => sum + utf8Bytes(record.text), 0) !== diagnostic.emittedBytes) throw new Error("Retained text byte count mismatch");
      return run;
    });
    check = "retained-identities";
    if (new Set(checked.map((run) => run.runId)).size !== 4) throw new Error("Duplicate retained run");
    check = "retained-outcome";
    const runs = roles.map((role) => {
      const run = checked.find((item) => item.runId === ids[role]);
      const state = role === "second" ? "completed" : role === "activeAtClose" ? "unknown" : "cancelled";
      if (!run || run.state !== state || (role === "first" && (run.instructions.length !== 1 || run.instructions[0]!.status !== "accepted")) ||
          (role === "third" && (run.instructions.length !== 1 || run.instructions[0]!.status !== "delivery-unknown")) ||
          ((role === "first" || role === "third") && (run.providerOutcome.kind !== "turn" || run.providerOutcome.status !== "interrupted")) ||
          ((role === "second" || role === "activeAtClose") && run.instructions.length !== 0)) throw new Error("Expected durable journey outcome is missing");
      return { role, runId: run.runId, state: run.state, records: run.transcript.lastRecord, bytes: run.transcript.bytes,
        instructionStatuses: run.instructions.map((receipt) => receipt.status), contextHashesVerified: true as const };
    });
    return { verified: true as const, inProcessCleanupOnly: true as const, runCount: 4 as const, snapshotBytes: snapshot.bytes,
      responder: { start: 4 as const, dispose: 4 as const, activeTimers: 0 as const }, runs };
  } catch { throw new Error(`Rehearsal close proof failed: [${check}] owned shutdown diagnostics and retained run history did not agree; no successful cleanup claim was published.`); }
}
