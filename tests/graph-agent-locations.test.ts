import { describe, expect, it } from "vitest";
import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../protocol/external-agents";
import { observedGraphAgents, graphEventPath, placeGraphAgents, buildAgentLocations, componentAgentLocations, serviceAgentLocations, taskAgentLocations } from "../app/renderer/graph-agents/locations";
import { PlanIndexSchema } from "../protocol/plans";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
const root = "/projects/swarm/master";
const projectId = "1".repeat(64);
const selection = { root, projectId, agentVisibility: "worktree" as const };
const at = "2026-09-08T12:00:00Z";
const event: ExternalEntry = { id: "edit", at, kind: "tool-call", text: "Edited src/app.ts", attribution: "recorded-tool-event", path: "src/app.ts" };
const session: ExternalAgentSummary = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "F7", evidence: "local", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "", contextPaths: [], worktree: root, projectId, branch: "master", lifecycle: { state: "working" } };
const detail: ExternalDetail = { session, entries: [event], handoff: "unavailable", coverage: { tailBytes: 100, partial: false, omittedRecords: 0, message: "" } };
const observe = (options: Partial<Parameters<typeof observedGraphAgents>[0]> = {}) => observedGraphAgents({ selection, sessions: [session], fleet: [detail], ...options });

describe("registered graph locations", () => {
  it("keeps last touched source separate from the latest action and lifecycle", () => {
    expect(observe({ fleet: [{ ...detail, entries: [event, { ...event, id: "later", path: undefined, text: "Ran build" }] }] })[0])
      .toMatchObject({ path: "src/app.ts", action: "Edited src/app.ts", latestAction: "Ran build", state: "working", retained: false });
  });
  it("rejects another worktree and keeps mismatched or synthetic detail explicitly unplaced", () => {
    expect(observe({ selection: { ...selection, root: "/projects/swarm/feature" } })).toEqual([]);
    expect(observe({ sessions: [] })).toEqual([]);
    expect(observe({ sessions: [{ ...session, worktree: undefined }] })).toEqual([]);
    expect(observe({ fleet: [{ ...detail, session: { ...session, worktree: "/projects/swarm/feature" } }] })[0]?.path).toBeNull();
    expect(observe({ fleet: [{ ...detail, session: { ...session, evidence: "synthetic" } }] })[0]?.path).toBeNull();
  });
  it("includes a sibling worktree's relative location in the primary project view", () => {
    const siblingRoot = "/projects/swarm/feature-agent";
    const sibling = { ...session, worktree: siblingRoot };
    expect(observe({ selection: { ...selection, agentVisibility: "project" }, sessions: [sibling], fleet: [{ ...detail, session: sibling }] })).toEqual([
      expect.objectContaining({ id: session.id, path: "src/app.ts", worktree: siblingRoot }),
    ]);
  });
  it("includes every same-project worktree in project scope and excludes unrelated or conservative scopes", () => {
    const sibling = { ...session, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", worktree: "/projects/swarm/feature", branch: "feature/agent" };
    const unrelated = { ...session, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", worktree: "/projects/other/master", projectId: "2".repeat(64) };
    const fleet = [detail, { ...detail, session: sibling }, { ...detail, session: unrelated }];
    const sessions = fleet.map((row) => row.session);
    expect(observedGraphAgents({ selection: { ...selection, agentVisibility: "project" }, sessions, fleet }).map((agent) => agent.id)).toEqual([session.id, sibling.id]);
    expect(observedGraphAgents({ selection: { ...selection, root: sibling.worktree, agentVisibility: "worktree" }, sessions, fleet }).map((agent) => agent.id)).toEqual([sibling.id]);
    expect(observedGraphAgents({ selection: { root: sibling.worktree, projectId: null, agentVisibility: "worktree" }, sessions, fleet }).map((agent) => agent.id)).toEqual([sibling.id]);
    expect(observedGraphAgents({ selection: { root, projectId: null, agentVisibility: "project" }, sessions, fleet }).map((agent) => agent.id)).toEqual([session.id]);
    const missingIdentity = { ...session, projectId: undefined };
    expect(observedGraphAgents({ selection: { ...selection, agentVisibility: "project" }, sessions: [missingIdentity], fleet: [{ ...detail, session: missingIdentity }] }).map((agent) => agent.id)).toEqual([session.id]);
  });
  it("resolves exact absolute/nested cwd paths without common-prefix or traversal matches", () => {
    expect(graphEventPath(root, { path: `${root}/src/app.ts` })).toBe("src/app.ts");
    expect(graphEventPath(root, { cwd: `${root}/src`, path: "app.ts" })).toBe("src/app.ts");
    for (const path of ["../master/src/app.ts", "src/../app.ts", "/projects/swarm/master-old/src/app.ts", "a\\b", "a\0b"]) expect(graphEventPath(root, { path })).toBeNull();
    expect(graphEventPath(root, { cwd: "/projects/swarm/feature", path: "src/app.ts" })).toBeNull();
  });
  it("does not infer paths from command/assistant text or resurface an earlier location after an outside-root path", () => {
    expect(observe({ fleet: [{ ...detail, entries: [{ ...event, path: undefined, text: "Edited src/app.ts" }] }] })[0]?.path).toBeNull();
    expect(observe({ fleet: [{ ...detail, entries: [{ ...event, attribution: "assistant-reported" }] }] })[0]?.path).toBeNull();
    expect(observe({ fleet: [{ ...detail, entries: [event, { ...event, id: "outside", path: "/elsewhere/src/app.ts" }] }] })[0]?.path).toBeNull();
  });
  it("uses newer detail status, and preserves terminal status when observations become stale", () => {
    const complete = { ...detail, session: { ...session, observedAt: "2026-09-08T12:00:03Z", lifecycle: { state: "completed" as const } } };
    expect(observe({ detail: complete, retained: true })[0]).toMatchObject({ state: "completed", retained: true });
    expect(observe({ sessions: [{ ...session, status: "unavailable" }] })[0]).toMatchObject({ retained: true });
    expect(observe({ sessions: [complete.session] })[0]).toMatchObject({ state: "completed" });
  });
  it("places multiple agents at the most specific available source node without moving nodes", () => {
    const first = observe()[0]!, second = { ...first, id: "second", label: "K7" };
    const nodes = [{ id: "root", paths: [""], directory: true }, { id: "src", paths: ["src"], directory: true }, { id: "file", paths: ["src/app.ts"] }];
    const before = structuredClone(nodes);
    expect([...placeGraphAgents([first, second], nodes, true)]).toEqual([["file", [first, second]]]);
    expect([...placeGraphAgents([first], nodes.slice(0, 2), true).keys()]).toEqual(["src"]);
    expect(placeGraphAgents([{ ...first, path: "src-other/a.ts" }], nodes.slice(1), true).size).toBe(0);
    expect(nodes).toEqual(before);
  });
  it("maps only explicit source inputs, not neighboring targets or transitive dependencies", () => {
    const capture: BuildLinkSnapshot = { repositoryId: "r", revision: "r", capturedAt: at, command: "query", targets: [
      { label: "//src:a", kind: "rule", path: "src" }, { label: "//src:b", kind: "rule", path: "src" }, { label: "//src:app.ts", kind: "source", path: "src/app.ts" },
    ], links: [{ from: "//src:a", to: "//src:app.ts", fromPath: "src", toPath: "src/app.ts" }, { from: "//src:b", to: "//src:a", fromPath: "src", toPath: "src" }] };
    expect([...placeGraphAgents(observe(), buildAgentLocations(capture)).keys()]).toEqual(["//src:a"]);
  });
  it("uses authored component and service/interface sources, not descriptions", () => {
    const index = PlanIndexSchema.parse({ version: 1, nodes: [
      { id: "app", kind: "component", title: "app", parentId: null, docs: ["docs/app.md"], sourcePaths: ["src/app.ts"], taskIds: [], contextRefs: [] },
      { id: "hidden", kind: "component", title: "hidden", parentId: null, docs: [], sourcePaths: ["src/hidden.ts"], taskIds: [], contextRefs: [] },
    ] });
    expect([...placeGraphAgents(observe(), componentAgentLocations(index)).keys()]).toEqual(["app"]);
    expect(componentAgentLocations(index, new Set(["app"])).map((location) => location.id)).toEqual(["app"]);
    expect(placeGraphAgents([{ ...observe()[0]!, path: "src/hidden.ts" }], componentAgentLocations(index, new Set(["app"]))).size).toBe(0);
    const locations = serviceAgentLocations({ repositoryId: "r", worldId: "w", sourceFingerprint: "r", observedAt: at, status: "current", paths: ["compose.yaml"], issues: [], services: [{ id: "service:app", displayName: "app", declarationPath: "compose.yaml", implementationPaths: ["src/app.ts"], interfaces: [{ id: "interface:api", name: "api", path: "src/api.ts", requestType: "Request", responseType: "Response", role: "provided" }] }] });
    expect([...placeGraphAgents(observe(), locations).keys()]).toEqual(["service:app"]);
    expect([...placeGraphAgents([{ ...observe()[0]!, path: "src/api.ts" }], locations).keys()]).toEqual(["interface:api"]);
  });
  it("uses exact current task IDs and canonical task file references without prose inference", () => {
    const snapshot = taskObservationFixture().snapshot!;
    const detail = taskDetailFixture();
    snapshot.backlinks = { status: "complete", entries: detail.fileRefs.map((ref, refIndex) => ({ taskId: detail.id, refIndex, path: ref.path, navigation: ref.navigation })) };
    const locations = taskAgentLocations(snapshot, new Map([[detail.id, detail]]), new Set([detail.id, "missing-task"]));
    expect(locations).toEqual([{ id: detail.id, paths: ["docs/architecture.md"], tasks: [detail.id] }]);
    const pathAgent = { ...observe()[0]!, path: "docs/architecture.md" };
    const exactTask = { ...observe()[0]!, id: "task-agent", path: null, task: detail.id };
    const proseTask = { ...observe()[0]!, id: "prose-agent", path: null, task: `Please work on ${detail.id}` };
    expect(placeGraphAgents([pathAgent, exactTask, proseTask], locations).get(detail.id)?.map((agent) => agent.id)).toEqual([pathAgent.id, exactTask.id]);
  });
});
