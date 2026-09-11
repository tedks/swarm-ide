// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalDetail } from "../protocol/external-agents";
import { GraphAgents, GraphAgentLayer, GraphAgentSprites, GraphAgentsToggle } from "../app/renderer/graph-agents/GraphAgents";
import { ProjectionCanvas } from "../app/renderer/plans/ProjectionCanvas";

const captured = vi.hoisted(() => ({ nodes: undefined as unknown, edges: undefined as unknown, mounts: 0, fit: vi.fn(), viewport: vi.fn() }));
vi.mock("@xyflow/react", async (original) => {
  const actual = await original<typeof import("@xyflow/react")>();
  return { ...actual, Background: () => null, Controls: () => null, ReactFlow: (props: any) => {
    captured.nodes = props.nodes; captured.edges = props.edges;
    useEffect(() => { captured.mounts++; props.onInit?.({ fitView: captured.fit, setViewport: captured.viewport, getViewport: () => ({ x: 73, y: 25, zoom: .6 }) }); }, []);
    return createElement("div", {}, props.nodes.map((node: any) => createElement("div", { key: node.id, className: "react-flow__node", "data-id": node.id, onClick: () => props.onNodeClick?.({}, node) }, node.data.label)));
  } };
});

const root = "/projects/app/master", at = "2026-09-08T12:00:00Z";
const projectId = "1".repeat(64);
const selection = (worktree = root) => ({ id: worktree, root: worktree, label: worktree, projectId,
  agentVisibility: "worktree" as const, sessionId: null, branch: "master", base: null, changes: [], changesComplete: true });
function detail(id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", state: "working" | "completed" | "failed" | "waiting" = "working"): ExternalDetail {
  return { session: { id, label: id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" ? "F7" : "K7", evidence: "local", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "", contextPaths: [], worktree: root, projectId, branch: "master", lifecycle: { state } },
    entries: [{ id: "edit", at, kind: "tool-call", path: "app.ts", text: "Edited app.ts", attribution: "recorded-tool-event" }], handoff: "unavailable", coverage: { tailBytes: 10, omittedRecords: 0, partial: false, message: "" } };
}
function client(fleet = [detail()], stale = false): ExternalClient {
  return { fleet, snapshot: { status: "observed", message: "", observedAt: at, sessions: fleet.map((row) => row.session), fleet }, detail: null, selected: null, observing: true, stale, busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) };
}
afterEach(() => { cleanup(); captured.mounts = 0; vi.clearAllMocks(); });

