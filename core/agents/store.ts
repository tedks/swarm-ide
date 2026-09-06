import type {
  AdmissionReceipt, AgentSnapshot, InstructionReceipt, PreparedAgentContext, Run, TranscriptPage, TranscriptRecord,
} from "../../protocol/agents";
import type { AgentOperation } from "./adapter";

/** Durable operations complete only after validation and atomic persistence.
 * Admit deduplicates runId/contextHash, rejecting reused IDs with different
 * context and quotas before any provider work. Failure never authorizes spawn.
 * Update preserves identity/context and terminal outcomes; late events cannot
 * regress state. Append/read enforce AGENT_LIMITS, retaining explicit gaps.
 */
export interface RunStore {
  admit(context: PreparedAgentContext): Promise<AgentOperation<{ receipt: AdmissionReceipt; existing: boolean }>>;
  update(run: Run): Promise<AgentOperation<Run>>;
  snapshot(): Promise<AgentOperation<AgentSnapshot>>;
  read(runId: string, afterRecord: number): Promise<AgentOperation<{ run: Run; page: TranscriptPage }>>;
  append(runId: string, record: TranscriptRecord): Promise<AgentOperation<TranscriptPage>>;
  /** Persist pending text/hash/expected turn before dispatch; deduplicate by
   * requestId within a run, reject changed payload reuse, never replay unknowns.
   */
  instruction(runId: string, receipt: InstructionReceipt): Promise<AgentOperation<InstructionReceipt>>;
}
