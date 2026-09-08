type Receipt = { status: "queued" | "rejected" | "delivery-unknown"; message: string; receiptId?: string };
export type TargetState = { draft: string; receipt?: Receipt };
type State = { targets: Map<string, TargetState>; pending: { id: string; label: string } | null };

/** App retains this owner across development remounts; it never sends on its own. */
export class SteeringMemory {
  private state: State = { targets: new Map(), pending: null };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(id: string, change: (prior: TargetState) => TargetState) {
    const targets = new Map(this.state.targets);
    targets.set(id, change(targets.get(id) ?? { draft: "" }));
    this.publish({ ...this.state, targets });
  }
  pending(value: State["pending"]) { this.publish({ ...this.state, pending: value }); }
  private publish(state: State) { this.state = state; this.listeners.forEach((listener) => listener()); }
}