describe("real agent graph overlays", () => {
  it("opens independent exact identities, suppressing node click, drag and keyboard propagation", () => {
    const open = vi.fn(), nodeClick = vi.fn(), nodeKey = vi.fn(), down = vi.fn();
    const mounted = render(<GraphAgents client={client([detail(), detail("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")])} selection={selection()} connected onOpen={open}>
      <GraphAgentLayer locations={[{ id: "file", paths: ["app.ts"] }]}><div onClick={nodeClick} onKeyDown={nodeKey} onPointerDown={down}><GraphAgentSprites nodeId="file" /></div></GraphAgentLayer>
    </GraphAgents>);
    const first = screen.getByRole("button", { name: /Open F7/ }), second = screen.getByRole("button", { name: /Open K7/ });
    expect(mounted.container.querySelector("[data-graph-agent-summary]")).toBeNull();
    expect(screen.queryByText(/located|unplaced/i)).toBeNull();
    fireEvent.pointerDown(first); fireEvent.keyDown(first, { key: "Enter" }); fireEvent.click(first); fireEvent.click(second);
    expect(open.mock.calls.map(([id]) => id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
    expect(nodeClick).not.toHaveBeenCalled(); expect(nodeKey).not.toHaveBeenCalled(); expect(down).not.toHaveBeenCalled();
  });
  it("updates lifecycle/retained labels and visibility without a new timer", () => {
    const setTimer = vi.spyOn(globalThis, "setInterval");
    const view = (observation: ExternalClient) => <GraphAgents client={observation} selection={selection()} connected onOpen={vi.fn()}>
      <GraphAgentsToggle /><GraphAgentLayer locations={[{ id: "file", paths: ["app.ts"] }]}><GraphAgentSprites nodeId="file" /></GraphAgentLayer></GraphAgents>;
    const mounted = render(view(client()));
    expect(screen.getByRole("button", { name: /Open F7/ }).dataset.agentWorking).toBe("true");
    for (const state of ["waiting", "failed", "completed"] as const) {
      mounted.rerender(view(client([detail(undefined, state)])));
      expect(screen.getByRole("button", { name: /Open F7/ }).dataset.agentWorking).toBe("false");
    }
    mounted.rerender(view(client([detail()], true)));
    expect(screen.getByRole("button", { name: /Last seen/ }).dataset.agentWorking).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "♧ Agents" }));
    expect(screen.queryByRole("button", { name: /Open F7/ })).toBeNull(); expect(setTimer).not.toHaveBeenCalled(); setTimer.mockRestore();
  });
  it("does not rebuild graph arrays, mount a new camera, or select the component when activity changes", () => {
    const open = vi.fn(), select = vi.fn();
    const nodes = [{ id: "component", title: "App", subtitle: "Component", position: { x: 3, y: 7 } }], edges: [] = [];
    const locations = [{ id: "component", paths: ["app.ts"] }];
    const canvas = <GraphAgentLayer locations={locations}><ProjectionCanvas label="Agent stability" nodes={nodes} edges={edges} selected="component" onSelect={select} /></GraphAgentLayer>;
    const view = (observation: ExternalClient) => <GraphAgents client={observation} selection={selection()} connected onOpen={open}>{canvas}</GraphAgents>;
    const mounted = render(view(client())), originalNodes = captured.nodes, originalEdges = captured.edges;
    mounted.rerender(view(client([detail(undefined, "waiting")])));
    expect(captured.nodes).toBe(originalNodes); expect(captured.edges).toBe(originalEdges); expect(captured.mounts).toBe(1);
    const button = screen.getByRole("button", { name: /Open F7.*Waiting/ });
    fireEvent.keyDown(button, { key: "Enter" }); fireEvent.click(button);
    expect(select).not.toHaveBeenCalled(); expect(open).toHaveBeenCalledOnce(); expect(captured.fit).not.toHaveBeenCalled(); expect(captured.viewport).not.toHaveBeenCalled();
  });
  it("removes placement immediately on canonical worktree change", () => {
    const canvas = <GraphAgentLayer locations={[{ id: "file", paths: ["app.ts"] }]}><GraphAgentSprites nodeId="file" /></GraphAgentLayer>;
    const mounted = render(<GraphAgents client={client()} selection={selection()} connected onOpen={vi.fn()}>{canvas}</GraphAgents>);
    expect(screen.getByRole("button", { name: /Open F7/ })).toBeTruthy();
    mounted.rerender(<GraphAgents client={client()} selection={selection("/projects/app/feature")} connected onOpen={vi.fn()}>{canvas}</GraphAgents>);
    expect(screen.queryByRole("button", { name: /Open F7/ })).toBeNull();
  });
  it("omits every unplaced agent and the placement summary without changing the canvas wrapper", () => {
    const pathless = { ...detail(), entries: [{ ...detail().entries[0]!, path: undefined, text: "Branch-only work" }] };
    const unmatched = { ...detail("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), entries: [{ ...detail().entries[0]!, path: "other.ts" }] };
    const open = vi.fn();
    render(<GraphAgents client={client([pathless, unmatched])} selection={selection()} connected onOpen={open}>
      <section data-testid="graph-owner"><GraphAgentLayer locations={[{ id: "file", paths: ["app.ts"] }]}><div data-testid="graph-canvas"><GraphAgentSprites nodeId="file" /></div></GraphAgentLayer></section>
    </GraphAgents>);
    const owner = screen.getByTestId("graph-owner"), layer = owner.querySelector("[data-graph-agent-layer]");
    expect(owner.children).toHaveLength(1); expect(layer?.parentElement).toBe(owner);
    expect(layer?.children).toHaveLength(1); expect(screen.getByTestId("graph-canvas").parentElement).toBe(layer);
    expect(layer?.querySelector("[data-graph-agent-summary]")).toBeNull();
    expect(layer?.querySelector("[data-agent-id]")).toBeNull();
    expect(screen.queryByText(/located|unplaced/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull(); expect(open).not.toHaveBeenCalled();
  });
  it("shows only located sprites in mixed observations and preserves their callback and visibility toggle", () => {
    const located = detail(), pathless = { ...detail("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), entries: [] };
    const open = vi.fn();
    const mounted = render(<GraphAgents client={client([located, pathless])} selection={selection()} connected onOpen={open}>
      <GraphAgentsToggle /><GraphAgentLayer locations={[{ id: "file", paths: ["app.ts"] }]}><GraphAgentSprites nodeId="file" /></GraphAgentLayer>
    </GraphAgents>);
    const toggle = screen.getByRole("button", { name: "♧ Agents" });
    const expectNoUnplaced = () => {
      expect(mounted.container.querySelector("[data-graph-agent-summary]")).toBeNull();
      expect(mounted.container.querySelector(`[data-agent-id="${pathless.session.id}"]`)).toBeNull();
      expect(screen.queryByText(/located|unplaced/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /Open K7/ })).toBeNull();
    };
    const sprite = screen.getByRole("button", { name: /Open F7/ });
    expect(sprite.dataset.agentId).toBe(located.session.id); expect(sprite.dataset.agentPath).toBe("app.ts");
    fireEvent.click(sprite); expect(open).toHaveBeenCalledExactlyOnceWith(located.session.id); expectNoUnplaced();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false"); expect(screen.queryByRole("button", { name: /Open F7/ })).toBeNull(); expectNoUnplaced();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true"); expect(screen.getByRole("button", { name: /Open F7/ })).toBeTruthy(); expectNoUnplaced();
  });
  it("describes exact task-only placement without null path or timestamp text", () => {
    const taskOnly = { ...detail(), session: { ...detail().session, task: "swarm-task" }, entries: [] };
    render(<GraphAgents client={client([taskOnly])} selection={selection()} connected onOpen={vi.fn()}>
      <GraphAgentLayer locations={[{ id: "task", paths: [], tasks: ["swarm-task"] }]}><GraphAgentSprites nodeId="task" /></GraphAgentLayer>
    </GraphAgents>);
    const button = screen.getByRole("button", { name: /Exact task swarm-task/ });
    expect(button.title).toContain("Exact task swarm-task");
    expect(button.title).not.toContain("null");
  });
});
