import { z } from "zod";
import type { AgentCapabilities } from "../../protocol/agents";
import type { AgentOperation } from "./adapter";

/** Required preview, not a claim that the installed provider enforces it. */
export const READ_ONLY_ACCESS = {
  policy: "read-only", toolNetwork: false, approvals: "never",
  hostConfidentiality: false, sendsSelectedContentToProvider: true,
} as const;

export const POLICY_BLOCKER = "The installed app-server configuration surface has not established that hooks, MCP servers, connectors, plugins and delegation are all disabled. Real launch is unavailable.";

/** E1 has inspected help/schema, not an authenticated server's effective policy.
 * In particular, an empty mcp_servers override is not proof that inherited
 * servers were removed. Do not turn schema support into launch authority.
 */
export function unavailablePolicyCapabilities(version: string | null = null): AgentCapabilities {
  return {
    availability: "unavailable", provider: "codex", version,
    reason: { code: "ADAPTER_POLICY_UNAVAILABLE", message: POLICY_BLOCKER },
    controls: { launch: false, steer: false, cancel: false }, policy: "unverified",
  };
}

const threadPolicy = z.object({
  cwd: z.string(), approvalPolicy: z.literal("never"),
  sandbox: z.object({ type: z.literal("readOnly"), networkAccess: z.literal(false) }).strict(),
});

/** Necessary thread/start checks for the observed 0.153.4 stable wire shape.
 * A successful result proves ONLY these echoed fields, not disabled auxiliary
 * tools or authentication. Runtime must separately require effective preflight
 * before turn/start. Unknown sandbox extensions deliberately fail closed.
 */
export function validateCodexThreadPolicy(response: unknown, expectedCwd: string): AgentOperation<{ cwd: string; policy: "read-only" }> {
  const parsed = threadPolicy.safeParse(response);
  if (!parsed.success || !expectedCwd.startsWith("/") || parsed.data.cwd !== expectedCwd) {
    return { ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Provider sandbox, approvals or working directory did not match the required limited profile." } };
  }
  return { ok: true, value: { cwd: expectedCwd, policy: "read-only" } };
}
