// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskGraph } from "../app/renderer/tasks/TaskGraph";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
import { TaskDetailSchema, TaskSnapshotSchema, type TaskDetail, type TaskSnapshot } from "../protocol/tasks";

vi.mock("../app/renderer/plans/ProjectionCanvas", async () => {
  const { useState } = await import("react");
  return { ProjectionCanvas: ({ nodes, selected, onSelect }: { nodes: { id: string }[]; selected: string | null; onSelect: (id: string) => void }) => {
    const [camera, setCamera] = useState("initial");
    return <div data-testid="task-canvas" data-count={nodes.length} data-camera={camera} data-selected={selected}>
      <button onClick={() => setCamera("moved")}>Move graph camera</button>
      <button onClick={() => onSelect(nodes.at(-1)!.id)}>Select last graph task</button>
    </div>;
  } };
});
afterEach(cleanup);
function harness(count = 100) {
  const observation = taskObservationFixture(), details = new Map<string, TaskDetail>();
  observation.snapshot!.summaries = Array.from({ length: count }, (_, index) => {
    const detail = TaskDetailSchema.parse({ ...taskDetailFixture(), id: `task-${index}`, title: `Task ${index}`,
      counts: { blocks: 0, blockedBy: 0, fileRefs: 0 }, blocks: [], blockedBy: [], fileRefs: [] });
    details.set(detail.id, detail);
    const { description: _d, disposition: _p, blocks: _b, blockedBy: _by, fileRefs: _f, ...summary } = detail;
    return summary;
  });
  TaskSnapshotSchema.parse(observation.snapshot);
  let lifetime = 1;
  let currentSnapshot = observation.snapshot!;
  const readGraphDetail = vi.fn(async (_snapshot: TaskSnapshot, id: string, _signal: AbortSignal) => details.get(id) ?? null);
  const client = { graphCurrent: (snapshot: TaskSnapshot, epoch = lifetime) => epoch === lifetime &&
    snapshot.worldId === currentSnapshot.worldId && snapshot.repositoryId === currentSnapshot.repositoryId &&
    snapshot.metadataCommit.hex === currentSnapshot.metadataCommit.hex,
  graphLifetime: () => lifetime, readGraphDetail, refresh: vi.fn() } as unknown as TaskBridgeClient;
  const props = { client, state: { ...new TaskBridgeClient().getSnapshot(), connected: true, observation },
    visible: true, onOpen: vi.fn(async () => true) };
  return { props, details, readGraphDetail, replace: (snapshot: TaskSnapshot) => { currentSnapshot = snapshot; }, dispose: () => { lifetime++; } };
}

it("loads the whole overview and retains its mounted camera and selection through reload/hide", async () => {
  const h = harness(), view = render(<TaskGraph {...h.props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await screen.findByText(/100\/100 details read/);
  const canvas = screen.getByTestId("task-canvas");
  expect(canvas.dataset.count).toBe("100");
  expect(h.readGraphDetail).toHaveBeenCalledTimes(100);
  fireEvent.click(screen.getByRole("button", { name: "Move graph camera" }));
  fireEvent.click(screen.getByRole("button", { name: "Select last graph task" }));
  await waitFor(() => expect(h.props.onOpen).toHaveBeenCalledOnce());
  const selected = canvas.dataset.selected;
  view.rerender(<TaskGraph {...h.props} visible={false} />);
  view.rerender(<TaskGraph {...h.props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await waitFor(() => expect(h.readGraphDetail).toHaveBeenCalledTimes(200));
  expect(screen.getByTestId("task-canvas")).toBe(canvas);
  expect(canvas.dataset.camera).toBe("moved");
  expect(canvas.dataset.selected).toBe(selected);
  expect(h.props.onOpen).toHaveBeenCalledOnce();
});

it.each(["hide", "unmount", "repository", "revision", "lifetime"])("cancels pending work on %s without late publication", async (reason) => {
  const h = harness();
  const pending: { signal: AbortSignal; resolve: (value: TaskDetail | null) => void; id: string }[] = [];
  h.readGraphDetail.mockImplementation((_snapshot, id, signal) => new Promise((resolve) => pending.push({ signal, resolve, id })));
  const view = render(<TaskGraph {...h.props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  expect(pending).toHaveLength(4);
  if (reason === "hide") view.rerender(<TaskGraph {...h.props} visible={false} />);
  if (reason === "unmount") view.unmount();
  if (reason === "repository" || reason === "revision") {
    const snapshot = structuredClone(h.props.state.observation.snapshot!);
    if (reason === "repository") snapshot.repositoryId = "project:other";
    else snapshot.metadataCommit.hex = "c".repeat(40);
    h.replace(snapshot);
    view.rerender(<TaskGraph {...h.props} state={{ ...h.props.state, observation: { ...h.props.state.observation, snapshot } }} />);
  }
  if (reason === "lifetime") {
    h.dispose();
    view.rerender(<TaskGraph {...h.props} state={{ ...h.props.state }} />);
  }
  await act(async () => { for (const row of pending) row.resolve(h.details.get(row.id)!); });
  expect(h.readGraphDetail).toHaveBeenCalledTimes(4);
  expect(pending.every((row) => row.signal.aborted)).toBe(true);
  if (reason !== "unmount") expect(screen.queryByText(/4\/100 details read/)).toBeNull();
  expect(h.props.onOpen).not.toHaveBeenCalled();
});
