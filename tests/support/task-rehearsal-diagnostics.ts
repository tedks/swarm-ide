/** TEST ONLY. Passive delivery evidence: no timers, layout reads/writes,
 * callback replacement, error suppression or application/bridge mutation. */
export function installTaskResizeDiagnostics() {
  type Observation = { at: number; target: string; graph: string | null; width: number; height: number };
  const deliveries: Observation[] = [], errors: unknown[] = [];
  const observed = new WeakSet<Element>();
  let count = 0;
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      deliveries.push({ at: performance.now(), target: `${entry.target.tagName}.${entry.target.className}`.slice(0, 240),
        graph: entry.target.closest(".graph-pane")?.getAttribute("data-topology") ?? null,
        width: entry.contentRect.width, height: entry.contentRect.height });
      if (deliveries.length > 128) deliveries.shift();
    }
  });
  const scan = () => {
    for (const target of document.querySelectorAll(".react-flow,.react-flow__node,.cm-editor,.agent-dock-panel,.agent-launch-context")) {
      if (count >= 64) break;
      if (!observed.has(target)) { observed.add(target); count++; resize.observe(target); }
    }
  };
  const mutations = new MutationObserver(scan);
  mutations.observe(document.documentElement, { subtree: true, childList: true }); scan();
  const error = (event: ErrorEvent) => {
    if (errors.length < 16) errors.push({ at: performance.now(), message: event.message.slice(0, 4096),
      filename: event.filename, line: event.lineno, recentDeliveries: deliveries.slice(-24) });
  };
  addEventListener("error", error);
  return { read: () => ({ observed: count, deliveries: [...deliveries], errors: [...errors] }),
    dispose: () => { resize.disconnect(); mutations.disconnect(); removeEventListener("error", error); } };
}

/** Exact user-accepted D6 test risk, never a production console filter. Keep
 * raw messages in proof/diagnostics; every other message remains blocking. */
export function assessTaskRendererErrors(errors: readonly string[]) {
  const acceptedWarning = "ResizeObserver loop completed with undelivered notifications.";
  const unexpected = errors.filter((message) => message !== acceptedWarning);
  if (unexpected.length) throw new Error(`Unexpected renderer errors: ${unexpected.join("; ")}`);
  return { acceptedRisk: "task-rehearsal-resize-observer-d6", acceptedWarnings: [...errors], unexpectedErrors: [] };
}

/** Complete passive capture without changing which failure is authoritative. */
export async function finishTaskDiagnostics(errors: readonly string[], capture: () => Promise<void>, originalFailure: { error: unknown } | null) {
  try { await capture(); } catch (error) { if (!originalFailure) throw error; }
  if (originalFailure) throw originalFailure.error;
  assessTaskRendererErrors(errors);
}
