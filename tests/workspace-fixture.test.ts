import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, parseCoreResponseForRequest, type CoreRequest } from "../protocol/schema";
import { fixtureAcknowledgement, workspaceReply, workspaceTaskFixtures } from "./support/workspace-fixture";

describe("mounted workspace fixtures", () => {
  it("binds task observations and reads to the chosen workspace without healing malformed replies", () => {
    const snapshot = initialSnapshot();
    const tasks = workspaceTaskFixtures(snapshot);
    const observation = tasks.observation();
    const read = tasks.read();
    const requests: CoreRequest[] = [
      { protocolVersion: PROTOCOL_VERSION, requestId: "observe", type: "tasks.snapshot", workspaceId: snapshot.project.id, worldId: snapshot.world.id, refresh: true },
      { protocolVersion: PROTOCOL_VERSION, requestId: "read", type: "tasks.read", workspaceId: snapshot.project.id, worldId: snapshot.world.id, metadataCommit: read.metadataCommit, taskId: read.taskId },
    ];
    for (const [index, task] of [{ kind: "snapshot", observation }, read].entries()) {
      const request = requests[index]!;
      const reply = { ...workspaceReply(request, snapshot), task };
      expect(parseCoreResponseForRequest(reply, request).ok).toBe(true);
      expect(() => parseCoreResponseForRequest({ ...reply, workspaceId: "other" }, request)).toThrow();
      expect(() => workspaceReply({ ...request, workspaceId: "other" }, snapshot)).toThrow();
    }
    expect(observation.snapshot.repositoryId).toBe(snapshot.project.id);
    expect(() => parseCoreResponseForRequest({ ...workspaceReply(requests[0]!, snapshot), task: {
      kind: "snapshot", observation: { ...observation, repositoryId: "other" },
    } }, requests[0]!)).toThrow();
  });

  it("registers the launch workspace and rejects unimplemented requests explicitly", () => {
    const snapshot = initialSnapshot();
    const open: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "open", type: "workspace.open", sessionId: null };
    expect(parseCoreResponseForRequest(fixtureAcknowledgement(open, snapshot), open).ok).toBe(true);
    const read: CoreRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "read", workspaceId: snapshot.project.id, type: "file.read", path: "absent.ts" };
    expect(parseCoreResponseForRequest(fixtureAcknowledgement(read, snapshot), read)).toMatchObject({ ok: false, error: { code: "CORE_UNAVAILABLE" } });
  });
});
