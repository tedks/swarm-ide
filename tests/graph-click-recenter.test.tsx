// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";

const { fits, targets, moves, flows, dimensions } = vi.hoisted(() => ({ fits: vi.fn(async (_options?: unknown) => true), targets: vi.fn((_ids: string[]) => ({ x: 1000, y: 500, width: 170, height: 60 })), moves: vi.fn(async (_viewport: unknown, _options?: unknown) => true), flows: [] as Array<{ props: Record<string, any> }>, dimensions: { measured: true, visible: true } }));
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return { Background: () => null, Controls: () => null, Handle: () => null, BaseEdge: () => null,
    getViewportForBounds: (_bounds: unknown, _width: number, _height: number, _min: number, maxZoom: number) => ({ x: -900, y: -400, zoom: maxZoom }),
    MarkerType: { ArrowClosed: "arrow" }, Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    ReactFlow: (props: Record<string, any>) => {
      const latest = React.useRef(props); latest.current = props;
      const [entry] = React.useState(() => ({ props })); entry.props = props;
      const [instance] = React.useState(() => ({ fitView: fits, getViewport: () => ({ x: 80, y: 60, zoom: .8 }), setViewport: moves,
        // Real controlled ReactFlow props remain unmeasured; only its internal
        // lookup receives dimension events. Do not accidentally fake that away.
        getNodes: () => latest.current.nodes,
        getNodesBounds: targets,
        getInternalNode: (id: string) => { const node = latest.current.nodes.find((item: any) => item.id === id); return node ? { ...node, measured: dimensions.measured ? { width: 170, height: 60 } : {} } : undefined; } }));
      React.useEffect(() => { flows.push(entry); props.onInit?.(instance); }, [instance]);
      return <div>{props.nodes.map((node: any) => <button key={node.id} onClick={(event) => props.onNodeClick?.(event, node)}>{node.id}</button>)}
        <button onClick={() => props.onMoveStart?.(new MouseEvent("mousedown"))}>Manual pan</button>{props.children}</div>;
    } };
});
import { GraphPane } from "../app/renderer/GraphPane";
import { BuildGraphPane } from "../app/renderer/repository/BuildGraphPane";
import { ProjectionCanvas } from "../app/renderer/plans/ProjectionCanvas";
import { focusRevealNodes } from "../app/renderer/repository/focus-reveal";
import { adaptDeclaredServices } from "../core/service-topology";

let frames: Map<number, FrameRequestCallback>, serial: number;
const settle = () => { for (let n = 0; n < 4; n++) act(() => { const work = [...frames.values()]; frames.clear(); for (const callback of work) callback(n); }); };
beforeEach(() => {
  fits.mockClear(); targets.mockClear(); moves.mockClear(); flows.length = 0; frames = new Map(); serial = 0; dimensions.measured = true; dimensions.visible = true;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 500, width: dimensions.visible ? 800 : 0, height: dimensions.visible ? 500 : 0, toJSON: () => ({}) }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const snapshot = initialSnapshot();
const service = snapshot.graphs.find((graph) => graph.topologyId === "service")!;
const serviceProps = { workspaceId: snapshot.project.id, graph: service, focus: snapshot.focus, mappings: snapshot.mappings, interfaceZoom: 100, onFocus: vi.fn(), onActivate: vi.fn(), onConnectionFocus: vi.fn(), onReconcile: vi.fn(), reconciliationRunning: false };
const capture: BuildLinkSnapshot = { repositoryId: "repo", revision: "rev", capturedAt: "now", command: "query", targets: [
  { label: "//a:app", kind: "rule", path: "a", buildFile: "a/BUILD" }, { label: "//b:lib", kind: "rule", path: "b", buildFile: "b/BUILD" },
], links: [{ from: "//a:app", to: "//b:lib", fromPath: "a", toPath: "b" }] };
const buildProps = { capture, mockAgents: false, mockVersion: 0, onOpenBuild: vi.fn() };

it("reveals only the clicked service, including a repeated click, while status and zoom retain the camera", () => {
  const view = render(<GraphPane {...serviceProps} />); settle(); fits.mockClear();
  const id = service.nodes[0]!.id;
  fireEvent.click(screen.getByRole("button", { name: id })); settle();
  expect(targets).toHaveBeenLastCalledWith([id]);
  expect(moves).toHaveBeenLastCalledWith({ x: -900, y: -400, zoom: 1.2 }, { duration: 0 });
  expect(fits).not.toHaveBeenCalled(); targets.mockClear(); moves.mockClear();
  view.rerender(<GraphPane {...serviceProps} interfaceZoom={150} graph={{ ...service, reconciliation: "yellow", epoch: service.epoch + 1 }} />); settle();
  expect(moves).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: id })); settle(); expect(targets).toHaveBeenCalledOnce();
});

