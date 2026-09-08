/** Navigation stores places, never commands. The core must validate workspace
 * roots and re-open targets when the caller restores a place. */
export type NavigationTarget =
  | { readonly kind: "file"; readonly path: string; readonly line?: number }
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "component"; readonly id: string }
  | { readonly kind: "task"; readonly id: string }
  | { readonly kind: "agent"; readonly sessionId: string }
  | { readonly kind: "worktree" };

export interface NavigationLocation {
  /** Canonical absolute worktree root, not a repository id or relative path. */
  readonly workspaceRoot: string;
  readonly target: NavigationTarget;
}

export const NAVIGATION_HISTORY_LIMIT = 64;
export interface NavigationHistory {
  readonly entries: readonly NavigationLocation[];
  readonly index: number;
  readonly limit: number;
}

export interface HistoryNavigation {
  readonly origin: NavigationHistory;
  readonly index: number;
  readonly location: NavigationLocation;
}

function snapshot(location: NavigationLocation): NavigationLocation {
  return Object.freeze({ workspaceRoot: location.workspaceRoot, target: Object.freeze({ ...location.target }) });
}

function state(entries: readonly NavigationLocation[], index: number, limit: number): NavigationHistory {
  return Object.freeze({ entries: Object.freeze([...entries]), index, limit });
}

function identity(location: NavigationLocation): string {
  const target = location.target;
  const detail = target.kind === "file" ? [target.path, target.line ?? null]
    : target.kind === "directory" ? [target.path]
      : target.kind === "agent" ? [target.sessionId]
        : target.kind === "worktree" ? [] : [target.id];
  return JSON.stringify([location.workspaceRoot, target.kind, ...detail]);
}

export function createNavigationHistory(initial?: NavigationLocation, limit = NAVIGATION_HISTORY_LIMIT): NavigationHistory {
  if (!Number.isInteger(limit) || limit < 1 || limit > NAVIGATION_HISTORY_LIMIT) throw new RangeError("Navigation history limit must be between 1 and 64.");
  return state(initial ? [snapshot(initial)] : [], initial ? 0 : -1, limit);
}

export function currentNavigation(history: NavigationHistory): NavigationLocation | null {
  return history.entries[history.index] ?? null;
}

/** Call only after a deliberate navigation succeeds, not from observation or
 * snapshot effects. Even reselecting the current place supersedes a pending
 * Back/Forward request, without adding a duplicate entry. */
export function recordNavigation(history: NavigationHistory, location: NavigationLocation): NavigationHistory {
  const current = currentNavigation(history);
  if (current && identity(current) === identity(location)) return state(history.entries, history.index, history.limit);
  const entries = [...history.entries.slice(0, history.index + 1), snapshot(location)].slice(-history.limit);
  return state(entries, entries.length - 1, history.limit);
}

/** Restoring is two-phase: begin does not move the cursor. Failed restoration
 * therefore leaves the current view/history usable. Commit only after the
 * caller's target restoration succeeds; do not record that replay as a visit. */
export function beginHistoryNavigation(history: NavigationHistory, direction: "back" | "forward"): HistoryNavigation | null {
  const index = history.index + (direction === "back" ? -1 : 1);
  const location = history.entries[index];
  return location ? Object.freeze({ origin: history, index, location }) : null;
}

export function commitHistoryNavigation(history: NavigationHistory, navigation: HistoryNavigation): NavigationHistory {
  if (navigation.origin !== history) return history;
  return state(history.entries, navigation.index, history.limit);
}
