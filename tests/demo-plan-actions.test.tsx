// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanHierarchy } from "../app/renderer/plans/PlanHierarchy";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import { taskObservationFixture } from "../fixtures/tasks";
import { initialSnapshot } from "../fixtures/world";
import { PlanIndexSchema } from "../protocol/plans";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

vi.mock("../app/renderer/plans/ProjectionCanvas", () => ({
  ProjectionCanvas: ({ onSelect }: { onSelect: (id: string) => void }) => <div data-testid="retained-plan-camera">
    <button onClick={() => onSelect("plan:demo")}>Select graph plan</button>
    <button onClick={() => onSelect("plan:empty")}>Select empty plan</button>
  </div>,
}));
afterEach(() => { cleanup(); delete window.swarm; });
const index = PlanIndexSchema.parse({ version: 1, nodes: [
  { id: "plan:demo", kind: "plan", title: "A deliberate implementation plan", parentId: null,
    docs: ["docs/design.md"], sourcePaths: ["src/main.ts"], taskIds: ["task-fixture"],
    contextRefs: [{ kind: "contract", path: "docs/contract.md", note: "Read before implementation." }] },
  { id: "plan:empty", kind: "plan", title: "No invented links", parentId: null,
    docs: [], sourcePaths: [], taskIds: [], contextRefs: [] },
] });
async function harness(planIndex = index) {
  const request = vi.fn(async (request: CoreRequest): Promise<CoreResponse> => ({ protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, ok: true, sequence: 1, snapshot: initialSnapshot(),
    plans: { status: "observed", index: planIndex, revision: "a".repeat(64), observedAt: "2026-09-07T21:35:00.000Z" } }));
  window.swarm = { request, onEvent: () => () => {} };
  const props = { visible: true, worldId: "world:working", repositoryId: "project:swarm-ide", generation: 1, connected: true,
    tasks: { ...new TaskBridgeClient().getSnapshot(), connected: true, observation: taskObservationFixture() },
    onOpenFile: vi.fn(), onOpenTask: vi.fn(async () => true) };
  const view = render(<PlanHierarchy {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Load plan index" }));
  await screen.findByText(/2 authored nodes/);
  fireEvent.click(screen.getByRole("button", { name: "Select graph plan" }));
  return { ...view, props, request };
}

describe("selected plan action header", () => {
  it("keeps title and deliberate actions outside the supporting scroll region", async () => {
    const h = await harness();
    const primary = h.container.querySelector(".plan-selection-primary")!;
    const support = h.container.querySelector(".plan-selection-support")!;
    expect(primary).not.toBeNull(); expect(support).not.toBeNull();
    expect(within(primary as HTMLElement).getByText("A deliberate implementation plan")).toBeTruthy();
    for (const name of ["Read doc · docs/design.md", "Open source · src/main.ts", "Inspect task · task-fixture", "Why this context?"])
      expect(within(primary as HTMLElement).getByRole("button", { name })).toBeTruthy();
    expect(support.contains(primary)).toBe(false);
    expect(within(support as HTMLElement).getByText(/Keyboard plan outline/)).toBeTruthy();
    expect(h.props.onOpenFile).not.toHaveBeenCalled(); expect(h.props.onOpenTask).not.toHaveBeenCalled();
  });

  it("reveals and focuses supporting context without navigation or replacing the graph", async () => {
    const h = await harness();
    const camera = screen.getByTestId("retained-plan-camera");
    const guidance = h.container.querySelector<HTMLDetailsElement>(".plan-context-guidance")!;
    expect(guidance).not.toBeNull();
    guidance.open = false;
    fireEvent.click(screen.getByRole("button", { name: "Why this context?" }));
    expect(guidance.open).toBe(true);
    expect(document.activeElement).toBe(guidance.querySelector("summary"));
    expect(h.props.onOpenFile).not.toHaveBeenCalled(); expect(h.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "contract · docs/contract.md" }));
    expect(h.props.onOpenFile).toHaveBeenLastCalledWith("docs/contract.md");
    fireEvent.click(screen.getByRole("button", { name: "Read doc · docs/design.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Open source · src/main.ts" }));
    expect(h.props.onOpenFile.mock.calls).toEqual([["docs/contract.md"], ["docs/design.md"], ["src/main.ts"]]);
    fireEvent.click(screen.getByRole("button", { name: "Inspect task · task-fixture" }));
    await waitFor(() => expect(h.props.onOpenTask).toHaveBeenCalledWith(h.props.tasks.observation!.snapshot, "task-fixture"));
    expect(screen.getByTestId("retained-plan-camera")).toBe(camera);
  });

  it("retains stale evidence but disables every effectful selected link", async () => {
    const h = await harness();
    h.rerender(<PlanHierarchy {...h.props} generation={2} />);
    expect(screen.getByText(/RETAINED — load again/)).toBeTruthy();
    for (const name of ["Read doc · docs/design.md", "Open source · src/main.ts", "Inspect task · task-fixture", "contract · docs/contract.md"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true); fireEvent.click(button);
    }
    expect(h.props.onOpenFile).not.toHaveBeenCalled(); expect(h.props.onOpenTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Why this context?" }));
    expect(screen.getByText(/selected briefing, not an inventory/)).toBeTruthy();
  });

  it("does not invent actions for an unlinked node and preserves the keyboard outline", async () => {
    const h = await harness();
    fireEvent.click(screen.getByRole("button", { name: "Select empty plan" }));
    expect(screen.queryByRole("button", { name: /^Read doc/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Open source/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Inspect task/ })).toBeNull();
    expect(screen.getByText("No context references authored for this node.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect plan plan:demo" }));
    expect(screen.getByRole("button", { name: "Read doc · docs/design.md" })).toBeTruthy();
    expect(h.props.onOpenFile).not.toHaveBeenCalled();
  });

  it("keeps dense document, source and task actions in independent groups without dropping links", async () => {
    const dense = PlanIndexSchema.parse({ ...index, nodes: [{ ...index.nodes[0], title: "Long title ".repeat(23),
      docs: Array.from({ length: 16 }, (_, i) => `docs/design-${i}.md`),
      sourcePaths: Array.from({ length: 16 }, (_, i) => `src/part-${i}.ts`),
      taskIds: Array.from({ length: 32 }, (_, i) => `task-${i}`),
    }, index.nodes[1]] });
    await harness(dense);
    expect(within(screen.getByRole("group", { name: "Document actions" })).getAllByRole("button")).toHaveLength(16);
    expect(within(screen.getByRole("group", { name: "Source actions" })).getAllByRole("button")).toHaveLength(16);
    expect(within(screen.getByRole("group", { name: "Task actions" })).getAllByRole("button")).toHaveLength(32);
  });
});
