// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { contextArtifact } from "./context-fixture";
import { adaptServiceTopology } from "../core/service-topology";
vi.mock("@xyflow/react", () => ({
  Background: () => null, Controls: () => null, Handle: () => null, MarkerType: { ArrowClosed: "arrowclosed" }, Position: { Left: "left", Right: "right" },
  ReactFlow: ({ nodes, onNodeClick, autoPanOnNodeFocus }: { nodes: Array<{ id: string; data: unknown }>; onNodeClick: (event: unknown, node: unknown) => void; autoPanOnNodeFocus?: boolean }) =>
    <div data-testid="flow" data-auto-pan={String(autoPanOnNodeFocus)}>{nodes.map((node) => <div key={node.id} className="react-flow__node" data-id={node.id} tabIndex={0}
      onClick={(event) => onNodeClick(event, node)}>{node.id}</div>)}</div>,
}));
import { GraphPane } from "../app/renderer/GraphPane";
afterEach(cleanup);
describe("actual GraphPane gesture wiring (ReactFlow seam)", () => {
  it("only click or nonrepeated Enter activates; Alt-click and Shift+Enter inspect", () => {
    const snapshot = initialSnapshot(), onFocus = vi.fn(), onActivate = vi.fn();
    const { graph } = adaptServiceTopology(contextArtifact, "bazel://fixture", "b".repeat(64), "a".repeat(64), 1, "2026-09-07T03:00:00.000Z", snapshot.project.id);
    const props = { graph, focus: snapshot.focus, mappings: [], interfaceZoom: 100 as const, onFocus, onActivate, onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false };
    const view = render(<GraphPane {...props} />), node = screen.getByText("service:validator");
    expect(screen.getByTestId("flow").dataset.autoPan).toBe("false");
    fireEvent.mouseOver(node); fireEvent.focus(node); fireEvent.pointerMove(node); expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(node); expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(node, { key: "Enter" }); expect(onActivate).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(node, { key: "Enter", repeat: true }); expect(onActivate).toHaveBeenCalledTimes(2);
    fireEvent.click(node, { altKey: true }); fireEvent.keyDown(node, { key: "Enter", shiftKey: true }); expect(onFocus).toHaveBeenCalledTimes(2);
    view.rerender(<GraphPane {...props} focus={graph.nodes[0]!.focus} interfaceZoom={150} />); expect(onActivate).toHaveBeenCalledTimes(2);
  });
});
