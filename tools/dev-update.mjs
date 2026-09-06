// Recompilation is not invalidation. Compare executable bytes, not timestamps or
// source maps. A shared input is one successful build transaction.
export function classifyUpdate(previous, next) {
  if (!previous) return "initial";
  const changed = (name) => previous.get(name) !== next.get(name);
  if (changed("app/electron/main.js")) return "restart-required";
  const core = changed("core/worker.js") || changed("core/agents/owner-process.js");
  const preload = changed("app/electron/preload.js");
  return core && preload ? "core-preload" : core ? "core" : preload ? "preload" : "unchanged";
}
