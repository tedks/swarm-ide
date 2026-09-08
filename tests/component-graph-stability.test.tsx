// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PlanIndexSchema } from "../protocol/plans";
import { DesignWorkspace, designProjection } from "../app/renderer/plans/DesignWorkspace";
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
  const request = vi.fn(async (req: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION, requestId: req.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(),
    ...(req.type === "plans.read" ? { plans: { status: "observed", index: structuredClone(index), revision: "a".repeat(64), observedAt: "2026-09-08T00:00:00.000Z" } } :
      req.type === "file.read" ? { file: { kind: "read", path: req.path, content: `# Document\n\n${req.path}`, revision: "a".repeat(64), size: 64 } } : {}) }));
  window.swarm = { request, onEvent: () => () => {} }; return request;
}

describe("component graph remains stable and truthful", () => {
  it("keeps every root interface direction and distinguishes parent containment", () => {
    const result = designProjection(index, index.nodes[0]!);
    expect(result.nodes).toHaveLength(7);
    expect(result.edges.filter(e => e.kind === "containment")).toHaveLength(6);
    const authored = index.nodes.flatMap(n => (n.design?.connections ?? []).map(e => [n.id, e.targetId, e.label]));
    expect(result.edges.filter(e => e.kind === "interface").map(e => [e.source, e.target, e.label])).toEqual(authored);
    expect(result.edges.filter(e => e.kind === "interface" && result.edges.some(other => other.kind === "interface" && other.source === e.target && other.target === e.source))).toHaveLength(8);
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
