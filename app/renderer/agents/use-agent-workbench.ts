import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AgentBridgeClient } from "./bridge-client";
import { createAgentClient, type AgentClientMemory } from "./client-memory";
import type { SwarmBridge } from "../../electron/preload";
import type { LifecycleBridge } from "../../lifecycle";

// Memory only: never export private prompt/steering bytes into localStorage.
// New module code constructs a new client from this presentation checkpoint.
const hot = import.meta.hot?.data as { agentMemory?: AgentClientMemory } | undefined;
const memory = hot ? hot.agentMemory ??= {} : undefined;
export function useAgentWorkbench() {
  return useAgentClient(window.swarm, window.swarmLifecycle, memory);
}

// Component-level bridge injection is for tests, never a renderer-selected
// provider. The production entry above always uses the installed preload bridge.
export function useAgentClient(bridge?: SwarmBridge, lifecycle?: LifecycleBridge, checkpointMemory?: AgentClientMemory) {
  // A replaced controller module must use its new methods, not keep an instance
  // of the old class forever through Fast Refresh's preserved useState hooks.
  const client = useMemo(() => createAgentClient(checkpointMemory), [AgentBridgeClient, createAgentClient, checkpointMemory]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(bridge, lifecycle), [client, bridge, lifecycle]);
  return { client, state };
}
