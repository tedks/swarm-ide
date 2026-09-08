import type { ExternalEntry } from "../protocol/external-agents";

type Dict = Record<string, unknown>;
const object = (value: unknown): Dict | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Dict : undefined;
const bounded = (value: string, limit = 4096): string => {
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return clean.length <= limit ? clean : clean.slice(0, limit - 12) + " [truncated]";
};
// Navigation identities must stay exact: truncating a path could name a different file.
const location = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;

/** A deliberately small literal reader, not a JavaScript evaluator. Expressions,
 * variables, spreads, templates and getters are unsupported and never executed. */
function literal(source: string, start: number, depth = 0): { value: unknown; end: number } | undefined {
  if (depth > 12) return;
  let pos = start;
  while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
  const first = source[pos];
  if (first === '"') {
    let end = pos + 1;
    while (end < source.length) {
      if (source[end] === "\\") { end += 2; continue; }
      if (source[end++] === '"') {
        try { return { value: JSON.parse(source.slice(pos, end)), end }; } catch { return; }
      }
    }
    return;
  }
  if (first === "{" || first === "[") {
    const result: Dict | unknown[] = first === "{" ? Object.create(null) as Dict : [];
    const close = first === "{" ? "}" : "]";
    pos++;
    for (let count = 0; count < 256; count++) {
      while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
      if (source[pos] === close) return { value: result, end: pos + 1 };
      let key = "";
      if (!Array.isArray(result)) {
        if (source[pos] === '"') {
          const parsed = literal(source, pos, depth + 1);
          if (!parsed || typeof parsed.value !== "string") return;
          key = parsed.value; pos = parsed.end;
        } else {
          const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(pos));
          if (!match) return;
          key = match[0]; pos += key.length;
        }
        while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
        if (source[pos++] !== ":") return;
      }
      const parsed = literal(source, pos, depth + 1);
      if (!parsed) return;
      if (Array.isArray(result)) result.push(parsed.value); else result[key] = parsed.value;
      pos = parsed.end;
      while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
      if (source[pos] === close) return { value: result, end: pos + 1 };
      if (source[pos++] !== ",") return;
    }
    return;
  }
  const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w$.])/.exec(source.slice(pos));
  if (primitive) return { value: JSON.parse(primitive[0]), end: pos + primitive[0].length };
}

/** Accept a complete top-level sequence of `await tools.name(literal)` or
 * `text(await tools.name(literal))` statements only. Scanning arbitrary source
 * would falsely attribute calls in unexecuted branches or function bodies.
 * Any unsupported syntax makes the entire wrapper a generic tool event. */
function nestedCalls(source: string): { name: string; input: unknown }[] {
  if (source.length > 262144) return [];
  const calls: { name: string; input: unknown }[] = [];
  let pos = 0;
  const trivia = (): boolean => {
    while (pos < source.length) {
      if (/\s/.test(source[pos]!)) { pos++; continue; }
      if (source.startsWith("//", pos)) {
        const end = source.indexOf("\n", pos + 2); pos = end < 0 ? source.length : end + 1; continue;
      }
      if (source.startsWith("/*", pos)) {
        const end = source.indexOf("*/", pos + 2);
        if (end < 0) return false;
        pos = end + 2; continue;
      }
      break;
    }
    return true;
  };
  const token = (value: string): boolean => {
    if (!trivia() || !source.startsWith(value, pos) || /[\w$]/.test(value.at(-1) ?? "") && /[\w$]/.test(source[pos + value.length] ?? "")) return false;
    pos += value.length; return true;
  };
  while (true) {
    if (!trivia()) return [];
    if (pos === source.length) return calls;
    if (calls.length >= 64) return [];
    const wrapped = token("text");
    if (wrapped && !token("(")) return [];
    if (!token("await") || !token("tools") || !token(".")) return [];
    const name = token("exec_command") ? "exec_command" : token("apply_patch") ? "apply_patch" : undefined;
    if (!name || !token("(") || !trivia()) return [];
    const parsed = literal(source, pos);
    if (!parsed) return [];
    pos = parsed.end;
    if (!token(")") || wrapped && !token(")") || !trivia()) return [];
    calls.push({ name, input: parsed.value });
    if (pos === source.length) return calls;
    if (!token(";")) return [];
  }
}

