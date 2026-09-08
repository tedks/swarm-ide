import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";

export const BUILD_PROGRESS_LIMITS = { bytes: 4 * 1024 * 1024, lineBytes: 256 * 1024, sampleMs: 250, message: 300 } as const;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
function text(value: unknown): string {
  if (typeof value !== "string") return "";
  // Linear even for unterminated/repeated escape prefixes. Never interpret
  // terminal control sequences or let them become layout commands in the UI.
  let mode: "plain" | "escape" | "csi" | "osc" | "osc-escape" = "plain", visible = "";
  for (const character of value) {
    if (mode === "osc" || mode === "osc-escape") {
      if (character === "\x07" || mode === "osc-escape" && character === "\\") mode = "plain";
      else mode = character === "\x1b" ? "osc-escape" : "osc";
      continue;
    }
    if (mode === "csi") { if (character >= "@" && character <= "~") mode = "plain"; continue; }
    if (mode === "escape") { mode = character === "[" ? "csi" : character === "]" ? "osc" : "plain"; continue; }
    if (character === "\x1b") { mode = "escape"; continue; }
    const safe = /[\u0000-\u001f\u007f-\u009f\s]/u.test(character) ? " " : character;
    if (safe !== " " || visible && !visible.endsWith(" ")) visible += safe;
    if (visible.length >= BUILD_PROGRESS_LIMITS.message) break;
  }
  return visible.trim().slice(0, BUILD_PROGRESS_LIMITS.message);
}

/** Deliberately ignores command lines, environment, file contents and percentages. */
export function buildMilestone(value: unknown): string | undefined {
  const event = object(value), id = object(event?.id);
  if (!event || !id) return;
  const configured = text(object(id.targetConfigured)?.label), completed = text(object(id.targetCompleted)?.label);
  const test = text(object(id.testSummary)?.label ?? object(id.testResult)?.label);
  let message: string | undefined;
  if (object(event.aborted)) message = `Build step stopped${configured || completed || test ? `: ${configured || completed || test}` : ""}`;
  else if (configured && object(event.configured)) message = `Configured ${configured}`;
  else if (completed && object(event.completed)) message = object(event.completed)?.success === true ? `Built ${completed}` : `Target failed: ${completed}`;
  else if (test && (object(event.testSummary) || object(event.testResult))) {
    const status = text(object(event.testSummary)?.overallStatus ?? object(event.testResult)?.status);
    message = `Test ${test}${status ? `: ${status.toLowerCase().replace(/_/g, " ")}` : " result received"}`;
  } else if (object(id.progress) && object(event.progress)) {
    const progress = object(event.progress)!;
    const lines = [progress.stderr, progress.stdout].filter((part): part is string => typeof part === "string").join("\n").split(/[\r\n]+/);
    message = lines.map(text).filter(Boolean).at(-1);
  } else if (object(id.started) && object(event.started)) message = "Bazel build started";
  else if (object(id.buildFinished) && object(event.finished)) message = "Build process finished; checking outputs";
  return message?.slice(0, BUILD_PROGRESS_LIMITS.message);
}

/** Incremental bytes: partial JSON and split UTF-8 characters never become events. */
export class BuildProgressDecoder {
  private pending = Buffer.alloc(0);
  private total = 0;
  append(chunk: Uint8Array): string | undefined {
    this.total += chunk.byteLength;
    if (this.total > BUILD_PROGRESS_LIMITS.bytes) throw new Error("Build progress exceeded its byte limit");
    const bytes = Buffer.concat([this.pending, chunk]);
    let offset = 0, end: number, latest: string | undefined;
    while ((end = bytes.indexOf(10, offset)) !== -1) {
      if (end - offset > BUILD_PROGRESS_LIMITS.lineBytes) throw new Error("Build progress event exceeded its line limit");
      const line = new TextDecoder("utf8", { fatal: true }).decode(bytes.subarray(offset, end));
      offset = end + 1;
      if (line.trim()) latest = buildMilestone(JSON.parse(line)) ?? latest;
    }
    this.pending = Buffer.from(bytes.subarray(offset));
    if (this.pending.byteLength > BUILD_PROGRESS_LIMITS.lineBytes) throw new Error("Build progress event exceeded its line limit");
    return latest;
  }
}

/** One private append-only BEP file; telemetry failure never decides build success. */
export function watchBuildProgress(path: string, publish: (message: string) => void,
  openFile: (path: string, flags: number) => Promise<FileHandle> = open): { stop(): Promise<void> } {
  const decoder = new BuildProgressDecoder();
  let handle: FileHandle | undefined, offset = 0, disabled = false, stopped = false, last = "";
  let timer: ReturnType<typeof setTimeout> | undefined, pending: Promise<void> | undefined, closing: Promise<void> | undefined;
  const emit = (message: string | undefined) => {
    if (!message || message === last) return;
    last = message;
    try { publish(message); } catch { /* Progress listeners cannot change the build result. */ }
  };
  async function sample() {
    if (disabled) return;
    try {
      if (!handle) {
        try { handle = await openFile(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      }
      const [fd, name] = await Promise.all([handle.stat(), lstat(path)]);
      if (!fd.isFile() || !name.isFile() || fd.dev !== name.dev || fd.ino !== name.ino || fd.size < offset || fd.size > BUILD_PROGRESS_LIMITS.bytes)
        throw new Error("Build progress file changed or exceeded its limit");
      let latest: string | undefined;
      const end = fd.size;
      while (offset < end) {
        const bytes = Buffer.alloc(Math.min(64 * 1024, end - offset));
        const read = await handle.read(bytes, 0, bytes.byteLength, offset);
        if (!read.bytesRead) throw new Error("Build progress file was truncated");
        offset += read.bytesRead;
        latest = decoder.append(bytes.subarray(0, read.bytesRead)) ?? latest;
      }
      emit(latest);
    } catch {
      disabled = true;
      emit("Build progress is unavailable; waiting for the build result");
    }
  }
  const pump = () => {
    pending = sample().finally(() => {
      pending = undefined;
      if (!stopped && !disabled) { timer = setTimeout(pump, BUILD_PROGRESS_LIMITS.sampleMs); timer.unref(); }
    });
  };
  pump();
  return { stop() {
    if (closing) return closing;
    stopped = true; clearTimeout(timer);
    closing = (async () => {
      await pending;
      await sample(); // Drain complete lines written immediately before process exit.
      try { await handle?.close(); }
      catch { emit("Build progress is unavailable; waiting for the build result"); }
      finally { handle = undefined; }
    })();
    return closing;
  } };
}
