// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComponentTargets, componentTargets, type ComponentSelection } from "../app/renderer/plans/ComponentTargets";
import type { BuildGraphObservation } from "../protocol/build-graph";

const selection: ComponentSelection = { repositoryId: "project:test", worldId: "world:test", generation: 1, current: true,
  node: { id: "design:agents", kind: "component", title: "Agent owners and steering", parentId: null,
    docs: ["docs/agents.md"], sourcePaths: ["src/agent.ts"], taskIds: [], contextRefs: [],
    design: { summary: "Run and steer local agents.", state: "implemented", connections: [], buildTargets:
      ["//:unit", "//:suite", "//:misleading-checks", "//:assets", "//:missing", "//:source.ts"].map(label => ({ label, role: `Role for ${label}`, dependencies: [] })) } } };
const observation: BuildGraphObservation = { repositoryId: selection.repositoryId, worldId: selection.worldId, generation: 1, status: "current", message: "Current",
  graph: { repositoryId: selection.repositoryId, worldId: selection.worldId, inputDigest: "a".repeat(64), observedAt: "2026-09-09T12:00:00.000Z", command: "query", complete: true, coverage: "test fixture", edges: [], targets: [
    { label: "//:unit", kind: "rule", ruleClass: "sh_test", path: "", buildFile: "BUILD.bazel" },
    { label: "//:suite", kind: "rule", ruleClass: "test_suite", path: "", buildFile: "BUILD.bazel" },
    { label: "//:misleading-checks", kind: "rule", ruleClass: "sh_binary", path: "", buildFile: "BUILD.bazel" },
    { label: "//:assets", kind: "rule", ruleClass: "filegroup", path: "", buildFile: "BUILD.bazel" },
    { label: "//:source.ts", kind: "source", path: "source.ts" },
    { label: "//:unmapped_test", kind: "rule", ruleClass: "sh_test", path: "", buildFile: "BUILD.bazel" },
  ] } };
afterEach(cleanup);

it("classifies only explicitly mapped observed rule types, not names or source files", () => {
  expect(componentTargets(selection, observation).map(({ label, kind, ready }) => [label, kind, ready])).toEqual([
    ["//:unit", "test", true], ["//:suite", "test", true], ["//:misleading-checks", "build", true],
    ["//:assets", "build", true], ["//:missing", "unavailable", false], ["//:source.ts", "unavailable", false],
  ]);
});

it.each(["refreshing", "stale", "error"] as const)("retains labels but disables actions for a %s graph", (status) => {
  const run = vi.fn();
  render(<ComponentTargets selection={selection} observation={{ ...observation, status }} busy={false} onRun={run} onOpenTarget={vi.fn()} onRefresh={vi.fn()} />);
  const test = screen.getByRole("button", { name: "Test //:unit" }) as HTMLButtonElement;
  expect(test.disabled).toBe(true); fireEvent.click(test); expect(run).not.toHaveBeenCalled();
});

it("never borrows same-label targets from a different workspace or world", () => {
  for (const other of [{ ...observation, repositoryId: "project:other" }, { ...observation, worldId: "world:other" },
    { ...observation, graph: { ...observation.graph!, repositoryId: "project:other" } }]) {
    expect(componentTargets(selection, other).every(target => target.kind === "unavailable" && !target.ready)).toBe(true);
  }
});

it("shows selected component, separates Test and Build and dispatches only deliberate exact actions", () => {
  const run = vi.fn(), open = vi.fn();
  const props = { selection, observation, busy: false, onRun: run, onOpenTarget: open, onRefresh: vi.fn() };
  const view = render(<ComponentTargets {...props} />);
  expect(screen.getByRole("heading", { name: selection.node!.title })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Tests" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Test //:misleading-checks" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Test //:unmapped_test" })).toBeNull();
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Test //:unit" }));
  expect(run).toHaveBeenLastCalledWith("//:unit", "test");
  fireEvent.click(screen.getByRole("button", { name: "Build //:assets" }));
  expect(run).toHaveBeenLastCalledWith("//:assets", "build");
  fireEvent.click(screen.getByRole("button", { name: "//:unit" })); expect(open).toHaveBeenCalledWith("//:unit");
  view.rerender(<ComponentTargets {...props} busy />);
  expect((screen.getByRole("button", { name: "Test //:unit" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Test //:unit" })); expect(run).toHaveBeenCalledTimes(2);
  view.rerender(<ComponentTargets {...props} selection={{ ...selection, current: false }} />);
  expect((screen.getByRole("button", { name: "Build //:assets" }) as HTMLButtonElement).disabled).toBe(true);
});

it("reports empty/unavailable mappings without pretending a tests-by-name inference", () => {
  render(<ComponentTargets selection={selection} busy={false} onRun={vi.fn()} onOpenTarget={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByText("No test targets")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Other mappings" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Test //:unit" })).toBeNull();
});
