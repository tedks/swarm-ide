// This module is outside the replaceable React component. Vite retains its data
// if this module itself changes too; production never retains component state.
export const hotMemory = import.meta.hot?.data as { workbench?: unknown; steering?: import("./external-agents/steering-memory").SteeringMemory } | undefined;

class PendingWrites {
  readonly paths = new Set<string>();
  private listeners = new Set<() => void>();
  private revision = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  start(path: string) { this.paths.add(path); this.publish(); }
  finish(path: string) { this.paths.delete(path); this.publish(); }
  private publish() { this.revision += 1; for (const listener of this.listeners) listener(); }
}
// The actual in-flight operation survives Fast Refresh, not just its warning.
// Disk reconciliation must wait for settlement, even after component remount.
const data = import.meta.hot?.data as { pendingWrites?: PendingWrites } | undefined;
export const pendingWrites = data?.pendingWrites ?? new PendingWrites();
if (data) data.pendingWrites = pendingWrites;