function toolEntries(name: string, input: unknown, base: ExternalEntry): ExternalEntry[] {
  const tool = bounded(name, 160);
  const args = object(input);
  if (/(?:^|[._])exec_command$/.test(name) && typeof args?.cmd === "string") {
    const command = bounded(args.cmd);
    const cwd = location(args.workdir);
    return [{ ...base, tool, command, ...(cwd ? { cwd } : {}), text: bounded(`Ran ${command}`) }];
  }
  if (/(?:^|[._])apply_patch$/.test(name)) {
    const patch = typeof input === "string" ? input : typeof args?.patch === "string" ? args.patch : typeof args?.input === "string" ? args.input : undefined;
    if (patch) {
      const headers = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: ([^\r\n]+)\r?$/gm)];
      const entries: ExternalEntry[] = [];
      for (let index = 0; index < Math.min(headers.length, 64); index++) {
        const header = headers[index]!, path = location(header[1]);
        if (!path) continue;
        const end = headers[index + 1]?.index ?? patch.length;
        const section = patch.slice(header.index, end).replace(/\n\*\*\* End Patch\s*$/, "");
        entries.push({ ...base, id: `${base.id.slice(0, 90)}:file:${index}`, tool, path, patch: bounded(`*** Begin Patch\n${section}\n*** End Patch`, 16384), text: bounded(`Edited ${path}`) });
      }
      if (entries.length) return entries;
    }
  }
  return [{ ...base, tool, text: `Ran ${tool}` }];
}

/** Recorded invocation is a request, never proof of success. Preserve assistant
 * messages, but omit user input, reasoning and raw tool output. Only actual tool
 * literals provide file/command attribution; prose and shell commands never do. */
export function extractEntries(input: unknown, id: string): ExternalEntry[] {
  const record = object(input), payload = object(record?.payload);
  if (!record || !payload) return [];
  const at = typeof record.timestamp === "string" ? bounded(record.timestamp, 64) : "timestamp unavailable";
  const base: ExternalEntry = { id: id.slice(0, 100), at, kind: "tool-call", text: "", attribution: "recorded-tool-event",
    ...(typeof payload.call_id === "string" ? { callId: bounded(payload.call_id, 160) } : {}) };
  if (record.type === "response_item" && payload.type === "message" && payload.role === "assistant" && payload.phase !== "analysis" && Array.isArray(payload.content)) {
    const chunks = payload.content.flatMap((item: unknown) => {
      const part = object(item);
      return part?.type === "output_text" && typeof part.text === "string" ? [part.text] : [];
    });
    return chunks.length ? [{ id: base.id, at, kind: "assistant", text: bounded(chunks.join("\n")), attribution: "assistant-reported" }] : [];
  }
  if (record.type === "response_item" && (payload.type === "function_call" || payload.type === "custom_tool_call") && typeof payload.name === "string") {
    let args: unknown = payload.arguments ?? payload.input;
    if (payload.type === "function_call" && typeof args === "string") {
      try { args = JSON.parse(args); } catch { args = undefined; }
    }
    if (/(?:^|[._])exec$/.test(payload.name) && typeof args === "string") {
      const nested = nestedCalls(args);
      if (nested.length) return nested.flatMap((call, index) => toolEntries(call.name, call.input, { ...base, id: `${base.id.slice(0, 78)}:call:${index}` })).slice(0, 120);
    }
    return toolEntries(payload.name, args, base);
  }
  if (record.type === "response_item" && (payload.type === "function_call_output" || payload.type === "custom_tool_call_output"))
    return [{ ...base, kind: "tool-result", text: "Tool response" }];
  if (record.type === "event_msg" && (payload.type === "task_started" || payload.type === "task_complete"))
    return [{ id: base.id, at, kind: payload.type === "task_started" ? "turn-start" : "turn-complete", text: payload.type === "task_started" ? "Turn started" : "Turn completed", attribution: "harness-event" }];
  return [];
}
