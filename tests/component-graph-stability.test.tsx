// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PlanIndexSchema } from "../protocol/plans";
import { DesignWorkspace, designProjection, designContracts } from "../app/renderer/plans/DesignWorkspace";
import { ProjectionCanvas, contractCurveOffset } from "../app/renderer/plans/ProjectionCanvas";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

const flow = vi.hoisted(() => ({ mounts: 0, unmounts: 0, props: new Map<string, any>(),
  viewport: { x: 0, y: 0, zoom: 1 }, setViewport: vi.fn(), fitView: vi.fn() }));
vi.mock("@xyflow/react", () => ({
  Background: () => null, Controls: () => null, BaseEdge: () => null, getBezierPath: () => ["", 0, 0],
  Position: { Right: "right", Left: "left", Top: "top", Bottom: "bottom" }, MarkerType: { ArrowClosed: "arrow" },
  ReactFlow: (props: any) => {
    const component = props.nodes.some((n: any) => n.id.startsWith("design:"));
    if (component) flow.props.set("component", props);
    useEffect(() => {
      if (!component) return;
      flow.mounts++;
      props.onInit({ getViewport: () => flow.viewport, setViewport: (next: typeof flow.viewport) => { flow.viewport = next; flow.setViewport(next); }, fitView: flow.fitView });
      return () => { flow.unmounts++; };
    }, []);
    return <div data-testid={component ? "component-canvas" : "other-canvas"}>{props.nodes.map((n: any) => <button key={n.id} onClick={() => props.onNodeClick({}, n)}>{n.id}</button>)}</div>;
  },
}));
const index = PlanIndexSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../.swarm/plans.json"), "utf8")));
const options = { visible: true, connected: true, worldId: "world:working", repositoryId: "project:swarm-ide", generation: 1 };
afterEach(() => { cleanup(); delete window.swarm; flow.mounts = 0; flow.unmounts = 0; flow.props.clear(); flow.setViewport.mockClear(); flow.fitView.mockClear(); });
function bridge() {
  const request = vi.fn(async (req: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION, requestId: req.requestId, ok: true, sequence: 1, snapshot: { ...initialSnapshot(), project: { ...initialSnapshot().project, id: req.type === "plans.read" ? req.repositoryId : options.repositoryId } },
    ...(req.workspaceId ? { workspaceId: req.workspaceId, snapshot: { ...initialSnapshot(), project: { ...initialSnapshot().project, id: req.workspaceId } } } : {}),
    ...(req.type === "plans.read" ? { plans: { status: "observed", index: structuredClone(index), revision: "a".repeat(64), observedAt: "2026-09-08T00:00:00.000Z" } } :
      req.type === "file.read" ? { file: { kind: "read", path: req.path, content: `# Document\n\n${req.path}`, revision: "a".repeat(64), size: 64 } } : {}) }));
  window.swarm = { request, onEvent: () => () => {} }; return request;
}

