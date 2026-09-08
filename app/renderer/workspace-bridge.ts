import type { SwarmBridge } from "../electron/preload";
import type { CoreRequest } from "../../protocol/schema";

/** A bridge belongs to one exploration scope for its whole lifetime. Captured
 * callbacks cannot silently follow a later worktree selection. */
export function workspaceBridge(bridge: SwarmBridge | undefined, workspaceId: string | undefined): SwarmBridge | undefined {
  if (!bridge || !workspaceId) return bridge;
  const shared = (request: CoreRequest) => request.type.startsWith("externalAgents.") || request.type.startsWith("workLog.") || request.type === "worktree.inspect" || request.type === "worktree.browse" || request.type === "workspace.open";
  return {
    request: (request) => bridge.request(shared(request) ? request : { ...request, workspaceId }),
    onEvent: (listener) => bridge.onEvent((event) => {
      if (event.type === "agent.changed" || ("snapshot" in event ? event.snapshot.project.id === workspaceId : !event.workspaceId || event.workspaceId === workspaceId)) listener(event);
    }),
  };
}
