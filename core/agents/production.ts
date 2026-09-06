import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { WorkspaceSnapshot } from "../../protocol/schema";
import type { AgentRequest, AgentResult, AgentSnapshot } from "../../protocol/agents";
import type { AgentAdapter, AgentOperation } from "./adapter";
import { RegisteredAgentContextProvider } from "./context";
import { createFileRunStore } from "./file-store";
import { unavailablePolicyCapabilities } from "./policy";
import { createAgentService } from "./service";

export interface ProductionAgentService {
  request(input: AgentRequest): Promise<AgentOperation<AgentResult>>;
  shutdown(): Promise<void>;
}

/** Deliberately no CLI spawn/probe here. Installing a CLI does not prove its
 * effective hooks/tools policy. The complete run service and real disk context
 * remain usable while execution is explicitly unavailable, not fixture-backed.
 */
const unavailableAdapter: AgentAdapter = {
  async probe() { return { provider: "codex", version: "unobserved", executable: "unconfigured", available: false,
    reason: unavailablePolicyCapabilities().reason, supports: { steer: false, interrupt: false, readOnly: false } }; },
  async start() { throw new Error("Production launch policy has not been verified"); },
};

export async function createProductionAgentService(options: {
  root: string; storeRoot: string; snapshot(): WorkspaceSnapshot; emit(snapshot: AgentSnapshot): void;
}): Promise<ProductionAgentService> {
  if (!isAbsolute(options.storeRoot)) throw new Error("Electron must supply an absolute private app-data root");
  const root = await realpath(options.root);
  const identity = createHash("sha256").update(root).digest("hex");
  const store = await createFileRunStore(join(options.storeRoot, identity));
  try {
    const context = await RegisteredAgentContextProvider.create({
      root, repositoryId: `repository:${identity}`, worldId: options.snapshot().world.id,
      workingRevision: () => options.snapshot().revisions.working.fingerprint || null,
      async resolveFocus(focus) {
        const snapshot = options.snapshot();
        const matches = snapshot.graphs.flatMap((graph) => graph.nodes).filter((node) =>
          node.focus.domain === focus.domain && node.focus.key === focus.key && node.focus.path === focus.path &&
          node.focus.worldId === focus.worldId && node.focus.revisionId === focus.revisionId);
        if (matches.length !== 1) return [];
        const sourcePaths = [...new Set(snapshot.mappings.filter((mapping) =>
          mapping.from.domain === focus.domain && mapping.from.key === focus.key).flatMap((mapping) =>
          mapping.candidates.flatMap((candidate) => candidate.focus.path ? [candidate.focus.path] : [])))];
        return [{ attachmentPath: focus.domain === "repo" ? focus.path ?? null : null, sourcePaths }];
      },
      // Missing implicit provider expansion is explicitly recorded by E1.
      // Do not read account-wide instructions/configuration speculatively.
      provenance: async () => ({ instructions: [], configuration: [] }),
      knownParent: async (runId) => (await store.read(runId, 0)).ok,
      capabilities: async () => unavailablePolicyCapabilities(),
    });
    const service = await createAgentService({ store, context, adapter: unavailableAdapter,
      capabilities: async () => unavailablePolicyCapabilities(), emit: options.emit });
    return { request: (request) => service.request(request), async shutdown() { await service.shutdown(); await store.close(); } };
  } catch (error) { await store.close(); throw error; }
}
