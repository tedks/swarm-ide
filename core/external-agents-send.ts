import { spawn } from "node:child_process";
import { isAbsolute, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { ExternalMessageSchema, ExternalSessionId, type ExternalResult } from "../protocol/external-agents";
import { findTrustedExecutable } from "./agents/trusted-local";

export type ExternalSendReceipt = Extract<ExternalResult, { kind: "send" }>;
export type QueueMessage = typeof queueExternalMessage;

/** Operator installation/configuration only. No renderer/path or shell lookup. */
export async function resolveExternalCodex(): Promise<string> {
  const selected = process.env.SWARM_CODEX_BIN ?? "codex";
  if (selected !== "codex" && !isAbsolute(selected)) throw new Error("Expected an absolute configured Codex executable");
  return findTrustedExecutable(selected);
}

/** The short-lived queue command is owned; its target session is never owned.
 * Return only a bounded correlated acknowledgement, never raw provider output.
 * Once spawned, any missing/invalid response is ambiguous, including nonzero exit.
 */
export async function queueExternalMessage(executable: string, sessionId: string, text: string, signal?: AbortSignal,
  timeoutMs = 5000): Promise<ExternalSendReceipt> {
  const receiptId = randomUUID();
  const result = (status: ExternalSendReceipt["status"], message: string): ExternalSendReceipt => ({ kind: "send", sessionId, receiptId, status, message });
  ExternalSessionId.parse(sessionId); ExternalMessageSchema.parse(text);
  if (!isAbsolute(executable) || normalize(executable) !== executable || /[\p{Cc}\p{Cf}]/u.test(executable))
    return result("rejected", "Configured Codex executable is unavailable. Nothing was queued.");
  if (signal?.aborted) return result("rejected", "Sending was cancelled before dispatch. Nothing was queued.");
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    let spawned = false, cancelled = false, failed = false, output = "", bytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unknown = () => result("delivery-unknown", "Queue delivery could not be confirmed. Inspect the target conversation before sending again; no retry was sent.");
    const stop = () => {
      cancelled = true;
      // detached creates a fresh process group for this queue CLI and its wrapper
      // children. Never address the registered session PID or tmux server.
      if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* close determines completion */ } }
    };
    try {
      child = spawn(executable, ["queue", "--thread", sessionId, "--message", text], {
        cwd: "/", env: process.env, detached: true, stdio: ["ignore", "pipe", "pipe"], shell: false,
      });
    } catch { resolve(result("rejected", "Codex queue could not be started. Nothing was queued.")); return; }
    child.once("spawn", () => { spawned = true; if (cancelled) stop(); });
    child.once("error", () => { failed = true; });
    child.stdout!.on("data", (data: Buffer) => { bytes += data.length; if (bytes > 16384) stop(); else output += data.toString("utf8"); });
    child.stderr!.on("data", (data: Buffer) => { bytes += data.length; if (bytes > 16384) stop(); });
    // Wait for close (including inherited pipes), not merely error/exit. Disposal
    // therefore cannot declare this owned CLI drained while it is still alive.
    child.once("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", stop);
      if (!spawned) { resolve(result("rejected", "Codex queue could not be started. Nothing was queued.")); return; }
      if (cancelled || failed || code !== 0) { resolve(unknown()); return; }
      const ack = /^Queued message ([0-9a-f-]{36}) for thread ([0-9a-f-]{36})\.?\s*$/.exec(output);
      if (!ack || !ExternalSessionId.safeParse(ack[1]).success || ack[2] !== sessionId) { resolve(unknown()); return; }
      resolve({ ...result("queued", "Codex accepted the message into the session queue. Consumption and completion are not confirmed."), receiptId: ack[1]! });
    });
    signal?.addEventListener("abort", stop, { once: true });
    timer = setTimeout(stop, timeoutMs);
    if (signal?.aborted) stop();
  });
}
