import type { ExternalAgentSummary, ExternalDetail, ExternalEntry } from "../../../protocol/external-agents";
import type { AgentExecutionState } from "../../../protocol/agent-lifecycle";
import type { BuildLinkSnapshot } from "../repository/layers";
import { buildTargets } from "../repository/build-view";
import type { ServiceDeclarations } from "../../../protocol/service-declarations";
import type { PlanIndex } from "../../../protocol/plans";

export interface GraphAgent {
  id: string; label: string; path: string; at: string; action: string;
  latestAction: string; state: AgentExecutionState; retained: boolean;
}
export interface AgentNodeLocation {
  id: string; paths: readonly string[]; directory?: boolean;
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
export function observedGraphAgents({ root, sessions, fleet, detail, retained = false }: {
  root?: string; sessions: readonly ExternalAgentSummary[]; fleet: readonly ExternalDetail[];
  detail?: ExternalDetail | null; retained?: boolean;
}): GraphAgent[] {
  if (!root || !absolute(root)) return [];
  const observations = new Map<string, ExternalDetail>();
  for (const value of [...fleet, ...(detail ? [detail] : [])]) {
    const previous = observations.get(value.session.id);
    if (!previous || Date.parse(value.session.observedAt) >= Date.parse(previous.session.observedAt)) observations.set(value.session.id, value);
  }
  const result: GraphAgent[] = [];
  for (const row of sessions) {
    const value = observations.get(row.id);
    if (row.evidence !== "local" || row.worktree !== root || !value ||
      value.session.evidence !== "local" || value.session.worktree !== root) continue;
    const event = [...value.entries].reverse().find((entry) => entry.path && entry.attribution === "recorded-tool-event");
    const path = event && graphEventPath(root, event);
    if (!event || !path) continue;
    const newest = Date.parse(row.observedAt) > Date.parse(value.session.observedAt) ? row : value.session;
    const stale = retained || row.status !== "observed" || value.session.status !== "observed";
    result.push({ id: row.id, label: row.label, path, at: event.at, action: event.text,
      latestAction: value.entries.at(-1)?.text ?? event.text,
      state: newest.lifecycle?.state ?? "unknown", retained: stale });
  }
  return result;
}

/** One nearest visible directory/file; explicit domain memberships may show the
 * same agent on several nodes. Never synthesize graph edges or movement. */
export function placeGraphAgents(agents: readonly GraphAgent[], locations: readonly AgentNodeLocation[], nearest = false) {
  const placed = new Map<string, GraphAgent[]>();
  for (const agent of agents) {
    const matches = locations.map((location) => ({ location, specificity: Math.max(-1, ...location.paths.map((path) =>
      path === agent.path || location.directory && (path === "" || agent.path.startsWith(`${path}/`)) ? path.length : -1)) }))
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

export function componentAgentLocations(index: PlanIndex): AgentNodeLocation[] {
  return index.nodes.map((node) => ({ id: node.id, paths: [...node.sourcePaths, ...node.docs] }));
}
