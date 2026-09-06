import { spawn } from "node:child_process";
import { readlinkSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import type { Readable, Writable } from "node:stream";
import { AGENT_LIMITS, utf8Bytes, type CleanupEvidence } from "../../protocol/agents";
import type { CodexTransport, CodexTransportSink } from "./codex-app-server";

/** Trusted local-core configuration, not a command exposed to the renderer.
 * Namespace ownership is NOT evidence of the provider's read-only policy.
 * Missing Linux namespace/tool support fails closed; there is no group fallback.
 */
export interface OwnedCodexTransportOptions {
  root: string;
  executable: string;
  nodeExecutable: string;
  unshareExecutable: string;
  setprivExecutable: string;
  ownerScript: string;
  /** Fixed by the core's provider factory; fixtures may use a deterministic program. */
  args?: readonly string[];
  /** Post-interrupt process grace. Service reserves Stop's separate five seconds. */
  graceMs?: number;
}

const evidence = (status: "confirmed" | "unknown"): CleanupEvidence => ({ status,
  observedAt: new Date().toISOString(), detail: status === "confirmed"
    ? "The private PID namespace init was reaped after owned shutdown; the kernel terminated its descendants."
    : "Owned shutdown was requested, but complete namespace teardown could not be confirmed. Another launch must remain blocked." });

/** The guardian survives core death and watches a private control pipe. Its
 * namespace init cannot launch the provider until this facade receives ready
 * and explicitly sends start. close() is idempotent and never signals saved PIDs.
 */
export function createOwnedCodexTransport(options: OwnedCodexTransportOptions, sink: CodexTransportSink): CodexTransport {
  const environment = { ...process.env };
  // These hooks execute before our guardian establishes the lifetime boundary.
  // Reject rather than silently remove operator configuration. This narrow
  // check is not a complete effective-environment or read-only policy proof.
  if (["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_AUDIT"].some((name) => environment[name])) {
    throw new Error("Core-owned process startup hooks are not permitted");
  }
  const args = [...(options.args ?? ["app-server", "--listen", "stdio://"])];
  const graceMs = options.graceMs ?? 250;
  const paths = [options.root, options.executable, options.nodeExecutable,
    options.unshareExecutable, options.setprivExecutable, options.ownerScript];
  if (process.platform !== "linux" || paths.some((path) => typeof path !== "string" ||
      !isAbsolute(path) || normalize(path) !== path || path.length > 4096 || /[\p{Cc}\p{Cf}]/u.test(path)) ||
      !Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 5000 || args.length > 32 ||
      args.some((arg) => typeof arg !== "string" || arg.includes("\0") || utf8Bytes(arg) > 4096) ||
      args.reduce((sum, arg) => sum + utf8Bytes(arg), 0) > 16384) {
    throw new Error("Invalid core-owned Linux process configuration");
  }
  const parentNamespace = readlinkSync("/proc/self/ns/pid");
  const config = { ...options, args, graceMs, parentNamespace };
  const child = spawn(options.nodeExecutable, [options.ownerScript, "guardian", JSON.stringify(config)], {
    cwd: options.root, env: environment, shell: false, stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
  });
  const input = child.stdin!, stdout = child.stdout!, stderr = child.stderr!;
  const control = child.stdio[3] as Writable, status = child.stdio[4] as Readable;
  let ready = false, closing = false, invalid = false, sentExit = false;
  let cleanup: "confirmed" | "unknown" | undefined;
  let buffer = "", statusBytes = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let resolveCleanup!: (value: CleanupEvidence) => void;
  const result = new Promise<CleanupEvidence>((resolve) => { resolveCleanup = resolve; });
  const settle = (value: "confirmed" | "unknown") => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolveCleanup(evidence(value));
  };
  const close = (): Promise<CleanupEvidence> => {
    if (!closing) {
      closing = true;
      control.end();
      input.end();
      // Do not kill the guardian: it owns the fallback if namespace init hangs.
      timeout = setTimeout(() => settle("unknown"), graceMs + 4000);
      if (settled) clearTimeout(timeout);
    }
    return result;
  };
  const fault = () => { if (!invalid) { invalid = true; sink.error(); } void close(); };
  stdout.on("data", sink.stdout);
  stderr.on("data", sink.stderr);
  stdout.on("end", sink.end);
  for (const stream of [input, stdout, stderr, control, status]) stream.on("error", fault);
  child.on("error", fault);
  status.setEncoding("utf8");
  status.on("data", (chunk: string) => {
    statusBytes += utf8Bytes(chunk);
    if (invalid || statusBytes > 4096) { fault(); return; }
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let value: { type?: string; namespace?: string; code?: number | null; status?: string };
      try { value = JSON.parse(line); if (!value || typeof value !== "object") throw new Error(); }
      catch { fault(); return; }
      if (value.type === "ready" && !ready && /^pid:\[\d+\]$/.test(value.namespace ?? "") && value.namespace !== parentNamespace) {
        ready = true;
        if (!closing) control.write("start\n");
      } else if (value.type === "exit" && ready && !sentExit &&
          (value.code === null || Number.isSafeInteger(value.code))) {
        sentExit = true; sink.exit(value.code!);
      } else if (value.type === "cleanup" && !cleanup &&
          (value.status === "unknown" || (value.status === "confirmed" && ready))) {
        cleanup = value.status;
      } else { fault(); return; }
    }
  });
  child.on("close", (code) => {
    if (buffer.length) invalid = true;
    if (!sentExit) { sentExit = true; sink.exit(null); }
    settle(!invalid && code === 0 && cleanup === "confirmed" ? "confirmed" : "unknown");
  });
  return {
    write(line) {
      if (closing || settled || input.destroyed || input.writableLength + utf8Bytes(line) > AGENT_LIMITS.pageBytes) {
        throw new Error("Owned provider input unavailable or backed up");
      }
      input.write(line);
    },
    close,
  };
}
