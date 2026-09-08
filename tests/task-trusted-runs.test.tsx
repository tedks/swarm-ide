// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskTrustedRuns } from "../app/renderer/tasks/TaskTrustedRuns";
import { TaskContext, type TaskContextProps } from "../app/renderer/tasks/TaskContext";
import { selectedTaskRunDetail, taskRunStatus, taskTrustedRuns, type TaskRunScope, type TaskTrustedRun, type TaskTrustedSnapshot } from "../app/renderer/tasks/trusted-runs";
import { taskDetailFixture, taskObservationFixture, TASK_FIXTURE_COMMIT } from "../fixtures/tasks";

afterEach(cleanup);
const taskSnapshot = taskObservationFixture().snapshot!;
const scope: TaskRunScope = { worldId: taskSnapshot.worldId, repositoryId: taskSnapshot.repositoryId, taskId: "task-fixture" };
function run(token = "00000000-0000-4000-8000-000000000001", patch: Partial<TaskTrustedRun> = {}): TaskTrustedRun {
  return { runToken: token, title: "Review this task", status: "ready", archived: false, approvalCount: 0,
    createdAt: "2026-09-07T19:00:00Z", updatedAt: "2026-09-07T19:01:00Z", message: "Turn finished; awaiting instructions.",
    taskReference: { version: 1, provider: "ditz", ...scope, metadataCommit: TASK_FIXTURE_COMMIT, issueBlob: taskDetailFixture().blob }, ...patch };
}
function snapshot(runs: TaskTrustedRun[], selected = runs[0]): TaskTrustedSnapshot {
  return { instanceId: "00000000-0000-4000-8000-000000000002", runs, runToken: selected?.runToken ?? null,
    taskReference: selected?.taskReference ?? null, output: "Explicitly admitted task output", archived: selected?.archived ?? false,
    activities: [{ id: "event-1", at: "2026-09-07T19:01:00Z", turnId: "turn-1", kind: "command", status: "completed", summary: "Checked the task implementation" }] };
}

it("requires admitted world/repository/task identity; titles and drafts grant no association", () => {
  const linked = run(), ref = linked.taskReference!;
  const otherTask = run("00000000-0000-4000-8000-000000000003", { taskReference: { ...ref, taskId: "task-fixture-suffix" } });
  const otherRepo = run("00000000-0000-4000-8000-000000000004", { taskReference: { ...ref, repositoryId: "other" } });
  const otherWorld = run("00000000-0000-4000-8000-000000000005", { taskReference: { ...ref, worldId: "other" } });
  const unattached = run("00000000-0000-4000-8000-000000000006", { taskReference: null });
  expect(taskTrustedRuns(snapshot([otherTask, otherRepo, otherWorld, unattached, linked]), scope)).toEqual([linked]);
  expect(taskTrustedRuns(null, scope)).toEqual([]);
});

it("keeps original metadata revisions, sorts recent first and rejects duplicate token ambiguity", () => {
  const older = run(undefined, { taskReference: { ...run().taskReference!, metadataCommit: { algorithm: "sha1", hex: "c".repeat(40) } } });
  const newer = run("00000000-0000-4000-8000-000000000003", { updatedAt: "2026-09-07T20:01:00Z" });
  const data = snapshot([older, newer]);
  expect(taskTrustedRuns(data, scope)).toEqual([newer, older]);
  expect(data.runs).toEqual([older, newer]);
  expect(taskTrustedRuns(snapshot([older, older, newer]), scope)).toEqual([newer]);
  render(<TaskTrustedRuns scope={scope} observation={{ snapshot: data, retained: false }} connected onOpen={vi.fn()} />);
  expect(screen.getByText("cccccccc").getAttribute("title")).toBe(`sha1:${"c".repeat(40)}`);
});

it("only exposes selected output/activity for exact summary and detail admission correlation", () => {
  const linked = run(), data = snapshot([linked]);
  expect(selectedTaskRunDetail(data, linked)?.output).toBe(data.output);
  expect(selectedTaskRunDetail({ ...data, runToken: "other-token" }, linked)).toBeNull();
  expect(selectedTaskRunDetail({ ...data, taskReference: null }, linked)).toBeNull();
  expect(selectedTaskRunDetail({ ...data, taskReference: { ...linked.taskReference!, metadataCommit: { algorithm: "sha1", hex: "c".repeat(40) } } }, linked)).toBeNull();
  expect(selectedTaskRunDetail({ ...data, taskReference: { ...linked.taskReference!, issueBlob: { algorithm: "sha1", hex: "d".repeat(40) } } }, linked)).toBeNull();
  expect(selectedTaskRunDetail({ ...data, archived: true }, linked)).toBeNull();
});

