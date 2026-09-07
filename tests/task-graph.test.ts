import { describe, expect, it } from "vitest";
import { dependencyPositions, graphSummaries, loadTaskGraphDetails, projectTaskGraph, TASK_GRAPH_LIMITS } from "../app/renderer/tasks/graph";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
import type { TaskDetail, TaskSnapshot, TaskSummary } from "../protocol/tasks";

function data(count = 5): { snapshot: TaskSnapshot; details: Map<string, TaskDetail> } {
  const snapshot = taskObservationFixture().snapshot!;
  const details = new Map<string, TaskDetail>();
  snapshot.summaries = Array.from({ length: count }, (_, i) => {
    const detail = { ...taskDetailFixture(), id: `task-${i}`, title: `Task ${i}`, counts: { blocks: 0, blockedBy: 0, fileRefs: 0 }, blocks: [], blockedBy: [], fileRefs: [] };
    details.set(detail.id, detail);
    const { description: _description, disposition: _disposition, blocks: _blocks, blockedBy: _blockedBy, fileRefs: _fileRefs, ...summary } = detail;
    return summary;
  });
  return { snapshot, details };
}
const drain = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

describe("bounded task blockage projection", () => {
  it("preserves isolated tasks and a directed fork/join without conflating containment", () => {
    const { snapshot, details } = data();
    for (const [source, target] of [[0, 1], [0, 2], [1, 3], [2, 3]]) {
      details.get(`task-${source}`)!.blocks.push({ taskId: `task-${target}`, status: "unstarted", diagnostics: [] });
      details.get(`task-${target}`)!.blockedBy.push({ taskId: `task-${source}`, status: "unstarted", diagnostics: [] });
    }
    const graph = projectTaskGraph(snapshot, details, 5);
    expect(graph.nodes).toHaveLength(5); expect(graph.edges).toHaveLength(4);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(["task-0->task-1", "task-0->task-2", "task-1->task-3", "task-2->task-3"]);
    expect(graph.nodes.find((node) => node.id === "task-4")).toMatchObject({ detailLoaded: true, missing: false });
    const positions = dependencyPositions(graph.nodes.map((node) => node.id), graph.edges);
    expect(positions.get("task-0")!.x).toBeLessThan(positions.get("task-1")!.x);
    expect(positions.get("task-1")!.x).toBe(positions.get("task-2")!.x);
    expect(positions.get("task-3")!.x).toBeGreaterThan(positions.get("task-2")!.x);
  });
  it("keeps partial, missing, cyclic and asymmetric declarations visible", () => {
    const { snapshot, details } = data(3);
    details.get("task-0")!.blocks = [{ taskId: "missing", status: null, diagnostics: ["missing", "asymmetric"] },
      { taskId: "task-1", status: "unstarted", diagnostics: ["cyclic"] }];
    details.get("task-1")!.blocks = [{ taskId: "task-0", status: "unstarted", diagnostics: ["cyclic"] }];
    details.delete("task-2");
    const graph = projectTaskGraph(snapshot, details, 3);
    expect(graph).toMatchObject({ loaded: 2, total: 3, unread: 1 });
    expect(graph.nodes.find((node) => node.id === "missing")).toMatchObject({ missing: true, detailLoaded: false });
    expect(graph.edges[0]!.diagnostics).toEqual(["missing", "asymmetric"]);
    expect(graph.edges.filter((edge) => edge.diagnostics.includes("cyclic"))).toHaveLength(2);
    expect(dependencyPositions(graph.nodes.map((node) => node.id), graph.edges).size).toBe(4);
  });
  it("caps selected details and orders open tasks before closed tasks", () => {
    const { snapshot } = data(256);
    snapshot.summaries[0]!.status = "closed";
    const summaries = graphSummaries(snapshot);
    expect(summaries).toHaveLength(TASK_GRAPH_LIMITS.details);
    expect(summaries.some((row) => row.id === "task-0")).toBe(false);
    expect(projectTaskGraph(snapshot, new Map(), 0)).toMatchObject({ loaded: 0, unread: 256, total: 256 });
  });
  it("caps endpoint expansion independently of all valid per-task declaration limits", () => {
    const { snapshot, details } = data(64);
    for (const [id, detail] of details) detail.blocks = Array.from({ length: 32 }, (_, i) => ({ taskId: `${id}-missing-${i}`, status: null, diagnostics: ["missing"] }));
    const graph = projectTaskGraph(snapshot, details, 64);
    expect(graph.nodes.length).toBeLessThanOrEqual(64 + TASK_GRAPH_LIMITS.endpoints);
    expect(graph.edges.length).toBeLessThanOrEqual(TASK_GRAPH_LIMITS.edges);
    expect(graph.omittedEndpoints).toBeGreaterThan(0);
  });
  it("limits in-flight work to four and never reads past cancellation", async () => {
    const { snapshot } = data(100); const controller = new AbortController();
    const calls: string[] = [], release: ((detail: TaskDetail | null) => void)[] = [];
    const progress: number[] = [];
    const promise = loadTaskGraphDetails(snapshot, (id) => { calls.push(id); return new Promise((resolve) => release.push(resolve)); }, controller.signal,
      (_details, attempted) => progress.push(attempted));
    expect(calls).toHaveLength(4);
    release[0]!(null); await drain(); expect(calls).toHaveLength(5);
    controller.abort(); release.slice(1).forEach((resolve) => resolve(null));
    await promise; expect(calls).toHaveLength(5); expect(progress).toEqual([1]);
  });
  it("attempts at most 64 reads and accounts for failures without manufacturing empty detail", async () => {
    const { snapshot, details } = data(100); let count = 0, last: ReadonlyMap<string, TaskDetail> = new Map(), attempted = 0;
    await loadTaskGraphDetails(snapshot, async (id) => { count++; return count % 2 ? details.get(id)! : null; }, new AbortController().signal,
      (result, read) => { last = result; attempted = read; });
    expect(count).toBe(64); expect(attempted).toBe(64); expect(last.size).toBe(32);
    expect(projectTaskGraph(snapshot, last, attempted).unread).toBe(68);
  });
});