it("reveals a clicked build target without fitting its unrelated siblings", () => {
  render(<BuildGraphPane {...buildProps} />); settle(); fits.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "//b:lib" })); settle();
  expect(targets).toHaveBeenLastCalledWith(["//b:lib"]); expect(fits).not.toHaveBeenCalled();
});

it("reveals a deliberate task-canvas click without changing selection authority", () => {
  const onSelect = vi.fn();
  render(<ProjectionCanvas label="Tasks" cameraScope="repo:tasks" nodes={[{ id: "a", title: "A", subtitle: "task" }, { id: "b", title: "B", subtitle: "task" }]} edges={[]} selected="a" onSelect={onSelect} />);
  settle(); fits.mockClear(); fireEvent.click(screen.getByRole("button", { name: "b" })); settle();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");
  expect(targets).toHaveBeenLastCalledWith(["b"]); expect(fits).not.toHaveBeenCalled();
});

it("waits for actual node measurements and drops an older request when the user pans", () => {
  dimensions.measured = false;
  render(<GraphPane {...serviceProps} />); settle(); fits.mockClear();
  fireEvent.click(screen.getByRole("button", { name: service.nodes[0]!.id })); settle(); expect(targets).not.toHaveBeenCalled();
  dimensions.measured = true;
  act(() => flows[0]!.props.onNodesChange([{ type: "dimensions", id: service.nodes[0]!.id }]));
  fireEvent.click(screen.getByRole("button", { name: "Manual pan" })); settle(); expect(targets).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: service.nodes[0]!.id })); settle(); expect(targets).toHaveBeenCalledOnce();
});

it("defers an external task selection while hidden, then reveals once; scope changes cancel it", () => {
  const props = { label: "Task selection", nodes: [{ id: "a", title: "A", subtitle: "task" }, { id: "b", title: "B", subtitle: "task" }], edges: [], selected: "a", onSelect: vi.fn(), revealSelection: true, cameraScope: "repoA" };
  const view = render(<ProjectionCanvas {...props} />); settle(); targets.mockClear(); moves.mockClear();
  view.rerender(<ProjectionCanvas {...props} visible={false} selected="b" />); settle(); expect(targets).not.toHaveBeenCalled();
  view.rerender(<ProjectionCanvas {...props} visible selected="b" />); settle(); expect(targets).toHaveBeenLastCalledWith(["b"]);
  targets.mockClear();
  view.rerender(<ProjectionCanvas {...props} visible={false} selected="a" />); settle();
  view.rerender(<ProjectionCanvas {...props} visible selected="a" cameraScope="repoB" />); settle(); expect(targets).not.toHaveBeenCalled();
});

it("does not rearm a consumed task selection on metadata/size changes or an unmatched ID", () => {
  const props = { label: "Task updates", nodes: [{ id: "a", title: "A", subtitle: "task" }], edges: [], selected: "a", onSelect: vi.fn(), revealSelection: true, cameraScope: "repo" };
  const view = render(<ProjectionCanvas {...props} />); settle(); targets.mockClear();
  view.rerender(<ProjectionCanvas {...props} nodes={[{ ...props.nodes[0]!, subtitle: "complete" }]} />);
  act(() => flows[0]!.props.onNodesChange([{ type: "dimensions", id: "a" }])); settle(); expect(targets).not.toHaveBeenCalled();
  view.rerender(<ProjectionCanvas {...props} selected="missing" />); settle(); expect(targets).not.toHaveBeenCalled();
});

