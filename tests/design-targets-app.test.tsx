// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { PlanIndexSchema } from "../protocol/plans";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { BuildGraphObservation } from "../protocol/build-graph";
import type { TargetBuildJob } from "../protocol/build-jobs";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: () => <div>Retained graph</div> }));
vi.mock("../app/renderer/tasks/TaskPanel", () => ({ TaskPanel: ({ onOpen }: { onOpen(id: string): void }) =>
  <button onClick={() => onOpen("linked-task")}>Open linked task</button> }));
vi.mock("../app/renderer/plans/ProjectionCanvas", () => ({ ProjectionCanvas: ({ label, nodes, selected, onSelect }: {
  label: string; nodes: Array<{ id: string; title: string }>; selected: string | null; onSelect(id: string): void;
}) => <section aria-label={label}>{nodes.map(node => <button key={node.id} aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>{node.title}</button>)}</section> }));
import { App } from "../app/renderer/App";

const baseNode = { kind: "component", docs: ["docs/design.md"], sourcePaths: [], taskIds: [], contextRefs: [] };
const design = { summary: "Owned test design", state: "implemented", connections: [], buildTargets: [
  { label: "//:passing_test", role: "Unit behavior", dependencies: [] },
  { label: "//:library", role: "Compiled source", dependencies: [] },
] };
const index = PlanIndexSchema.parse({ version: 1, nodes: [
  { ...baseNode, id: "system", title: "Whole system", parentId: null, design: { ...design, buildTargets: [] } },
  { ...baseNode, id: "agents", title: "Agent owners and steering", parentId: "system", design },
  { ...baseNode, id: "planning", title: "Planning", parentId: "system", design: { ...design, buildTargets: [] } },
] });
const snapshot = initialSnapshot();
const graph: BuildGraphObservation = { repositoryId: snapshot.project.id, worldId: snapshot.world.id, generation: 1, status: "current", message: "Build graph current",
  graph: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, inputDigest: "a".repeat(64), observedAt: "2026-09-09T12:00:00.000Z", command: "query", complete: true, coverage: "fixture", edges: [],
    targets: [ { label: "//:passing_test", kind: "rule", ruleClass: "sh_test", path: "", buildFile: "BUILD.bazel" },
      { label: "//:library", kind: "rule", ruleClass: "filegroup", path: "", buildFile: "BUILD.bazel" } ] } };
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });

function bridge() {
  let jobs: TargetBuildJob[] = [];
  let releasePlan: (() => void) | undefined;
  let holdPlan = false;
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (input.type === "plans.read" && holdPlan) await new Promise<void>(resolve => { releasePlan = resolve; });
    if (input.type === "build.start") jobs = [{ id: "actual-request", target: input.target, operation: input.operation,
      status: "succeeded", startedAt: "2026-09-09T12:00:00.000Z", elapsedMs: 10, message: "Tests passed", output: "//:passing_test PASSED", exitCode: 0, cleanup: "confirmed" }];
    return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 1, snapshot,
      ...(input.type === "plans.read" ? { plans: { status: "observed", index, revision: "b".repeat(64), observedAt: "2026-09-09T12:00:00.000Z" } } : {}),
      ...(input.type === "buildGraph.observe" ? { buildGraph: graph } : {}),
      ...(input.type === "build.start" || input.type === "build.observe" || input.type === "build.cancel" ? { buildJobs: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, blocked: false, jobs } } : {}),
      ...(input.type === "file.read" ? { workspaceId: input.workspaceId, file: { kind: "read", path: input.path, content: "# Design body\n\nKeep this component open.", revision: "c".repeat(64), size: 43 } } : {}),
    };
  });
  window.swarm = { request, onEvent: () => () => {} };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  return { request, hold: () => { holdPlan = true; }, release: () => { holdPlan = false; releasePlan?.(); } };
}

