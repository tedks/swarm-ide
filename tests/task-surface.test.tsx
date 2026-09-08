// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { taskDetailFixture, taskObservationFixture, TASK_FIXTURE_COMMIT } from "../fixtures/tasks";
import { TaskDetailSchema, TaskObservationSchema, type TaskDetail as TaskDetailData } from "../protocol/tasks";
import { TaskPanel, type TaskPanelProps } from "../app/renderer/tasks/TaskPanel";
import { TaskDetail, type TaskDetailProps } from "../app/renderer/tasks/TaskDetail";
import { canRevealTaskRef, displayTaskText } from "../app/renderer/tasks/display";

afterEach(cleanup);

function observedTasks(...details: TaskDetailData[]) {
  const observation = taskObservationFixture();
  return TaskObservationSchema.parse({ ...observation, snapshot: { ...observation.snapshot,
    summaries: details.map(({ description: _description, disposition: _disposition, blocks: _blocks, blockedBy: _blockedBy, fileRefs: _refs, ...summary }) => summary) } });
}
function panelProps(overrides: Partial<TaskPanelProps> = {}): TaskPanelProps {
  return { observation: taskObservationFixture(), refreshing: false, connected: true, notice: null, selectedTaskId: null,
    onSelect: vi.fn(), onRefresh: vi.fn(), onShowDetails: vi.fn(), ...overrides };
}
function detailProps(overrides: Partial<TaskDetailProps> = {}): TaskDetailProps {
  return { selectedTaskId: "task-fixture", snapshot: taskObservationFixture().snapshot, detail: taskDetailFixture(),
    detailRevision: TASK_FIXTURE_COMMIT, detailStale: false, reading: false, notice: null,
    onSelect: vi.fn(), onReveal: vi.fn(), onReturnToSource: vi.fn(), ...overrides };
}

