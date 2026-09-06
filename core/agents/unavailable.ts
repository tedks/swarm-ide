import { AgentRequestSchema, AgentSnapshotSchema, type AgentRequest, type AgentResult } from "../../protocol/agents";
import type { AgentOperation } from "./adapter";

export function unavailableAgentSnapshot() {
  return AgentSnapshotSchema.parse({
    runs: [], activeRunId: null, tail: [],
    capabilities: {
      availability: "unavailable",
      reason: { code: "ADAPTER_UNAVAILABLE", message: "Agent execution is not installed in this build" },
      provider: null, version: null, controls: { launch: false, steer: false, cancel: false },
      policy: "unverified",
    },
  });
}

/** Production R0 seam. No fixture import, discovery fallback or execution. */
export function unavailableAgentRequest(input: AgentRequest): AgentOperation<AgentResult> {
  const request = AgentRequestSchema.parse(input);
  const snapshot = unavailableAgentSnapshot();
  if (request.type === "agent.snapshot") return { ok: true, value: { kind: "snapshot", snapshot } };
  return { ok: false, error: snapshot.capabilities.reason! };
}