describe("component graph remains stable and truthful", () => {
  it("gives existing hierarchy columns and rows room without changing authored contracts", () => {
    const root = designProjection(index, index.nodes[0]!);
    expect(root.nodes[2]!.position!.x - root.nodes[1]!.position!.x).toBeGreaterThanOrEqual(300);
    expect(root.nodes[4]!.position!.y - root.nodes[1]!.position!.y).toBeGreaterThanOrEqual(140);
    expect(root.nodes[1]!.position!.y - root.nodes[0]!.position!.y).toBeGreaterThanOrEqual(140);
    expect(root.nodes.map(n => n.id)).toEqual(index.nodes.filter(n => n.id === "design:system" || n.parentId === "design:system").map(n => n.id));
  });
  it("opts only the component view into dragging and preserves keyboard/click activation", async () => {
    bridge(); render(<DesignWorkspace {...options} repositoryId="drag-mount" onOpenFile={vi.fn()} />);
    await screen.findByText("docs/design/system.md");
    expect(flow.props.get("component").nodesDraggable).toBe(true);
    expect(flow.props.get("component").autoPanOnNodeDrag).toBe(false);
    expect(screen.getByRole("button", { name: "Reset layout" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
  });
  it("applies live node changes, scopes arrangements, drops removed IDs and resets only this view", () => {
    const nodes = [{ id: "design:a", title: "A", subtitle: "", position: { x: 0, y: 0 } }, { id: "design:b", title: "B", subtitle: "", position: { x: 320, y: 140 } }];
    const onSelect = vi.fn();
    const component = (scope: string, input = nodes) => <ProjectionCanvas label="drag-test" nodes={input} edges={[]} selected={null} onSelect={onSelect} {...{ layoutScope: scope }} />;
    const view = render(component("world/repo/a"));
    const position = () => flow.props.get("component").nodes[0].position;
    const move = (x: number, y: number) => act(() => flow.props.get("component").onNodesChange([{ id: "design:a", type: "position", position: { x, y }, dragging: true }]));
    const cameraBefore = { ...flow.viewport };
    move(42, 80);
    expect(position()).toEqual({ x: 42, y: 80 });
    expect(flow.props.get("component").nodes[1].position).toEqual(nodes[1]!.position);
    expect(flow.viewport).toEqual(cameraBefore); expect(onSelect).not.toHaveBeenCalled();
    view.rerender(component("world/repo/a", structuredClone(nodes))); // ordinary refresh
    expect(position()).toEqual({ x: 42, y: 80 });
    for (const scope of ["world/repo/b", "world/repo/a/contract", "world/another-repo/a", "other-world/repo/a"]) {
      view.rerender(component(scope)); expect(position()).toEqual(nodes[0]!.position); move(99, 101);
    }
    view.rerender(component("world/repo/a")); expect(position()).toEqual({ x: 42, y: 80 });
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(position()).toEqual(nodes[0]!.position); expect(flow.viewport).toEqual(cameraBefore);
    view.rerender(component("world/repo/b")); expect(position()).toEqual({ x: 99, y: 101 });
    view.rerender(component("world/repo/b", [nodes[1]!]));
    view.rerender(component("world/repo/b")); expect(position()).toEqual(nodes[0]!.position);
    move(18, 29); view.unmount();
    render(component("world/repo/b")); expect(position()).toEqual({ x: 18, y: 29 });
    expect(flow.fitView).not.toHaveBeenCalled();
  });
  it("leaves shared task/build/containment canvases non-draggable without layout controls", () => {
    render(<ProjectionCanvas label="other projection" nodes={[{ id: "design:test", title: "Test", subtitle: "", position: { x: 0, y: 0 } }]} edges={[]} selected={null} onSelect={vi.fn()} />);
    expect(flow.props.get("component").nodesDraggable).toBe(false);
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
    act(() => flow.props.get("component").onNodesChange([{ id: "design:test", type: "position", position: { x: 900, y: 800 } }]));
    expect(flow.props.get("component").nodes[0].position).toEqual({ x: 0, y: 0 });
  });
  it("opens a responsibility hierarchy without drawing every child's contracts", () => {
    const result = designProjection(index, index.nodes[0]!);
    expect(result.nodes).toHaveLength(7);
    expect(result.edges.filter(e => e.kind === "containment")).toHaveLength(6);
    expect(result.edges).toHaveLength(6);
    for (const area of index.nodes.filter(n => n.parentId === "design:system")) {
      const focused = designProjection(index, area);
      const authored = index.nodes.flatMap(n => (n.design?.connections ?? [])
        .filter(e => n.id === area.id || e.targetId === area.id).map(e => [n.id, e.targetId, e.label]));
      expect(focused.edges.map(e => [e.source, e.target, e.label])).toEqual(authored);
    }
  });
  it("accepts optional contract semantics without reinterpreting legacy connections", () => {
    const typed = structuredClone(index);
    Object.assign(typed.nodes[1]!.design!.connections[0]!, { kind: "request", detail: "Read a file through the typed broker." });
    expect(PlanIndexSchema.safeParse(typed).success).toBe(true);
    Object.assign(typed.nodes[1]!.design!.connections[0]!, { kind: "deployment" });
    expect(PlanIndexSchema.safeParse(typed).success).toBe(false);
  });
  it("focuses incident interfaces, not relationships between unrelated neighbours", () => {
    const selected = index.nodes.find(n => n.id === "design:cockpit")!;
    const result = designProjection(index, selected);
    expect(result.edges.every(e => e.source === selected.id || e.target === selected.id)).toBe(true);
    expect(result.edges.some(e => e.target === selected.id)).toBe(true);
    const reordered = structuredClone(index);
    reordered.nodes.find(n => n.id === selected.id)!.design!.connections.reverse();
    expect(designProjection(reordered, reordered.nodes.find(n => n.id === selected.id)!).edges.map(e => e.id).sort()).toEqual(result.edges.map(e => e.id).sort());
  });
  it("keeps navigation, saved-summary data, requests and replies distinct in the actual index", () => {
    const activity = index.nodes.find(n => n.id === "design:activity")!;
    const links = designContracts(index, activity);
    expect(links.filter(c => c.target.id === "design:agents").map(c => c.link.kind)).toEqual(["navigation", "data"]);
    expect(links.find(c => c.target.id === "design:planning")!.link.detail).toContain("already-closed");
    const repository = index.nodes.find(n => n.id === "design:repository")!;
    const pair = designContracts(index, repository).filter(c => c.source.id === "design:runtime" || c.target.id === "design:runtime");
    expect(pair.map(c => c.link.kind)).toEqual(["request", "result"]);
    for (const contract of links) {
      const selected = designProjection(index, activity, contract.id);
      expect(selected.nodes.map(n => n.id).sort()).toEqual([contract.source.id, contract.target.id].sort());
      expect(selected.edges).toHaveLength(1);
      expect(selected.edges[0]).toMatchObject({ id: contract.id, source: contract.source.id, target: contract.target.id, kind: contract.link.kind });
    }
  });
  it("gives parallel navigation/data contracts separate stable lanes as well as reciprocal arrows", () => {
    const graph = designProjection(index, index.nodes.find(n => n.id === "design:activity")!);
    const outgoing = graph.edges.filter(e => e.source === "design:activity" && e.target === "design:agents");
    expect(outgoing).toHaveLength(2);
    const offsets = outgoing.map(e => contractCurveOffset(e, graph.edges));
    expect(new Set(offsets).size).toBe(2);
    expect(offsets.every(offset => offset > 0)).toBe(true);
    expect(outgoing.map(e => contractCurveOffset(e, [...graph.edges].reverse()))).toEqual(offsets);
    const reverse = graph.edges.find(e => e.source === "design:agents" && e.target === "design:activity")!;
    expect(contractCurveOffset(reverse, graph.edges)).toBeGreaterThan(0); // reversed endpoints bend to the opposite physical side
    expect(contractCurveOffset(outgoing[0]!, outgoing)).not.toBe(contractCurveOffset(outgoing[1]!, outgoing));
  });
  it("retains read-only contract detail during a held same-world refresh without permitting activation", async () => {
    const request = bridge();
    render(<DesignWorkspace {...options} onOpenFile={vi.fn()} />);
    await screen.findByText("docs/design/system.md");
    fireEvent.click(screen.getByRole("button", { name: "design:activity" }));
    await screen.findByText("docs/design/activity.md");
    const data = designContracts(index, index.nodes.find(n => n.id === "design:activity")!).find(c => c.link.label === "Latest saved summary")!;
    fireEvent.change(screen.getByRole("combobox", { name: "Architectural contract" }), { target: { value: data.id } });
    const edges = flow.props.get("component").edges;
    request.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Refresh design" }));
    expect(screen.getByRole("complementary", { name: "Selected architectural contract" }).textContent).toContain("Latest saved summary");
    expect(flow.props.get("component").edges).toBe(edges);
    expect((screen.getByRole("combobox", { name: "Architectural contract" }) as HTMLSelectElement).disabled).toBe(true);
    act(() => flow.props.get("component").onEdgeClick({}, { id: "another", data: { kind: "request" } }));
    expect((screen.getByRole("combobox", { name: "Architectural contract" }) as HTMLSelectElement).value).toBe(data.id);
  });
  it("inspects one contract through the picker or edge without changing component, source or camera", async () => {
    const request = bridge(), onOpenFile = vi.fn();
    const view = render(<DesignWorkspace {...options} onOpenFile={onOpenFile} />);
    await screen.findByText("docs/design/system.md");
    fireEvent.click(screen.getByRole("button", { name: "design:activity" }));
    await screen.findByText("docs/design/activity.md");
    const picker = screen.getByRole("combobox", { name: "Architectural contract" });
    const activity = index.nodes.find(n => n.id === "design:activity")!;
    const contracts = designContracts(index, activity);
    const data = contracts.find(c => c.link.kind === "data" && c.source.id === activity.id)!;
    flow.viewport = { x: 34, y: 20, zoom: .7 };
    fireEvent.change(picker, { target: { value: data.id } });
    expect(flow.props.get("component").edges).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Selected architectural contract" }).textContent).toContain("Latest saved summary");
    expect(flow.viewport).toEqual({ x: 34, y: 20, zoom: .7 });
    const before = flow.props.get("component").edges;
    view.rerender(<DesignWorkspace {...options} onOpenFile={onOpenFile} />);
    expect(flow.props.get("component").edges).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Refresh design" }));
    await waitFor(() => expect(request.mock.calls.filter(([r]) => r.type === "plans.read")).toHaveLength(2));
    await screen.findByText("docs/design/activity.md");
    expect((picker as HTMLSelectElement).value).toBe(data.id);
    expect(onOpenFile).not.toHaveBeenCalled(); expect(flow.fitView).not.toHaveBeenCalled();
    fireEvent.change(picker, { target: { value: "" } });
    const edge = flow.props.get("component").edges.find((e: any) => e.data.kind === "request");
    act(() => flow.props.get("component").onEdgeClick({}, edge));
    expect(screen.getByRole("complementary", { name: "Selected architectural contract" }).textContent).toContain("already-closed");
    expect(flow.mounts).toBe(1);
    view.rerender(<DesignWorkspace {...options} connected={false} onOpenFile={onOpenFile} />);
    expect(screen.queryByRole("complementary", { name: "Selected architectural contract" })).toBeNull();
    view.rerender(<DesignWorkspace {...options} onOpenFile={onOpenFile} />);
    await screen.findByText("docs/design/activity.md");
    expect(screen.queryByRole("complementary", { name: "Selected architectural contract" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Architectural contract" }), { target: { value: data.id } });
    expect(screen.getByRole("complementary", { name: "Selected architectural contract" })).toBeTruthy();
    view.rerender(<DesignWorkspace {...options} generation={2} onOpenFile={onOpenFile} />);
    expect(screen.queryByRole("complementary", { name: "Selected architectural contract" })).toBeNull();
  });
  it("keeps canvas and unchanged node/label props on idle updates and an identical refresh", async () => {
    const request = bridge(); const view = render(<DesignWorkspace {...options} onOpenFile={vi.fn()} />);
    await screen.findByText("docs/design/system.md");
    const canvas = screen.getByTestId("component-canvas"), props = flow.props.get("component");
    flow.viewport = { x: 67, y: -42, zoom: .63 };
    view.rerender(<DesignWorkspace {...options} onOpenFile={vi.fn()} />);
    expect(flow.props.get("component").nodes).toBe(props.nodes);
    expect(flow.props.get("component").edges).toBe(props.edges);
    fireEvent.click(screen.getByRole("button", { name: "Refresh design" }));
    await waitFor(() => expect(request.mock.calls.filter(([r]) => r.type === "plans.read")).toHaveLength(2));
    await screen.findByText("docs/design/system.md");
    expect(screen.getByTestId("component-canvas")).toBe(canvas);
    expect(flow.props.get("component").edges).toBe(props.edges);
    expect(flow.mounts).toBe(1); expect(flow.unmounts).toBe(0); expect(flow.fitView).not.toHaveBeenCalled();
    expect(flow.viewport).toEqual({ x: 67, y: -42, zoom: .63 });
  });
  it("preserves each visited component camera without remounting and exposes inbound constraints/links", async () => {
    bridge(); render(<DesignWorkspace {...options} onOpenFile={vi.fn()} />);
    await screen.findByText("docs/design/system.md");
    const canvas = screen.getByTestId("component-canvas");
    flow.viewport = { x: 30, y: 70, zoom: .7 };
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
    expect(screen.getByText("Navigation preserves dirty source, cursor and graph cameras.")).toBeTruthy();
    expect(screen.getAllByRole("button").some(button => button.textContent?.includes("Graphs & Context links"))).toBe(true);
    act(() => { flow.viewport = { x: -90, y: 20, zoom: .9 }; });
    fireEvent.click(screen.getByRole("button", { name: "Up one level" }));
    await screen.findByText("docs/design/system.md");
    expect(flow.viewport).toEqual({ x: 30, y: 70, zoom: .7 });
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
    expect(flow.viewport).toEqual({ x: -90, y: 20, zoom: .9 });
    expect(screen.getByTestId("component-canvas")).toBe(canvas); expect(flow.mounts).toBe(1);
    expect(flow.props.get("component").edges.some((e: any) => e.data?.reciprocal)).toBe(true);
  });
});
