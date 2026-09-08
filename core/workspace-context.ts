import { realpath } from "node:fs/promises";
import { registerRepository } from "./repository-registration";
import { queryRepositoryGit } from "./repository-boundary";
import { registeredWorktree, browseRegisteredWorktree } from "./worktree-inspection";
import { PROTOCOL_VERSION, CoreResponseSchema, parseCoreRequest, type CoreRequest, type WorkspaceSnapshot } from "../protocol/schema";
import { WorkspaceSelectionSchema, isSharedWorkspaceRequest, type WorkspaceSelection } from "../protocol/workspace";
import { BoundedRequestIds } from "./request-ids";

export async function resolveWorkspaceSelection(launchRoot: string, registry: string | undefined, sessionId: string | null,
  signal?: AbortSignal): Promise<WorkspaceSelection> {
  const launch = await registerRepository(launchRoot);
  if (sessionId === null) {
    let branch: string | null = null;
    try { branch = (await queryRepositoryGit(launch.root, ["symbolic-ref", "--short", "HEAD"], { signal, maximumBytes: 1024 })).toString("utf8").trim(); }
    catch { if (signal?.aborted) throw new Error("Workspace selection stopped."); }
    return WorkspaceSelectionSchema.parse({ id: launch.id, root: launch.root, label: launch.name, sessionId, branch, base: null, changes: [], changesComplete: false,
      notice: "Launch worktree. Select a registered worktree for its master comparison." });
  }
  const selected = await registeredWorktree(launch.root, registry, sessionId, signal);
  const common = async (root: string) => {
    const bytes = await queryRepositoryGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"], { signal, maximumBytes: 16384 });
    const path = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    if (!path.endsWith("\n")) throw new Error("Git common directory is unavailable.");
    return realpath(path.slice(0, -1));
  };
  const [launchCommon, targetCommon, target] = await Promise.all([common(launch.root), common(selected.root), registerRepository(selected.root)]);
  if (launchCommon !== targetCommon) throw new Error("Choose a registered worktree of this Git repository.");
  const browser = await browseRegisteredWorktree(launch.root, registry, {
    protocolVersion: PROTOCOL_VERSION, requestId: "workspace-metadata", type: "worktree.browse", sessionId, directory: "", page: 0,
  }, signal);
  if (browser.worktree !== target.root) throw new Error("The registered worktree changed during selection. Try again.");
  return WorkspaceSelectionSchema.parse({ id: target.id, root: target.root, label: browser.label, sessionId, branch: browser.branch,
    base: browser.base, changes: browser.changes, changesComplete: browser.changesComplete, ...(browser.notice ? { notice: browser.notice } : {}) });
}

export interface RootedRuntime {
  ready: Promise<WorkspaceSnapshot>;
  request(input: unknown, context?: { trustedStartRoot: string }): Promise<void>;
  snapshot(): Promise<WorkspaceSnapshot>;
  shutdown(): Promise<void>;
  close(): void;
}

/** Immutable root ownership. Selection opens a context, never mutates the root
 * under an in-flight request; accepted writes may safely settle in old contexts. */
