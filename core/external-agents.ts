import { constants } from "node:fs";
import { open, realpath, lstat, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { isRepositoryPath } from "../protocol/repository";
import { ExternalSessionId, ExternalResultSchema, type ExternalRequest, type ExternalResult,
  type ExternalAgentSummary, type ExternalDetail, type ExternalEntry, type ExternalSnapshot } from "../protocol/external-agents";
import { TmuxTargetSchema, validateHandoff, openHandoff } from "./external-agents-handoff";

const HEADER = 65536, TAIL = 262144, MAX_ENTRIES = 120;
const Registration = z.object({ id: ExternalSessionId, label: z.string().min(1).max(120),
  rollout: z.string().min(1).max(4096), evidence: z.enum(["local", "synthetic"]).default("local"),
  role: z.string().max(120).optional(), task: z.string().max(200).optional(),
  contextRoot: z.string().max(4096).optional(),
  contextPaths: z.array(z.string().max(512).refine((p) => isRepositoryPath(p) && p !== "")).max(12).default([]),
  tmux: TmuxTargetSchema.optional(),
}).strict();
const Registry = z.object({ version: z.literal(1), sessions: z.array(Registration).max(64) }).strict()
  .refine((r) => new Set(r.sessions.map((s) => s.id)).size === r.sessions.length &&
    new Set(r.sessions.map((s) => s.rollout)).size === r.sessions.length, "Duplicate session registration");
type Registered = z.infer<typeof Registration>;
const Meta = z.object({ type: z.literal("session_meta"), payload: z.object({ id: ExternalSessionId,
  forked_from_id: ExternalSessionId.nullable().optional() }) });
const safe = (text: string, size = 4096) => (text.length > size ? text.slice(0, size - 16) + " … [truncated]" : text).replace(/[\p{Cf}\p{Cc}]/gu,
  (c) => c === "\n" || c === "\t" ? c : "�");
const within = (root: string, path: string) => { const r = relative(root, path); return r === "" || r !== ".." && !r.startsWith("../") && !isAbsolute(r); };

/** No watches, polling or external process ownership. Each read uses a bounded
 * descriptor and closes it before publishing. Registry is re-read on demand. */
export class ExternalAgentService {
  private disposed = false;
  private controller = new AbortController();
  private pending = 0;
  private drained: (() => void)[] = [];
  constructor(private readonly root: string, private readonly registryPath: string | undefined) {}
  dispose(): Promise<void> {
    this.disposed = true; this.controller.abort();
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
        // Authored path links have authority only in their explicitly named
        // registered repository, never merely because another repo has the path.
        if (session.contextRoot !== root) session.contextPaths = [];
      }
      return registry.sessions;
    } finally { await file.close(); }
  }
  private summary(row: Registered): ExternalAgentSummary {
    return { id: row.id, label: safe(row.label, 120), evidence: row.evidence, status: "unavailable", parentId: null,
      ancestry: "unavailable", observationId: "", observedAt: new Date().toISOString(), message: "Registered session could not be read safely.",
      ...(row.role ? { role: safe(row.role, 120) } : {}), ...(row.task ? { task: safe(row.task, 200) } : {}), contextPaths: row.contextPaths };
  }
  private async read(row: Registered, tail: boolean): Promise<ExternalDetail> {
    const summary = this.summary(row);
    const result: ExternalDetail = { session: summary, entries: [], handoff: row.tmux ? "unavailable" : "unconfigured",
      coverage: { tailBytes: 0, partial: true, omittedRecords: 0, message: "No transcript observed." } };
    let file: FileHandle | undefined;
    try {
      file = await this.regular(row.rollout, 2 ** 31);
      const stat = await file.stat(), header = Buffer.alloc(HEADER);
      const first = await file.read(header, 0, HEADER, 0); this.check();
      const newline = header.subarray(0, first.bytesRead).indexOf(10);
      if (newline < 0) throw new Error("Missing or oversized metadata");
      const meta = Meta.parse(JSON.parse(header.subarray(0, newline).toString("utf8")));
      if (meta.payload.id !== row.id) throw new Error("Wrong registered session");
      summary.parentId = meta.payload.forked_from_id ?? null;
      summary.status = "observed"; summary.ancestry = summary.parentId ? "unknown-parent" : "root";
      summary.observationId = createHash("sha256").update(`${stat.dev}:${stat.ino}:${header.subarray(0, newline).toString("utf8")}`).digest("hex");
      summary.message = "Parentage comes from the registered session header; role and task are operator descriptions.";
      if (tail) {
        const start = Math.max(0, stat.size - TAIL), buffer = Buffer.alloc(Math.min(stat.size, TAIL));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, start); this.check();
        result.coverage.tailBytes = bytesRead;
        let text = buffer.subarray(0, bytesRead).toString("utf8");
        let partial = start > 0;
        if (start > 0) { const end = text.indexOf("\n"); text = end < 0 ? "" : text.slice(end + 1); }
        if (!text.endsWith("\n")) { partial = true; text = text.slice(0, text.lastIndexOf("\n") + 1); }
        const entries: ExternalEntry[] = [];
        let omitted = 0, index = 0;
        for (const line of text.split("\n")) {
          if (!line) continue;
          if (line.length > 65536) { omitted++; partial = true; continue; }
          let item: unknown;
          try { item = JSON.parse(line); } catch { omitted++; partial = true; continue; }
          const entry = extractEntry(item, `${start}:${index++}`);
          if (entry) entries.push(entry); else omitted++;
        }
        if (entries.length > MAX_ENTRIES) { omitted += entries.length - MAX_ENTRIES; partial = true; }
        result.entries = entries.slice(-MAX_ENTRIES);
        result.coverage = { tailBytes: bytesRead, partial, omittedRecords: omitted,
          message: "Bounded recent assistant conversation and named tool events. User prompts, reasoning, arguments and tool output bytes omitted. Not all effective context or repository changes." };
      }
      const after = await file.stat(), current = await lstat(row.rollout); this.check();
      if (after.size < stat.size || current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink())
        throw new Error("Transcript rotated or truncated");
      if (tail && row.tmux) result.handoff = await validateHandoff(row.tmux, row.rollout, this.controller.signal) ? "available" : "unavailable";
      this.check();
      return result;
    } catch {
      this.check();
      return { ...result, session: this.summary(row), entries: [], handoff: row.tmux ? "unavailable" : "unconfigured",
        coverage: { tailBytes: 0, partial: true, omittedRecords: 0, message: "Missing, changed, invalid or unsafe registered transcript; no transcript authority retained." } };
    } finally { await file?.close(); }
  }
  async request(request: ExternalRequest): Promise<ExternalResult> {
    this.check();
    if (this.pending >= 2) throw new Error("External observer busy; retry deliberately");
    this.pending++;
    try {
      let rows: Registered[];
      try { rows = await this.registrations(); } catch {
        this.check();
        if (request.type !== "externalAgents.snapshot") throw new Error("External registry unavailable");
        return { kind: "snapshot", snapshot: { status: "unavailable", observedAt: new Date().toISOString(), sessions: [],
          message: "External sessions are not configured or the operator registry could not be validated. Managed-agent execution is separate." } };
      }
      this.check();
      if (request.type === "externalAgents.snapshot") {
        const sessions: ExternalAgentSummary[] = [];
        for (const row of rows) { sessions.push((await this.read(row, false)).session); this.check(); }
        resolveAncestry(sessions);
        return ExternalResultSchema.parse({ kind: "snapshot", snapshot: { status: "observed", sessions, observedAt: new Date().toISOString(),
          message: "Explicit operator registrations only. Refresh to observe new records; sessions may be active or historical." } });
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

/** Deliberately not a prose-to-facts parser. Tool payloads are never exposed. */
export function extractEntry(input: unknown, id: string): ExternalEntry | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>, p = record.payload;
  if (!p || typeof p !== "object") return null;
  const payload = p as Record<string, unknown>;
  const at = typeof record.timestamp === "string" ? safe(record.timestamp, 64) : "timestamp unavailable";
  if (record.type === "response_item" && payload.type === "message" && payload.role === "assistant" &&
      payload.phase !== "analysis" && Array.isArray(payload.content)) {
    const chunks: string[] = [];
    for (const item of payload.content) if (item?.type === "output_text" && typeof item.text === "string") chunks.push(item.text);
    if (chunks.length) return { id, at, kind: "assistant", text: safe(chunks.join("\n")), attribution: "assistant-reported" };
  }
  if (record.type === "response_item" && (payload.type === "function_call" || payload.type === "custom_tool_call") && typeof payload.name === "string")
    return { id, at, kind: "tool-call", text: `Tool requested: ${safe(payload.name, 160)} (arguments withheld; outcome not inferred)`, attribution: "recorded-tool-event" };
  if (record.type === "response_item" && (payload.type === "function_call_output" || payload.type === "custom_tool_call_output"))
    return { id, at, kind: "tool-result", text: "Tool response recorded (output withheld; not proof of success or a commit)", attribution: "recorded-tool-event" };
  if (record.type === "event_msg" && (payload.type === "task_started" || payload.type === "task_complete"))
    return { id, at, kind: payload.type === "task_started" ? "turn-start" : "turn-complete", text: payload.type === "task_started" ? "Harness turn started" : "Harness turn completed; product completion not inferred", attribution: "harness-event" };
  return null;
}