it("fences a pending service reveal when its graph publication changes", () => {
  dimensions.measured = false;
  const view = render(<GraphPane {...serviceProps} />); settle(); fits.mockClear();
  fireEvent.click(screen.getByRole("button", { name: service.nodes[0]!.id })); settle();
  dimensions.measured = true;
  view.rerender(<GraphPane {...serviceProps} graph={{ ...service, inputFingerprint: "new-publication" }} />);
  act(() => flows[0]!.props.onNodesChange([{ type: "dimensions", id: service.nodes[0]!.id }])); settle(); expect(targets).not.toHaveBeenCalled();
});

it("maps an exact declared source to all loaded services, not directory neighbors or reverse recipes", () => {
  const input = { paths: ["services.json"], issues: [], dependencies: [], services: [
    { id: "svc:a", displayName: "A", declarationPath: "a/service.swarm.json", implementationPaths: ["shared.ts"], interfaces: [] },
    { id: "svc:b", displayName: "B", declarationPath: "b/service.swarm.json", implementationPaths: ["shared.ts"], interfaces: [{ id: "iface:b", name: "Read", role: "provided" as const, path: "api.proto", requestType: "Req", responseType: "Res" }] },
  ] };
  const { graph, mappings, declarations } = adaptDeclaredServices(input, "fingerprint", 1, "2026-09-08T21:00:00Z", "repo");
  const focus = { worldId: "world:working", revisionKind: "working" as const, revisionId: "fingerprint", domain: "repo" as const, key: "file:shared.ts", path: "shared.ts" };
  expect(focusRevealNodes(graph, focus, mappings, "repo", declarations)).toEqual(["svc:a", "svc:b"]);
  expect(focusRevealNodes(graph, { ...focus, key: "file:api.proto", path: "api.proto" }, mappings, "repo", declarations)).toEqual(["iface:b"]);
  expect(focusRevealNodes(graph, { ...focus, key: "file:a/unrelated.ts", path: "a/unrelated.ts" }, mappings, "repo", declarations)).toEqual([]);
  expect(focusRevealNodes(graph, focus, mappings, "different-worktree", declarations)).toEqual([]);
  expect(focusRevealNodes(graph, focus, mappings, "repo", { ...declarations, sourceFingerprint: "old" })).toEqual([]);
  expect(focusRevealNodes(graph, focus, mappings)).toEqual([]);
});

it("first-mount target navigation reveals exactly the target, never a competing full-slice fit", () => {
  render(<BuildGraphPane {...buildProps} targetSelection={{ id: "//b:lib", repositoryId: "repo", revision: "rev", nonce: 1 }} />); settle();
  expect(targets).toHaveBeenCalledExactlyOnceWith(["//b:lib"]); expect(fits).not.toHaveBeenCalled();
});

it("file navigation reveals exact owners once and passive revision changes cannot re-arm it", () => {
  const sourceCapture = { ...capture, links: [...capture.links, { from: "//b:lib", to: "//b:lib.ts", fromPath: "b", toPath: "b/lib.ts" }] };
  const navigation = { scope: "workspace", nonce: 1, focus: { ...snapshot.focus, domain: "repo" as const, key: "file:b/lib.ts", path: "b/lib.ts" } };
  const view = render(<BuildGraphPane {...buildProps} cameraScope="workspace" capture={sourceCapture} focusedFile="a/app.ts" />); settle();
  view.rerender(<BuildGraphPane {...buildProps} cameraScope="workspace" capture={sourceCapture} focusedFile="b/lib.ts" navigation={navigation} />); settle();
  expect(targets).toHaveBeenCalledExactlyOnceWith(["//b:lib"]); expect(fits).not.toHaveBeenCalled(); targets.mockClear();
  view.rerender(<BuildGraphPane {...buildProps} cameraScope="workspace" capture={{ ...sourceCapture, revision: "rev2" }} focusedFile="b/lib.ts" navigation={navigation} />); settle();
  expect(targets).not.toHaveBeenCalled(); expect(fits).not.toHaveBeenCalled();
});

it("a manual move after synchronous reveal has no queued fit left to overwrite it", () => {
  render(<GraphPane {...serviceProps} />); settle();
  fireEvent.click(screen.getByRole("button", { name: service.nodes[0]!.id })); settle(); expect(moves).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Manual pan" })); moves.mockClear(); settle();
  expect(moves).not.toHaveBeenCalled(); expect(fits).not.toHaveBeenCalled();
});
