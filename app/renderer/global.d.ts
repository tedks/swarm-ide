import type { SwarmBridge } from "../electron/preload";

declare global {
  interface Window {
    swarm?: SwarmBridge;
  }
}

export {};
