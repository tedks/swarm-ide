// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskContext, type TaskContextProps } from "../app/renderer/tasks/TaskContext";
import { taskDetailFixture, taskObservationFixture, TASK_FIXTURE_COMMIT } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { syntheticJournal } from "./journal-fixture";
import { agentFixtureFrames } from "../fixtures/agents";
import { type LaunchContextV2 } from "../protocol/agents";
afterEach(() => { cleanup(); delete window.swarm; });
const props = (): TaskContextProps => ({ selectedTaskId: "task-fixture", detail: taskDetailFixture(), snapshot: taskObservationFixture().snapshot,
  detailRevision: TASK_FIXTURE_COMMIT, detailStale: false, reading: false, notice: null, onSelect: vi.fn(), onReveal: vi.fn(), onReturnToSource: vi.fn(),
  connected: true, generation: 1, journal: null, journalRetained: false, run: null, onJournal: vi.fn() });
function response(input: CoreRequest, comment: string): CoreResponse {
  if (input.type !== "taskActivity.read") throw new Error("Unexpected request");
  const snapshot = initialSnapshot(); snapshot.world.id = input.worldId; snapshot.project.id = input.repositoryId;
  return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 1, snapshot,
    taskActivity: { worldId: input.worldId, repositoryId: input.repositoryId, taskId: input.taskId, metadataCommit: input.metadataCommit, unavailable: null,
      activity: { blob: taskDetailFixture().blob, createdAt: null, total: 1, omitted: 0, status: "complete", events: [{ ordinal: 0, time: "2026-09-07T12:00:00Z", who: "Fixture", what: "commented", comment }] } } };
}
it("shows compact metadata, literal real history and exact dependency titles; not an inferred agent log", async () => {
  const input = props();
  input.snapshot!.summaries.push({ ...input.snapshot!.summaries[0]!, id: "blocker", title: "Approve the interface" });
  input.detail = { ...input.detail!, blockedBy: [{ taskId: "blocker", status: "unstarted", diagnostics: [] }] };
  window.swarm = { request: vi.fn(async (request) => response(request, "<b>Review complete</b>")), onEvent: () => () => {} };
  render(<TaskContext {...input} />);
  expect(await screen.findByText("<b>Review complete</b>")).toBeTruthy();
  const button = screen.getByRole("button", { name: "Select dependency blocker" });
  expect(button.textContent).toBe("Approve the interface"); fireEvent.click(button); expect(input.onSelect).toHaveBeenCalledWith("blocker");
  expect(screen.getByText("No agent activity in this scope.")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Description" })).toBeNull();
});
it("late previous-task history cannot overwrite the current selection", async () => {
  const pending: { input: CoreRequest; resolve: (response: CoreResponse) => void }[] = [];
  window.swarm = { request: (input) => new Promise((resolve) => pending.push({ input, resolve })), onEvent: () => () => {} };
  const input = props(), view = render(<TaskContext {...input} />);
  view.rerender(<TaskContext {...input} selectedTaskId="another" detail={{ ...input.detail!, id: "another" }} />);
  await act(async () => { pending[1]!.resolve(response(pending[1]!.input, "Current update")); });
  await act(async () => { pending[0]!.resolve(response(pending[0]!.input, "Old update")); });
  expect(screen.getByText("Current update")).toBeTruthy(); expect(screen.queryByText("Old update")).toBeNull();
  view.rerender(<TaskContext {...input} selectedTaskId="missing" detail={null} />);
  expect(within(screen.getByRole("region", { name: "Task context" })).queryByText("Current update")).toBeNull();
});
it("only links exact task IDs in this repository and labels synthetic journal evidence", () => {
  const input = props(), journal = syntheticJournal().result;
  journal.repositoryId = input.snapshot!.repositoryId; journal.bundle.evidence[0]!.taskIds = ["task-fixture"];
  const view = render(<TaskContext {...input} journal={journal} />);
  const link = screen.getByRole("button", { name: "Synthetic change" });
  expect(screen.getByText(/Recorded reconstructed.*synthetic/)).toBeTruthy();
  fireEvent.click(link); expect(input.onJournal).toHaveBeenCalledWith("change-a");
  view.rerender(<TaskContext {...input} journal={{ ...journal, repositoryId: "another-repository" }} />);
  expect(screen.queryByRole("button", { name: "Synthetic change" })).toBeNull();
  journal.bundle.evidence[0]!.taskIds = ["task-fixture-prefix"];
  view.rerender(<TaskContext {...input} journal={journal} />);
  expect(screen.queryByRole("button", { name: "Synthetic change" })).toBeNull();
});
it("renders only a loaded run's explicitly attached task output, not task-label matching", () => {
  const input = props(), run = agentFixtureFrames().streaming.run;
  const reference = { version: 1 as const, worldId: input.snapshot!.worldId, repositoryId: input.snapshot!.repositoryId,
    provider: "ditz" as const, taskId: "task-fixture", metadataCommit: TASK_FIXTURE_COMMIT, issueBlob: input.detail!.blob };
  // Controlled presentation fixture, not a valid provider launch or run proof.
  run.launchContext = { ...run.launchContext, contextVersion: 2, sourceLinks: [], repositoryTask: { reference } } as LaunchContextV2;
  const records = [{ recordId: 1, timestamp: "2026-09-07T12:00:00Z", kind: "message" as const, providerItemId: null, text: "Synthetic explicitly attached run output" }];
  const view = render(<TaskContext {...input} run={run} runRecords={records} runRetained />);
  expect(screen.getByText("Synthetic explicitly attached run output")).toBeTruthy();
  expect(screen.getByText(/Loaded run.*retained observation/)).toBeTruthy();
  reference.taskId = "another-task";
  view.rerender(<TaskContext {...input} run={run} runRecords={records} />);
  expect(screen.queryByText("Synthetic explicitly attached run output")).toBeNull();
});
