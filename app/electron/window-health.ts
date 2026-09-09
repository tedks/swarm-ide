import type { EventEmitter } from "node:events";

type Emitter = Pick<EventEmitter, "on" | "removeListener">;
type Report = (event: string, details?: Record<string, string | number>) => void;

/** Fixed event categories only. Does not reload, kill, or send work to a renderer. */
export function watchWindowHealth(window: Emitter, contents: Emitter, report: Report) {
  const unresponsive = () => report("unresponsive");
  const responsive = () => report("responsive");
  const gone = (_event: unknown, details: { reason: string; exitCode: number }) => report("render-process-gone", { reason: details.reason, exitCode: details.exitCode });
  const failed = (_event: unknown, errorCode: number, _description: string, _url: string, mainFrame: boolean) => { if (mainFrame) report("load-failed", { errorCode }); };
  const diagnostic = (event: { message: string }) => {
    const category = ["render-error", "script-error", "unhandled-rejection"].find((value) => event.message === `[renderer-health] ${value}`);
    if (category) report(category);
  };
  window.on("unresponsive", unresponsive); window.on("responsive", responsive);
  contents.on("render-process-gone", gone); contents.on("did-fail-load", failed); contents.on("console-message", diagnostic);
  return () => {
    window.removeListener("unresponsive", unresponsive); window.removeListener("responsive", responsive);
    contents.removeListener("render-process-gone", gone); contents.removeListener("did-fail-load", failed); contents.removeListener("console-message", diagnostic);
  };
}
