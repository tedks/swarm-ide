import { AgentBridgeClient } from "./bridge-client";
import type { LiveAgentState } from "./live-state";

export interface AgentClientMemory { state?: LiveAgentState; owner?: symbol }

export function createAgentClient(memory?: AgentClientMemory): AgentBridgeClient {
  const owner = Symbol("agent-client-checkpoint-owner");
  return new AgentBridgeClient(memory?.state, (state) => {
    // An old controller may finish a promise after HMR. Its acknowledgement
    // cannot overwrite the replacement controller's newly edited intent.
    if (memory?.owner === owner) memory.state = state;
  }, () => {
    // Claim only when React commits the connection effect. StrictMode calls
    // render/useMemo initializers twice and discards one of their results.
    if (memory) memory.owner = owner;
  });
}
