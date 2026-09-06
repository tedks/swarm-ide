/** Fixed test-build alias: observes actual transport and drains only owned close. */
import type { UtilityProcess } from "electron";
import { launchLocalCore as actualLaunch } from "../../app/electron/core-launch";

const requests: { type: string; requestId: string }[] = [];
const events: { runId: string; state: string; processState: string; cleanup: string }[] = [];
let current: UtilityProcess | undefined;
let generations = 0;
let overflow = false;
let closing = false;
let shutdown: Promise<boolean> | undefined;
let shutdownDiagnostics: unknown = null;
const kills = new WeakMap<UtilityProcess, () => boolean>();

export function rehearsalLedger() { return { requests: [...requests], events: [...events], generations, overflow }; }
export function rehearsalShutdownDiagnostics() { return shutdownDiagnostics; }
export function launchLocalCore(root: string, storeRoot: string) {
  const child = actualLaunch(root, storeRoot);
  current = child; generations++;
  const post = child.postMessage.bind(child);
  child.postMessage = (message, transfer) => {
    if (typeof message?.requestId === "string" && typeof message?.type === "string") {
      if (requests.length < 4096) requests.push({ type: message.type, requestId: message.requestId }); else overflow = true;
    }
    post(message, transfer);
  };
  child.on("message", (message) => {
    if (message?.type === "rehearsal.shutdown") shutdownDiagnostics = message.diagnostics;
    if (message?.agent?.kind === "read") {
      const run = message.agent.run;
      if (events.length < 4096) events.push({ runId: run.runId, state: run.state, processState: run.processState, cleanup: run.cleanup.status });
      else overflow = true;
    }
    if (message?.type !== "agent.changed") return;
    for (const run of message.snapshot.runs) {
      if (events.length < 4096) events.push({ runId: run.runId, state: run.state, processState: "not-in-summary", cleanup: "not-in-summary" });
      else overflow = true;
    }
  });
  const kill = child.kill.bind(child);
  kills.set(child, kill);
  child.kill = () => { if (closing) { void drainRehearsalCore(); return true; } return kill(); };
  return child;
}

/** Only after Electron has accepted close (not a dirty-buffer close attempt). */
export function drainRehearsalCore(): Promise<boolean> {
  closing = true;
  if (shutdown) return shutdown;
  const child = current;
  if (!child) return Promise.resolve(false);
  shutdown = new Promise((resolve) => {
    let settled = false;
    let ready = false;
    const timer = setTimeout(() => { kills.get(child)?.(); finish(false); }, 1800);
    function finish(result: boolean) {
      if (settled) return;
      settled = true; clearTimeout(timer); child!.removeListener("message", receive); child!.removeListener("exit", exited); resolve(result);
    }
    function receive(message: unknown) {
      if (typeof message === "object" && message && "type" in message && message.type === "core.shutdown.ready") {
        ready = true; kills.get(child!)?.();
      }
    }
    function exited() { finish(ready); }
    child.on("message", receive); child.once("exit", exited);
    try { child.postMessage({ type: "core.shutdown" }); } catch { kills.get(child)?.(); finish(false); }
  });
  return shutdown;
}
