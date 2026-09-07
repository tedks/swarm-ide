import { isRepositoryPath } from "../../../protocol/repository";
import type { BuildLinkSnapshot } from "../repository/layers";
import { buildTargets } from "../repository/build-view";

export interface FileTargets { direct: string[]; indirect: string[] }

/** Index one bounded declaration observation, not a filesystem or build query. */
export function indexCapture(capture: BuildLinkSnapshot | undefined, worldId?: string) {
  const paths = new Map<string, string[]>(), sources = new Map<string, string[]>();
  const incoming = new Map<string, Set<string>>(), cached = new Map<string, FileTargets>();
  const empty = { capture: undefined, worldId, paths, forFile: (_path: string): FileTargets => ({ direct: [], indirect: [] }) };
  if (!capture || capture.links.length > (capture.observation ? 8000 : 4096) ||
      (capture.graphEdges?.length ?? 0) > 8000 || (capture.targets?.length ?? 0) > 2000 ||
      new TextEncoder().encode(JSON.stringify(capture)).byteLength > (capture.observation ? 4 : 1) * 1024 * 1024 ||
      [capture.repositoryId, capture.revision, capture.command].some((item) => !item || item.length > 512) || !Number.isFinite(Date.parse(capture.capturedAt))) return empty;
  const rules = new Set(capture.targets ? capture.targets.filter((target) => target.kind === "rule").map((target) => target.label) : buildTargets(capture));
  const nodes = new Set(capture.targets?.map((target) => target.label));
  for (const target of capture.targets ?? []) {
    if (!target.label || target.label.length > 512 || target.path !== null && !isRepositoryPath(target.path, true)) return empty;
    if (target.kind === "source" && target.path && isRepositoryPath(target.path)) sources.set(target.path, [...(sources.get(target.path) ?? []), target.label]);
  }
  for (const link of capture.links) {
    if ([link.from, link.to].some((label) => !label || label.length > 512) || !isRepositoryPath(link.toPath, true) || !isRepositoryPath(link.fromPath, true)) return empty;
    if (!capture.targets) {
      nodes.add(link.from); nodes.add(link.to);
      if (!rules.has(link.to) && isRepositoryPath(link.toPath)) sources.set(link.toPath, [...new Set([...(sources.get(link.toPath) ?? []), link.to])]);
    }
  }
  for (const link of capture.graphEdges ?? capture.links) {
    if (!nodes.has(link.from) || !nodes.has(link.to)) return empty;
    const parents = incoming.get(link.to) ?? new Set<string>(); parents.add(link.from); incoming.set(link.to, parents);
  }
  for (const [path, labels] of sources) paths.set(path, [...new Set(labels.flatMap((label) => [...(incoming.get(label) ?? [])].filter((parent) => rules.has(parent))))].sort());
  return { capture, worldId, paths, forFile(path: string): FileTargets {
    const prior = cached.get(path); if (prior) return prior;
    const direct = paths.get(path) ?? [], directSet = new Set(direct);
    // Reverse reachability includes generated-output intermediates, never the
    // forward dependencies/siblings of a containing rule. Cycles terminate.
    const visited = new Set(sources.get(path) ?? []), queue = [...visited], indirect = new Set<string>();
    for (let i = 0; i < queue.length; i++) for (const parent of incoming.get(queue[i]!) ?? []) {
      if (visited.has(parent)) continue;
      visited.add(parent); queue.push(parent);
      if (rules.has(parent) && !directSet.has(parent)) indirect.add(parent);
    }
    const result = { direct, indirect: [...indirect].sort() };
    if (cached.size >= 128) cached.delete(cached.keys().next().value!);
    cached.set(path, result); return result;
  } };
}
