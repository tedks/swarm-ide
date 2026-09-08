import type { TaskDetail, TaskSnapshot, TaskSummary } from "../../../protocol/tasks";

/** Limit concurrent work, not graph completeness. This never authorizes work. */
export const TASK_GRAPH_LIMITS = { concurrency: 4 } as const;
export interface TaskGraphEdge { id: string; source: string; target: string; diagnostics: string[] }
export interface TaskGraphNode { id: string; title: string; status: string; detailLoaded: boolean; missing: boolean }
export interface TaskGraphProjection {
  nodes: TaskGraphNode[]; edges: TaskGraphEdge[]; loaded: number; attempted: number; total: number;
  unread: number;
}

/** Scope changes presentation only; unread coverage remains on the full
 * projection. A missing anchor is not replaced by a different task. */
export function scopeTaskGraph(graph: TaskGraphProjection, anchor: string | null, whole: boolean) {
  if (whole || anchor === null) return { nodes: graph.nodes, edges: graph.edges, hidden: 0 };
  const ids = new Set([anchor]);
  for (const edge of graph.edges) {
    if (edge.source === anchor) ids.add(edge.target);
    if (edge.target === anchor) ids.add(edge.source);
  }
  const nodes = graph.nodes.filter((node) => ids.has(node.id));
  const visible = new Set(nodes.map((node) => node.id));
  return { nodes, edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)), hidden: graph.nodes.length - nodes.length };
}
export function graphSummaries(snapshot: TaskSnapshot): TaskSummary[] {
  return [...snapshot.summaries].sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export async function loadTaskGraphDetails(snapshot: TaskSnapshot,
  read: (id: string, signal: AbortSignal) => Promise<TaskDetail | null>, signal: AbortSignal,
  progress: (details: ReadonlyMap<string, TaskDetail>, attempted: number) => void): Promise<void> {
  const summaries = graphSummaries(snapshot), details = new Map<string, TaskDetail>();
  let next = 0, attempted = 0, published = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const publish = () => {
    clear();
    if (signal.aborted || published === attempted) return;
    published = attempted;
    progress(new Map(details), attempted);
  };
  // Cache hits may settle together. Copy and publish at most ten times a second,
  // plus final completion, instead of reprojecting/layouting after every detail.
  signal.addEventListener("abort", clear, { once: true });
  try { await Promise.all(Array.from({ length: Math.min(TASK_GRAPH_LIMITS.concurrency, summaries.length) }, async () => {
    while (!signal.aborted && next < summaries.length) {
      const row = summaries[next++]!;
      let detail: TaskDetail | null = null;
      try { detail = await read(row.id, signal); } catch { /* Unavailable detail is coverage, not fabricated emptiness. */ }
      if (signal.aborted) return;
      if (detail?.id === row.id) details.set(row.id, detail);
      attempted++;
      if (timer === undefined) timer = setTimeout(publish, 100);
    }
  })); publish(); }
  finally { clear(); signal.removeEventListener("abort", clear); }
}

export function projectTaskGraph(snapshot: TaskSnapshot, details: ReadonlyMap<string, TaskDetail>, attempted: number): TaskGraphProjection {
  const summaries = new Map(snapshot.summaries.map((row) => [row.id, row]));
  const nodes = new Map<string, TaskGraphNode>();
  const add = (id: string) => {
    if (nodes.has(id)) return;
    const row = summaries.get(id);
    nodes.set(id, { id, title: row?.title ?? id, status: row?.status ?? "missing endpoint", detailLoaded: details.has(id), missing: !row });
  };
  const ordered = graphSummaries(snapshot);
  ordered.forEach((row) => add(row.id));
  const edges = new Map<string, TaskGraphEdge>();
  for (const summary of ordered) {
    const detail = details.get(summary.id);
    if (!detail) continue;
    for (const [direction, rows] of [["blocks", detail.blocks], ["blockedBy", detail.blockedBy]] as const) for (const relation of rows) {
      const source = direction === "blocks" ? detail.id : relation.taskId;
      const target = direction === "blocks" ? relation.taskId : detail.id;
      const id = JSON.stringify([source, target]);
      const known = edges.get(id);
      if (known) { known.diagnostics = [...new Set([...known.diagnostics, ...relation.diagnostics])]; continue; }
      add(relation.taskId);
      const diagnostics: string[] = [...relation.diagnostics];
      if (!details.has(relation.taskId) && summaries.has(relation.taskId)) diagnostics.push("endpoint detail unread");
      edges.set(id, { id, source, target, diagnostics });
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], loaded: details.size, attempted, total: snapshot.summaries.length,
    unread: Math.max(0, snapshot.summaries.length - details.size) };
}

/** Stable breadth layers; remaining cyclic nodes share a visibly labelled graph
 * layer instead of pretending the supplied relation is acyclic. */
export function dependencyPositions(ids: string[], edges: { source: string; target: string }[]): Map<string, { x: number; y: number }> {
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) if (incoming.has(edge.source) && incoming.has(edge.target)) {
    incoming.set(edge.target, incoming.get(edge.target)! + 1); outgoing.get(edge.source)!.push(edge.target);
  }
  const depth = new Map<string, number>(), queue = ids.filter((id) => incoming.get(id) === 0);
  queue.forEach((id) => depth.set(id, 0));
  for (let i = 0; i < queue.length; i++) for (const target of outgoing.get(queue[i]!)!) {
    depth.set(target, Math.max(depth.get(target) ?? 0, depth.get(queue[i]!)! + 1));
    incoming.set(target, incoming.get(target)! - 1);
    if (incoming.get(target) === 0) queue.push(target);
  }
  const cycleLayer = Math.max(0, ...depth.values()) + 1, rows = new Map<number, number>();
  return new Map(ids.map((id) => {
    const column = incoming.get(id)! > 0 ? cycleLayer : depth.get(id) ?? 0;
    const row = rows.get(column) ?? 0; rows.set(column, row + 1);
    return [id, { x: column * 260, y: row * 104 }];
  }));
}

