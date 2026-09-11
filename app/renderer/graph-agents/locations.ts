import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../../../protocol/external-agents";
import type { AgentExecutionState } from "../../../protocol/agent-lifecycle";
import type { BuildLinkSnapshot } from "../repository/layers";
import { buildTargets } from "../repository/build-view";
import type { ServiceDeclarations } from "../../../protocol/service-declarations";
import type { PlanIndex } from "../../../protocol/plans";
import type { WorkspaceDescriptor } from "../../../protocol/workspace";
import { isTaskSourcePath, type TaskDetail, type TaskSnapshot } from "../../../protocol/tasks";

export interface GraphAgent {
  id: string; label: string; path: string | null; at: string | null; action: string | null;
  latestAction: string; state: AgentExecutionState; retained: boolean;
  worktree: string; branch?: string; task?: string;
}
export interface AgentNodeLocation {
  id: string; paths: readonly string[]; tasks?: readonly string[]; directory?: boolean;
}

const absolute = (path: string) => path.startsWith("/") && path !== "/" &&
  !/[\\\u0000-\u001f]/.test(path) && path.slice(1).split("/").every((part) => part && part !== "." && part !== "..");

/** Resolve typed event locations only. No command/prose parsing, filesystem
 * probing, basename matching or crossing the registered canonical root. */
export function graphEventPath(root: string, entry: Pick<ExternalEntry, "path" | "cwd">): string | null {
  if (!absolute(root) || !entry.path || /[\\\u0000-\u001f]/.test(entry.path)) return null;
  const base = entry.cwd ?? root;
  if (!absolute(base) || !(base === root || base.startsWith(`${root}/`))) return null;
  const path = entry.path.startsWith("/") ? entry.path : `${base}/${entry.path}`;
  // Refuse dot segments rather than accidentally relabeling symlink traversal.
  if (!absolute(path) || !path.startsWith(`${root}/`)) return null;
  return path.slice(root.length + 1);
}

/** A file is the last observed location, not a claim that the current turn is
 * editing it. Registry identity is authoritative even while a detail is held. */
export function observedGraphAgents({ selection, sessions, fleet, detail, retained = false }: {
  selection?: Pick<WorkspaceDescriptor, "root" | "projectId" | "agentVisibility">; sessions: readonly ExternalAgentSummary[]; fleet: readonly ExternalDetail[];
  detail?: ExternalDetail | null; retained?: boolean;
}): GraphAgent[] {
  if (!selection || !absolute(selection.root)) return [];
  const observations = new Map<string, ExternalDetail>();
  for (const value of [...fleet, ...(detail ? [detail] : [])]) {
    const previous = observations.get(value.session.id);
    if (!previous || Date.parse(value.session.observedAt) >= Date.parse(previous.session.observedAt)) observations.set(value.session.id, value);
  }
  const result: GraphAgent[] = [];
  for (const row of sessions) {
    const value = observations.get(row.id);
    if (row.evidence !== "local" || !row.worktree || !absolute(row.worktree)) continue;
    const exactWorktree = row.worktree === selection.root;
    const eligible = exactWorktree || selection.agentVisibility === "project" &&
      Boolean(selection.projectId && row.projectId === selection.projectId);
    if (!eligible) continue;
    const matchingDetail = value?.session.evidence === "local" && value.session.worktree === row.worktree &&
      (exactWorktree || selection.agentVisibility !== "project" || value.session.projectId === selection.projectId) ? value : undefined;
    const event = matchingDetail && [...matchingDetail.entries].reverse().find((entry) => entry.path && entry.attribution === "recorded-tool-event");
    const path = event ? graphEventPath(row.worktree, event) : null;
    const newest = matchingDetail && Date.parse(row.observedAt) <= Date.parse(matchingDetail.session.observedAt) ? matchingDetail.session : row;
    const stale = retained || row.status !== "observed" || matchingDetail?.session.status === "unavailable";
    result.push({ id: row.id, label: row.label, path, at: event?.at ?? null, action: event?.text ?? null,
      latestAction: matchingDetail?.entries.at(-1)?.text ?? row.message,
      state: newest.lifecycle?.state ?? "unknown", retained: stale, worktree: row.worktree,
      ...(row.branch ? { branch: row.branch } : {}), ...(row.task ? { task: row.task } : {}) });
  }
  return result;
}

