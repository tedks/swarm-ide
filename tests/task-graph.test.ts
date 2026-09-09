import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_TASK_STATUSES, TASK_GRAPH_STATUSES, dependencyPositions, filterTaskGraph, graphSummaries, loadTaskGraphDetails, parseTaskGraphStatuses, projectTaskGraph, scopeTaskGraph } from "../app/renderer/tasks/graph";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
import { TaskDetailSchema, TaskSnapshotSchema, type TaskDetail, type TaskSnapshot } from "../protocol/tasks";

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
afterEach(() => { vi.useRealTimers(); });
function validate(snapshot: TaskSnapshot, details: Map<string, TaskDetail>) {
  for (const summary of snapshot.summaries) {
    const detail = details.get(summary.id);
    if (!detail) continue;
    detail.counts = { blocks: detail.blocks.length, blockedBy: detail.blockedBy.length, fileRefs: detail.fileRefs.length };
    summary.counts = detail.counts;
    TaskDetailSchema.parse(detail);
  }
  TaskSnapshotSchema.parse(snapshot);
}

describe("complete task blockage projection", () => {
  it("filters statuses without shortcut edges or changing underlying coverage and diagnostics", () => {
    const { snapshot, details } = data(5);
    snapshot.summaries[1]!.status = "closed";
    snapshot.summaries[2]!.status = "paused";
    snapshot.summaries[3]!.status = "in_progress";
    details.get("task-0")!.blocks = [{ taskId: "task-1", status: "closed", diagnostics: [] },
      { taskId: "missing-active", status: null, diagnostics: ["missing", "asymmetric"] }];
    details.get("task-1")!.blocks = [{ taskId: "task-2", status: "paused", diagnostics: [] },
      { taskId: "missing-closed", status: null, diagnostics: ["missing"] }];
    details.delete("task-4");
    const graph = projectTaskGraph(snapshot, details, 5), original = structuredClone(graph);
    const filtered = filterTaskGraph(graph, ACTIVE_TASK_STATUSES);
    expect(filtered.nodes.map((node) => node.id)).toEqual(["task-0", "task-2", "task-3", "task-4", "missing-active"]);
    expect(filtered.edges.map((edge) => [edge.source, edge.target])).toEqual([["task-0", "missing-active"]]);
    expect(filtered.edges[0]!.diagnostics).toEqual(["missing", "asymmetric"]);
    expect(filtered).toMatchObject({ total: 5, loaded: 4, attempted: 5, unread: 1, hiddenTasks: 1 });
    expect(graph).toEqual(original);
    expect(filterTaskGraph(graph, TASK_GRAPH_STATUSES)).toMatchObject(graph);
    expect(filterTaskGraph(graph, [])).toMatchObject({ nodes: [], edges: [], hiddenTasks: 5, unread: 1 });
    const focused = scopeTaskGraph(filtered, "task-0", false);
    expect(focused.nodes.map((node) => node.id)).toEqual(["task-0", "missing-active"]);
    expect(focused.hidden).toBe(3);
  });
  it("validates persisted status choices, including deliberate empty selection", () => {
    for (const invalid of [null, "{", "null", "{}", '["unknown"]', '["closed","closed"]', '[1]', '["__proto__"]'])
      expect(parseTaskGraphStatuses(invalid)).toEqual(ACTIVE_TASK_STATUSES);
    expect(parseTaskGraphStatuses('["closed","unstarted"]')).toEqual(["unstarted", "closed"]);
    expect(parseTaskGraphStatuses("[]")).toEqual([]);
  });
  it("preserves isolated tasks and a directed fork/join without conflating containment", () => {
    const { snapshot, details } = data();
    for (const [source, target] of [[0, 1], [0, 2], [1, 3], [2, 3]]) {
      details.get(`task-${source}`)!.blocks.push({ taskId: `task-${target}`, status: "unstarted", diagnostics: [] });
      details.get(`task-${target}`)!.blockedBy.push({ taskId: `task-${source}`, status: "unstarted", diagnostics: [] });
    }
    validate(snapshot, details);
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
    validate(snapshot, details);
    const graph = projectTaskGraph(snapshot, details, 3);
    expect(graph).toMatchObject({ loaded: 2, total: 3, unread: 1 });
    expect(graph.nodes.find((node) => node.id === "missing")).toMatchObject({ missing: true, detailLoaded: false });
    expect(graph.edges[0]!.diagnostics).toEqual(["missing", "asymmetric"]);
    expect(graph.edges.filter((edge) => edge.diagnostics.includes("cyclic"))).toHaveLength(2);
    expect(dependencyPositions(graph.nodes.map((node) => node.id), graph.edges).size).toBe(4);
  });
  it("includes every task while ordering open tasks before closed tasks", () => {
    const { snapshot, details } = data(256);
    validate(snapshot, details);
    snapshot.summaries[0]!.status = "closed";
    const summaries = graphSummaries(snapshot);
    expect(summaries).toHaveLength(256);
    expect(summaries.at(-1)!.id).toBe("task-0");
    expect(projectTaskGraph(snapshot, new Map(), 0)).toMatchObject({ loaded: 0, unread: 256, total: 256 });
  });
  it("retains 100 tasks, 800 distinct edges and 800 missing endpoints from valid detail", () => {
    const { snapshot, details } = data(100);
    for (const [id, detail] of details) detail.blocks = Array.from({ length: 8 }, (_, i) => ({ taskId: `${id}-missing-${i}`, status: null, diagnostics: ["missing"] }));
    validate(snapshot, details);
    const graph = projectTaskGraph(snapshot, details, 100);
    expect(graph.nodes).toHaveLength(900);
    expect(graph.edges).toHaveLength(800);
    expect(graph.nodes.filter((row) => row.missing)).toHaveLength(800);
    expect(graph).toMatchObject({ loaded: 100, unread: 0, total: 100 });
    expect(scopeTaskGraph(graph, null, false)).toMatchObject({ nodes: graph.nodes, edges: graph.edges, hidden: 0 });
  });
  it("keeps all 64 direct neighbors and reciprocal diagnostics without truncating focused scope", () => {
    const { snapshot, details } = data(67), center = details.get("task-0")!;
    for (let i = 1; i <= 64; i++) {
      const neighbor = details.get(`task-${i}`)!;
      const [from, to] = i <= 32 ? [center, neighbor] : [neighbor, center];
      from.blocks.push({ taskId: to.id, status: "unstarted", diagnostics: ["asymmetric"] });
      to.blockedBy.push({ taskId: from.id, status: "unstarted", diagnostics: [] });
    }
    validate(snapshot, details);
    const graph = projectTaskGraph(snapshot, details, 67), focused = scopeTaskGraph(graph, center.id, false);
    expect(graph.nodes).toHaveLength(67); expect(graph.edges).toHaveLength(64);
    expect(focused.nodes).toHaveLength(65); expect(focused.hidden).toBe(2);
    expect(focused.edges).toHaveLength(64);
    expect(focused.edges.every((edge) => edge.diagnostics.includes("asymmetric"))).toBe(true);
  });
  it("limits in-flight work to four and never reads past cancellation", async () => {
    vi.useFakeTimers();
    const { snapshot } = data(100); const controller = new AbortController();
    const calls: string[] = [], release: ((detail: TaskDetail | null) => void)[] = [];
    const progress: number[] = [];
    const promise = loadTaskGraphDetails(snapshot, (id) => { calls.push(id); return new Promise((resolve) => release.push(resolve)); }, controller.signal,
      (_details, attempted) => progress.push(attempted));
    expect(calls).toHaveLength(4);
    release[0]!(null); await drain(); expect(calls).toHaveLength(5);
    controller.abort(); release.slice(1).forEach((resolve) => resolve(null));
    await promise; await vi.runAllTimersAsync();
    expect(calls).toHaveLength(5); expect(progress).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
  it("attempts every read and accounts for failures without manufacturing empty detail", async () => {
    const { snapshot, details } = data(100); let count = 0, last: ReadonlyMap<string, TaskDetail> = new Map(), attempted = 0;
    await loadTaskGraphDetails(snapshot, async (id) => { count++; return count % 2 ? details.get(id)! : null; }, new AbortController().signal,
      (result, read) => { last = result; attempted = read; });
    expect(count).toBe(100); expect(attempted).toBe(100); expect(last.size).toBe(50);
    expect(projectTaskGraph(snapshot, last, attempted).unread).toBe(50);
  });
  it("coalesces progress, retains immutable publications and flushes the final partial batch", async () => {
    vi.useFakeTimers();
    const { snapshot, details } = data(100);
    const release: (() => void)[] = [], updates: [ReadonlyMap<string, TaskDetail>, number][] = [];
    const loading = loadTaskGraphDetails(snapshot, (id) => new Promise((resolve) => release.push(() => resolve(details.get(id)!))),
      new AbortController().signal, (rows, attempted) => updates.push([rows, attempted]));
    release.splice(0).forEach((done) => done()); await drain();
    release.splice(0).forEach((done) => done()); await drain();
    expect(updates).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(updates.map(([, attempted]) => attempted)).toEqual([8]);
    while (release.length) { release.splice(0).forEach((done) => done()); await drain(); }
    await loading;
    expect(updates.map(([, attempted]) => attempted)).toEqual([8, 100]);
    expect(updates[0]![0].size).toBe(8); expect(updates[1]![0].size).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});
