import { expect, it } from "vitest";
import { compactTaskPositions, dependencyPositions, scopeTaskGraph, type TaskGraphProjection } from "../app/renderer/tasks/graph";
const graph: TaskGraphProjection = {
  nodes: Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: `Task ${i}`, status: "unstarted", detailLoaded: i < 20, missing: false })),
  edges: [{ id: "a", source: "0", target: "1", diagnostics: [] }, { id: "b", source: "1", target: "2", diagnostics: ["cyclic"] }, { id: "c", source: "2", target: "1", diagnostics: ["cyclic"] }],
  total: 50, unread: 30, loaded: 20, attempted: 20, omittedEdges: 0, omittedEndpoints: 0,
};
it("bounds the default view without claiming unread or hidden tasks absent", () => {
  const scope = scopeTaskGraph(graph, null, false);
  expect(scope.nodes).toHaveLength(16); expect(scope.hidden).toBe(24);
  expect(graph.nodes).toHaveLength(40); expect(graph.unread).toBe(30);
});
it("shows direct blocker and blocked neighbors with cycles and edge direction intact", () => {
  const scope = scopeTaskGraph(graph, "1", false);
  expect(scope.nodes.map((node) => node.id)).toEqual(["0", "1", "2"]);
  expect(scope.edges).toEqual(graph.edges); expect(scope.hidden).toBe(37);
});
it("whole projection preserves all recorded nodes and edges; missing anchor is explicit", () => {
  expect(scopeTaskGraph(graph, "1", true).nodes).toEqual(graph.nodes);
  expect(scopeTaskGraph(graph, "not-read", false)).toMatchObject({ nodes: [], edges: [], hidden: 40 });
});
it("packs isolated tasks without modifying the Plan default or the directed graph", () => {
  const ids = Array.from({ length: 16 }, (_, i) => String(i));
  const compact = compactTaskPositions(ids, []);
  expect(Math.max(...[...compact.values()].map((point) => point.y))).toBe(312);
  expect(new Set([...compact.values()].map((point) => `${point.x}:${point.y}`)).size).toBe(16);
  expect(dependencyPositions(ids, []).get("15")).toEqual({ x: 0, y: 1560 });
  const layered = compactTaskPositions(["a", "b", "independent"], [{ source: "a", target: "b" }]);
  expect(layered.get("b")!.x).toBeGreaterThan(layered.get("a")!.x);
});
