// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskPanel, type TaskPanelProps } from "../app/renderer/tasks/TaskPanel";
import { taskObservationFixture } from "../fixtures/tasks";

afterEach(cleanup);
const props = (overrides: Partial<TaskPanelProps> = {}): TaskPanelProps => ({
  observation: taskObservationFixture(), connected: true, refreshing: false, notice: null,
  selectedTaskId: "task-fixture", onSelect: vi.fn(), onRefresh: vi.fn(), onShowDetails: vi.fn(), onOpen: vi.fn(), ...overrides,
});

describe("task sidebar density without losing authority", () => {
  it("retains the existing packaged task search control hook", () => {
    render(<TaskPanel {...props()} />);
    expect(document.querySelector(".task-search input")).toBe(screen.getByRole("searchbox"));
  });

  it("places secondary provenance and the Open explanation after task titles in one closed native disclosure", () => {
    render(<TaskPanel {...props()} />);
    const list = screen.getByRole("list", { name: "Repository tasks" });
    const disclosure = screen.getByText(/Snapshot ·/).closest("details")!;
    expect(disclosure.open).toBe(false);
    expect(list.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByText("Open means not closed, not ready to dispatch.").closest("details")).toBe(disclosure);
    expect(screen.getByText(/shown · .* in snapshot/).closest("details")).toBe(disclosure);
    expect(screen.getByRole("searchbox", { name: "Search tasks by title or full ID" }).closest(".task-toolbar")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Task filter" }).closest(".task-toolbar")).not.toBeNull();
  });

  it.each(["stale", "malformed", "error", "unavailable", "limited", "loading"] as const)("keeps %s state and reason outside the disclosure", (status) => {
    render(<TaskPanel {...props({ observation: taskObservationFixture(status), notice: "Check could not confirm current metadata" })} />);
    const state = screen.getByRole("status");
    expect(state.getAttribute("data-task-status")).toBe(status);
    expect(state.closest("details")).toBeNull();
    expect(state.closest(".is-current")).toBeNull();
    expect(screen.getByText("Check could not confirm current metadata").closest("details")).toBeNull();
    expect(screen.getByRole("button", { name: "Select task task-fixture" })).toBeTruthy();
  });

  it("keeps retained-data warnings and disconnection visible with duplicate refresh disabled", () => {
    render(<TaskPanel {...props({ connected: false, refreshing: true, notice: "CORE_TIMEOUT: task read expired" })} />);
    for (const text of ["Task snapshot retained", "Local core disconnected.", "Checking tasks…", "Latest check failed or was ignored; retained data is not confirmed current."])
      expect(screen.getByText(text).closest("details")).toBeNull();
    expect((screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("search and disclosure do not change selection, while deliberate activation still opens the exact task", () => {
    const input = props();
    render(<TaskPanel {...input} />);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "missing task" } });
    expect(screen.getByText("Selected task is hidden by the current filters.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    const disclosure = screen.getByText(/Snapshot ·/).closest("details")!;
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    expect(input.onSelect).not.toHaveBeenCalled(); expect(input.onOpen).not.toHaveBeenCalled();
    const task = screen.getByRole("button", { name: "Select task task-fixture" });
    expect(task.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(task, { key: "Enter" });
    expect(input.onOpen).toHaveBeenCalledExactlyOnceWith("task-fixture");
    fireEvent.doubleClick(task); expect(input.onOpen).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Show task details" }));
    expect(input.onShowDetails).toHaveBeenCalledOnce();
  });
});
