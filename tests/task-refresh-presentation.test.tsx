// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskPanel, type TaskPanelProps } from "../app/renderer/tasks/TaskPanel";
import { taskObservationFixture } from "../fixtures/tasks";

afterEach(cleanup);
const props = (): TaskPanelProps => ({ observation: taskObservationFixture(), refreshing: false, connected: true,
  notice: null, selectedTaskId: "task-fixture", onSelect: vi.fn(), onRefresh: vi.fn(), onShowDetails: vi.fn() });

describe("quiet background task refresh presentation", () => {
  it("retains compact layout, controls, filter and focus while keeping pending refresh disabled and not current", () => {
    const input = props();
    const view = render(<TaskPanel {...input} />);
    const panel = screen.getByRole("region", { name: "Tasks" });
    const status = screen.getByRole("status").parentElement!;
    const refresh = screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement;
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "task-fixture" } }); search.focus();
    const row = screen.getByRole("button", { name: "Select task task-fixture" });
    expect(status.classList.contains("is-compact")).toBe(true);
    view.rerender(<TaskPanel {...input} refreshing />);
    expect(status.classList.contains("is-compact")).toBe(true);
    expect(status.classList.contains("is-current")).toBe(false);
    expect(panel.getAttribute("data-task-refresh")).toBe("background");
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Checking tasks…")).toBeNull();
    expect(refresh.disabled).toBe(true);
    fireEvent.click(refresh); expect(input.onRefresh).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe("task-fixture");
    expect(screen.getByRole("button", { name: "Select task task-fixture" })).toBe(row);
    view.rerender(<TaskPanel {...input} />);
    expect(status.classList.contains("is-compact")).toBe(true);
    expect(status.classList.contains("is-current")).toBe(true);
    expect(refresh.disabled).toBe(false);
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it("shows checking for a deliberate refresh and resets that indication before the next background check", () => {
    const input = props();
    function Host() {
      const [refreshing, setRefreshing] = useState(false);
      return <><button onClick={() => setRefreshing(false)}>Finish check</button><button onClick={() => setRefreshing(true)}>Background check</button>
        <TaskPanel {...input} refreshing={refreshing} onRefresh={() => { input.onRefresh(); setRefreshing(true); }} /></>;
    }
    render(<Host />);
    const refresh = screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement;
    fireEvent.click(refresh);
    expect(input.onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Checking tasks…")).toBeTruthy();
    expect(refresh.disabled).toBe(true);
    fireEvent.click(refresh); expect(input.onRefresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Finish check"));
    fireEvent.click(screen.getByText("Background check"));
    expect(screen.queryByText("Checking tasks…")).toBeNull();
    expect(screen.getByRole("region", { name: "Tasks" }).getAttribute("data-task-refresh")).toBe("background");
  });

  it("does not hide failure, stale, disconnected or first-load state as routine checking", () => {
    const input = props();
    const view = render(<TaskPanel {...input} refreshing notice="Task read failed" />);
    expect(screen.getByText("Task read failed")).toBeTruthy();
    expect(screen.getByText("Task snapshot retained")).toBeTruthy();
    expect(screen.getByText("Checking tasks…")).toBeTruthy();
    expect(screen.getByRole("status").closest(".is-compact")).toBeNull();
    view.rerender(<TaskPanel {...input} refreshing observation={taskObservationFixture("stale")} />);
    expect(screen.getByText("Task snapshot stale")).toBeTruthy();
    expect(screen.getByText("Checking tasks…")).toBeTruthy();
    view.rerender(<TaskPanel {...input} connected={false} />);
    expect(screen.getByText("Local core disconnected.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<TaskPanel {...input} refreshing observation={null} />);
    expect(screen.getByText("Tasks not observed")).toBeTruthy();
    expect(screen.getByText("Checking tasks…")).toBeTruthy();
  });
});
