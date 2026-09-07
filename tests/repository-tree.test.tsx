// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepositoryEntry, RepositoryObservation } from "../protocol/repository";
import { RepositoryNavigation } from "../app/renderer/repository/RepositoryNavigation";
import type { RepositoryNavigationActions } from "../app/renderer/repository/navigation";
import { repositoryTree, retainDirectory, TREE_CACHE_LIMIT, TREE_ROW_LIMIT, type DirectoryCache } from "../app/renderer/repository/tree";

const capturedAt = "2026-09-06T20:00:00.000Z";
function entry(path: string, kind: "directory" | "file" = "file"): RepositoryEntry {
  return { id: `${kind}:${path}`, path, label: path.split("/").at(-1)!, kind, git: "tracked", actionable: true };
}
function observation(directory = "", entries: RepositoryEntry[] = []): RepositoryObservation {
  return { directory, entries, observationId: `capture:${directory}`, capturedAt, state: "observed", complete: true,
    capturedCount: entries.length, filteredCount: entries.length, page: 0, pageCount: 1, filter: "" };
}
function root() { return observation("", [entry("core", "directory"), entry("docs", "directory"), entry("README.md")]); }
function actions(): RepositoryNavigationActions {
  return { pending: false, pendingSerial: null, notice: "", cameraIntent: null, expansionIntent: null, backEnabled: false, retryEnabled: false,
    enter: vi.fn(async (_path: string) => true), up: vi.fn(async () => true), back: vi.fn(async () => true),
    refresh: vi.fn(async () => true), page: vi.fn(async (_page: number) => true), filter: vi.fn(async (_filter: string) => true),
    reveal: vi.fn(async (_path: string) => true), retry: vi.fn(async () => true) };
}
function expanded(button: HTMLElement) { return button.closest("[role=treeitem]")?.getAttribute("aria-expanded"); }
afterEach(cleanup);