export class WorkspaceContextRouter {
  private contexts = new Map<string, Promise<RootedRuntime>>();
  private selections = new Map<string, WorkspaceSelection>();
  private ids = new BoundedRequestIds(512);
  private stopping = false;
  private lifetime = new AbortController();
  readonly primary: Promise<{ selection: WorkspaceSelection; runtime: RootedRuntime }>;
  constructor(private readonly options: {
    resolve(sessionId: string | null, signal: AbortSignal): Promise<WorkspaceSelection>;
    create(selection: WorkspaceSelection, primary: boolean): RootedRuntime;
    post(message: unknown): void;
  }) {
    this.primary = options.resolve(null, this.lifetime.signal).then(async (selection) => {
      if (this.stopping) throw new Error("Core is shutting down.");
      const runtime = this.open(selection, true);
      return { selection, runtime: await runtime };
    });
  }
  private open(selection: WorkspaceSelection, primary: boolean): Promise<RootedRuntime> {
    if (this.stopping) throw new Error("Core is shutting down.");
    const existing = this.contexts.get(selection.id);
    if (existing) { this.selections.set(selection.id, structuredClone(selection)); return existing; }
    this.selections.set(selection.id, structuredClone(selection));
    const runtime = this.options.create(selection, primary);
    const pending = runtime.ready.then(() => runtime).catch((error) => { runtime.close(); this.contexts.delete(selection.id); this.selections.delete(selection.id); throw error; });
    this.contexts.set(selection.id, pending);
    return pending;
  }
  async request(input: unknown): Promise<void> {
    let request: CoreRequest | undefined;
    let failureCode = "INVALID_REQUEST";
    try {
      request = parseCoreRequest(input);
      failureCode = "CORE_UNAVAILABLE";
      if (this.stopping) throw new Error("Core is shutting down.");
      failureCode = "DUPLICATE_REQUEST";
      if (!this.ids.accept(request.requestId)) throw new Error("This request has already been processed.");
      failureCode = "WORKSPACE_UNAVAILABLE";
      const primary = await this.primary;
      if (this.stopping) throw new Error("Core is shutting down.");
      if (request.type === "workspace.open") {
        const selection = request.sessionId === null ? primary.selection : await this.options.resolve(request.sessionId, this.lifetime.signal);
        if (this.stopping) throw new Error("Core is shutting down.");
        const runtime = await this.open(selection, selection.id === primary.selection.id);
        const snapshot = await runtime.snapshot();
        if (this.stopping) throw new Error("Core is shutting down.");
        this.options.post(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true,
          sequence: 0, workspaceId: selection.id, workspace: selection, snapshot }));
        return;
      }
      const id = request.workspaceId ?? ("repositoryId" in request ? request.repositoryId : undefined) ?? primary.selection.id;
      if ("repositoryId" in request && request.repositoryId !== id) throw new Error("Workspace and repository identities disagree.");
      if (id !== primary.selection.id && ["agent.prepare", "trusted.prepare", "trusted.launch"].includes(request.type)) {
        this.options.post(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, workspaceId: id, ok: false,
          error: { code: "UNSUPPORTED_CONTROL", message: "Agent launch context remains in the original workspace. Switch back before preparing a run." } }));
        return;
      }
      const context = isSharedWorkspaceRequest(request) ? primary.runtime : await this.contexts.get(id);
      if (!context) throw new Error("This worktree is not open. Select it before using its files.");
      if (this.stopping) throw new Error("Core is shutting down.");
      const { workspaceId: _workspaceId, ...command } = request;
      if (request.type === "trusted.start") {
        const selected = this.selections.get(id);
        if (!selected || !await this.contexts.get(id)) throw new Error("Select this worktree before starting an agent.");
        const current = await this.options.resolve(selected.sessionId, this.lifetime.signal);
        if (current.id !== selected.id || current.root !== selected.root) throw new Error("This worktree registration changed. Select it again before starting an agent.");
        if (this.stopping) throw new Error("Core is shutting down.");
        await context.request(command, { trustedStartRoot: current.root });
      } else await context.request(command);
    } catch (error) {
      this.options.post(CoreResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: request?.requestId ?? "invalid-request", ok: false,
        ...(request?.workspaceId ? { workspaceId: request.workspaceId } : {}),
        error: { code: failureCode, message: error instanceof Error ? error.message.slice(0, 512) : "Workspace unavailable." } }));
    }
  }
  async shutdown(): Promise<void> {
    this.stopping = true; this.lifetime.abort();
    await this.primary.catch(() => undefined);
    await Promise.all([...this.contexts.values()].map(async (pending) => (await pending).shutdown()));
  }
  close(): void {
    this.stopping = true; this.lifetime.abort();
    for (const context of this.contexts.values()) void context.then((runtime) => runtime.close()).catch(() => undefined);
  }
}
