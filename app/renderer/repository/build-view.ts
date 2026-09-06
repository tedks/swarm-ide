import type { BuildLinkSnapshot } from "./layers";

export const BUILD_VIEW_LIMIT = 80;
export const BUILD_PATTERN_LIMIT = 8;
export function buildTargets(snapshot: BuildLinkSnapshot): string[] {
  return [...new Set(snapshot.links.flatMap((link) => [
    ...(link.from.slice(2).split(":")[0] === link.fromPath ? [link.from] : []),
    ...(link.to.slice(2).split(":")[0] === link.toPath ? [link.to] : []),
  ]))].sort();
}

/** Local pattern matching over captured rule targets, not a shell/Bazel query. */
export function matchBuildTargets(input: string, targets: readonly string[]): string[] {
  const pattern = input.trim();
  if (targets.includes(pattern)) return [pattern];
  const parsed = /^\/\/(.*?)(?::(all|\*))?$/.exec(pattern);
  if (!parsed) return [];
  const path = parsed[1]!;
  const recursive = path === "..." || path.endsWith("/...");
  if (!recursive && !parsed[2]) return [];
  const prefix = recursive ? path === "..." ? "" : path.slice(0, -4) : path;
  if (recursive && path !== "..." && !prefix) return [];
  if (prefix && prefix.split("/").some((part) => !part || [".", "..", "..."].includes(part) || /[\\:*\s]/.test(part))) return [];
  return targets.filter((label) => {
    if (!label.startsWith("//")) return false;
    const pkg = label.slice(2).split(":")[0]!;
    return recursive ? !prefix || pkg === prefix || pkg.startsWith(`${prefix}/`) : pkg === prefix;
  });
}

/** Bounded display traversal of a capture; never evaluates or builds targets. */
export function selectBuildView(snapshot: BuildLinkSnapshot, roots: string[], transitive: boolean) {
  const allTargets = buildTargets(snapshot), targets = new Set(allTargets);
  const links = snapshot.links.filter((link) => targets.has(link.from) && targets.has(link.to));
  const depths = new Map<string, number>();
  let truncated = roots.length > BUILD_PATTERN_LIMIT;
  for (const pattern of roots.slice(0, BUILD_PATTERN_LIMIT)) {
    for (const root of matchBuildTargets(pattern, allTargets)) {
      if (depths.has(root)) continue;
      if (depths.size >= BUILD_VIEW_LIMIT) { truncated = true; continue; }
      depths.set(root, 0);
    }
  }
  const queue = [...depths.keys()];
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

/** Broad patterns must not produce one unreadably tall column. */
export function layoutBuildTargets(depths: ReadonlyMap<string, number>) {
  const positions = new Map<string, { x: number; y: number }>();
  const bands = new Map<number, string[]>();
  for (const [label, depth] of depths) bands.set(depth, [...(bands.get(depth) ?? []), label]);
  let x = 0;
  for (const [, labels] of [...bands].sort(([a], [b]) => a - b)) {
    labels.forEach((label, index) => positions.set(label, { x: x + Math.floor(index / 8) * 245, y: index % 8 * 110 }));
    x += Math.ceil(labels.length / 8) * 245;
  }
  return positions;
}
