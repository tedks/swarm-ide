import { taskObservationFixture, taskReadFixture } from "../../fixtures/tasks";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type WorkspaceSnapshot } from "../../protocol/schema";

/** Compose domain fixtures with an explicit workspace; never repair a reply under test. */
export function workspaceTaskFixtures(snapshot: WorkspaceSnapshot) {
  const identity = { repositoryId: snapshot.project.id, worldId: snapshot.world.id };
  return {
    observation() {
      const observation = taskObservationFixture();
      return { ...observation, ...identity, snapshot: { ...observation.snapshot!, ...identity } };
    },
    read() { return { ...taskReadFixture(), ...identity }; },
  };
}

export function workspaceReply(request: CoreRequest, snapshot: WorkspaceSnapshot, sequence = 1) {
  if (request.workspaceId !== undefined && request.workspaceId !== snapshot.project.id)
    throw new Error("Test bridge received a request for another workspace");
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true as const,
    workspaceId: snapshot.project.id, snapshot, sequence };
}

export function fixtureFailure(request: CoreRequest, code: string, message: string): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, workspaceId: request.workspaceId,
    ok: false, error: { code, message } };
}

/** Launch-workspace registration and acknowledgements shared by mounted suites. */
export function fixtureAcknowledgement(request: CoreRequest, snapshot: WorkspaceSnapshot, sequence = 1): CoreResponse {
  switch (request.type) {
    case "workspace.open": return request.sessionId === null ? {
      ...workspaceReply(request, snapshot, sequence), workspace: {
        id: snapshot.project.id, root: "/fixtures/workspace", label: snapshot.project.name,
        projectId: null, agentVisibility: "worktree", sessionId: null, branch: "fixture",
        base: null, changes: [], changesComplete: true,
      },
    } : fixtureFailure(request, "CORE_UNAVAILABLE", "No registered worktree fixture");
    case "workspace.snapshot": case "focus.select": case "fixture.reset": case "reconciliation.start":
    case "file.watch": case "file.unwatch": return workspaceReply(request, snapshot, sequence);
    default: return fixtureFailure(request, "CORE_UNAVAILABLE", `No fixture for ${request.type}`);
  }
}
