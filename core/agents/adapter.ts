import type { AgentError, CleanupEvidence, PreparedAgentContext, Run } from "../../protocol/agents";
export type { CleanupEvidence, PreparedAgentContext } from "../../protocol/agents";

export type AgentOperation<T> = { ok: true; value: T } | { ok: false; error: AgentError };

/** Probe is capability evidence only, never permission to start a turn. */
export interface AdapterCapabilities {
  provider: string;
  version: string;
  executable: string;
  available: boolean;
  reason: AgentError | null;
  supports: { steer: boolean; interrupt: boolean; readOnly: boolean };
}
export type AdapterEvent =
  | { type: "started"; threadId: string; model: string; cwd: string;
      policy: "read-only"; instructionPaths: readonly string[]; at: string }
  | { type: "turn-started"; threadId: string; turnId: string; at: string }
  | { type: "item"; itemId: string | null; kind: "message" | "tool" | "status"; text: string; at: string }
  | { type: "terminal"; outcome: Exclude<Run["providerOutcome"], { kind: "none" }>; at: string }
  | { type: "process-exit"; exitCode: number | null; at: string }
  | { type: "error"; error: AgentError; dispatch: "not-sent" | "unknown"; at: string };

/** A returned promise acknowledges a command, not turn completion or process exit.
 * Implementations must validate provider bytes before emitting normalized events.
 */
export interface AgentHandle {
  steer(expectedTurnId: string, text: string): Promise<AgentOperation<{ status: "accepted" }>>;
  interrupt(): Promise<AgentOperation<{ status: "requested" }>>;
  dispose(): Promise<CleanupEvidence>;
}
export interface AgentAdapter {
  probe(): Promise<AdapterCapabilities>;
  start(context: PreparedAgentContext, emit: (event: AdapterEvent) => void): Promise<AgentHandle>;
}