/** One nearest visible directory/file; explicit domain memberships may show the
 * same agent on several nodes. Never synthesize graph edges or movement. */
export function placeGraphAgents(agents: readonly GraphAgent[], locations: readonly AgentNodeLocation[], nearest = false) {
  const placed = new Map<string, GraphAgent[]>();
  for (const agent of agents) {
    const matches = locations.map((location) => ({ location, specificity: Math.max(-1, ...location.paths.map((path) =>
      path === agent.path || agent.path !== null && location.directory && (path === "" || agent.path.startsWith(`${path}/`)) ? path.length : -1),
      agent.task && location.tasks?.includes(agent.task) ? Number.MAX_SAFE_INTEGER : -1) }))
      .filter((match) => match.specificity >= 0).sort((a, b) => b.specificity - a.specificity || a.location.id.localeCompare(b.location.id));
    for (const { location } of nearest ? matches.slice(0, 1) : matches) {
      const list = placed.get(location.id) ?? []; list.push(agent); placed.set(location.id, list);
    }
  }
  return placed;
}

export function buildAgentLocations(capture?: BuildLinkSnapshot): AgentNodeLocation[] {
  if (!capture) return [];
  const rules = new Set(buildTargets(capture));
  const targets = new Map<string, string[]>();
  for (const link of capture.links) if (rules.has(link.from) && !rules.has(link.to)) {
    const paths = targets.get(link.from) ?? []; paths.push(link.toPath); targets.set(link.from, paths);
  }
  return [...targets].map(([id, paths]) => ({ id, paths }));
}

export function serviceAgentLocations(declarations?: ServiceDeclarations): AgentNodeLocation[] {
  return declarations?.services.flatMap((service) => [
    { id: service.id, paths: [service.declarationPath, ...service.implementationPaths] },
    ...service.interfaces.map((item) => ({ id: item.id, paths: [item.path] })),
  ]) ?? [];
}

export function componentAgentLocations(index: PlanIndex, visibleIds?: ReadonlySet<string>): AgentNodeLocation[] {
  return index.nodes.filter((node) => !visibleIds || visibleIds.has(node.id))
    .map((node) => ({ id: node.id, paths: [...node.sourcePaths, ...node.docs], tasks: node.taskIds }));
}

/** Current task nodes accept only their exact typed task identity and canonical
 * file references from the pinned snapshot/detail projection. */
export function taskAgentLocations(snapshot: TaskSnapshot | undefined, details: ReadonlyMap<string, TaskDetail>, visibleIds: ReadonlySet<string>): AgentNodeLocation[] {
  if (!snapshot) return [];
  const paths = new Map<string, Set<string>>();
  const add = (id: string, path: string) => {
    const values = paths.get(id) ?? new Set<string>(); values.add(path); paths.set(id, values);
  };
  if (snapshot.backlinks?.status === "complete") for (const entry of snapshot.backlinks.entries) {
    if (entry.navigation === "candidate" && isTaskSourcePath(entry.path)) add(entry.taskId, entry.path);
  }
  for (const [id, detail] of details) for (const ref of detail.fileRefs) {
    if (ref.navigation === "candidate" && isTaskSourcePath(ref.path)) add(id, ref.path);
  }
  const known = new Set(snapshot.summaries.map((row) => row.id));
  return [...visibleIds].filter((id) => known.has(id)).map((id) => ({ id, paths: [...(paths.get(id) ?? [])], tasks: [id] }));
}
