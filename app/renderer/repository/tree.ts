import type { RepositoryEntry, RepositoryObservation } from "../../../protocol/repository";
import { repositoryBreadcrumbs } from "./navigation";

export const TREE_CACHE_LIMIT = 32;
export const TREE_ROW_LIMIT = 1_000;
export type DirectoryCache = ReadonlyMap<string, RepositoryObservation>;

/** Dated display observations only: opening still goes through the file broker. */
export function retainDirectory(cache: DirectoryCache, observation: RepositoryObservation): DirectoryCache {
  if (observation.state === "loading") return cache;
  const next = new Map(cache);
  next.delete(observation.directory);
  next.set(observation.directory, observation);
  for (const directory of next.keys()) {
    if (next.size <= TREE_CACHE_LIMIT) break;
    if (directory !== "" && directory !== observation.directory) next.delete(directory);
  }
  return next;
}

export interface TreeRow {
  key: string;
  parent: string | null;
  depth: number;
  entry: RepositoryEntry;
  expanded: boolean;
  observation?: RepositoryObservation;
  recipe?: boolean;
}
export function directoryRecipe(path: string, label: string): RepositoryEntry {
  return { id: `directory-recipe:${path}`, path, label, kind: "directory", git: "unknown", actionable: true };
}

/** Flatten only expanded, already observed branches. No recursive filesystem scan. */
export function repositoryTree(cache: DirectoryCache, active: RepositoryObservation, expanded: ReadonlySet<string>, rootLabel: string): { rows: TreeRow[]; truncated: boolean } {
  const observations = new Map(cache);
  if (active.state !== "loading" || !observations.has(active.directory)) observations.set(active.directory, active);
  const ancestors = repositoryBreadcrumbs(active.directory);
  const recipes = new Map<string, RepositoryEntry>();
  // Deep exact paths remain bounded recipes, not thousands of DOM levels.
  for (let index = 1; index < Math.min(ancestors.length, 33); index++) {
    const ancestor = index === 32 ? ancestors.at(-1)! : ancestors[index]!;
    recipes.set(ancestors[index - 1]!.path, directoryRecipe(ancestor.path, index === 32 ? `…/${ancestor.label}` : ancestor.label));
  }
  const rows: TreeRow[] = [];
  const stack: Array<{ entry: RepositoryEntry; parent: string | null; depth: number; recipe?: boolean }> = [
    { entry: directoryRecipe("", rootLabel), parent: null, depth: 0, recipe: true },
  ];
  while (stack.length && rows.length < TREE_ROW_LIMIT) {
    const item = stack.pop()!;
    const directory = item.entry.kind === "directory" && item.entry.path !== null;
    const open = directory && expanded.has(item.entry.path!);
    const observed = directory ? observations.get(item.entry.path!) : undefined;
    rows.push({ ...item, key: item.entry.path ?? item.entry.id, expanded: open, observation: observed });
    if (!open) continue;
    const children = [...(observed?.entries ?? [])];
    const recipe = recipes.get(item.entry.path!);
    if (recipe && !children.some((child) => child.path === recipe.path)) children.unshift(recipe);
    for (let index = children.length - 1; index >= 0; index--) {
      const entry = children[index]!;
      stack.push({ entry, parent: item.entry.path!, depth: item.depth + 1, recipe: entry === recipe });
    }
  }
  return { rows, truncated: stack.length > 0 };
}
