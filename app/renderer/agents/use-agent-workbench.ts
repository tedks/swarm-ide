import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AgentBridgeClient } from "./bridge-client";
import { createAgentClient, type AgentClientMemory } from "./client-memory";

// Memory only: never export private prompt/steering bytes into localStorage.
// New module code constructs a new client from this presentation checkpoint.
const hot = import.meta.hot?.data as { agentMemory?: AgentClientMemory } | undefined;
const memory = hot ? hot.agentMemory ??= {} : undefined;
export function useAgentWorkbench() {
  // A replaced controller module must use its new methods, not keep an instance
  // of the old class forever through Fast Refresh's preserved useState hooks.
  const client = useMemo(() => createAgentClient(memory), [AgentBridgeClient, createAgentClient]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(window.swarm, window.swarmLifecycle), [client]);
  return { client, state };
}
