import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { Registry } from "../external-agents-registry";

export type WorkInput = { sessionId: string; agent: string; taskId: string | null; boundary: string; at: string; text: string; state?: "completed" | "failed" };
export type WorkCompletion = Pick<WorkInput, "sessionId" | "boundary" | "at" | "state">;
const TAIL = 512 * 1024;
async function regular(path: string) {
  if (!isAbsolute(path) || await realpath(path) !== path) throw new Error("Work Log input must be a canonical registered file");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const stat = await file.stat();
  if (!stat.isFile() || stat.uid !== process.getuid?.()) { await file.close(); throw new Error("Work Log input unavailable"); }
  return file;
}
export function cleanWorkText(text: string, max = 1600): string {
  return text.replace(/(?:\/home\/[^\s"'<>]+|\/tmp\/[^\s"'<>]+|[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|password|secret)\s*[=:]\s*[^\s,;]+)/gi, "[private]")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => c === "\n" || c === "\t" ? c : "").slice(0, max);
}

/** Only explicit operator registry, at most a bounded recent tail per session.
 * A boundary is an actual finished Codex turn, not a timer or arbitrary tool. */
export async function readWorkInputs(root: string, registryPath?: string, seen: Record<string, string> = {}): Promise<WorkInput[]> {
  return (await readWorkEvidence(root, registryPath, seen)).inputs;
}

/** Bounded, non-billable corroboration for saved legacy completion rows. */
export async function readWorkCompletions(root: string, registryPath?: string): Promise<WorkCompletion[]> {
  return (await readWorkEvidence(root, registryPath, {})).completions;
}

async function readWorkEvidence(root: string, registryPath: string | undefined, seen: Record<string, string>) {
  if (!registryPath) throw new Error("Register agents to start the Work Log");
  const rel = relative(await realpath(root), registryPath);
  if (!rel.startsWith("../") && !isAbsolute(rel)) throw new Error("Use the private agent registry outside this repository");
  const registryFile = await regular(registryPath);
  let rows;
  try {
    const stat = await registryFile.stat();
    if (stat.size > 65536 || (stat.mode & 0o022)) throw new Error("Private registry is not readable safely");
    rows = Registry.parse(JSON.parse(await registryFile.readFile("utf8"))).sessions;
  } finally { await registryFile.close(); }
  const result: WorkInput[] = [];
  const completions: WorkCompletion[] = [];
  for (const row of rows.filter((item) => item.evidence === "local")) {
    let file;
    try {
      file = await regular(row.rollout);
      const stat = await file.stat();
      const header = Buffer.alloc(65536), head = await file.read(header, 0, header.length, 0);
      const firstLine = header.subarray(0, head.bytesRead).toString("utf8").split("\n")[0];
      const meta = JSON.parse(firstLine);
      if (meta.type !== "session_meta" || meta.payload?.id !== row.id) continue;
      const start = Math.max(0, stat.size - TAIL), data = Buffer.alloc(Math.min(stat.size, TAIL));
      const read = await file.read(data, 0, data.length, start);
      let text = data.subarray(0, read.bytesRead).toString("utf8");
      if (start) text = text.slice(text.indexOf("\n") + 1);
      text = text.slice(0, text.lastIndexOf("\n") + 1);
      let boundary = "", at = "", completedText = "";
      let state: "completed" | "failed" = "completed";
      const fork = !!meta.payload?.forked_from_id;
      const born = Date.parse(meta.payload?.timestamp ?? (fork ? "" : meta.timestamp) ?? "");
      if (fork && !Number.isFinite(born)) continue;
      let ownTurn: string | undefined;
      const evidence: string[] = [];
      for (const line of text.split("\n")) {
        if (!line || line.length > 64000) continue;
        let event; try { event = JSON.parse(line); } catch { continue; }
        const payload = event.payload;
        // A copied nested transcript header ends any proven ownership span,
        // even if the header has no usable timestamp of its own.
        if (event.type === "session_meta") { evidence.length = 0; ownTurn = undefined; continue; }
        const timestamp = Date.parse(event.timestamp ?? "");
        if (!Number.isFinite(timestamp) || (Number.isFinite(born) && timestamp < born)) continue;
        // Fork copies can rewrite outer timestamps. Only their preserved turn
        // start time (epoch seconds), not copied header time, proves ownership.
        const started = typeof payload?.started_at === "number" ? payload.started_at * 1000 : NaN;
        if (event.type === "event_msg" && payload?.type === "task_started") {
          evidence.length = 0;
          ownTurn = typeof payload.turn_id === "string" && Number.isFinite(started) && started >= born ? payload.turn_id : undefined;
        }
        const ownEvidence = !fork || ownTurn !== undefined;
        if (ownEvidence && event.type === "event_msg" && payload?.type === "agent_message" && typeof payload.message === "string")
          evidence.push(cleanWorkText(payload.message, 2500));
        if (ownEvidence && event.type === "response_item" && payload?.type === "function_call")
          evidence.push(`Tool ${cleanWorkText(payload.name ?? "", 80)}: ${cleanWorkText(payload.arguments ?? "", 700)}`);
        if (ownEvidence && event.type === "response_item" && payload?.type === "function_call_output" && typeof payload.output === "string")
          evidence.push(`Result: ${cleanWorkText(payload.output, 700)}`);
        if (event.type === "event_msg" && payload?.type === "task_complete" && typeof event.timestamp === "string") {
          if (fork && !(Number.isFinite(started) ? started >= born : ownTurn !== undefined && payload.turn_id === ownTurn)) continue;
          if (fork && payload.turn_id !== ownTurn) evidence.length = 0;
          if (typeof payload.last_agent_message === "string") evidence.push(cleanWorkText(payload.last_agent_message, 3500));
          at = new Date(event.timestamp).toISOString();
          boundary = `${payload.turn_id ?? "turn"}:${at}`;
          state = payload.error != null ? "failed" : "completed";
          completions.push({ sessionId: row.id, boundary, at, state });
          completedText = evidence.slice(-16).join("\n").slice(-10000);
          evidence.length = 0; ownTurn = undefined;
          if (seen[row.id] === boundary) { boundary = ""; completedText = ""; }
        }
        if (event.type === "event_msg" && payload?.type === "turn_aborted") { evidence.length = 0; ownTurn = undefined; }
      }
      if (boundary && completedText.trim()) result.push({ sessionId: row.id, agent: cleanWorkText(row.label, 120),
        taskId: row.task && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(row.task) ? row.task : null,
        boundary, at, text: completedText, state });
    } catch { /* One unavailable session does not hide other registered work. */ }
    finally { await file?.close(); }
  }
  return { inputs: result, completions };
}