/** Pack independent dependency components into shelves instead of one enormous
 * column of isolated tasks. Edges inside each component retain their layers. */
export function compactTaskPositions(ids: string[], edges: { source: string; target: string }[]) {
  const neighbors = new Map(ids.map((id) => [id, new Set<string>()]));
  const outgoing = new Map(ids.map((id) => [id, [] as typeof edges]));
  for (const edge of edges) if (neighbors.has(edge.source) && neighbors.has(edge.target)) {
    neighbors.get(edge.source)!.add(edge.target); neighbors.get(edge.target)!.add(edge.source);
    outgoing.get(edge.source)!.push(edge);
  }
  const visited = new Set<string>(), positions = new Map<string, { x: number; y: number }>();
  let x = 0, y = 0, shelf = 0;
  for (const root of ids) {
    if (visited.has(root)) continue;
    const component: string[] = [], pending = [root];
    while (pending.length) {
      const id = pending.pop()!; if (visited.has(id)) continue;
      visited.add(id); component.push(id); pending.push(...neighbors.get(id)!);
    }
    const componentEdges = component.flatMap((id) => outgoing.get(id)!);
    const layout = new Map([...dependencyPositions(component, componentEdges)].map(([id, point]) =>
      [id, { x: point.y / 104 * 260, y: point.x / 260 * 88 }]));
    const width = Math.max(...[...layout.values()].map((point) => point.x)) + 260;
    const height = Math.max(...[...layout.values()].map((point) => point.y)) + 104;
    if (x && x + width > 1040) { x = 0; y += shelf; shelf = 0; }
    for (const [id, point] of layout) positions.set(id, { x: x + point.x, y: y + point.y });
    x += width; shelf = Math.max(shelf, height);
  }
  return positions;
}
