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