describe("conventional repository tree interactions", () => {
  it("retains root siblings when a directory expands and folds without another navigation or source activation", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn();
    const view = render(<RepositoryNavigation observation={root()} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(entry("core", "directory"));
    view.rerender(<RepositoryNavigation observation={observation("core", [entry("core/files.ts")])} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file core/files.ts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enter directory docs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open file README.md" })).toBeTruthy();
    const core = screen.getByRole("button", { name: "Enter directory core" });
    fireEvent.click(core);
    expect(expanded(core)).toBe("false");
    expect(screen.queryByRole("button", { name: "Open file core/files.ts" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enter directory docs" })).toBeTruthy();
    expect(onActivate).toHaveBeenCalledOnce();
    expect(controls.enter).not.toHaveBeenCalled();
    expect(controls.up).not.toHaveBeenCalled();
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("uses Right to expand or focus a child, and Left to fold or focus the parent", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn();
    const view = render(<RepositoryNavigation observation={root()} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    const core = screen.getByRole("button", { name: "Enter directory core" });
    core.focus(); fireEvent.keyDown(core, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(entry("core", "directory"));
    view.rerender(<RepositoryNavigation observation={observation("core", [entry("core/files.ts")])} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.keyDown(core, { key: "ArrowRight" });
    const file = screen.getByRole("button", { name: "Open file core/files.ts" });
    expect(document.activeElement).toBe(file);
    fireEvent.keyDown(file, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(core);
    fireEvent.keyDown(core, { key: "ArrowLeft" });
    expect(expanded(core)).toBe("false");
    expect(document.activeElement).toBe(core);
    fireEvent.keyDown(core, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Toggle repository root" }));
    expect(onActivate).toHaveBeenCalledOnce();
    expect(controls.enter).not.toHaveBeenCalled();
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("keeps a pending directory folded when its late observation arrives", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn(), initial = root();
    const view = render(<RepositoryNavigation observation={initial} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={initial} actions={{ ...controls, pending: true, pendingSerial: 1 }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={observation("core", [entry("core/late.ts")])} actions={{ ...controls, expansionIntent: { directory: "core", serial: 1 } }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    const core = screen.getByRole("button", { name: "Enter directory core" });
    expect(expanded(core)).toBe("false");
    expect(screen.queryByRole("button", { name: "Open file core/late.ts" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open file README.md" })).toBeTruthy();
    expect(onActivate).toHaveBeenCalledOnce();
    fireEvent.click(core);
    expect(expanded(core)).toBe("true");
    expect(screen.getByRole("button", { name: "Open file core/late.ts" })).toBeTruthy();
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("expires pending-fold suppression and unfolds a later same-directory Reveal, but not Refresh", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn();
    const view = render(<RepositoryNavigation observation={root()} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={root()} actions={{ ...controls, pending: true, pendingSerial: 1 }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    const captured = observation("core", [entry("core/files.ts")]);
    const completed = { ...controls, expansionIntent: { directory: "core", serial: 1 } };
    view.rerender(<RepositoryNavigation observation={captured} actions={completed} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.queryByRole("button", { name: "Open file core/files.ts" })).toBeNull();
    view.rerender(<RepositoryNavigation observation={{ ...captured, observationId: "refresh" }} actions={completed} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.queryByRole("button", { name: "Open file core/files.ts" })).toBeNull();
    view.rerender(<RepositoryNavigation observation={captured} actions={{ ...controls, expansionIntent: { directory: "core", serial: 2 } }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file core/files.ts" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={observation("docs", [entry("docs/readme.md")])} actions={{ ...controls, expansionIntent: { directory: "docs", serial: 3 } }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    view.rerender(<RepositoryNavigation observation={captured} actions={{ ...controls, expansionIntent: { directory: "core", serial: 4 } }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file core/files.ts" })).toBeTruthy();
  });

  it("does not carry a folded pending request into an overlapping same-directory Reveal", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn(), initial = root();
    const view = render(<RepositoryNavigation observation={initial} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={initial} actions={{ ...controls, pending: true, pendingSerial: 1 }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter directory core" }));
    view.rerender(<RepositoryNavigation observation={initial} actions={{ ...controls, pending: true, pendingSerial: 2 }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    const captured = observation("core", [entry("core/files.ts")]);
    view.rerender(<RepositoryNavigation observation={captured} actions={{ ...controls, pending: true, pendingSerial: 2 }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file core/files.ts" })).toBeTruthy();
    view.rerender(<RepositoryNavigation observation={captured} actions={{ ...controls, expansionIntent: { directory: "core", serial: 2 } }} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file core/files.ts" })).toBeTruthy();
  });

  it("navigates an off-slice ancestor through an explicit recipe, never source activation", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn();
    const view = render(<RepositoryNavigation observation={root()} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    view.rerender(<RepositoryNavigation observation={observation("packages/new", [entry("packages/new/index.ts")])} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    expect(screen.getByRole("button", { name: "Open file packages/new/index.ts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open file README.md" })).toBeTruthy();
    const ancestor = screen.getByRole("button", { name: "Enter directory packages" });
    fireEvent.click(ancestor);
    expect(controls.enter).not.toHaveBeenCalled();
    fireEvent.click(ancestor);
    expect(controls.enter).toHaveBeenCalledExactlyOnceWith("packages");
    expect(onActivate).not.toHaveBeenCalled();
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("does not activate unavailable entries by click or keyboard", () => {
    const controls = actions(), onActivate = vi.fn(), onOpenPath = vi.fn();
    const unavailable: RepositoryEntry = { id: "symlink:external", path: "external", label: "external", kind: "symlink",
      git: "unknown", actionable: false, reason: "Symlink not followed" };
    render(<RepositoryNavigation observation={observation("", [unavailable])} actions={controls} onActivate={onActivate} onOpenPath={onOpenPath} />);
    const button = screen.getByRole("button", { name: "Unavailable external: Symlink not followed" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.focus(); fireEvent.click(button); fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(onActivate).not.toHaveBeenCalled();
    expect(controls.enter).not.toHaveBeenCalled();
    expect(onOpenPath).not.toHaveBeenCalled();
  });
});

describe("bounded retained directory display", () => {
  it("retains at most 32 observations, including the root and newest branch, and ignores loading placeholders", () => {
    let cache: DirectoryCache = retainDirectory(new Map(), root());
    for (let index = 0; index < 40; index++) {
      cache = retainDirectory(cache, observation(`dir${index}`, [entry(`dir${index}/file.ts`)]));
      expect(cache.size).toBeLessThanOrEqual(TREE_CACHE_LIMIT);
    }
    expect(TREE_CACHE_LIMIT).toBe(32);
    expect(cache.size).toBe(32);
    expect(cache.has("")).toBe(true);
    expect(cache.has("dir39")).toBe(true);
    expect(cache.has("dir0")).toBe(false);
    expect(retainDirectory(cache, { ...observation("dir39"), state: "loading" })).toBe(cache);
  });

  it("caps visible rows at 1000 and exposes truncation until enough branches are folded", () => {
    const directories = Array.from({ length: 6 }, (_, index) => `dir${index}`);
    const active = observation("", directories.map((directory) => entry(directory, "directory")));
    let cache: DirectoryCache = retainDirectory(new Map(), active);
    for (const directory of directories) cache = retainDirectory(cache, observation(directory,
      Array.from({ length: 200 }, (_, index) => entry(`${directory}/file${index}.ts`))));
    const expanded = new Set(["", ...directories]);
    const limited = repositoryTree(cache, active, expanded, "Project");
    expect(TREE_ROW_LIMIT).toBe(1000);
    expect(limited.rows).toHaveLength(1000);
    expect(limited.truncated).toBe(true);
    expanded.delete("dir0"); expanded.delete("dir1");
    const folded = repositoryTree(cache, active, expanded, "Project");
    expect(folded.rows).toHaveLength(807);
    expect(folded.truncated).toBe(false);
  });

  it("labels inferred ancestor rows as recipes while actual children remain observations", () => {
    const active = observation("packages/new", [entry("packages/new/index.ts")]);
    const cache = retainDirectory(retainDirectory(new Map(), root()), active);
    const { rows } = repositoryTree(cache, active, new Set(["", "packages", "packages/new"]), "Project");
    expect(rows.find((row) => row.key === "packages")).toMatchObject({ recipe: true, parent: "", depth: 1 });
    expect(rows.find((row) => row.key === "packages/new")).toMatchObject({ recipe: true, parent: "packages", depth: 2 });
    expect(rows.find((row) => row.key === "packages/new/index.ts")).toMatchObject({ recipe: false, parent: "packages/new", depth: 3 });
    expect(rows.find((row) => row.key === "README.md")).toMatchObject({ recipe: false, parent: "" });
  });
});
