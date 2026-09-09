// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlanNavigation } from "../app/renderer/plans/navigation";
import { StrictMode, type ReactNode } from "react";
import { initialSnapshot } from "../fixtures/world";
import { PlanIndexSchema } from "../protocol/plans";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
const index = PlanIndexSchema.parse({ version: 1, nodes: [
  { id: "plan:demo", kind: "plan", title: "Product intent", parentId: null, docs: [], sourcePaths: [], taskIds: [], contextRefs: [] },
  { id: "component:engine", kind: "component", title: "Engine", parentId: "plan:demo", docs: [], sourcePaths: [], taskIds: [], contextRefs: [] },
] });
const observedPlans = () => ({ status: "observed" as const, index, revision: "a".repeat(64), observedAt: "2026-09-07T19:00:00.000Z" });
const wrap = (request: CoreRequest, plans: unknown) => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true,
  sequence: 1, snapshot: initialSnapshot(), plans } as CoreResponse);
function harness() {
  const request = vi.fn(async (request: CoreRequest) => wrap(request, observedPlans()));
  window.swarm = { request, onEvent: () => () => {} };
  return { request, props: { worldId: initialSnapshot().world.id, repositoryId: initialSnapshot().project.id } };
}
afterEach(() => { cleanup(); delete window.swarm; vi.restoreAllMocks(); });
describe("automatic component plan observation", () => {
  it("settles initial reads and still refreshes after StrictMode mount replay", async () => {
    const h = harness(); const options = { visible: true, worldId: h.props.worldId, repositoryId: h.props.repositoryId, generation: 1, connected: true, changeToken: "first" };
    const pending: Array<() => void> = [];
    h.request.mockImplementation((request) => new Promise((resolve) => { pending.push(() => resolve(wrap(request, observedPlans()))); }));
    const view = renderHook((props) => usePlanNavigation(props), { initialProps: options,
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await act(async () => { for (const complete of pending.splice(0)) complete(); });
    await waitFor(() => expect(view.result.current.current).toBe(true));
    const count = h.request.mock.calls.length;
    fireEvent.focus(window);
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(count + 1));
    await act(async () => { for (const complete of pending.splice(0)) complete(); });
    await waitFor(() => expect(view.result.current.current).toBe(true));
  });
  it("refreshes changed plan inputs and focus return with one catch-up, preserving equal index and selected component", async () => {
    const h = harness();
    const options = { visible: true, worldId: h.props.worldId, repositoryId: h.props.repositoryId, generation: 1, connected: true, changeToken: "first" };
    const view = renderHook((props) => usePlanNavigation(props), { initialProps: options });
    await waitFor(() => expect(view.result.current.current).toBe(true));
    act(() => view.result.current.select("component:engine"));
    const retained = view.result.current.index;
    let release!: (reply: CoreResponse) => void;
    h.request.mockImplementationOnce((request) => new Promise((resolve) => { release = () => resolve(wrap(request, observedPlans())); }));
    view.rerender({ ...options, changeToken: "second" });
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(2));
    view.rerender({ ...options, changeToken: "third" });
    fireEvent.focus(window); fireEvent.focus(window);
    expect(h.request).toHaveBeenCalledTimes(2);
    await act(async () => release({} as CoreResponse));
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(view.result.current.current).toBe(true));
    expect(view.result.current.index).toBe(retained); expect(view.result.current.selected).toBe("component:engine");
    view.rerender({ ...options, changeToken: "third" }); expect(h.request).toHaveBeenCalledTimes(3);
    fireEvent.focus(window); await waitFor(() => expect(h.request).toHaveBeenCalledTimes(4));
  });
  it("retains a plan on failed refresh and recovers on focus without repeatedly retrying unchanged input", async () => {
    const h = harness(); const options = { visible: true, worldId: h.props.worldId, repositoryId: h.props.repositoryId, generation: 1, connected: true, changeToken: "first" };
    const view = renderHook((props) => usePlanNavigation(props), { initialProps: options });
    await waitFor(() => expect(view.result.current.current).toBe(true));
    const retained = view.result.current.index;
    h.request.mockRejectedValueOnce(new Error("offline")); view.rerender({ ...options, changeToken: "second" });
    await waitFor(() => expect(view.result.current.notice).toContain("Could not read"));
    expect(view.result.current.index).toBe(retained); expect(view.result.current.current).toBe(false);
    expect(h.request).toHaveBeenCalledTimes(2);
    fireEvent.focus(window); await waitFor(() => expect(view.result.current.current).toBe(true));
    expect(view.result.current.index).toBe(retained); expect(h.request).toHaveBeenCalledTimes(3);
  });
});
