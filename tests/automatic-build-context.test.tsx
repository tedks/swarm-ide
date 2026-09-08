// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBuildGraph } from "../app/renderer/repository/use-build-graph";
import { initialSnapshot } from "../fixtures/world";
import { fixtureBuildObservation } from "./support/build-graph-fixture";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

const snapshot = initialSnapshot();
function response(request: CoreRequest, status: "current" | "refreshing" | "error" = "current"): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, sequence: 1, ok: true,
    snapshot, buildGraph: { ...fixtureBuildObservation(snapshot), status } };
}
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function mount(enabled = true) {
  return renderHook(({ enabled, token, realm }) => useBuildGraph(snapshot.project.id, snapshot.world.id, realm, enabled, { changeToken: token }),
    { initialProps: { enabled, token: "first", realm: "core:1" } });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.swarm = { request: vi.fn(async (request) => response(request)), onEvent: () => () => {} };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); delete window.swarm; });

it("observes on startup and stays quiet when the input token and document are unchanged", async () => {
  const h = mount(); await tick();
  expect(window.swarm!.request).toHaveBeenCalledOnce();
  expect(h.result.current.observation?.status).toBe("current");
  await tick(60_000);
  expect(window.swarm!.request).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("coalesces changed source signals without forcing an equivalent query", async () => {
  const h = mount(); await tick();
  h.rerender({ enabled: true, token: "second", realm: "core:1" }); await tick(300);
  h.rerender({ enabled: true, token: "third", realm: "core:1" }); await tick(300);
  expect(window.swarm!.request).toHaveBeenCalledOnce();
  await tick(2000);
  expect(window.swarm!.request).toHaveBeenCalledTimes(2);
  expect(vi.mocked(window.swarm!.request).mock.calls.every(([request]) => request.type === "buildGraph.observe" && !request.refresh)).toBe(true);
});

it("pauses while hidden or blurred, then rechecks the opened project on return", async () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const h = mount(); await tick(30_000); expect(window.swarm!.request).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible"); act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await tick(2000); expect(window.swarm!.request).toHaveBeenCalledOnce();
  act(() => { window.dispatchEvent(new Event("blur")); });
  h.rerender({ enabled: true, token: "new", realm: "core:1" }); await tick(60_000);
  expect(window.swarm!.request).toHaveBeenCalledOnce();
  act(() => { window.dispatchEvent(new Event("focus")); }); await tick(2000);
  expect(window.swarm!.request).toHaveBeenCalledTimes(2);
});

it("polls a running query only to completion, with one bounded chain", async () => {
  let calls = 0;
  window.swarm!.request = vi.fn(async (request) => response(request, ++calls < 3 ? "refreshing" : "current"));
  const h = mount(); await tick(1500);
  expect(window.swarm!.request).toHaveBeenCalledTimes(3);
  expect(h.result.current.observation?.status).toBe("current");
  await tick(60_000); expect(window.swarm!.request).toHaveBeenCalledTimes(3);
});

it("stops an endless pending observation and retains data instead of polling forever", async () => {
  window.swarm!.request = vi.fn(async (request) => response(request, "refreshing"));
  const h = mount(); await tick(45_000);
  expect(h.result.current.observation?.status).toBe("stale");
  expect(h.result.current.observation?.graph).toBeTruthy();
  const count = vi.mocked(window.swarm!.request).mock.calls.length;
  expect(count).toBeLessThanOrEqual(82);
  await tick(60_000); expect(window.swarm!.request).toHaveBeenCalledTimes(count);
});

it("allows a longer deliberate setup window but still stops a stuck observation", async () => {
  window.swarm!.request = vi.fn(async (request) => {
    const value = response(request, "refreshing");
    return value.ok ? { ...value, buildGraph: { ...value.buildGraph!, loadingDependencies: true } } : value;
  });
  const h = mount(); await tick(70_000);
  expect(h.result.current.observation?.status).toBe("refreshing");
  await tick(70_000);
  expect(h.result.current.observation?.status).toBe("stale");
  const count = vi.mocked(window.swarm!.request).mock.calls.length;
  await tick(50_000); expect(window.swarm!.request).toHaveBeenCalledTimes(count);
});

it("sends only a scoped cancel and observes cleanup without replaying refresh", async () => {
  let cancelled = false;
  window.swarm!.request = vi.fn(async (request) => {
    if (request.type === "buildGraph.observe" && request.cancel) cancelled = true;
    return response(request, cancelled ? "error" : "refreshing");
  });
  const h = mount(); await tick(1);
  await act(async () => { await h.result.current.cancel(); }); await tick(1000);
  expect(h.result.current.observation?.status).toBe("error");
  const requests = vi.mocked(window.swarm!.request).mock.calls.map(([request]) => request);
  expect(requests.filter((request) => request.type === "buildGraph.observe" && request.cancel)).toHaveLength(1);
  expect(requests.every((request) => request.type === "buildGraph.observe" && !request.refresh)).toBe(true);
});

it("does not accept a held response or rejection after the core lifetime is replaced", async () => {
  let reject!: (error: Error) => void;
  window.swarm!.request = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockImplementation(async (request) => response(request));
  const h = mount(); await tick();
  h.rerender({ enabled: true, token: "first", realm: "core:2" }); await tick();
  expect(h.result.current.observation?.status).toBe("current");
  await act(async () => { reject(new Error("old core")); });
  expect(h.result.current.observation?.status).toBe("current");
  h.rerender({ enabled: false, token: "first", realm: "core:2" }); await tick(60_000);
  expect(window.swarm!.request).toHaveBeenCalledTimes(2);
  expect(h.result.current.observation?.status).toBe("stale");
});

it("does not turn visibility or a core restart into focus for a blurred document", async () => {
  const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const h = mount(); await tick(3000); expect(window.swarm!.request).not.toHaveBeenCalled();
  visibility.mockReturnValue("hidden"); act(() => document.dispatchEvent(new Event("visibilitychange")));
  visibility.mockReturnValue("visible"); act(() => document.dispatchEvent(new Event("visibilitychange")));
  h.rerender({ enabled: true, token: "first", realm: "core:2" }); await tick(3000);
  expect(window.swarm!.request).not.toHaveBeenCalled();
  focused.mockReturnValue(true); act(() => window.dispatchEvent(new Event("focus"))); await tick(2000);
  expect(window.swarm!.request).toHaveBeenCalledOnce();
});

it("coalesces repeated changes behind a held request without overlapping requests", async () => {
  let release!: (value: CoreResponse) => void;
  window.swarm!.request = vi.fn().mockImplementationOnce(() => new Promise<CoreResponse>((resolve) => { release = resolve; }))
    .mockImplementation(async (request) => response(request));
  const h = mount(); await tick();
  h.rerender({ enabled: true, token: "second", realm: "core:1" });
  h.rerender({ enabled: true, token: "third", realm: "core:1" }); await tick(4000);
  expect(window.swarm!.request).toHaveBeenCalledOnce();
  await act(async () => release(response(vi.mocked(window.swarm!.request).mock.calls[0]![0])));
  await tick(2000); expect(window.swarm!.request).toHaveBeenCalledTimes(2);
  await tick(60_000); expect(window.swarm!.request).toHaveBeenCalledTimes(2);
});

it("drops old repository data immediately and ignores its held response", async () => {
  let release!: (value: CoreResponse) => void;
  window.swarm!.request = vi.fn(() => new Promise<CoreResponse>((resolve) => { release = resolve; }));
  const h = renderHook(({ repositoryId, enabled }) => useBuildGraph(repositoryId, snapshot.world.id, "core", enabled),
    { initialProps: { repositoryId: snapshot.project.id, enabled: true } });
  const request = vi.mocked(window.swarm!.request).mock.calls[0]![0];
  h.rerender({ repositoryId: "other-repository", enabled: false });
  await act(async () => release(response(request)));
  expect(h.result.current.observation).toBeUndefined();
  await tick(60_000); expect(window.swarm!.request).toHaveBeenCalledOnce();
});
