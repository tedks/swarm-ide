// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";

// This is an orchestration seam, not a ReactFlow implementation test. The
// library owns camera state, initial fit and controls. A mounted fake retains a
// deliberate viewport and exposes whether GraphPane imperatively resets it.
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => null,
    Controls: ({ showInteractive }: { showInteractive: boolean }) => <span data-testid="controls" data-interactive={showInteractive} />,
    Handle: () => null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right" },
    ReactFlow: ({ nodes, onInit, fitView, fitViewOptions, onNodeClick, children }: {
      nodes: Array<{ id: string; data: unknown }>;
      onInit?: (instance: { fitView: () => Promise<boolean> }) => void;
      fitView: boolean;
      fitViewOptions: { padding: number; maxZoom: number };
      onNodeClick: (event: unknown, node: { id: string; data: unknown }) => void;
      children: import("react").ReactNode;
    }) => {
      const [camera, setCamera] = React.useState("initial-fit");
      const [instance] = React.useState(() => ({ fitView: async () => { setCamera("imperative-fit"); return true; } }));
      React.useEffect(() => { onInit?.(instance); }, [instance]); // Deliberately mount-only, like ReactFlow's onInit.
      return <div data-testid="flow" data-camera={camera} data-initial-fit={fitView} data-fit-options={JSON.stringify(fitViewOptions)}>
        <button onClick={() => setCamera("x:83,y:-41,zoom:1.73")}>Pan and zoom A</button>
        <button onClick={() => setCamera("x:-62,y:27,zoom:0.81")}>Pan and zoom B</button>
        <button onClick={() => onNodeClick({}, nodes[0]!)}>Select first node</button>
        {children}
      </div>;
    },
  };
});

import { GraphPane } from "../app/renderer/GraphPane";

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function frame() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => { for (const callback of callbacks) callback(0); });
}
function settle() { frame(); frame(); frame(); }

beforeEach(() => {
  frames = new Map(); nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const snapshot = initialSnapshot(paymentsFileFocus);
const onFocus = vi.fn();
function Pair({ zoom, hidden = false, width = 800, source = false, focus = snapshot.focus }: {
  zoom: number | null; hidden?: boolean; width?: number; source?: boolean; focus?: typeof snapshot.focus;
}) {
  return <div style={{ width, height: hidden ? 0 : 600 }}>
    <textarea aria-label="Retained source" hidden={!source} defaultValue="source text" />
    {snapshot.graphs.map((graph) => <div key={graph.topologyId} data-testid={graph.topologyId} style={{ display: hidden ? "none" : "block" }}>
      <GraphPane graph={graph} focus={focus} mappings={snapshot.mappings} interfaceZoom={zoom} onFocus={onFocus} onConnectionFocus={() => undefined} onReconcile={() => undefined} reconciliationRunning={false} />
    </div>)}
  </div>;
}

describe("GraphPane keeps interface zoom separate from the library-owned camera", () => {
  it("preserves two deliberate independent cameras and mounted source through 100→150→100%, source and compact panes", () => {
    const view = render(<Pair zoom={100} />); settle();
    const repo = within(view.getByTestId("repo"));
    const service = within(view.getByTestId("service"));
    const repoFlow = repo.getByTestId("flow"), serviceFlow = service.getByTestId("flow");
    const source = view.getByLabelText("Retained source");
    fireEvent.change(source, { target: { value: "unsaved text" } });
    fireEvent.click(repo.getByText("Pan and zoom A"));
    fireEvent.click(service.getByText("Pan and zoom B"));
    for (const zoom of [150, 100]) {
      view.rerender(<Pair zoom={zoom} width={510} source />); settle();
      expect(repoFlow.dataset.camera).toBe("x:83,y:-41,zoom:1.73");
      expect(serviceFlow.dataset.camera).toBe("x:-62,y:27,zoom:0.81");
      expect(repo.getByTestId("flow")).toBe(repoFlow);
      expect(service.getByTestId("flow")).toBe(serviceFlow);
      expect(view.getByLabelText("Retained source")).toBe(source);
      expect((source as HTMLTextAreaElement).value).toBe("unsaved text");
    }
  });

  it("cannot overwrite a newer gesture with a late interface-zoom animation frame", () => {
    const view = render(<Pair zoom={100} />); settle();
    view.rerender(<Pair zoom={150} />); frame();
    const repo = within(view.getByTestId("repo"));
    fireEvent.click(repo.getByText("Pan and zoom B"));
    frame();
    expect(repo.getByTestId("flow").dataset.camera).toBe("x:-62,y:27,zoom:0.81");
  });

  it("keeps cameras through rapid resize/zoom interleaving and hidden/zero-size→visible panes", () => {
    const view = render(<Pair zoom={null} />); settle();
    const repo = within(view.getByTestId("repo"));
    const service = within(view.getByTestId("service"));
    fireEvent.click(repo.getByText("Pan and zoom A"));
    fireEvent.click(service.getByText("Pan and zoom B"));
    view.rerender(<Pair zoom={150} width={0} hidden />); frame();
    view.rerender(<Pair zoom={125} width={0} hidden />); frame();
    fireEvent.click(repo.getByText("Pan and zoom B"));
    view.rerender(<Pair zoom={100} width={510} />); settle();
    view.rerender(<Pair zoom={100} width={900} source />); settle();
    expect(repo.getByTestId("flow").dataset.camera).toBe("x:-62,y:27,zoom:0.81");
    expect(service.getByTestId("flow").dataset.camera).toBe("x:-62,y:27,zoom:0.81");
  });

  it("retains initial-fit options, library controls and node-focus wiring without replacing the instance", () => {
    const view = render(<Pair zoom={null} />); settle();
    const repo = within(view.getByTestId("repo"));
    const flow = repo.getByTestId("flow");
    expect(flow.dataset.initialFit).toBe("true");
    expect(JSON.parse(flow.dataset.fitOptions!)).toEqual({ padding: 0.18, maxZoom: 1.35 });
    expect(repo.getByTestId("controls").dataset.interactive).toBe("false");
    fireEvent.click(repo.getByText("Pan and zoom A"));
    onFocus.mockClear();
    fireEvent.click(repo.getByText("Select first node"));
    expect(onFocus).toHaveBeenCalledOnce();
    const selectedFocus = snapshot.graphs.find((graph) => graph.topologyId === "repo")!.nodes[0]!.focus;
    expect(selectedFocus).not.toEqual(snapshot.focus);
    expect(onFocus).toHaveBeenCalledWith(selectedFocus);
    view.rerender(<Pair zoom={150} focus={selectedFocus} source />); settle();
    expect(repo.getByTestId("flow")).toBe(flow);
    expect(flow.dataset.camera).toBe("x:83,y:-41,zoom:1.73");
  });
});
