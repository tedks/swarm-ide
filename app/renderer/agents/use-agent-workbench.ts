import { useEffect, useState, useSyncExternalStore } from "react";
import { AgentBridgeClient } from "./bridge-client";
import type { LiveAgentState } from "./live-state";

// Memory only: never export private prompt/steering bytes into localStorage.
// New module code constructs a new client from this presentation checkpoint.
const hot = import.meta.hot?.data as { agents?: LiveAgentState } | undefined;
export function useAgentWorkbench() {
  const [client] = useState(() => new AgentBridgeClient(hot?.agents, (state) => { if (hot) hot.agents = state; }));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(window.swarm, window.swarmLifecycle), [client]);
  return { client, state };
}
