import type { SwarmBridge } from "../electron/preload";
import type { ViewShellBridge } from "../view-shell";
import type { LifecycleBridge } from "../lifecycle";

declare global {
  interface Window {
    swarm?: SwarmBridge;
    swarmView?: ViewShellBridge;
    swarmLifecycle?: LifecycleBridge;
  }
}

export {};