it("keeps the real selected design and graph highlighted while Context runs its exact test", async () => {
  const { request } = bridge(); render(<App />);
  const components = await screen.findByRole("region", { name: "Component design canvas" });
  fireEvent.click(within(components).getByRole("button", { name: "Agent owners and steering" }));
  fireEvent.click(screen.getByRole("button", { name: "Read design" }));
  const context = await screen.findByRole("region", { name: "Component targets" });
  expect(within(context).getByRole("heading", { name: "Agent owners and steering" })).toBeTruthy();
  await waitFor(() => expect((within(context).getByRole("button", { name: "Test //:passing_test" }) as HTMLButtonElement).disabled).toBe(false));
  const documentPane = screen.getByRole("article", { name: "Design document" });
  await within(documentPane).findByText("Keep this component open.");
  expect(request.mock.calls.some(([input]) => input.type === "build.start")).toBe(false);
  fireEvent.click(within(context).getByRole("button", { name: "Test //:passing_test" }));
  await screen.findByText("Tests passed");
  expect(request.mock.calls.filter(([input]) => input.type === "build.start").map(([input]) => input)).toEqual([
    expect.objectContaining({ type: "build.start", operation: "test", target: "//:passing_test", repositoryId: snapshot.project.id, worldId: snapshot.world.id }),
  ]);
  expect(screen.getByRole("article", { name: "Design document" })).toBe(documentPane);
  expect(within(components).getByRole("button", { name: "Agent owners and steering" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Test output")).toBeTruthy();
});

it("retires Context actions during plan refresh and replaces targets on component selection", async () => {
  const owner = bridge(); render(<App />);
  let components = await screen.findByRole("region", { name: "Component design canvas" });
  fireEvent.click(within(components).getByRole("button", { name: "Agent owners and steering" }));
  await screen.findByRole("button", { name: "Test //:passing_test" });
  owner.hold(); fireEvent.click(screen.getByRole("button", { name: "Refresh design" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Test //:passing_test" }) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Test //:passing_test" }));
  expect(owner.request.mock.calls.some(([input]) => input.type === "build.start")).toBe(false);
  await act(async () => owner.release());
  await waitFor(() => expect((screen.getByRole("button", { name: "Test //:passing_test" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Whole system" }));
  components = screen.getByRole("region", { name: "Component design canvas" });
  fireEvent.click(within(components).getByRole("button", { name: "Planning" }));
  const context = screen.getByRole("region", { name: "Component targets" });
  expect(within(context).getByRole("heading", { name: "Planning" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Test //:passing_test" })).toBeNull();
  expect(owner.request.mock.calls.some(([input]) => input.type === "build.start")).toBe(false);
});

it("restores the component Context when returning from a task through history or the design tab", async () => {
  const { request } = bridge(); render(<App />);
  const components = await screen.findByRole("region", { name: "Component design canvas" });
  fireEvent.click(within(components).getByRole("button", { name: "Agent owners and steering" }));
  fireEvent.click(screen.getByRole("button", { name: "Read design" }));
  const designDocument = await screen.findByRole("article", { name: "Design document" });
  await within(designDocument).findByText("Keep this component open.");
  for (const returnRoute of ["history", "design"] as const) {
    fireEvent.click(screen.getByRole("button", { name: "Open linked task" }));
    await waitFor(() => expect(document.querySelector('[data-context-kind="task"][data-context-subject="linked-task"]')).not.toBeNull());
    expect(screen.queryByRole("region", { name: "Component targets" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: returnRoute === "history" ? "Go back" : "Read design" }));
    const context = await screen.findByRole("region", { name: "Component targets" });
    expect(within(context).getByRole("heading", { name: "Agent owners and steering" })).toBeTruthy();
    await waitFor(() => expect((within(context).getByRole("button", { name: "Test //:passing_test" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("article", { name: "Design document" })).toBe(designDocument);
    expect(within(components).getByRole("button", { name: "Agent owners and steering" }).getAttribute("aria-pressed")).toBe("true");
  }
  expect(request.mock.calls.some(([input]) => input.type === "build.start")).toBe(false);
});
