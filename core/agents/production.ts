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
import { createAgentTaskResolver } from "../tasks/draft-context";

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
  let context: RegisteredAgentContextProvider | undefined;
  try {
    const repositoryId = `repository:${identity}`, worldId = options.snapshot().world.id;
    context = await RegisteredAgentContextProvider.create({
      root, repositoryId, worldId,
      taskResolver: createAgentTaskResolver({ root, repositoryId, worldId }),
      workingRevision: () => {
        const working = options.snapshot().revisions.working;
        return working.evidence === "observed" ? working.fingerprint || null : null;
      },
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
    const ownedContext = context;
    let closing: Promise<void> | undefined;
    return { request: (request) => service.request(request), shutdown() {
      if (closing) return closing;
      let resolveClosing!: () => void, rejectClosing!: (error: unknown) => void;
      closing = new Promise<void>((resolve, reject) => { resolveClosing = resolve; rejectClosing = reject; });
      const drain = <T>(operation: () => Promise<T>): Promise<T> => {
        try { return operation(); } catch (error) { return Promise.reject(error); }
      };
      // Close both ingress paths immediately; metadata may hold the service's
      // serial queue. Reserve the shared promise first: an abort callback can
      // synchronously reenter shutdown. A throw must not skip the other owner.
      const serviceDrain = drain(() => service.shutdown()), contextDrain = drain(() => ownedContext.dispose());
      void Promise.allSettled([serviceDrain, contextDrain]).then(async (settlements) => {
        const [storage] = await Promise.allSettled([drain(() => store.close())]);
        const failures = [...settlements, storage].filter((result) => result.status === "rejected");
        if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Agent shutdown cleanup failed");
      }).then(resolveClosing, rejectClosing);
      return closing;
    } };
  } catch (error) {
    try { await context?.dispose(); } finally { await store.close(); }
    throw error;
  }
}