describe("read-only task panel", () => {
  it("opens the document on one click and expands its title without a duplicate selection", () => {
    const props = panelProps({ onOpen: vi.fn() });
    render(<TaskPanel {...props} />);
    const row = screen.getByRole("button", { name: "Select task task-fixture" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row); expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith("task-fixture");
    fireEvent.click(row); expect(row.getAttribute("aria-expanded")).toBe("true");
  });
  it("sorts by full identity without mutating metadata and Open includes paused/in-progress but not closed", () => {
    const details = ([ ["z-task", "paused"], ["a-task", "in_progress"], ["c-task", "closed"], ["b-task", "unstarted"] ] as const)
      .map(([id, status]) => TaskDetailSchema.parse({ ...taskDetailFixture(), id, title: "Same title", status }));
    const observation = observedTasks(...details);
    const props = panelProps({ observation });
    render(<TaskPanel {...props} />);
    expect(within(screen.getByRole("list", { name: "Repository tasks" })).getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["Select task a-task", "Select task b-task", "Select task z-task"]);
    expect(screen.getByText("3 shown · 4 in snapshot")).toBeTruthy();
    expect(screen.getByText("Open means not closed, not ready to dispatch.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "Select task c-task" })).toBeTruthy();
    expect(observation.snapshot!.summaries.map((task) => task.id)).toEqual(["z-task", "a-task", "c-task", "b-task"]);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /dispatch/i })).toBeNull();
  });

  it("searches full ID and title, distinguishes no matches, and keeps filtered selection", () => {
    const props = panelProps({ observation: observedTasks(
      TaskDetailSchema.parse({ ...taskDetailFixture(), id: "prefix-alpha", title: "First title" }),
      TaskDetailSchema.parse({ ...taskDetailFixture(), id: "prefix-beta", title: "Second title" })), selectedTaskId: "prefix-alpha" });
    render(<TaskPanel {...props} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PREFIX-BETA" } });
    expect(screen.getByRole("button", { name: "Select task prefix-beta" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select task prefix-alpha" })).toBeNull();
    expect(screen.getByText("Selected task is hidden by the current filters.")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first TITLE" } });
    expect(screen.getByRole("button", { name: "Select task prefix-alpha" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-result" } });
    expect(screen.getByText("No matches in this snapshot.")).toBeTruthy();
    expect(screen.queryByText("No tasks in this snapshot.")).toBeNull();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("shows a truly empty observed snapshot separately from unavailable metadata", () => {
    const view = render(<TaskPanel {...panelProps({ observation: observedTasks() })} />);
    expect(screen.getByText("No tasks in this snapshot.")).toBeTruthy();
    view.rerender(<TaskPanel {...panelProps({ observation: taskObservationFixture("unavailable", false) })} />);
    expect(screen.getByText("Tasks unavailable")).toBeTruthy();
    expect(screen.getByText("No task snapshot has been loaded.")).toBeTruthy();
    expect(screen.queryByText("No tasks in this snapshot.")).toBeNull();
    expect(screen.queryByText(/0 shown/)).toBeNull();
  });

  it.each([
    ["unobserved", "Tasks not observed"], ["loading", "Loading tasks"], ["observed", "Tasks observed"],
    ["stale", "Task snapshot stale"], ["unavailable", "Tasks unavailable"], ["malformed", "Task metadata malformed"],
    ["limited", "Task observation limited"], ["error", "Task observation failed"],
  ] as const)("renders the %s attempt honestly without inventing tasks", (state, label) => {
    const props = panelProps({ observation: taskObservationFixture(state, false) });
    render(<TaskPanel {...props} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it("retains original revision and rows after failure without marking the failed attempt observed", () => {
    const props = panelProps({ selectedTaskId: "task-fixture" });
    const view = render(<TaskPanel {...props} />);
    view.rerender(<TaskPanel {...props} observation={taskObservationFixture("malformed")} />);
    expect(screen.getByText("Task metadata malformed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select task task-fixture" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(`sha1:${"a".repeat(40)}`)).toBeTruthy();
    expect(screen.getByText("Retained snapshot; the latest attempt does not establish that it is current.")).toBeTruthy();
    expect(screen.getByText(/Local ref checked 2026-09-06/)).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("makes a removed selection explicit without adopting a different row or taking keyboard focus", () => {
    const props = panelProps({ selectedTaskId: "task-removed" });
    const view = render(<TaskPanel {...props} />);
    const search = screen.getByRole("searchbox"); search.focus();
    view.rerender(<TaskPanel {...props} observation={observedTasks()} />);
    expect(screen.getByText("Selected task task-removed is not present in this revision.")).toBeTruthy();
    expect(document.activeElement).toBe(search);
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show task details" }));
    expect(props.onShowDetails).toHaveBeenCalledOnce();
  });

  it("labels retained data after transport failure without rewriting the last authoritative observation", () => {
    const observation = taskObservationFixture();
    const view = render(<TaskPanel {...panelProps({ observation, notice: "CORE_TIMEOUT: Task read timed out." })} />);
    expect(screen.getByText("Task snapshot retained")).toBeTruthy();
    expect(screen.getByText("Latest check failed or was ignored; retained data is not confirmed current.")).toBeTruthy();
    expect(screen.queryByText("Tasks observed")).toBeNull();
    expect(screen.getByText(`sha1:${"a".repeat(40)}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select task task-fixture" })).toBeTruthy();
    expect(observation.status).toBe("observed");
    expect(observation.sequence).toBe(1);
    view.rerender(<TaskPanel {...panelProps({ observation, notice: "CORE_TIMEOUT: Task read timed out.", refreshing: true })} />);
    expect(screen.getByText("Task snapshot retained")).toBeTruthy();
    expect(screen.getByText("CORE_TIMEOUT: Task read timed out.")).toBeTruthy();
    expect(screen.queryByText("Tasks observed")).toBeNull();
  });

  it("exposes only explicit selection/show/refresh callbacks and disables duplicate refresh", () => {
    const props = panelProps({ selectedTaskId: "task-fixture" });
    const view = render(<TaskPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Select task task-fixture" }));
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("task-fixture");
    expect(props.onShowDetails).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh tasks" }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
    view.rerender(<TaskPanel {...props} refreshing />);
    expect((screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh tasks" }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
    view.rerender(<TaskPanel {...props} connected={false} />);
    expect(screen.getByText("Local core disconnected.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh tasks" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("explicit task detail", () => {
  it("renders malicious text literally with confusing controls visible, never turning prose into links", () => {
    const detail = TaskDetailSchema.parse({ ...taskDetailFixture(), title: "<img src=x onerror=alert(1)>\u202e",
      description: "<script>alert(1)</script>\nhttps://example.invalid/ docs/secret.md\u0000",
      component: "a\u001b[31m", disposition: "closed\u200b", fileRefs: [] , counts: { blocks: 1, blockedBy: 0, fileRefs: 0 } });
    const props = detailProps({ detail });
    render(<TaskDetail {...props} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>\\u{202e}")).toBeTruthy();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/).textContent).toContain("docs/secret.md\\u{0}");
    expect(screen.getByText("a\\u{1b}[31m")).toBeTruthy();
    expect(screen.getByText("closed\\u{200b}")).toBeTruthy();
    expect(document.querySelector("img, script, a")).toBeNull();
    expect(screen.getByText("No explicit file references.")).toBeTruthy();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onReveal).not.toHaveBeenCalled();
  });

  it("shows literal dependency diagnostics and selects even a missing exact ID without repairing or revealing", () => {
    const detail = TaskDetailSchema.parse({ ...taskDetailFixture(), blocks: [
      { taskId: "task-missing", status: null, diagnostics: ["missing", "asymmetric"] },
      { taskId: "task-cycle", status: "paused", diagnostics: ["cyclic"] },
    ], counts: { blocks: 2, blockedBy: 0, fileRefs: 2 } });
    const props = detailProps({ detail });
    render(<TaskDetail {...props} />);
    expect(screen.getByText("Recorded dependency: missing, asymmetric")).toBeTruthy();
    expect(screen.getByText("Recorded dependency: cyclic")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select dependency task-missing" }));
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("task-missing");
    expect(props.onReveal).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /dispatch|repair|ready/i })).toBeNull();
  });

  it("shows source references and notes literally and only explicitly reveals supported candidates", () => {
    const props = detailProps();
    render(<TaskDetail {...props} />);
    expect(screen.getByText("docs/architecture.md:2")).toBeTruthy();
    expect(screen.getByText("../outside")).toBeTruthy();
    expect(screen.getByText(/Cannot open this link/)).toBeTruthy();
    expect(screen.getByText(/Links open current working files, which may have moved or been deleted/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Reveal working file/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reveal working file docs/architecture.md at line 2" }));
    expect(props.onReveal).toHaveBeenCalledExactlyOnceWith(props.detail!.fileRefs[0]);
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Return to source information" }));
    expect(props.onReturnToSource).toHaveBeenCalledOnce();
  });

  it("does not mislabel retained detail after the snapshot advances or its task disappears", () => {
    const snapshot = { ...observedTasks().snapshot!, metadataCommit: { ...TASK_FIXTURE_COMMIT, hex: "c".repeat(40) } };
    const props = detailProps({ snapshot });
    render(<TaskDetail {...props} />);
    expect(screen.getByText("This task is missing from the current revision.")).toBeTruthy();
    expect(screen.getByText("Showing saved task details. Refresh to check for updates.")).toBeTruthy();
    expect(screen.getAllByText(`sha1:${"a".repeat(40)}`)).toHaveLength(2);
    expect(screen.queryByText(`sha1:${"c".repeat(40)}`)).toBeNull();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("never shows another selected task's cached detail during loading or failure", () => {
    const props = detailProps({ selectedTaskId: "task-missing", reading: true });
    const view = render(<TaskDetail {...props} />);
    expect(screen.getByText("Reading selected task…")).toBeTruthy();
    expect(screen.queryByText("Inspect a repository task")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reveal/ })).toBeNull();
    view.rerender(<TaskDetail {...props} reading={false} notice="TASK_NOT_FOUND: Task is not in the observed snapshot." />);
    expect(screen.getByText("No details loaded for this selection.")).toBeTruthy();
    expect(screen.getByText(/TASK_NOT_FOUND/)).toBeTruthy();
    expect(props.onReveal).not.toHaveBeenCalled();
  });

  it("can retain current-revision details but explicitly mark them unconfirmed after a core change", () => {
    render(<TaskDetail {...detailProps({ detailStale: true, notice: "CORE_UNAVAILABLE: Connection ended." })} />);
    expect(screen.getByText("Showing saved task details. Refresh to check for updates.")).toBeTruthy();
    expect(screen.getByText(/CORE_UNAVAILABLE/)).toBeTruthy();
  });

  it("does not take focus on detail selection changes or error updates", () => {
    const props = detailProps();
    const view = render(<><input aria-label="Existing source cursor" /><TaskDetail {...props} /></>);
    const source = screen.getByRole("textbox", { name: "Existing source cursor" }); source.focus();
    view.rerender(<><input aria-label="Existing source cursor" /><TaskDetail {...props} selectedTaskId="task-missing" notice="TASK_NOT_FOUND: Missing task." /></>);
    expect(document.activeElement).toBe(source);
    expect(props.onReturnToSource).not.toHaveBeenCalled();
  });
});

describe("literal task display boundary", () => {
  it("preserves ordinary multiline text and exposes invisible direction/terminal controls", () => {
    expect(displayTaskText("a\n\tb\r\u001b\u202e\u200b")).toBe("a\n\tb\\u{d}\\u{1b}\\u{202e}\\u{200b}");
    expect(displayTaskText("first\r\nsecond\r\n")).toBe("first\nsecond\n");
  });
  it.each(["/absolute", "../escape", "file:///etc/passwd", "https://example.invalid/a", "a\\b", "a//b", "a/./b", "a/../b", "a\u0000b", "a\u202eb", ""])("does not offer Reveal for %j even with a false candidate flag", (path) => {
    expect(canRevealTaskRef({ path, line: 1, note: null, navigation: "candidate" })).toBe(false);
  });
  it("requires a declared candidate and valid optional line, preserving full path identity", () => {
    expect(canRevealTaskRef({ path: "one/index.ts", line: 3, note: null, navigation: "candidate" })).toBe(true);
    expect(canRevealTaskRef({ path: "two/index.ts", line: null, note: null, navigation: "candidate" })).toBe(true);
    expect(canRevealTaskRef({ path: "one/index.ts", line: 0, note: null, navigation: "candidate" })).toBe(false);
    expect(canRevealTaskRef({ path: "one/index.ts", line: 1.5, note: null, navigation: "candidate" })).toBe(false);
    expect(canRevealTaskRef({ path: "one/index.ts", line: 1, note: null, navigation: "unsupported" })).toBe(false);
  });
});
