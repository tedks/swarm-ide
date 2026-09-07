// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskPanel } from "../app/renderer/tasks/TaskPanel";
import { taskObservationFixture } from "../fixtures/tasks";

afterEach(cleanup);
it("opens a task document with one ordinary click, without a second selection request", () => {
  const onSelect = vi.fn(), onOpen = vi.fn();
  render(<TaskPanel observation={taskObservationFixture()} connected refreshing={false} notice={null}
    selectedTaskId={null} onSelect={onSelect} onOpen={onOpen} onRefresh={vi.fn()} onShowDetails={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Select task task-fixture" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("task-fixture");
  expect(onSelect).not.toHaveBeenCalled();
});
