import { describe, expect, it } from "vitest";
import {
  beginHistoryNavigation,
  commitHistoryNavigation,
  createNavigationHistory,
  currentNavigation,
  NAVIGATION_HISTORY_LIMIT,
  recordNavigation,
  type NavigationLocation,
} from "../app/renderer/navigation-history";

const file = (path: string, workspaceRoot = "/repo/master", line?: number): NavigationLocation => ({
  workspaceRoot, target: { kind: "file", path, ...(line === undefined ? {} : { line }) },
});

describe("deliberate navigation history", () => {
  it("starts empty or at a supplied place without inventing a previous visit", () => {
    const empty = createNavigationHistory();
    expect(currentNavigation(empty)).toBeNull();
    expect(beginHistoryNavigation(empty, "back")).toBeNull();
    expect(beginHistoryNavigation(empty, "forward")).toBeNull();
    const initial = createNavigationHistory(file("README.md"));
    expect(currentNavigation(initial)).toEqual(file("README.md"));
    expect(beginHistoryNavigation(initial, "back")).toBeNull();
  });

  it("keeps identical relative file names in different worktrees distinct", () => {
    const first = file("src/main.ts");
    const second = file("src/main.ts", "/repo/agent");
    const history = recordNavigation(createNavigationHistory(first), second);
    expect(history.entries).toEqual([first, second]);
    const back = beginHistoryNavigation(history, "back")!;
    expect(back.location).toEqual(first);
    const restored = commitHistoryNavigation(history, back);
    expect(currentNavigation(restored)).toEqual(first);
    const forward = beginHistoryNavigation(restored, "forward")!;
    expect(forward.location).toEqual(second);
    expect(currentNavigation(commitHistoryNavigation(restored, forward))).toEqual(second);
  });

  it("keeps a failed or pending restoration at its original history position", () => {
    const history = recordNavigation(createNavigationHistory(file("a.ts")), file("b.ts"));
    beginHistoryNavigation(history, "back");
    expect(currentNavigation(history)).toEqual(file("b.ts"));
    expect(history.index).toBe(1);
  });

  it("does not commit a delayed restore after a newer deliberate selection", () => {
    const history = recordNavigation(createNavigationHistory(file("a.ts")), file("b.ts"));
    const pending = beginHistoryNavigation(history, "back")!;
    const newer = recordNavigation(history, file("c.ts"));
    expect(commitHistoryNavigation(newer, pending)).toBe(newer);
    expect(currentNavigation(newer)).toEqual(file("c.ts"));
  });

  it("a deliberate reselect cancels an older restore without duplicating the place", () => {
    const history = recordNavigation(createNavigationHistory(file("a.ts")), file("b.ts"));
    const pending = beginHistoryNavigation(history, "back")!;
    const reselected = recordNavigation(history, file("b.ts"));
    expect(reselected.entries).toEqual(history.entries);
    expect(commitHistoryNavigation(reselected, pending)).toBe(reselected);
  });

  it("commits a replay once without recording extra visits or consuming forward history", () => {
    const history = recordNavigation(createNavigationHistory(file("a.ts")), file("b.ts"));
    const pending = beginHistoryNavigation(history, "back")!;
    const restored = commitHistoryNavigation(history, pending);
    expect(restored.entries).toEqual(history.entries);
    expect(commitHistoryNavigation(restored, pending)).toBe(restored);
    expect(beginHistoryNavigation(restored, "forward")?.location).toEqual(file("b.ts"));
  });

  it("cuts off the old forward branch when a new place is deliberately opened", () => {
    const history = recordNavigation(recordNavigation(createNavigationHistory(file("a.ts")), file("b.ts")), file("c.ts"));
    const back = commitHistoryNavigation(history, beginHistoryNavigation(history, "back")!);
    const branched = recordNavigation(back, file("d.ts"));
    expect(branched.entries).toEqual([file("a.ts"), file("b.ts"), file("d.ts")]);
    expect(beginHistoryNavigation(branched, "forward")).toBeNull();
    expect(history.entries).toEqual([file("a.ts"), file("b.ts"), file("c.ts")]);
  });

  it("bounds memory while keeping the latest current and back places", () => {
    let history = createNavigationHistory();
    for (let index = 0; index < 100; index++) history = recordNavigation(history, file(`${index}.ts`));
    expect(history.entries).toHaveLength(NAVIGATION_HISTORY_LIMIT);
    expect(history.entries[0]).toEqual(file("36.ts"));
    expect(currentNavigation(history)).toEqual(file("99.ts"));
    expect(beginHistoryNavigation(history, "back")?.location).toEqual(file("98.ts"));
    expect(() => createNavigationHistory(undefined, 0)).toThrow(RangeError);
    expect(() => createNavigationHistory(undefined, 65)).toThrow(RangeError);
    expect(() => createNavigationHistory(undefined, 1.5)).toThrow(RangeError);
  });

  it("records supported identities without storing operations to replay", () => {
    const targets: NavigationLocation["target"][] = [
      { kind: "directory", path: "src" }, { kind: "component", id: "design:runtime" },
      { kind: "task", id: "task:42" }, { kind: "agent", sessionId: "session:42" }, { kind: "worktree" },
    ];
    let history = createNavigationHistory();
    for (const target of targets) history = recordNavigation(history, { workspaceRoot: "/repo/master", target });
    expect(history.entries.map((entry) => entry.target)).toEqual(targets);
    expect(history.entries.every((entry) => Object.keys(entry).join(",") === "workspaceRoot,target")).toBe(true);
  });

  it("treats file line changes as places and ignores object property order", () => {
    const first = createNavigationHistory(file("a.ts", "/repo/master", 2));
    const same = recordNavigation(first, { target: { line: 2, path: "a.ts", kind: "file" }, workspaceRoot: "/repo/master" });
    expect(same.entries).toHaveLength(1);
    const other = recordNavigation(same, file("a.ts", "/repo/master", 3));
    expect(other.entries).toHaveLength(2);
  });

  it("snapshots caller-owned locations so later mutation cannot retarget history", () => {
    const original = { workspaceRoot: "/repo/master", target: { kind: "file" as const, path: "a.ts" } };
    const history = createNavigationHistory(original);
    original.workspaceRoot = "/repo/agent";
    original.target.path = "b.ts";
    expect(currentNavigation(history)).toEqual(file("a.ts"));
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.entries)).toBe(true);
    expect(Object.isFrozen(history.entries[0]?.target)).toBe(true);
  });
});
