/** TEST-ONLY construction of current synthetic contexts, never migration of
 * stored history or production authority. Deliberate negative tests bypass it. */
import { createHash } from "node:crypto";
import { formatAgentContextV2 } from "../protocol/agent-task";
import { PreparedAgentContextSchema, type LaunchContext, type PreparedAgentContext } from "../protocol/agents";
export function fixtureV2Draft(draft: Omit<PreparedAgentContext, "launchContext"> & { launchContext: LaunchContext }): PreparedAgentContext {
  const fields = { ...draft.launchContext, contextVersion: 2 as const,
    sourceLinks: "sourceLinks" in draft.launchContext ? draft.launchContext.sourceLinks : [] };
  const submittedPrompt = formatAgentContextV2(fields);
  const contextHash = createHash("sha256").update(submittedPrompt).digest("hex");
  return PreparedAgentContextSchema.parse({ ...draft, contextHash, launchContext: { ...fields, submittedPrompt, contextHash } });
}
