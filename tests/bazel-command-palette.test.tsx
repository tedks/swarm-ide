// @vitest-environment jsdom
import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildGraphObservation } from "../protocol/build-graph";
import { bazelTargetCatalogue, permitsBazelPaletteActivation, type BazelPaletteOperation } from "../app/renderer/build-resources/bazel-palette";
import { FileSearchPalette, type PaletteCommand } from "../app/renderer/repository/FileSearchPalette";

afterEach(cleanup);

const scope = { repositoryId: "project:test", worldId: "world:test", coreGeneration: 4, workspaceVisit: 2 };
const graph: BuildGraphObservation = { repositoryId: scope.repositoryId, worldId: scope.worldId, generation: 7,
  status: "current", message: "Current", graph: { repositoryId: scope.repositoryId, worldId: scope.worldId,
    inputDigest: "a".repeat(64), observedAt: "2026-09-13T20:00:00.000Z", command: "query", complete: false,
    coverage: "partial controlled fixture", edges: [], targets: [
      { label: "//app:bundle", kind: "rule", ruleClass: "filegroup", path: "", buildFile: "app/BUILD.bazel" },
      { label: "//app:unit", kind: "rule", ruleClass: "sh_test", path: "", buildFile: "app/BUILD.bazel" },
      { label: "//app:suite", kind: "rule", ruleClass: "test_suite", path: "", buildFile: "app/BUILD.bazel" },
      { label: "//app:looks_test", kind: "rule", ruleClass: "sh_binary", path: "", buildFile: "app/BUILD.bazel" },
      { label: "//app:source_test.ts", kind: "source", path: "app/source_test.ts" },
      { label: "@remote//app:external_test", kind: "rule", ruleClass: "sh_test", path: null },
    ] } };

describe("observed Bazel target catalogue", () => {
  it("filters literal full-label fragments and classifies tests by actual rule class", () => {
    expect(bazelTargetCatalogue(scope, graph, "test", "app", false).rows.map((row) => [row.label, row.ruleClass])).toEqual([
      ["//app:suite", "test_suite"], ["//app:unit", "sh_test"],
    ]);
    expect(bazelTargetCatalogue(scope, graph, "build", "looks", false).rows.map((row) => row.label)).toEqual(["//app:looks_test"]);
    expect(bazelTargetCatalogue(scope, graph, "build", "[*]", false).rows).toEqual([]);
    expect(bazelTargetCatalogue(scope, graph, "test", "source", false).rows).toEqual([]);
  });

  it("labels a current partial catalogue and permits only the same ready observation identity", () => {
    const catalogue = bazelTargetCatalogue(scope, graph, "test", "unit", false);
    expect(catalogue.message).toContain("Current partial");
    expect(catalogue.rows[0]?.ready).toBe(true);
    expect(permitsBazelPaletteActivation(catalogue.rows[0]!, scope, graph, "test", false)).toBe(true);
    expect(permitsBazelPaletteActivation(catalogue.rows[0]!, { ...scope, workspaceVisit: 3 }, graph, "test", false)).toBe(false);
    expect(permitsBazelPaletteActivation(catalogue.rows[0]!, scope, { ...graph, status: "stale" }, "test", false)).toBe(false);
    expect(permitsBazelPaletteActivation(catalogue.rows[0]!, scope, graph, "test", true)).toBe(false);
  });

  it.each(["refreshing", "stale", "error", "unavailable"] as const)("retains but disables known rows while %s", (status) => {
    const catalogue = bazelTargetCatalogue(scope, { ...graph, status }, "test", "", false);
    expect(catalogue.rows.map((row) => row.label)).toEqual(["//app:suite", "//app:unit"]);
    expect(catalogue.rows.every((row) => !row.ready)).toBe(true);
  });
});

function search() { return { loading: false, refresh: vi.fn() }; }

describe("Bazel palette keyboard ownership", () => {
  it("does not activate on mode entry, typing, arrows, IME, repeat, refresh, or a second Enter", () => {
    const activate = vi.fn(), refresh = vi.fn();
    function Harness() {
      const [operation, setOperation] = useState<BazelPaletteOperation | null>(null);
      const [query, setQuery] = useState("");
      const commands: PaletteCommand[] = operation ? [] : [{ label: "Bazel test…", detail: "Choose one exact test", run: () => { setOperation("test"); setQuery(""); } }];
      const catalogue = operation ? bazelTargetCatalogue(scope, graph, operation, query, false) : undefined;
      return <FileSearchPalette query={query} onQuery={setQuery} exact={false} commands={commands} inputRef={createRef()}
        focusLabel="retained source" onCancel={() => {}} onOpen={() => {}} search={search()}
        target={operation && catalogue ? { operation, catalogue, workspace: "/worktrees/current", diskOnly: true, refreshDisabled: false,
          onRefresh: refresh, onActivate: activate } : undefined} />;
    }
    render(<Harness />);
    const commandInput = screen.getByRole("textbox", { name: "Workspace command" });
    fireEvent.keyDown(commandInput, { key: "Enter" });
    const input = screen.getByRole("textbox", { name: "Bazel test target" });
    expect(activate).not.toHaveBeenCalled();
    expect(screen.getByText(/Current partial target catalogue/)).toBeTruthy();
    expect(screen.getByText(/unsaved source changes are not included/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "unit" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Bazel targets" }));
    expect(activate).not.toHaveBeenCalled(); expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ label: "//app:unit", operation: "test" }));
  });

  it("renders retained stale rows disabled and Escape cancels without activation", () => {
    const activate = vi.fn(), cancel = vi.fn();
    const catalogue = bazelTargetCatalogue(scope, { ...graph, status: "stale" }, "test", "", false);
    render(<FileSearchPalette query="" onQuery={() => {}} exact={false} commands={[]} inputRef={createRef()}
      focusLabel="source" onCancel={cancel} onOpen={() => {}} search={search()}
      target={{ operation: "test", catalogue, workspace: "/current", diskOnly: false, refreshDisabled: false, onRefresh: vi.fn(), onActivate: activate }} />);
    const row = screen.getByRole("button", { name: "Test //app:unit" }) as HTMLButtonElement;
    expect(row.disabled).toBe(true); fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Bazel test target" }), { key: "Escape" });
    expect(activate).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1);
  });
});
