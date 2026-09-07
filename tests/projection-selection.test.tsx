// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectionCanvas } from "../app/renderer/plans/ProjectionCanvas";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return { Background: () => null, Controls: () => null, MarkerType: { ArrowClosed: "arrow" }, Position: { Right: "right", Left: "left" },
    ReactFlow: ({ nodes, onNodeClick, onSelectionChange }: { nodes: { id: string; selected: boolean }[];
      onNodeClick: (event: unknown, node: { id: string }) => void;
      onSelectionChange?: (selection: { nodes: { id: string }[] }) => void }) => {
      // ReactFlow's internal selection can still describe the previous controlled
      // nodes while its node synchronization effect adopts a new parent selection.
      const retained = React.useRef(nodes.filter((node) => node.selected));
      return <><button onClick={() => onSelectionChange?.({ nodes: retained.current })}>Report retained internal selection</button>
        <button onClick={() => onNodeClick({}, nodes[1]!)}>Deliberately inspect component</button>
        <div className="react-flow__node" data-id={nodes[1]!.id} tabIndex={0}>Keyboard component</div></>;
    } };
});
afterEach(cleanup);
it("does not turn retained Flow selection into fresh user intent when the outline selects another node", () => {
  const onSelect = vi.fn();
  const nodes = [{ id: "plan:root", title: "Root", subtitle: "plan" }, { id: "component:child", title: "Child", subtitle: "component" }];
  const props = { label: "Selection boundary", nodes, edges: [], selected: "plan:root", onSelect };
  const view = render(<ProjectionCanvas {...props} />);
  view.rerender(<ProjectionCanvas {...props} selected="component:child" />);
  fireEvent.click(screen.getByRole("button", { name: "Report retained internal selection" }));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Deliberately inspect component" }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("component:child");
  onSelect.mockClear();
  fireEvent.keyDown(screen.getByText("Keyboard component"), { key: "Enter" });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("component:child");
  onSelect.mockClear();
  fireEvent.keyDown(screen.getByText("Keyboard component"), { key: " " });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("component:child");
  onSelect.mockClear();
  fireEvent.keyDown(screen.getByText("Keyboard component"), { key: "ArrowRight" });
  expect(onSelect).not.toHaveBeenCalled();
});
