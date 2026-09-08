import { z } from "zod";

/** Execution is separate from transcript availability and recording an outcome. */
export const AgentExecutionStateSchema = z.enum(["working", "waiting", "failed", "completed", "unknown"]);
export type AgentExecutionState = z.infer<typeof AgentExecutionStateSchema>;
export const AgentLifecycleSchema = z.object({
  state: AgentExecutionStateSchema,
  at: z.string().datetime().optional(),
  turnId: z.string().min(1).max(160).optional(),
}).strict();
export type AgentLifecycle = z.infer<typeof AgentLifecycleSchema>;
export const AGENT_EXECUTION_LABELS: Record<AgentExecutionState, string> = {
  working: "In progress", waiting: "Waiting on you", failed: "Failed", completed: "Complete", unknown: "Status unavailable",
};
