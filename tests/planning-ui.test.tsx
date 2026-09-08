// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanWorkspace } from "../app/renderer/plans/PlanWorkspace";
import { TaskBridgeClient, type TaskClientState } from "../app/renderer/tasks/client";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { PlanIndexSchema, PLAN_READ_MESSAGES } from "../protocol/plans";
import { parseCoreResponseForRequest, PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return { Background: () => null, Controls: () => null, MarkerType: { ArrowClosed: "arrow" }, Position: { Right: "right", Left: "left" },
    ReactFlow: ({ nodes, onNodeClick }: { nodes: { id: string }[]; onNodeClick: (event: unknown, node: { id: string }) => void }) => {
      const [camera, setCamera] = React.useState("initial");
      return <div data-testid="projection-camera" data-camera={camera}><button onClick={() => setCamera("deliberate")}>Move own camera</button>{nodes.map((node) => <button key={node.id} onClick={() => onNodeClick({}, node)}>{node.id}</button>)}</div>;
    } };
});
afterEach(() => { cleanup(); delete window.swarm; });
const index = PlanIndexSchema.parse({ version: 1, nodes: [
  { id: "plan:demo", kind: "plan", title: "Product intent", parentId: null, docs: ["docs/design.md"], sourcePaths: [], taskIds: [], contextRefs: [] },
  { id: "component:engine", kind: "component", title: "Engine", parentId: "plan:demo", docs: [], sourcePaths: ["src/main.ts"], taskIds: ["task-fixture"], contextRefs: [{ kind: "lesson", path: "docs/lesson.md", note: "Read selected guidance" }] },
  { id: "plan:implementation", kind: "plan", title: "Implementation", parentId: "component:engine", docs: [], sourcePaths: [], taskIds: [], contextRefs: [] },
] });
const observedPlans = () => ({ status: "observed" as const, index, revision: "a".repeat(64), observedAt: "2026-09-07T19:00:00.000Z" });
const wrap = (request: CoreRequest, plans: unknown) => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true,
  sequence: 1, snapshot: initialSnapshot(), plans } as CoreResponse);
