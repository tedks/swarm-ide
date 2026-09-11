import { registerRepository } from "./repository-registration";
import { registeredWorktree, browseRegisteredWorktree } from "./worktree-inspection";
import { PROTOCOL_VERSION, CoreResponseSchema, parseCoreRequest, type CoreRequest, type WorkspaceSnapshot } from "../protocol/schema";
import { WorkspaceSelectionSchema, isSharedWorkspaceRequest, type WorkspaceSelection } from "../protocol/workspace";
import { BoundedRequestIds } from "./request-ids";
import { gitWorktreeIdentity } from "./git-worktree-identity";

export async function resolveWorkspaceSelection(launchRoot: string, registry: string | undefined, sessionId: string | null,
  signal?: AbortSignal): Promise<WorkspaceSelection> {
  const launch = await registerRepository(launchRoot);
  let launchGit: Awaited<ReturnType<typeof gitWorktreeIdentity>> | null = null;
  let launchGitFailure: unknown;
  try { launchGit = await gitWorktreeIdentity(launch.root, signal); }
  catch (error) { if (signal?.aborted) throw new Error("Workspace selection stopped."); launchGitFailure = error; }
  if (sessionId === null) {
    const branch = launchGit?.branch ?? null;
    return WorkspaceSelectionSchema.parse({ id: launch.id, root: launch.root, label: launch.name,
      projectId: launchGit?.projectId ?? null, agentVisibility: branch && branch === launchGit?.defaultBranch ? "project" : "worktree",
      sessionId, branch, base: null, changes: [], changesComplete: false,
      notice: "Launch worktree. Select a registered worktree for its master comparison." });
  }
  if (!launchGit) throw new Error("Launch workspace Git identity is unavailable. Check Git repository metadata and permissions.",
    { cause: launchGitFailure });
  const selected = await registeredWorktree(launch.root, registry, sessionId, signal);
  const [targetGit, target] = await Promise.all([gitWorktreeIdentity(selected.root, signal), registerRepository(selected.root)]);
  if (launchGit.projectId !== targetGit.projectId) throw new Error("Choose a registered worktree of this Git repository.");
  const browser = await browseRegisteredWorktree(launch.root, registry, {
    protocolVersion: PROTOCOL_VERSION, requestId: "workspace-metadata", type: "worktree.browse", sessionId, directory: "", page: 0,
  }, signal);
  if (browser.worktree !== target.root) throw new Error("The registered worktree changed during selection. Try again.");
  return WorkspaceSelectionSchema.parse({ id: target.id, root: target.root, label: browser.label, projectId: targetGit.projectId,
    agentVisibility: targetGit.branch && targetGit.branch === targetGit.defaultBranch ? "project" : "worktree",
    sessionId, branch: targetGit.branch,
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
        // Opening is also the renderer's bounded identity revalidation path.
        // Re-resolve even the launch worktree so a mutable HEAD cannot retain
        // stale project-wide visibility after the initial runtime was created.
        const selection = await this.options.resolve(request.sessionId, this.lifetime.signal);
        if (this.stopping) throw new Error("Core is shutting down.");
        const runtime = await this.open(selection, selection.id === primary.selection.id);
        // Identity refreshes retain the typed response envelope but reuse the
        // runtime's already-loaded snapshot; the renderer discards it and no
        // repository traversal is warranted for this metadata-only request.
        const snapshot = request.identityOnly ? await runtime.ready : await runtime.snapshot();
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
