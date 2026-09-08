// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskGraph } from "../app/renderer/tasks/TaskGraph";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import { taskDetailFixture, taskObservationFixture } from "../fixtures/tasks";
import { TaskDetailSchema, TaskSnapshotSchema, type TaskDetail, type TaskSnapshot } from "../protocol/tasks";

vi.mock("../app/renderer/plans/ProjectionCanvas", async () => {
  const { useState } = await import("react");
  return { ProjectionCanvas: ({ nodes, selected, onSelect, revealSelection, cameraScope, visible, revealIdentity, selectionIntent }: { nodes: { id: string }[]; selected: string | null; onSelect: (id: string) => void; revealSelection?: boolean; cameraScope?: string; visible?: boolean; revealIdentity?: string; selectionIntent?: string | number }) => {
    const [camera, setCamera] = useState("initial");
    return <div data-testid="task-canvas" data-count={nodes.length} data-camera={camera} data-selected={selected} data-reveal={revealSelection} data-scope={cameraScope} data-visible={visible} data-identity={revealIdentity} data-intent={selectionIntent}>
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
  let available = true;
  let currentSnapshot = observation.snapshot!;
  const readGraphDetail = vi.fn(async (_snapshot: TaskSnapshot, id: string, _signal: AbortSignal) => details.get(id) ?? null);
  const client = { graphCurrent: (snapshot: TaskSnapshot, epoch = lifetime) => available && epoch === lifetime &&
    snapshot.worldId === currentSnapshot.worldId && snapshot.repositoryId === currentSnapshot.repositoryId &&
    snapshot.metadataCommit.hex === currentSnapshot.metadataCommit.hex,
  graphLifetime: () => lifetime, readGraphDetail, refresh: vi.fn() } as unknown as TaskBridgeClient;
  const props = { client, state: { ...new TaskBridgeClient().getSnapshot(), connected: true, observation },
    visible: true, onOpen: vi.fn(async () => true) };
  return { props, details, readGraphDetail, replace: (snapshot: TaskSnapshot) => { currentSnapshot = snapshot; }, dispose: () => { lifetime++; }, availability: (value: boolean) => { available = value; } };
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

it("follows sidebar selection while keeping local graph selection until a new external task is chosen", async () => {
  const h = harness(3), view = render(<TaskGraph {...h.props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await screen.findByText(/3\/3 details read/);
  const state = { ...h.props.state, selectedTaskId: "task-0" };
  view.rerender(<TaskGraph {...h.props} state={state} />);
  const canvas = screen.getByTestId("task-canvas");
  expect(canvas.dataset.selected).toBe("task-0");
  expect(canvas.dataset.reveal).toBe("true");
  expect(canvas.dataset.scope).toContain(h.props.state.observation.snapshot!.repositoryId);
  fireEvent.click(screen.getByRole("button", { name: "Select last graph task" }));
  expect(canvas.dataset.selected).toBe("task-2");
  const localIntent = canvas.dataset.intent;
  fireEvent.click(screen.getByRole("button", { name: "Move graph camera" }));
  view.rerender(<TaskGraph {...h.props} state={{ ...state, refreshing: true }} visible={false} />);
  expect(canvas.dataset.visible).toBe("false");
  expect(canvas.dataset.selected).toBe("task-2");
  expect(canvas.dataset.camera).toBe("moved");
  view.rerender(<TaskGraph {...h.props} state={{ ...state, selectedTaskId: "task-2" }} />);
  expect(canvas.dataset.intent).toBe(localIntent); // delayed onOpen acknowledgement
  expect(canvas.dataset.camera).toBe("moved");
  view.rerender(<TaskGraph {...h.props} state={state} />);
  expect(canvas.dataset.selected).toBe("task-0");
  fireEvent.click(screen.getByRole("button", { name: "Select last graph task" }));
  view.rerender(<TaskGraph {...h.props} state={{ ...state, selectedTaskId: "task-1" }} />);
  expect(canvas.dataset.selected).toBe("task-1");
  view.rerender(<TaskGraph {...h.props} state={state} />);
  expect(canvas.dataset.selected).toBe("task-0");
  expect(h.readGraphDetail).toHaveBeenCalledTimes(3);
  expect(h.props.onOpen).toHaveBeenCalledTimes(2);
  expect(h.props.onOpen).toHaveBeenLastCalledWith(h.props.state.observation.snapshot, "task-2");
});

it.each(["client", "repository", "revision", "lifetime"])("does not apply new sidebar selection to a retained graph after %s replacement", async (replacement) => {
  const h = harness(3), view = render(<TaskGraph {...h.props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await screen.findByText(/3\/3 details read/);
  let client = h.props.client;
  const snapshot = structuredClone(h.props.state.observation.snapshot!);
  if (replacement === "client") client = harness(3).props.client;
  if (replacement === "repository") snapshot.repositoryId = "project:other";
  if (replacement === "revision") snapshot.metadataCommit.hex = "c".repeat(40);
  if (replacement === "lifetime") h.dispose();
  h.replace(snapshot);
  view.rerender(<TaskGraph {...h.props} client={client} state={{ ...h.props.state, selectedTaskId: "task-1", observation: { ...h.props.state.observation, snapshot } }} />);
  const canvas = screen.getByTestId("task-canvas");
  expect(canvas.dataset.selected || null).toBeNull();
  expect(JSON.parse(canvas.dataset.identity!).at(-1)).toBe(false);
  expect(h.readGraphDetail).toHaveBeenCalledTimes(3);
  expect(h.props.onOpen).not.toHaveBeenCalled();
});

it("keeps a missing-reference outline selection without inventing a current task detail", async () => {
  const h = harness(2);
  h.details.get("task-0")!.blocks = [{ taskId: "missing", status: null, diagnostics: ["missing"] }];
  h.details.get("task-0")!.counts.blocks = 1;
  h.props.state.observation.snapshot!.summaries[0]!.counts.blocks = 1;
  const state = { ...h.props.state, selectedTaskId: "task-0" };
  const view = render(<TaskGraph {...h.props} state={state} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await screen.findByText(/2\/2 details read/);
  fireEvent.click(screen.getByRole("button", { name: "Inspect graph task missing" }));
  expect(screen.getByTestId("task-canvas").dataset.selected).toBe("missing");
  const intent = screen.getByTestId("task-canvas").dataset.intent;
  fireEvent.click(screen.getByRole("button", { name: "Inspect graph task missing" }));
  expect(screen.getByTestId("task-canvas").dataset.intent).not.toBe(intent);
  expect(screen.getByRole("button", { name: "Open task details" }).hasAttribute("disabled")).toBe(true);
  view.rerender(<TaskGraph {...h.props} state={{ ...state, notice: "Refreshing metadata" }} />);
  expect(screen.getByTestId("task-canvas").dataset.selected).toBe("missing");
  view.rerender(<TaskGraph {...h.props} state={{ ...state, selectedTaskId: "task-1" }} />);
  expect(screen.getByTestId("task-canvas").dataset.selected).toBe("task-1");
  expect(h.readGraphDetail).toHaveBeenCalledTimes(2);
});

it("keeps a sidebar gesture identity stable across a temporary reader error and recovery", async () => {
  const h = harness(2), state = { ...h.props.state, selectedTaskId: "task-0" };
  const view = render(<TaskGraph {...h.props} state={state} />);
  fireEvent.click(screen.getByRole("button", { name: "Load dependency graph" }));
  await screen.findByText(/2\/2 details read/);
  const canvas = screen.getByTestId("task-canvas"), intent = canvas.dataset.intent;
  h.availability(false);
  view.rerender(<TaskGraph {...h.props} state={{ ...state, notice: "Read unavailable" }} />);
  expect(canvas.dataset.selected || null).toBeNull();
  expect(canvas.dataset.intent).toBe(intent);
  h.availability(true);
  view.rerender(<TaskGraph {...h.props} state={state} />);
  expect(canvas.dataset.selected).toBe("task-0");
  expect(canvas.dataset.intent).toBe(intent);
  expect(h.readGraphDetail).toHaveBeenCalledTimes(2);
});