function harness() {
  const tasks: TaskClientState = { ...new TaskBridgeClient().getSnapshot(), observation: taskObservationFixture(), connected: true };
  const readGraphDetail = vi.fn(async () => taskDetailFixture());
  const refresh = vi.fn(async () => {});
  let lifetime = 1;
  const client = { graphCurrent: (_snapshot: unknown, epoch = lifetime) => epoch === lifetime, graphLifetime: () => lifetime, readGraphDetail, refresh } as unknown as TaskBridgeClient;
  const onOpenTask = vi.fn(async () => true), onOpenFile = vi.fn();
  const request = vi.fn(async (request: CoreRequest) => wrap(request, observedPlans()));
  window.swarm = { request, onEvent: () => () => {} };
  const props = { visible: true, worldId: "world:working", repositoryId: "project:swarm-ide", generation: 1, connected: true,
    tasks, client, onOpenTask, onOpenFile, initialView: "tasks" as const };
  return { props, readGraphDetail, request, onOpenTask, onOpenFile, nextLifetime: () => { lifetime++; } };
}
describe("playable separate planning projections", () => {
  it("requires an explicit graph reload after the client lifetime changes at the same metadata commit", async () => {
    const h = harness(); const view = render(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" })); await screen.findByText(/1\/1 details read/);
    h.nextLifetime(); view.rerender(<PlanWorkspace {...h.props} generation={2} tasks={{ ...h.props.tasks }} />);
    expect(screen.getByText(/NOT CURRENT/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Keyboard task outline/));
    expect((screen.getByRole("button", { name: "Open graph task task-fixture" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
    await waitFor(() => expect(screen.queryByText(/NOT CURRENT/)).toBeNull());
  });
  it("does not authorize the old graph when a different client has the same numeric epoch", async () => {
    const h = harness(), replacement = harness(); const view = render(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" })); await screen.findByText(/1\/1 details read/);
    view.rerender(<PlanWorkspace {...h.props} client={replacement.props.client} />);
    expect(screen.getByText(/NOT CURRENT/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Keyboard task outline/));
    expect((screen.getByRole("button", { name: "Open graph task task-fixture" }) as HTMLButtonElement).disabled).toBe(true);
    expect(replacement.readGraphDetail).not.toHaveBeenCalled();
  });
  it("does not read relations or plan bytes until an explicit gesture; graph selection is not execution", async () => {
    const h = harness(); render(<PlanWorkspace {...h.props} />);
    expect(h.readGraphDetail).not.toHaveBeenCalled(); expect(h.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
    await screen.findByText(/1\/1 details read/);
    expect(h.onOpenTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Inspect graph task task-fixture" }));
    expect(h.onOpenTask).toHaveBeenCalledExactlyOnceWith(h.props.tasks.observation!.snapshot, "task-fixture");
    fireEvent.click(screen.getByRole("button", { name: "Open task details" }));
    await waitFor(() => expect(h.onOpenTask).toHaveBeenCalledWith(h.props.tasks.observation!.snapshot, "task-fixture"));
    expect(h.onOpenFile).not.toHaveBeenCalled();
  });
  it("keeps independent mounted cameras across task/plan/lens switches and exposes explicit context/source/task links", async () => {
    const h = harness(); const view = render(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" })); await screen.findByText(/1\/1 details read/);
    fireEvent.click(screen.getByRole("button", { name: "Move own camera" }));
    const taskCamera = screen.getByTestId("projection-camera");
    fireEvent.click(screen.getByRole("button", { name: "Plans & components" }));
    await screen.findByText(/3 components/);
    expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ type: "plans.read", repositoryId: "project:swarm-ide" }));
    expect(h.onOpenFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Inspect plan component:engine" }));
    fireEvent.click(screen.getByRole("button", { name: "Open source · src/main.ts" }));
    expect(h.onOpenFile).toHaveBeenCalledWith("src/main.ts");
    fireEvent.click(screen.getByRole("button", { name: "lesson · docs/lesson.md" }));
    expect(h.onOpenFile).toHaveBeenLastCalledWith("docs/lesson.md");
    fireEvent.click(screen.getByRole("button", { name: "Inspect task · task-fixture" }));
    await waitFor(() => expect(h.onOpenTask).toHaveBeenCalledTimes(1));
    view.rerender(<PlanWorkspace {...h.props} visible={false} />);
    view.rerender(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Task blockage" }));
    expect(taskCamera.isConnected).toBe(true); expect(taskCamera.dataset.camera).toBe("deliberate");
    expect(h.readGraphDetail).toHaveBeenCalledTimes(1);
  });
  it("rejects late old-generation plan response and reports missing/invalid metadata without a fallback", async () => {
    const h = harness(); const pending: Array<(response: CoreResponse) => void> = [];
    h.request.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
    const view = render(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Plans & components" }));
    view.rerender(<PlanWorkspace {...h.props} generation={2} />);
    await act(async () => pending[0]!(wrap(h.request.mock.calls[0]![0], observedPlans())));
    expect(screen.queryByText(/3 components/)).toBeNull();
    await act(async () => pending[1]!(wrap(h.request.mock.calls[1]![0], { status: "unavailable", code: "PLAN_INDEX_MALFORMED", message: PLAN_READ_MESSAGES.PLAN_INDEX_MALFORMED })));
    expect((await screen.findAllByText(/The plan needs a correction/)).length).toBeGreaterThan(0); expect(screen.queryByRole("button", { name: "Inspect plan plan:demo" })).toBeNull();
  });
  it("marks retained plans unavailable for link activation after a core replacement", async () => {
    const h = harness(); const view = render(<PlanWorkspace {...h.props} />);
    fireEvent.click(screen.getByRole("button", { name: "Plans & components" }));
    await screen.findByText(/3 components/);
    fireEvent.click(screen.getByRole("button", { name: "Inspect plan plan:demo" }));
    view.rerender(<PlanWorkspace {...h.props} generation={2} />);
    expect((screen.getByRole("button", { name: "Read doc · docs/design.md" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Refresh to navigate/)).toBeTruthy();
  });
});
describe("plan bridge authority", () => {
  const request = { protocolVersion: PROTOCOL_VERSION, type: "plans.read" as const, requestId: "plan-proof", repositoryId: "project:swarm-ide", worldId: "world:working" };
  it("requires a correlated plan result and rejects substitution into other commands", () => {
    expect(parseCoreResponseForRequest(wrap(request, observedPlans()), request).ok).toBe(true);
    expect(() => parseCoreResponseForRequest(wrap(request, undefined), request)).toThrow();
    expect(() => parseCoreResponseForRequest(wrap(request, observedPlans()), { ...request, repositoryId: "wrong" })).toThrow();
    expect(() => parseCoreResponseForRequest(wrap(request, observedPlans()), { ...request, type: "workspace.snapshot" } as CoreRequest)).toThrow();
  });
  it("does not combine plan and Build result authority in either direction", () => {
    const plan = wrap(request, observedPlans());
    const buildRequest = { ...request, type: "buildGraph.observe" as const, refresh: false };
    const buildGraph = { repositoryId: request.repositoryId, worldId: request.worldId, generation: 1, status: "error", message: "No build observation" };
    const mixed = { ...plan, buildGraph };
    expect(() => parseCoreResponseForRequest(mixed, request)).toThrow();
    expect(() => parseCoreResponseForRequest(mixed, buildRequest)).toThrow();
    const build = { ...plan, plans: undefined, buildGraph };
    expect(parseCoreResponseForRequest(build, buildRequest).ok).toBe(true);
    expect(() => parseCoreResponseForRequest(build, request)).toThrow();
    expect(() => parseCoreResponseForRequest(plan, buildRequest)).toThrow();
  });
  it("keeps plan and external-session observation authority separate", () => {
    const plan = wrap(request, observedPlans());
    const externalRequest = { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, type: "externalAgents.snapshot" as const };
    const external = { kind: "snapshot", snapshot: { status: "unavailable", message: "No registered sessions", observedAt: "2026-09-07T19:00:00.000Z", sessions: [] } };
    const mixed = { ...plan, external };
    expect(() => parseCoreResponseForRequest(mixed, request)).toThrow();
    expect(() => parseCoreResponseForRequest(mixed, externalRequest)).toThrow();
    expect(parseCoreResponseForRequest({ ...plan, plans: undefined, external }, externalRequest).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...plan, plans: undefined, external }, request)).toThrow();
    expect(() => parseCoreResponseForRequest(plan, externalRequest)).toThrow();
  });
});
