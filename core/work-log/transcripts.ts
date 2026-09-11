import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { Registry } from "../external-agents-registry";
import { extractEntries } from "../external-agents-activity";

export type WorkCheckpoint = { source: string; offset: number; length: number; anchor: string; at: string; turnId: string | null;
  kind?: "milestone" | "terminal" | "abort" };
type WorkInputBase = { sessionId: string; agent: string; taskId: string | null; boundary: string; at: string; text: string; checkpoint?: WorkCheckpoint };
export type WorkInput = (WorkInputBase & { origin: "milestone"; state?: never })
  | (WorkInputBase & { origin: "terminal"; state: "completed" | "failed" });
export type WorkCompletion = { sessionId: string; boundary: string; at: string; state: "completed" | "failed" };
export type WorkObservation = { inputs: WorkInput[]; advances: Record<string, WorkCheckpoint> };
const TAIL = 512 * 1024;

async function regular(path: string) {
  if (!isAbsolute(path) || await realpath(path) !== path) throw new Error("Work Log input must be a canonical registered file");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const stat = await file.stat();
  if (!stat.isFile() || stat.uid !== process.getuid?.()) { await file.close(); throw new Error("Work Log input unavailable"); }
  return file;
}

export function cleanWorkText(text: string, max = 1600): string {
  return text.replace(/authorization\s*:\s*(?:bearer\s+)?[^\s,;]+/gi, "[private]")
    .replace(/\b[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|password|secret|token)[A-Za-z0-9_-]*\s*[=:]\s*[^\s,;]+/gi, "[private]")
    .replace(/(^|[^A-Za-z0-9_:/])\/(?!\/)[^\s"'<>),;\]`]+/g, "$1[private]")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => c === "\n" || c === "\t" ? c : "").slice(0, max);
}

function concreteCommand(command: string): boolean {
  const candidate = command.replace(/^\s*cd\s+(?:"[^"\n]*"|'[^'\n]*'|[^\s;&|]+)\s*&&\s*/, "");
  return /^\s*(?:nix\s+develop\s+--command\s+)?(?:(?:bazel|bazelisk)\s+(?:test|build|run)|(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:test|lint|typecheck|build|check)|vitest\s+run|pytest\b|cargo\s+test\b|go\s+test\b|make\s+(?:test|check)\b|git\s+(?:commit|push|merge|rebase|cherry-pick|tag)\b|gh\s+pr\s+(?:create|ready|merge|comment)\b|ditz\s+(?:add|start|close|comment|sync)\b)/i.test(candidate);
}

function turnIdentity(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return;
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : `hash/${createHash("sha256").update(value).digest("hex")}`;
}

function nextCheckpoint(source: string, offset: number, at: string, turnId: string | undefined,
  kind: NonNullable<WorkCheckpoint["kind"]>, bytes: Buffer): WorkCheckpoint {
  const anchor = createHash("sha256").update(source).update("\n").update(String(offset)).update("\n").update(bytes).digest("hex").slice(0, 32);
  return { source, offset, length: bytes.length + 1, anchor, at, turnId: turnId ?? null, kind };
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

/** Only explicit operator registry, at most a bounded recent tail per session.
 * Ongoing inputs require a completed concrete operation; terminal inputs still
 * require an actual task_complete event. */
export async function readWorkInputs(root: string, registryPath?: string, checkpoints: Record<string, WorkCheckpoint> = {},
  legacySeen: Record<string, string> = {}): Promise<WorkInput[]> {
  return (await readWorkEvidence(root, registryPath, checkpoints, legacySeen)).inputs;
}

export async function observeWork(root: string, registryPath?: string, checkpoints: Record<string, WorkCheckpoint> = {},
  legacySeen: Record<string, string> = {}): Promise<WorkObservation> {
  const observed = await readWorkEvidence(root, registryPath, checkpoints, legacySeen);
  return { inputs: observed.inputs, advances: observed.advances };
}

/** Bounded, non-billable corroboration for saved legacy completion rows. */
export async function readWorkCompletions(root: string, registryPath?: string): Promise<WorkCompletion[]> {
  return (await readWorkEvidence(root, registryPath, {}, {})).completions;
}

async function readWorkEvidence(root: string, registryPath: string | undefined, checkpoints: Record<string, WorkCheckpoint>,
  legacySeen: Record<string, string>) {
  if (!registryPath) throw new Error("Register agents to start the Work Log");
  const rel = relative(await realpath(root), registryPath);
  if (!rel.startsWith("../") && !isAbsolute(rel)) throw new Error("Use the private agent registry outside this repository");
  const registryFile = await regular(registryPath);
  let rows;
  try {
    const stat = await registryFile.stat();
    if (stat.size > 65536 || (stat.mode & 0o022)) throw new Error("Private registry is not readable safely");
    const bytes = Buffer.alloc(stat.size + 1), read = await registryFile.read(bytes, 0, bytes.length, 0), after = await registryFile.stat();
    if (read.bytesRead !== stat.size || after.size !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino)
      throw new Error("Private registry changed while reading");
    rows = Registry.parse(JSON.parse(bytes.subarray(0, read.bytesRead).toString("utf8"))).sessions;
  } finally { await registryFile.close(); }
  const inputs: WorkInput[] = [], completions: WorkCompletion[] = [];
  const advances: Record<string, WorkCheckpoint> = {};
  for (const row of rows.filter((item) => item.evidence === "local")) {
    let file;
    try {
      file = await regular(row.rollout);
      const stat = await file.stat(), source = `${stat.dev}:${stat.ino}`;
      const prior = checkpoints[row.id];
      // A replaced or truncated transcript cannot be joined to a paid cursor.
      if (prior && (prior.source !== source || prior.offset > stat.size || prior.length > prior.offset || prior.length > 64001)) continue;
      const anchorMatches = async () => {
        if (!prior) return true;
        const saved = Buffer.alloc(prior.length), read = await file!.read(saved, 0, saved.length, prior.offset - prior.length);
        if (read.bytesRead !== prior.length || saved.at(-1) !== 10) return false;
        const raw = saved.subarray(0, -1);
        return nextCheckpoint(source, prior.offset, prior.at, prior.turnId ?? undefined, prior.kind ?? "milestone", raw).anchor === prior.anchor;
      };
      if (!await anchorMatches()) continue;
      const header = Buffer.alloc(65536), head = await file.read(header, 0, header.length, 0);
      const firstLine = header.subarray(0, head.bytesRead).toString("utf8").split("\n")[0];
      const meta = JSON.parse(firstLine);
      if (meta.type !== "session_meta" || meta.payload?.id !== row.id) continue;

      const tailStart = Math.max(0, stat.size - TAIL);
      const start = Math.max(tailStart, prior?.offset ?? 0);
      const closedGap = !!prior && prior.offset < tailStart && prior.kind !== "milestone" && !(prior.kind === undefined && prior.turnId);
      const data = Buffer.alloc(stat.size - start), read = await file.read(data, 0, data.length, start);
      const after = await file.stat();
      if (after.dev !== stat.dev || after.ino !== stat.ino || after.size < stat.size || !await anchorMatches()) continue;
      let begin = 0;
      // A checkpoint is always immediately after a complete line. A tail start
      // can bisect a line, so discard that fragment rather than parsing it.
      if (start > 0 && (!prior || start !== prior.offset)) {
        const newline = data.subarray(0, read.bytesRead).indexOf(10);
        if (newline < 0) continue;
        begin = newline + 1;
      }
      const complete = data.subarray(begin, read.bytesRead).lastIndexOf(10);
      if (complete < 0) continue;
      const bytes = data.subarray(begin, begin + complete + 1);
      let absolute = start + begin;

      const fork = !!meta.payload?.forked_from_id;
      const born = Date.parse(meta.payload?.timestamp ?? (fork ? "" : meta.timestamp) ?? "");
      if (fork && !Number.isFinite(born)) continue;
      const priorKind = prior?.kind ?? (prior?.turnId ? "milestone" : undefined);
      let ownTurn = priorKind === "milestone" ? prior?.turnId ?? undefined : undefined;
      let owned = prior ? priorKind === "milestone" && (!fork || ownTurn !== undefined) : !fork;
      let evidence: string[] = [], milestones: { at: string; text: string; checkpoint: WorkCheckpoint }[] = [];
      let terminalInput: WorkInput | undefined, latestAdvance: WorkCheckpoint | undefined;
      const calls = new Map<string, { descriptions: string[] }>();

      for (let position = 0; position < bytes.length;) {
        const newline = bytes.indexOf(10, position);
        if (newline < 0) break;
        const rawBytes = bytes.subarray(position, newline), raw = rawBytes.toString("utf8");
        position = newline + 1;
        const end = absolute + rawBytes.length + 1;
        if (!raw) { absolute = end; continue; }
        if (rawBytes.length > 64000) { evidence = []; milestones = []; calls.clear(); owned = false; ownTurn = undefined; absolute = end; continue; }
        let event: Record<string, unknown>;
        try { event = JSON.parse(raw); }
        catch { evidence = []; milestones = []; calls.clear(); owned = false; ownTurn = undefined; absolute = end; continue; }
        const payload = event.payload as Record<string, unknown> | undefined;
        if (event.type === "session_meta" && absolute === 0 && payload?.id === row.id) {
          absolute = end; continue;
        }
        if (event.type === "session_meta") {
          evidence = []; milestones = []; calls.clear(); owned = false; ownTurn = undefined; absolute = end; continue;
        }
        const at = iso(event.timestamp);
        if (!at || (Number.isFinite(born) && Date.parse(at) < born)) { absolute = end; continue; }
        const started = typeof payload?.started_at === "number" ? payload.started_at * 1000 : NaN;
        if (event.type === "event_msg" && payload?.type === "task_started") {
          evidence = []; milestones = []; calls.clear();
          ownTurn = (!fork || Number.isFinite(started) && started >= born) ? turnIdentity(payload.turn_id) : undefined;
          owned = !fork || ownTurn !== undefined; absolute = end; continue;
        }

        if (owned && event.type === "event_msg" && payload?.type === "agent_message" && typeof payload.message === "string")
          evidence.push(cleanWorkText(payload.message, 2500));

        if (owned && event.type === "response_item" && (payload?.type === "function_call" || payload?.type === "custom_tool_call")
          && typeof payload.call_id === "string") {
          const entries = extractEntries(event, `work:${absolute}`);
          const descriptions = entries.flatMap((entry) => {
            if (entry.path && /(?:^|[._])apply_patch$/.test(entry.tool ?? "")) return [`Edited ${cleanWorkText(entry.path, 320)}`];
            if (entry.command && concreteCommand(entry.command)) return [`Ran ${cleanWorkText(entry.command, 700)}`];
            return [];
          });
          if (descriptions.length) calls.set(payload.call_id, { descriptions });
          evidence.push(`Tool ${cleanWorkText(String(payload.name ?? ""), 80)}: ${cleanWorkText(String(payload.arguments ?? payload.input ?? ""), 700)}`);
        }

        if (owned && event.type === "response_item" && (payload?.type === "function_call_output" || payload?.type === "custom_tool_call_output")
          && typeof payload.call_id === "string" && typeof payload.output === "string") {
          const result = cleanWorkText(payload.output, 1200), call = calls.get(payload.call_id);
          evidence.push(`Result: ${cleanWorkText(payload.output, 700)}`);
          calls.delete(payload.call_id);
          if (call) {
            const detail = `${call.descriptions.join("\n")}\nResult: ${result.trim() || "(completed without output)"}`;
            milestones.push({ at, text: detail, checkpoint: nextCheckpoint(source, end, at, ownTurn, "milestone", rawBytes) });
          }
        }

        if (event.type === "event_msg" && payload?.type === "task_complete") {
          const eventTurn = turnIdentity(payload.turn_id);
          const activeTerminal = owned && (ownTurn === undefined || eventTurn === undefined || eventTurn === ownTurn)
            && (!fork || (Number.isFinite(started) ? started >= born : ownTurn !== undefined && (eventTurn === undefined || eventTurn === ownTurn)));
          // A closed checkpoint may fall behind the bounded tail while a later
          // turn runs. Only an explicit different turn can bridge that gap;
          // ambiguous milestones and the previously closed turn stay rejected.
          const gapTerminal = closedGap && !fork && eventTurn !== undefined && eventTurn !== prior?.turnId;
          const ownTerminal = activeTerminal || gapTerminal;
          if (!ownTerminal) { absolute = end; continue; }
          if (typeof payload.last_agent_message === "string") evidence.push(cleanWorkText(payload.last_agent_message, 3500));
          const turn = eventTurn ?? ownTurn ?? "turn";
          const boundary = `${turn}:${at}`;
          const state = payload.error != null ? "failed" as const : "completed" as const;
          const next = nextCheckpoint(source, end, at, eventTurn ?? ownTurn, "terminal", rawBytes);
          completions.push({ sessionId: row.id, boundary, at, state });
          terminalInput = undefined;
          const terminalText = evidence.slice(-16).join("\n").slice(-10000).trim()
            || (priorKind === "milestone" && prior?.turnId !== null && prior?.turnId === (eventTurn ?? ownTurn)
              ? `Turn ${state === "failed" ? "failed" : "completed"} after earlier saved milestones; no additional outcome text was reported.` : "");
          if (legacySeen[row.id] !== boundary && terminalText) terminalInput = { origin: "terminal", sessionId: row.id,
            agent: cleanWorkText(row.label, 120), taskId: row.task && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(row.task) ? row.task : null,
            boundary, at, text: terminalText, state, checkpoint: next };
          else latestAdvance = next;
          evidence = []; milestones = []; calls.clear(); owned = false; ownTurn = undefined;
        }
        if (event.type === "event_msg" && payload?.type === "turn_aborted") {
          const eventTurn = turnIdentity(payload.turn_id);
          if (owned && (ownTurn === undefined || eventTurn === ownTurn)) latestAdvance = nextCheckpoint(source, end, at, eventTurn, "abort", rawBytes);
          evidence = []; milestones = []; calls.clear(); owned = false; ownTurn = undefined;
        }
        absolute = end;
      }

      if (terminalInput) inputs.push(terminalInput);
      else if (milestones.length) {
        const last = milestones.at(-1)!;
        inputs.push({ origin: "milestone", sessionId: row.id, agent: cleanWorkText(row.label, 120),
          taskId: row.task && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(row.task) ? row.task : null,
          boundary: `milestone:${last.checkpoint.anchor}`, at: last.at,
          text: milestones.slice(-8).map((item) => item.text).join("\n").slice(-10000), checkpoint: last.checkpoint });
      } else if (latestAdvance) advances[row.id] = latestAdvance;
    } catch { /* One unavailable session does not hide other registered work. */ }
    finally { await file?.close(); }
  }
  return { inputs, completions, advances };
}
