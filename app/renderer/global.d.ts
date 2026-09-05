import type { SwarmBridge } from "../electron/preload";
import type { ViewShellBridge } from "../view-shell";

declare global {
  interface Window {
    swarm?: SwarmBridge;
    swarmView?: ViewShellBridge;
  }
}

export {};
