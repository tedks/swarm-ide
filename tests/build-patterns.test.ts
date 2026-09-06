import { expect, it } from "vitest";
import { BUILD_VIEW_LIMIT, buildTargets, layoutBuildTargets, matchBuildTargets, selectBuildView } from "../app/renderer/repository/build-view";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";

const labels = ["//:root", "//app:ui", "//app/ui:view", "//apple:other", "//core:api", "//core/agents:runtime"];
function capture(targets = labels): BuildLinkSnapshot {
  return { repositoryId: "test", revision: "captured", capturedAt: "now", command: "query", links: targets.map((label) => {
    const pkg = label.slice(2).split(":")[0]!;
    return { from: label, to: `//${pkg}:source.ts`, fromPath: pkg, toPath: `${pkg ? `${pkg}/` : ""}source.ts` };
  }) };
}

it("expands recursive and package patterns over captured rules with exact package boundaries", () => {
  expect(matchBuildTargets(" //... ", labels)).toEqual(labels);
  expect(matchBuildTargets("//...:all", labels)).toEqual(labels);
  expect(matchBuildTargets("//app/...", labels)).toEqual(["//app:ui", "//app/ui:view"]);
  expect(matchBuildTargets("//app/...:*", labels)).toEqual(["//app:ui", "//app/ui:view"]);
  expect(matchBuildTargets("//app:*", labels)).toEqual(["//app:ui"]);
  expect(matchBuildTargets("//app:all", labels)).toEqual(["//app:ui"]);
  expect(matchBuildTargets("//:all", labels)).toEqual(["//:root"]);
  expect(matchBuildTargets("//core:api", labels)).toEqual(["//core:api"]);
});

it("does not pretend unsupported patterns or uncaptured targets match", () => {
  for (const input of ["", "...", "//missing/...", "//ap/...", "//app//...", "///...", "//app/../...", "//app/.../...", "//app/**", "//app", "@other//...", "-//app/...", "//app/... //core/...", "//app/source.ts", "//app:source.ts"]) {
    expect(matchBuildTargets(input, buildTargets(capture())), input).toEqual([]);
  }
});

it("expands more than eight matches, deduplicates overlap and keeps all internal dependency links", () => {
  const names = Array.from({ length: 25 }, (_, index) => `//pkg${index}:rule`);
  const snapshot = capture(names);
  snapshot.links.push({ from: names[0]!, to: names[1]!, fromPath: "pkg0", toPath: "pkg1" });
  const slice = selectBuildView(snapshot, [names[0]!, "//...", "//pkg0/..."], false);
  expect(slice.depths.size).toBe(25);
  expect(slice.truncated).toBe(false);
  expect(slice.links).toEqual([snapshot.links.at(-1)]);
});

it("shows dependencies outside the matched package and only traverses farther on explicit transitive selection", () => {
  const snapshot = capture();
  snapshot.links.push({ from: "//app:ui", to: "//core:api", fromPath: "app", toPath: "core" },
    { from: "//core:api", to: "//core/agents:runtime", fromPath: "core", toPath: "core/agents" });
  expect([...selectBuildView(snapshot, ["//app:*"], false).depths.keys()]).toEqual(["//app:ui", "//core:api"]);
  expect([...selectBuildView(snapshot, ["//app:*"], true).depths.keys()]).toEqual(["//app:ui", "//core:api", "//core/agents:runtime"]);
});

it("applies the display bound during wildcard expansion and reports truncation accurately", () => {
  const names = Array.from({ length: BUILD_VIEW_LIMIT + 20 }, (_, index) => `//pkg:t${index}`);
  const slice = selectBuildView(capture(names), ["//..."], true);
  expect(slice.depths.size).toBe(BUILD_VIEW_LIMIT);
  expect(slice.truncated).toBe(true);
  expect(selectBuildView(capture(names.slice(0, BUILD_VIEW_LIMIT)), ["//..."], false).truncated).toBe(false);
});

it("packs broad selections without overlaps between root and dependency bands", () => {
  const depths = new Map(Array.from({ length: 50 }, (_, index) => [`//pkg:t${index}`, index < 40 ? 0 : 1] as const));
  const positions = layoutBuildTargets(depths);
  expect(positions.size).toBe(50);
  expect(new Set([...positions.values()].map(({ x, y }) => `${x}:${y}`)).size).toBe(50);
  expect(Math.max(...[...positions.values()].map(({ y }) => y))).toBe(770);
  expect(positions.get("//pkg:t40")!.x).toBeGreaterThan(positions.get("//pkg:t39")!.x);
});
