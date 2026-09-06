import type { AgentPrepareInput, PreparedAgentContext } from "../../protocol/agents";
import type { AgentOperation } from "./adapter";
export type { AgentPrepareInput, PreparedAgentContext } from "../../protocol/agents";

/** Construction binds an operator-registered root; callers cannot provide cwd.
 * Prepare observes disk only. Revalidation checks expiry, context/config hashes
 * and the working fingerprint before dispatch; it never silently refreshes them.
 */
export interface AgentContextProvider {
  prepare(input: AgentPrepareInput): Promise<AgentOperation<PreparedAgentContext>>;
  revalidate(context: PreparedAgentContext): Promise<AgentOperation<PreparedAgentContext>>;
}
