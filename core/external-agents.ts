import { constants, type Stats } from "node:fs";
import { open, realpath, lstat, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ExternalSessionId, ExternalRequestSchema, ExternalResultSchema, EXTERNAL_FLEET_MAX_ENTRIES, EXTERNAL_FLEET_MAX_ENTRY_BYTES, externalEntryBytes, type ExternalRequest, type ExternalResult,
  type ExternalAgentSummary, type ExternalDetail, type ExternalEntry, type ExternalSnapshot } from "../protocol/external-agents";
import { validateHandoff, openHandoff, terminalCommands } from "./external-agents-handoff";
import { extractEntries } from "./external-agents-activity";
import { AgentLifecycleProjection } from "./agent-lifecycle";
import { Registry, type Registered } from "./external-agents-registry";
import { queueExternalMessage, resolveExternalCodex, type QueueMessage, type ExternalSendReceipt } from "./external-agents-send";

const HEADER = 65536, TAIL = 262144, MAX_ENTRIES = 120;
// Lifecycle boundaries are tiny but ordinary compaction/tool records between
// them can exceed the Activity tail. Cold recovery gets one larger fixed
// window; continuous observations read only the unchecked append interval.
const LIFECYCLE_LOOKBACK = 4 * 1024 * 1024, LIFECYCLE_ANCHOR = 128;
const HISTORY_ENTRIES = 16;
const fileVersion = (stat: Stats) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}:${stat.uid}`;
const Meta = z.object({ type: z.literal("session_meta"), payload: z.object({ id: ExternalSessionId,
  timestamp: z.string().datetime({ offset: true }).optional().catch(undefined),
  forked_from_id: ExternalSessionId.nullable().optional() }) });
const safe = (text: string, size = 4096) => (text.length > size ? text.slice(0, size - 16) + " … [truncated]" : text).replace(/[\p{Cf}\p{Cc}]/gu,
  (c) => c === "\n" || c === "\t" ? c : "�");
const within = (root: string, path: string) => { const r = relative(root, path); return r === "" || r !== ".." && !r.startsWith("../") && !isAbsolute(r); };

/** No watches, polling or observed process ownership. Each read uses a bounded
 * descriptor and closes it before publishing. Registry is re-read on demand. */
export class ExternalAgentService {
  private disposed = false;
  private controller = new AbortController();
  private pending = 0;
  private drained: (() => void)[] = [];
  private sending = new Set<string>();
  private sentRequests = new Set<string>();
  private historical = new Map<string, { registration: string; version: string; detail: ExternalDetail }>();
  private lifecycle = new Map<string, { observationId: string; position: number; size: number; mtime: number; anchor: Buffer; projection: AgentLifecycleProjection }>();
  constructor(private readonly root: string, private readonly registryPath: string | undefined,
    private readonly sender: { queue: QueueMessage; executable(): Promise<string> } = { queue: queueExternalMessage, executable: resolveExternalCodex }) {}
  dispose(): Promise<void> {
    this.disposed = true; this.controller.abort(); this.historical.clear(); this.lifecycle.clear();
    return this.pending ? new Promise((resolve) => this.drained.push(resolve)) : Promise.resolve();
  }
  private check() { if (this.disposed) throw new Error("Observer disposed"); }
  private async regular(path: string, maxSize: number, privateRegistry = false): Promise<FileHandle> {
    this.check();
    if (!isAbsolute(path) || path.includes("\0") || await realpath(path) !== path) throw new Error("Noncanonical path");
    this.check();
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat(); this.check();
      if (!stat.isFile() || stat.size > maxSize || stat.uid !== process.getuid?.() || (privateRegistry && (stat.mode & 0o022)))
        throw new Error("Unsafe file");
      return file;
    } catch (error) { await file.close(); throw error; }
  }
  private async registrations(): Promise<Registered[]> {
    if (!this.registryPath) throw new Error("Not configured");
    const root = await realpath(this.root);
    // Repo-controlled files are never an authority to read account transcripts.
    if (within(root, this.registryPath)) throw new Error("Registry must be outside repository");
    const file = await this.regular(this.registryPath, HEADER, true);
    try {
      const bytes = Buffer.alloc(HEADER + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      this.check();
      if (bytesRead > HEADER) throw new Error("Registry grew beyond bound");
      const registry = Registry.parse(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
      for (const session of registry.sessions) {
        if (!session.rollout.endsWith(".jsonl")) throw new Error("Not a rollout");
        // Links belong to this explicitly registered canonical worktree, not
        // whichever repository happens to be open in the cockpit. Consumers
        // activate them with session identity through worktree.inspect.
        let canonicalContext = false;
        try {
          canonicalContext = Boolean(session.contextRoot && isAbsolute(session.contextRoot) &&
            await realpath(session.contextRoot) === session.contextRoot && (await lstat(session.contextRoot)).isDirectory());
        } catch { /* Missing/noncanonical worktree has no navigation links. */ }
        this.check();
        if (!canonicalContext) { session.contextPaths = []; delete session.contextRoot; }
      }
      return registry.sessions;
    } finally { await file.close(); }
  }
  private summary(row: Registered): ExternalAgentSummary {
    return { id: row.id, label: safe(row.label, 120), evidence: row.evidence, status: "unavailable", parentId: null,
      ancestry: "unavailable", observationId: "", observedAt: new Date().toISOString(), message: "Registered session could not be read safely.",
      ...(row.role ? { role: safe(row.role, 120) } : {}), ...(row.task ? { task: safe(row.task, 200) } : {}), contextPaths: row.contextPaths, lifecycle: { state: "unknown" } };
  }
  private async projectLifecycle(file: FileHandle, stat: Stats, meta: { timestamp?: string; forked_from_id?: string | null }, observationId: string,
    previous: ReturnType<typeof this.lifecycle.get>): Promise<NonNullable<ReturnType<typeof this.lifecycle.get>>> {
    let continuous = Boolean(previous && previous.observationId === observationId && previous.size <= stat.size &&
      (previous.size < stat.size || previous.mtime === stat.mtimeMs) && previous.anchor.length > 0 && previous.position >= previous.anchor.length);
    if (continuous && previous) {
      const anchor = Buffer.alloc(previous.anchor.length);
      const checked = await file.read(anchor, 0, anchor.length, previous.position - anchor.length); this.check();
      continuous = checked.bytesRead === anchor.length && anchor.equals(previous.anchor);
    }
    if (continuous && previous && stat.size - previous.position > LIFECYCLE_LOOKBACK) continuous = false;

    const start = continuous && previous ? previous.position : Math.max(0, stat.size - LIFECYCLE_LOOKBACK);
    const buffer = Buffer.alloc(Math.min(stat.size - start, LIFECYCLE_LOOKBACK));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start); this.check();
    const bytes = buffer.subarray(0, bytesRead);
    let cursor = 0, checkpointable = true;
    if (!continuous && start > 0) {
      const preceding = Buffer.alloc(1), checked = await file.read(preceding, 0, 1, start - 1); this.check();
      if (checked.bytesRead !== 1) throw new Error("Lifecycle window changed during read");
      if (preceding[0] !== 10) {
        const newline = bytes.indexOf(10);
        if (newline < 0) { cursor = bytesRead; checkpointable = false; }
        else cursor = newline + 1;
      }
    }
    let projection = continuous && previous ? previous.projection.clone() : new AgentLifecycleProjection(meta);
    let completePosition = checkpointable ? start + cursor : 0;
    while (cursor < bytesRead) {
      const end = bytes.indexOf(10, cursor); if (end < 0) break;
      const line = bytes.subarray(cursor, end).toString("utf8"); cursor = end + 1; completePosition = start + cursor;
      if (!line) continue;
      try { projection.consume(JSON.parse(line)); }
      catch { projection = new AgentLifecycleProjection(meta); }
    }
    const anchorLength = Math.min(LIFECYCLE_ANCHOR, completePosition);
    const anchor = Buffer.alloc(anchorLength);
    if (anchorLength) {
      const checked = await file.read(anchor, 0, anchorLength, completePosition - anchorLength); this.check();
      if (checked.bytesRead !== anchorLength) throw new Error("Lifecycle checkpoint changed during read");
    }
    return { observationId, position: completePosition, size: stat.size, mtime: stat.mtimeMs, anchor, projection };
  }
  private async read(row: Registered, tail: boolean, checkHandoff = tail): Promise<ExternalDetail> {
    const summary = this.summary(row);
    const result: ExternalDetail = { session: summary, entries: [], handoff: row.tmux ? "unavailable" : "unconfigured",
      coverage: { tailBytes: 0, partial: true, omittedRecords: 0, message: "No transcript observed." } };
    let file: FileHandle | undefined;
    let nextLifecycle: ReturnType<typeof this.lifecycle.get>;
    const previousLifecycle = this.lifecycle.get(row.id);
    try {
      file = await this.regular(row.rollout, 2 ** 31);
      const stat = await file.stat(), header = Buffer.alloc(HEADER);
      const first = await file.read(header, 0, HEADER, 0); this.check();
      const newline = header.subarray(0, first.bytesRead).indexOf(10);
      if (newline < 0) throw new Error("Missing or oversized metadata");
      const meta = Meta.parse(JSON.parse(header.subarray(0, newline).toString("utf8")));
      if (meta.payload.id !== row.id) throw new Error("Wrong registered session");
      summary.parentId = meta.payload.forked_from_id ?? null;
      summary.createdAt = meta.payload.timestamp;
      summary.status = "observed"; summary.ancestry = summary.parentId ? "unknown-parent" : "root";
      summary.observationId = createHash("sha256").update(`${stat.dev}:${stat.ino}:${header.subarray(0, newline).toString("utf8")}`).digest("hex");
      summary.message = "Registered session";
      summary.control = row.tmux ? "tmux" : "read-only";
      if (row.contextRoot && isAbsolute(row.contextRoot)) summary.worktree = row.contextRoot;
      if (tail) {
        nextLifecycle = await this.projectLifecycle(file, stat, meta.payload, summary.observationId, previousLifecycle);
        const start = Math.max(0, stat.size - TAIL), buffer = Buffer.alloc(Math.min(stat.size, TAIL));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, start); this.check();
        result.coverage.tailBytes = bytesRead;
        const bytes = buffer.subarray(0, bytesRead);
        let partial = start > 0;
        // Byte offsets, not decoded character indices or tail-relative indices.
        // A complete record keeps its identity as later appends shift this tail.
        let cursor = start > 0 ? bytes.indexOf(10) + 1 : 0;
        if (start > 0 && cursor === 0) cursor = bytesRead;
        if (bytesRead && bytes[bytesRead - 1] !== 10) partial = true;
        const entries: ExternalEntry[] = [];
        let omitted = 0;
        while (cursor < bytesRead) {
          const end = bytes.indexOf(10, cursor); if (end < 0) break;
          const offset = start + cursor, line = bytes.subarray(cursor, end).toString("utf8"); cursor = end + 1;
          if (!line) continue;
          if (line.length > 65536) {
            omitted++; partial = true;
            continue;
          }
          let item: unknown;
          try { item = JSON.parse(line); } catch {
            omitted++; partial = true;
            continue;
          }
          const identity = `${stat.dev}:${stat.ino}:${offset}:${createHash("sha256").update(line).digest("hex").slice(0, 12)}`;
          const extracted = extractEntries(item, identity);
          if (extracted.length) entries.push(...extracted); else omitted++;
        }
        if (entries.length > MAX_ENTRIES) { omitted += entries.length - MAX_ENTRIES; partial = true; }
        result.entries = entries.slice(-MAX_ENTRIES);
        result.coverage = { tailBytes: bytesRead, partial, omittedRecords: omitted,
          message: "Recent activity; older entries may be outside this window." };
        summary.lastActivityAt = result.entries.at(-1)?.at;
        summary.lifecycle = nextLifecycle.projection.snapshot();
      }
      // An inode can be truncated and rewritten to another session without
      // shrinking its final size. Verify the accepted header on this descriptor
      // again after the tail read, while allowing ordinary append-only growth.
      const confirmation = Buffer.alloc(newline + 1);
      const confirmed = await file.read(confirmation, 0, confirmation.length, 0); this.check();
      if (confirmed.bytesRead !== confirmation.length || !confirmation.equals(header.subarray(0, newline + 1)))
        throw new Error("Session metadata changed during read");
      const after = await file.stat(), current = await lstat(row.rollout); this.check();
      if (after.size < stat.size || current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink())
        throw new Error("Transcript rotated or truncated");
      if (checkHandoff && row.tmux) {
        result.handoff = await validateHandoff(row.tmux, row.rollout, this.controller.signal) ? "available" : "unavailable";
        if (result.handoff === "available") result.terminal = terminalCommands(row.tmux);
      }
      this.check();
      if (nextLifecycle) {
        const currentLifecycle = this.lifecycle.get(row.id);
        // Compare the observation owner, not offsets: validated truncation is
        // a new interval whose cursor legitimately moves backwards. Concurrent
        // readers cannot overwrite a cache another read already published.
        if (currentLifecycle === previousLifecycle)
          this.lifecycle.set(row.id, nextLifecycle);
      }
      if (tail && !checkHandoff && !row.tmux) {
        const entries = result.entries.slice(-HISTORY_ENTRIES), dropped = result.entries.length - entries.length;
        this.historical.set(row.id, { registration: JSON.stringify(row), version: fileVersion(stat),
          detail: { ...result, entries, coverage: { ...result.coverage, partial: result.coverage.partial || dropped > 0, omittedRecords: result.coverage.omittedRecords + dropped } } });
      }
      return result;
    } catch {
      this.check();
      this.historical.delete(row.id);
      if (this.lifecycle.get(row.id) === previousLifecycle) this.lifecycle.delete(row.id);
      return { ...result, session: this.summary(row), entries: [], handoff: row.tmux ? "unavailable" : "unconfigured",
        coverage: { tailBytes: 0, partial: true, omittedRecords: 0, message: "Missing, changed, invalid or unsafe registered transcript; no transcript authority retained." } };
    } finally { await file?.close(); }
  }
  private async readFleet(row: Registered): Promise<ExternalDetail> {
    if (row.tmux) this.historical.delete(row.id);
    const cached = !row.tmux ? this.historical.get(row.id) : undefined;
    if (cached?.registration === JSON.stringify(row)) {
      try {
        const current = await lstat(row.rollout); this.check();
        if (current.isFile() && !current.isSymbolicLink() && current.uid === process.getuid?.() &&
            fileVersion(current) === cached.version && await realpath(row.rollout) === row.rollout) {
          this.check();
          return { ...cached.detail, session: { ...cached.detail.session } };
        }
      } catch { this.check(); }
      this.historical.delete(row.id);
    }
    const result = await this.read(row, true, false);
    const retained = this.historical.get(row.id);
    return !row.tmux && retained?.registration === JSON.stringify(row) ? retained.detail : result;
  }
  private async send(request: Extract<ExternalRequest, { type: "externalAgents.send" }>): Promise<ExternalSendReceipt> {
    const reject = (message: string): ExternalSendReceipt => ({ kind: "send", sessionId: request.sessionId, receiptId: randomUUID(), status: "rejected", message });
    if (this.sentRequests.has(request.requestId)) return { ...reject("This Send was already attempted; inspect the session. No retry was sent."), status: "delivery-unknown" };
    if (this.sending.has(request.sessionId) || this.sentRequests.size >= 256) return reject("A Send is pending or this core's send limit was reached. Nothing new was queued.");
    this.sentRequests.add(request.requestId); this.sending.add(request.sessionId);
    let dispatched = false;
    try {
      // Executable resolution may await disk. It must precede the final authority
      // checks, not open a stale-target interval after them.
      const executable = await this.sender.executable(); this.check();
      const row = (await this.registrations()).find((candidate) => candidate.id === request.sessionId); this.check();
      if (!row || row.evidence !== "local" || !row.tmux) return reject("Only a registered local session with a checked current tmux target can receive messages. Nothing was queued.");
      const detail = await this.read(row, false); this.check();
      if (detail.session.status !== "observed" || detail.session.observationId !== request.observationId)
        return reject("The observed session changed or is unavailable. Refresh before sending; nothing was queued.");
      if (!await validateHandoff(row.tmux, row.rollout, this.controller.signal)) return reject("The exact session process, pane or open rollout is no longer current. Nothing was queued.");
      this.check();
      // Last registry check prevents a concurrent operator removal/retarget from
      // granting authority through a previously read row. Revalidate the target
      // once more after that await, immediately before spawning the queue CLI.
      const current = (await this.registrations()).find((candidate) => candidate.id === row.id); this.check();
      if (!current || current.evidence !== "local" || current.rollout !== row.rollout || JSON.stringify(current.tmux) !== JSON.stringify(row.tmux))
        return reject("The operator registration changed. Refresh before sending; nothing was queued.");
      if (!await validateHandoff(row.tmux, row.rollout, this.controller.signal)) return reject("The target closed during verification. Nothing was queued.");
      // Handoff checks bind process/open descriptor but not the header accepted
      // by the renderer. Catch same-inode rewrites or a newly opened replacement
      // during those awaits before the final synchronous queue dispatch.
      const final = await this.read(current, false); this.check();
      if (final.session.status !== "observed" || final.session.observationId !== request.observationId)
        return reject("The transcript changed during verification. Refresh before sending; nothing was queued.");
      this.check(); dispatched = true;
      return await this.sender.queue(executable, row.id, request.text, this.controller.signal);
    } catch {
      return dispatched ? { ...reject("Delivery is unknown. Inspect the target conversation; no automatic retry was sent."), status: "delivery-unknown" }
        : reject("Sending could not be authorized before dispatch. Nothing was queued.");
    } finally { this.sending.delete(request.sessionId); }
  }
  async request(raw: ExternalRequest): Promise<ExternalResult> {
    const request = ExternalRequestSchema.parse(raw);
    this.check();
    if (this.pending >= 2) throw new Error("External observer busy; retry deliberately");
    this.pending++;
    try {
      if (request.type === "externalAgents.send") return await this.send(request);
      let rows: Registered[];
      try { rows = await this.registrations(); } catch {
        this.check();
        if (request.type !== "externalAgents.snapshot") throw new Error("External registry unavailable");
        return { kind: "snapshot", snapshot: { status: "unavailable", observedAt: new Date().toISOString(), sessions: [],
          message: "External sessions are not configured or the operator registry could not be validated. Managed-agent execution is separate." } };
      }
      this.check();
      if (request.type === "externalAgents.snapshot") {
        const registeredIds = new Set(rows.map((row) => row.id));
        for (const id of this.historical.keys()) if (!registeredIds.has(id)) this.historical.delete(id);
        for (const id of this.lifecycle.keys()) if (!registeredIds.has(id)) this.lifecycle.delete(id);
        const fleet: ExternalDetail[] = [];
        // Small bounded batches: all registered tails, no selected-session
        // bottleneck and no process-control validation on passive fleet reads.
        for (let index = 0; index < rows.length; index += 4) {
          const batch = await Promise.allSettled(rows.slice(index, index + 4).map((row) => this.readFleet(row)));
          this.check();
          for (const result of batch) { if (result.status === "rejected") throw result.reason; fleet.push(result.value); }
        }
        const sessions = fleet.map((detail) => detail.session);
        resolveAncestry(sessions);
        return ExternalResultSchema.parse({ kind: "snapshot", snapshot: { status: "observed", sessions, fleet: boundFleet(fleet), observedAt: new Date().toISOString(),
          message: "Registered fleet" } });
      }
      const row = rows.find((candidate) => candidate.id === request.sessionId);
      if (!row) throw new Error("Session is not registered");
      const detail = await this.read(row, true); this.check();
      if (request.type === "externalAgents.read") return ExternalResultSchema.parse({ kind: "read", detail });
      let opened = false;
      if (row.tmux && detail.session.status === "observed" && detail.session.observationId === request.observationId && detail.handoff === "available") {
        this.check(); opened = await openHandoff(row.tmux, row.rollout, this.controller.signal); this.check();
      }
      return { kind: "handoff", sessionId: row.id, status: opened ? "opened" : "unavailable", message: opened
        ? "Selected the existing registered tmux conversation. No message or agent command was sent."
        : "Existing conversation identity is unavailable or changed. Nothing was launched or resumed." };
    } finally { if (--this.pending === 0) for (const done of this.drained.splice(0)) done(); }
  }
}

/** Bound the whole published feed, preferring registered interactive owners and
 * their newest useful events. A selected conversation still has its full tail. */
export function boundFleet(fleet: ExternalDetail[]): ExternalDetail[] {
  const candidates = fleet.flatMap((detail, session) => detail.entries
    .map((entry, index) => ({ entry, index, session, current: detail.session.control === "tmux" }))
    .filter(({ entry }) => entry.kind !== "tool-result"));
  candidates.sort((a, b) => Number(b.current) - Number(a.current) || (Date.parse(b.entry.at) || 0) - (Date.parse(a.entry.at) || 0) || b.index - a.index);
  const retained = new Map<number, Set<number>>(); let bytes = 0, count = 0;
  for (const candidate of candidates) {
    const size = externalEntryBytes(candidate.entry);
    if (count >= EXTERNAL_FLEET_MAX_ENTRIES) break;
    if (bytes + size > EXTERNAL_FLEET_MAX_ENTRY_BYTES) continue;
    const indices = retained.get(candidate.session) ?? new Set<number>();
    indices.add(candidate.index); retained.set(candidate.session, indices); bytes += size; count++;
  }
  return fleet.map((detail, session) => {
    const entries = detail.entries.filter((_, index) => retained.get(session)?.has(index)), dropped = detail.entries.length - entries.length;
    return { ...detail, entries, coverage: { ...detail.coverage, partial: detail.coverage.partial || dropped > 0, omittedRecords: detail.coverage.omittedRecords + dropped } };
  });
}

export function resolveAncestry(sessions: ExternalAgentSummary[]): void {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  for (const session of sessions) {
    if (session.status !== "observed") continue;
    const visited = new Set<string>([session.id]); let parent = session.parentId, cycle = false;
    while (parent) {
      if (visited.has(parent)) { cycle = true; break; }
      visited.add(parent); const next = byId.get(parent);
      if (!next || next.status !== "observed") break;
      parent = next.parentId;
    }
    session.ancestry = cycle ? "cycle" : !session.parentId ? "root" : byId.get(session.parentId)?.status === "observed" ? "registered-parent" : "unknown-parent";
  }
}

/** Compatibility helper for callers that only need one record preview. */
export function extractEntry(input: unknown, id: string): ExternalEntry | null {
  return extractEntries(input, id)[0] ?? null;
}