it("opens only the explicit token without changing task status or executing anything", () => {
  const open = vi.fn(), linked = run();
  render(<TaskTrustedRuns scope={scope} observation={{ snapshot: snapshot([linked]), retained: false }} connected onOpen={open} />);
  expect(open).not.toHaveBeenCalled();
  expect(screen.getByText("Ready for instructions")).toBeTruthy();
  expect(screen.getByText(/A finished turn does not close the issue/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open trusted conversation Review this task" }));
  expect(open).toHaveBeenCalledExactlyOnceWith(linked.runToken);
});

it("labels archived/retained output, approvals, unavailable history and disconnection honestly", () => {
  const archived = run(undefined, { archived: true, status: "failed", approvalCount: 2 });
  const view = render(<TaskTrustedRuns scope={scope} observation={{ snapshot: snapshot([archived]), retained: true }} connected onOpen={vi.fn()} />);
  expect(screen.getByText("Archived history")).toBeTruthy();
  expect(screen.getByText(/Saved history, not a running conversation/)).toBeTruthy();
  expect(screen.queryByText(/2 approval requests/)).toBeNull();
  expect(screen.getByText(/Retained observation/)).toBeTruthy();
  expect(screen.getByText("Explicitly admitted task output")).toBeTruthy();
  view.rerender(<TaskTrustedRuns scope={scope} observation={{ snapshot: snapshot([run(undefined, { approvalCount: 2 })]), retained: false }} connected={false} onOpen={vi.fn()} />);
  expect(screen.getByText(/2 approval requests/)).toBeTruthy();
  expect((screen.getByRole("button", { name: /Open trusted conversation/ }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<TaskTrustedRuns scope={scope} connected />);
  expect(screen.getByText("Trusted task history not observed.")).toBeTruthy();
  view.rerender(<TaskTrustedRuns scope={scope} observation={{ snapshot: snapshot([]), retained: false }} connected />);
  expect(screen.getByText("No trusted conversations linked to this task.")).toBeTruthy();
});

it("renders bounded literal output and last four activity excerpts without HTML interpretation", () => {
  const linked = run(undefined, { title: "<script>task</script>" }), data = snapshot([linked]);
  data.output = "x".repeat(2000) + "<b>literal output</b>";
  data.activities = Array.from({ length: 6 }, (_, index) => ({ id: `event-${index}`, at: "2026-09-07T19:01:00Z", turnId: null, kind: "tool", status: "completed", summary: `Activity ${index}` }));
  const view = render(<TaskTrustedRuns scope={scope} observation={{ snapshot: data, retained: false }} connected />);
  expect(screen.getByLabelText("Trusted task output").textContent?.length).toBe(1601);
  expect(screen.queryByText("Activity 1")).toBeNull(); expect(screen.getByText("Activity 2")).toBeTruthy();
  expect(view.container.querySelector("script, b")).toBeNull();
});

it("late previous-task observations cannot expose old-task output after selection or world switches", () => {
  const linked = run(), data = snapshot([linked]), open = vi.fn();
  const input: TaskContextProps = { selectedTaskId: scope.taskId, snapshot: taskSnapshot, detail: taskDetailFixture(), detailRevision: TASK_FIXTURE_COMMIT,
    detailStale: false, reading: false, notice: null, onSelect: vi.fn(), onReveal: vi.fn(), onReturnToSource: vi.fn(),
    connected: true, generation: 1, journal: null, journalRetained: false, run: null, onJournal: vi.fn(),
    trustedObservation: { snapshot: data, retained: false }, onOpenTrustedRun: open };
  const view = render(<TaskContext {...input} />);
  expect(screen.getByText("Explicitly admitted task output")).toBeTruthy();
  const section = screen.getByRole("region", { name: "Trusted task runs" });
  view.rerender(<TaskContext {...input} selectedTaskId="task-b" detail={{ ...input.detail!, id: "task-b" }} />);
  expect(screen.queryByText("Explicitly admitted task output")).toBeNull();
  view.rerender(<TaskContext {...input} selectedTaskId="task-b" detail={{ ...input.detail!, id: "task-b" }} trustedObservation={{ snapshot: { ...data, output: "Late output for A" }, retained: false }} />);
  expect(screen.queryByText("Late output for A")).toBeNull();
  expect(within(section).queryAllByRole("button")).toHaveLength(0);
  view.rerender(<TaskContext {...input} snapshot={{ ...taskSnapshot, repositoryId: "other" }} />);
  expect(screen.queryByText("Explicitly admitted task output")).toBeNull();
  view.rerender(<TaskContext {...input} snapshot={{ ...taskSnapshot, worldId: "other" }} />);
  expect(screen.queryByText("Explicitly admitted task output")).toBeNull();
  expect(input.onSelect).not.toHaveBeenCalled(); expect(input.onReveal).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});

it("conversation status labels never claim an issue is completed", () => {
  for (const status of ["idle", "preparing", "starting", "ready", "running", "stopping", "closed", "failed"] as const) {
    expect(taskRunStatus({ status, archived: false })).not.toMatch(/task complete|issue complete|done/i);
  }
});
