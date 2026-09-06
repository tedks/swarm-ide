import { AgentBridgeClient } from "./bridge-client";
import type { LiveAgentState } from "./live-state";

export interface AgentClientMemory { state?: LiveAgentState; owner?: symbol }

export function createAgentClient(memory?: AgentClientMemory): AgentBridgeClient {
  const owner = Symbol("agent-client-checkpoint-owner");
  if (memory) memory.owner = owner;
  return new AgentBridgeClient(memory?.state, (state) => {
    // An old controller may finish a promise after HMR. Its acknowledgement
    // cannot overwrite the replacement controller's newly edited intent.
    if (memory?.owner === owner) memory.state = state;
  });
}
