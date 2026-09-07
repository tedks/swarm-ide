import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { initialSnapshot } from "../fixtures/world";
import { adaptGraph, type TopologyNodeData } from "../app/renderer/graph-adapter";
import { directoryMap, directoryZoomDestination, DIRECTORY_TILE } from "../app/renderer/repository/map";

function node(path: string, directory = false): Node<TopologyNodeData> {
  return { id: path || "root", position: { x: 0, y: 0 }, data: {
    label: path || "Repository", kind: directory ? "directory" : "file", status: "gray", focused: false, ambiguous: false,
    focus: { ...initialSnapshot().focus, domain: "repo", key: `${directory ? "dir" : "file"}:${path}`, ...(path ? { path } : {}) },
  } };
}

describe("spatial directory containment", () => {
  it("places siblings in a grid inside their parent, not as dependencies", () => {
    const nodes = directoryMap([node("", true), node("core", true), node("worker.ts"), node("working-world-observer.ts")], "");
    expect(nodes[0]!.data.directoryContainer).toBe(true);
    expect(nodes.slice(1).every((child) => child.parentId === "root")).toBe(true);
    expect(nodes[1]!.position.y).toBe(nodes[2]!.position.y);
    expect(nodes[3]!.position.y).toBeGreaterThan(nodes[1]!.position.y);
    expect(nodes[0]!.style!.height).toBeGreaterThan(nodes[3]!.position.y + DIRECTORY_TILE.height);
  });
  it("removes only directory containment lines, keeping genuine service edges", () => {
    const snapshot = initialSnapshot();
    const service = snapshot.graphs.find((graph) => graph.topologyId === "service")!;
    expect(adaptGraph(service, snapshot.focus, []).edges.length).toBe(service.edges.length);
    const graph = { ...snapshot.graphs[0]!, directory: { directory: "", observationId: "one", capturedAt: "2026-09-06T00:00:00.000Z", state: "observed" as const, complete: true, capturedCount: 0, filteredCount: 0, page: 0, pageCount: 1, filter: "", entries: [] } };
    expect(adaptGraph(graph, snapshot.focus, []).edges).toEqual([]);
  });
  it("zooms out one level, but never above root or in response to a pan", () => {
    const input = { directory: "app/renderer", nodes: [], startZoom: .8, baselineZoom: 1, viewport: { x: 0, y: 0, zoom: .6 }, point: { x: 0, y: 0 } };
    expect(directoryZoomDestination(input)).toBe("app");
    expect(directoryZoomDestination({ ...input, directory: "app" })).toBe("");
    expect(directoryZoomDestination({ ...input, directory: "" })).toBeNull();
    expect(directoryZoomDestination({ ...input, startZoom: .6 })).toBeNull();
  });
  it("expands only an eligible folder under the zoom anchor once its tile is large enough", () => {
    const nodes = directoryMap([node("", true), node("core", true), node("worker.ts")], "");
    const tile = nodes[1]!;
    const input = { directory: "", nodes, startZoom: 1, baselineZoom: 1, viewport: { x: 0, y: 0, zoom: 1.5 }, point: { x: tile.position.x + 10, y: tile.position.y + 10 } };
    expect(directoryZoomDestination(input)).toBe("core");
    expect(directoryZoomDestination({ ...input, viewport: { ...input.viewport, zoom: 1.1 } })).toBeNull();
    expect(directoryZoomDestination({ ...input, point: nodes[2]!.position })).toBeNull();
    expect(directoryZoomDestination({ ...input, nodes: nodes.map((item) => ({ ...item, data: { ...item.data, unavailable: true } })) })).toBeNull();
  });
});
