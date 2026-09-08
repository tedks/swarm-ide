// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const camera = vi.hoisted(() => ({ viewport: { x: 0, y: 0, zoom: 1 } }));
vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" }, MarkerType: { ArrowClosed: "arrow" },
  Background: () => null, Controls: () => null, BaseEdge: () => null, getBezierPath: () => ["", 0, 0],
  ReactFlow: ({ onInit }: { onInit(instance: unknown): void }) => {
    useLayoutEffect(() => { onInit({ getViewport: () => ({ ...camera.viewport }), setViewport: (viewport: typeof camera.viewport) => { camera.viewport = { ...viewport }; } }); }, []);
    return <div>Camera</div>;
  },
}));
import { ProjectionCanvas } from "../app/renderer/plans/ProjectionCanvas";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("retains the outgoing worktree camera before restoring another scope, including remount", () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  const view = (scope: string) => <ProjectionCanvas label="Scoped camera regression" cameraScope={scope} nodes={[]} edges={[]} selected={null} onSelect={() => {}} />;
  const mounted = render(view("A"));
  const a = { x: 10, y: 20, zoom: .6 }, b = { x: 90, y: 70, zoom: .3 };
  camera.viewport = a;
  mounted.rerender(view("B")); camera.viewport = b;
  mounted.rerender(view("A")); expect(camera.viewport).toEqual(a);
  mounted.rerender(view("B")); expect(camera.viewport).toEqual(b);
  mounted.unmount(); camera.viewport = { x: 0, y: 0, zoom: 1 };
  render(view("A")); expect(camera.viewport).toEqual(a);
});
