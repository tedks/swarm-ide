// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphSlice } from "../protocol/schema";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  Position: { Left: "left", Right: "right" },
  ReactFlow: ({ edges, onSelectionChange, children }: {
    edges: Array<{ id: string }>;
    onSelectionChange: (selection: { nodes: unknown[]; edges: Array<{ id: string }> }) => void;
    children: unknown;
  }) => <button aria-label="Keyboard-select first edge" onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") onSelectionChange({ nodes: [], edges: [edges[0]!] });
  }}>{children as import("react").ReactNode}</button>,
}));

import { GraphPane } from "../app/renderer/GraphPane";

afterEach(() => vi.restoreAllMocks());

describe("graph pane interaction", () => {
  it("coordinates a relationship selected from the keyboard", () => {
    const snapshot = initialSnapshot(paymentsFileFocus);
    const graph = snapshot.graphs.find((candidate) => candidate.topologyId === "service") as GraphSlice;
    const onConnectionFocus = vi.fn();
    render(<GraphPane graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={null} onFocus={() => undefined} onConnectionFocus={onConnectionFocus} onReconcile={() => undefined} reconciliationRunning={false} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Keyboard-select first edge" }), { key: "Enter" });
    expect(onConnectionFocus).toHaveBeenCalledWith(expect.objectContaining({ id: graph.edges[0]!.id }));
  });

  it("renders yellow as an action dot and dispatches reconciliation when idle", () => {
    const snapshot = initialSnapshot(paymentsFileFocus);
    const graph = { ...snapshot.graphs[0]!, reconciliation: "yellow" as const };
    const onReconcile = vi.fn();
    render(<GraphPane graph={graph} focus={snapshot.focus} mappings={snapshot.mappings} interfaceZoom={null} onFocus={() => undefined} onConnectionFocus={() => undefined} onReconcile={onReconcile} reconciliationRunning={false} />);
    const indicator = screen.getByRole("button", { name: "Build repository service topology" });
    expect(indicator.textContent).toBe("");
    fireEvent.click(indicator);
    expect(onReconcile).toHaveBeenCalledOnce();
  });
});
