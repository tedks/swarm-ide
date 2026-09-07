// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphSlice } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => null, Controls: () => <button>Graph zoom</button>, Handle: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" }, Position: { Left: "left", Right: "right" },
    ReactFlow: ({ nodes, onNodeClick, children }: { nodes: Array<{ id: string; data: { label: string } }>;
      onNodeClick: (event: unknown, node: unknown) => void; children: import("react").ReactNode }) => {
      const [camera, setCamera] = React.useState("initial");
      return <div data-testid="flow" data-camera={camera}>
        <button onClick={() => setCamera("deliberate-pan")}>Pan graph</button>
        {nodes.map((node) => <button key={node.id} onClick={() => onNodeClick({}, node)}>{node.data.label}</button>)}{children}
      </div>;
    },
  };
});

import { GraphPane } from "../app/renderer/GraphPane";

afterEach(cleanup);
const snapshot = initialSnapshot(paymentsFileFocus);
const populated = snapshot.graphs.find((graph) => graph.topologyId === "service")!;
const empty = (reconciliation: GraphSlice["reconciliation"], sourceKind: GraphSlice["provenance"][number]["sourceKind"] = "repo"): GraphSlice => ({
  ...populated, nodes: [], edges: [], reconciliation, provenance: populated.provenance.map((item) => ({ ...item, sourceKind })),
});
function pane(graph: GraphSlice, running = false, onReconcile = vi.fn(), onFocus = vi.fn()) {
  return <GraphPane graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={null}
    onFocus={onFocus} onConnectionFocus={vi.fn()} onReconcile={onReconcile} reconciliationRunning={running} />;
}

describe("Service graph explains absent observations without inferring services", () => {
  it.each([
    ["gray", false, "Service topology not observed"],
    ["yellow", false, "Service topology needs a build"],
    ["yellow", true, "Building service topology"],
    ["red", false, "Service observation failed"],
  ] as const)("explains %s / running=%s without starting a build", (status, running, title) => {
    const onReconcile = vi.fn(); render(pane(empty(status), running, onReconcile));
    expect(screen.getByRole("status", { name: "Service graph availability" }).textContent).toContain(title);
    expect(screen.queryByText("No services in this observation")).toBeNull();
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("describes a green build-backed empty observation, not absence across the repository", () => {
    render(pane(empty("green", "build")));
    const status = screen.getByRole("status", { name: "Service graph availability" });
    expect(status.textContent).toContain("No services in this observation");
    expect(status.textContent).toContain("not the entire repository");
  });

  it("does not infer that a build ran when red can mean working-state observation failure", () => {
    render(pane(empty("red")));
    const status = screen.getByRole("status", { name: "Service graph availability" });
    expect(status.textContent).toContain("Service observation failed");
    expect(status.textContent).not.toMatch(/build failed|Build output/);
  });

  it.each(["repo", "runtime", "mock"] as const)("does not promote %s provenance into an empty build observation", (kind) => {
    render(pane(empty("green", kind)));
    expect(screen.getByRole("status", { name: "Service graph availability" }).textContent).toContain("Service topology unavailable");
    expect(screen.queryByText("No services in this observation")).toBeNull();
  });

  it("leaves the existing deliberate Build control as the only reconciliation action", () => {
    const onReconcile = vi.fn(); const view = render(pane(empty("yellow"), false, onReconcile));
    fireEvent.click(screen.getByRole("button", { name: "Build repository service topology" }));
    expect(onReconcile).toHaveBeenCalledOnce();
    view.rerender(pane(empty("yellow"), true, onReconcile));
    expect((screen.getByRole("button", { name: "Topology build in progress" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onReconcile).toHaveBeenCalledOnce();
  });

  it("keeps populated and retained graphs interactive with the same mounted camera", () => {
    const onFocus = vi.fn(); const view = render(pane(empty("gray"), false, vi.fn(), onFocus));
    const flow = screen.getByTestId("flow"); fireEvent.click(screen.getByText("Pan graph"));
    for (const status of ["green", "yellow", "red", "gray"] as const) {
      view.rerender(pane({ ...populated, reconciliation: status }, status === "yellow", vi.fn(), onFocus));
      expect(screen.queryByRole("status", { name: "Service graph availability" })).toBeNull();
      expect(screen.getByTestId("flow")).toBe(flow);
      expect(flow.dataset.camera).toBe("deliberate-pan");
      fireEvent.click(screen.getByText(populated.nodes[0]!.label));
      expect(onFocus).toHaveBeenLastCalledWith(populated.nodes[0]!.focus);
    }
    view.rerender(pane(empty("yellow"), true));
    expect(screen.getByTestId("flow")).toBe(flow);
    expect(flow.dataset.camera).toBe("deliberate-pan");
  });

  it("does not annotate another empty graph projection", () => {
    render(pane({ ...empty("gray"), topologyId: "build" }));
    expect(screen.queryByRole("status", { name: "Service graph availability" })).toBeNull();
  });
});
