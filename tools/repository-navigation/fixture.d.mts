export const NAVIGATION_CASES: readonly string[];
export function createNavigationFixture(parent: string, kind: string, source?: string): Promise<{
  root: string; kind: string; sourceCommit: string | null; committedHead: string;
  sourcePath: string; sourceText: string; directory: string;
  searchPath: string; searchText: string;
}>;
