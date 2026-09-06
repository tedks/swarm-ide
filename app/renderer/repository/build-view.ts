import type { BuildLinkSnapshot } from "./layers";

export const BUILD_VIEW_LIMIT = 80;
export function buildTargets(snapshot: BuildLinkSnapshot): string[] {
  return [...new Set(snapshot.links.flatMap((link) => [
    ...(link.from.slice(2).split(":")[0] === link.fromPath ? [link.from] : []),
    ...(link.to.slice(2).split(":")[0] === link.toPath ? [link.to] : []),
  ]))].sort();
}

/** Bounded display traversal of a capture; never evaluates or builds targets. */
export function selectBuildView(snapshot: BuildLinkSnapshot, roots: string[], transitive: boolean) {
  const targets = new Set(buildTargets(snapshot));
  const links = snapshot.links.filter((link) => targets.has(link.from) && targets.has(link.to));
  const depths = new Map<string, number>();
  for (const root of roots.slice(0, 8)) if (targets.has(root)) depths.set(root, 0);
  const queue = [...depths.keys()]; let truncated = false;
  for (let index = 0; index < queue.length; index++) {
    const from = queue[index]!, depth = depths.get(from)!;
    if (!transitive && depth >= 1) continue;
    for (const link of links.filter((item) => item.from === from)) {
      if (depths.has(link.to)) continue;
      if (depths.size >= BUILD_VIEW_LIMIT) { truncated = true; continue; }
      depths.set(link.to, depth + 1); queue.push(link.to);
    }
  }
  return { depths, truncated, links: links.filter((link) => depths.has(link.from) && depths.has(link.to)) };
}
