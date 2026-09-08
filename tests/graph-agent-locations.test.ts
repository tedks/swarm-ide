import { describe, expect, it } from "vitest";
import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../protocol/external-agents";
import { observedGraphAgents, graphEventPath, placeGraphAgents, buildAgentLocations, componentAgentLocations, serviceAgentLocations } from "../app/renderer/graph-agents/locations";
import { PlanIndexSchema } from "../protocol/plans";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
const root = "/projects/swarm/master";
const at = "2026-09-08T12:00:00Z";
const event: ExternalEntry = { id: "edit", at, kind: "tool-call", text: "Edited src/app.ts", attribution: "recorded-tool-event", path: "src/app.ts" };
const session: ExternalAgentSummary = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "F7", evidence: "local", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "", contextPaths: [], worktree: root, lifecycle: { state: "working" } };
const detail: ExternalDetail = { session, entries: [event], handoff: "unavailable", coverage: { tailBytes: 100, partial: false, omittedRecords: 0, message: "" } };
const observe = (options: Partial<Parameters<typeof observedGraphAgents>[0]> = {}) => observedGraphAgents({ root, sessions: [session], fleet: [detail], ...options });

describe("registered graph locations", () => {
  it("keeps last touched source separate from the latest action and lifecycle", () => {
    expect(observe({ fleet: [{ ...detail, entries: [event, { ...event, id: "later", path: undefined, text: "Ran build" }] }] })[0])
      .toMatchObject({ path: "src/app.ts", action: "Edited src/app.ts", latestAction: "Ran build", state: "working", retained: false });
  });
  it("rejects same relative path in another worktree, unregistered and synthetic observations", () => {
    expect(observe({ root: "/projects/swarm/feature" })).toEqual([]);
    expect(observe({ sessions: [] })).toEqual([]);
    expect(observe({ sessions: [{ ...session, worktree: undefined }] })).toEqual([]);
    expect(observe({ fleet: [{ ...detail, session: { ...session, worktree: "/projects/swarm/feature" } }] })).toEqual([]);
    expect(observe({ fleet: [{ ...detail, session: { ...session, evidence: "synthetic" } }] })).toEqual([]);
  });
  it("resolves exact absolute/nested cwd paths without common-prefix or traversal matches", () => {
    expect(graphEventPath(root, { path: `${root}/src/app.ts` })).toBe("src/app.ts");
    expect(graphEventPath(root, { cwd: `${root}/src`, path: "app.ts" })).toBe("src/app.ts");
    for (const path of ["../master/src/app.ts", "src/../app.ts", "/projects/swarm/master-old/src/app.ts", "a\\b", "a\0b"]) expect(graphEventPath(root, { path })).toBeNull();
    expect(graphEventPath(root, { cwd: "/projects/swarm/feature", path: "src/app.ts" })).toBeNull();
  });
  it("does not infer paths from command/assistant text or resurface an earlier location after an outside-root path", () => {
    expect(observe({ fleet: [{ ...detail, entries: [{ ...event, path: undefined, text: "Edited src/app.ts" }] }] })).toEqual([]);
    expect(observe({ fleet: [{ ...detail, entries: [{ ...event, attribution: "assistant-reported" }] }] })).toEqual([]);
    expect(observe({ fleet: [{ ...detail, entries: [event, { ...event, id: "outside", path: "/elsewhere/src/app.ts" }] }] })).toEqual([]);
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
    const index = PlanIndexSchema.parse({ version: 1, nodes: [{ id: "app", kind: "component", title: "app", parentId: null, docs: ["docs/app.md"], sourcePaths: ["src/app.ts"], taskIds: [], contextRefs: [] }] });
    expect([...placeGraphAgents(observe(), componentAgentLocations(index)).keys()]).toEqual(["app"]);
    const locations = serviceAgentLocations({ repositoryId: "r", worldId: "w", sourceFingerprint: "r", observedAt: at, status: "current", paths: ["compose.yaml"], issues: [], services: [{ id: "service:app", displayName: "app", declarationPath: "compose.yaml", implementationPaths: ["src/app.ts"], interfaces: [{ id: "interface:api", name: "api", path: "src/api.ts", requestType: "Request", responseType: "Response", role: "provided" }] }] });
    expect([...placeGraphAgents(observe(), locations).keys()]).toEqual(["service:app"]);
    expect([...placeGraphAgents([{ ...observe()[0]!, path: "src/api.ts" }], locations).keys()]).toEqual(["interface:api"]);
  });
});
