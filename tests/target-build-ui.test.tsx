// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTargetBuilds } from "../app/renderer/build-resources/use-target-builds";
import { BuildResources } from "../app/renderer/build-resources/BuildResources";
import { BuildGraphPane } from "../app/renderer/repository/BuildGraphPane";
import type { BuildJobsObservation, TargetBuildJob } from "../protocol/build-jobs";
import { PROTOCOL_VERSION, parseCoreResponseForRequest, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";
import { fixtureBuildObservation } from "./support/build-graph-fixture";
import { buildGraphLinks } from "../app/renderer/repository/use-build-graph";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, onNodeClick, children }: { nodes: Array<{ id: string }>; onNodeClick: (event: null, node: { id: string }) => void; children: React.ReactNode }) => <div>{nodes.map((node) => <button key={node.id} onClick={() => onNodeClick(null, node)}>{node.id}</button>)}{children}</div>,
  Background: () => null, Controls: () => null, Handle: () => null, MarkerType: { ArrowClosed: "closed" }, Position: { Left: "left", Right: "right" },
}));
const snapshot = initialSnapshot();
const job: TargetBuildJob = { id: "job-1", target: "//demo:build", status: "running", startedAt: "2026-09-08T18:00:00.000Z", elapsedMs: 1234, message: "Configured //demo:build", output: "", cleanup: "pending" };
const observation = (jobs: TargetBuildJob[] = []): BuildJobsObservation => ({ repositoryId: snapshot.project.id, worldId: snapshot.world.id, blocked: false, jobs });
const response = (request: CoreRequest, jobs: TargetBuildJob[] = []): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot, buildJobs: observation(jobs) });
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.swarm; });
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

it("keeps target jobs when topology jobs clear, showing actual time/milestones and no fake resources", () => {
  const cancel = vi.fn(); const view = render(<BuildResources jobs={[]} targetBuilds={observation([job])} onCancel={cancel} />);
  expect(screen.getByText("Configured //demo:build")).toBeTruthy(); expect(screen.getByText("1.2 s")).toBeTruthy();
  expect(screen.queryByText("No build jobs")).toBeNull(); expect(screen.queryByText("0%")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop" })); expect(cancel).toHaveBeenCalledWith("job-1");
  view.rerender(<BuildResources jobs={[]} targetBuilds={observation([{ ...job, status: "failed", cleanup: "confirmed", output: "compile failed" }])} />);
  expect(screen.getByText("Failed")).toBeTruthy(); expect(screen.getByText("compile failed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
});

it("separates dependency refresh from exact selected rule build and disallows stale/active builds", () => {
  const graph = fixtureBuildObservation(snapshot);
  const capture = buildGraphLinks(graph)!;
  const target = capture.targets!.find((item) => item.kind === "rule" && item.label.startsWith("//"))!;
  const onBuild = vi.fn(), onRefresh = vi.fn();
  const props = { capture, observation: graph, mockAgents: false, mockVersion: 0, onOpenBuild: vi.fn(), onBuild, onRefresh };
  const view = render(<BuildGraphPane {...props} />);
  const build = screen.getByRole("button", { name: "Build selected target" }) as HTMLButtonElement;
  expect(build.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh dependencies" })); expect(onRefresh).toHaveBeenCalledOnce(); expect(onBuild).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: target.label })); fireEvent.click(build);
  expect(onBuild).toHaveBeenCalledWith(target.label);
  view.rerender(<BuildGraphPane {...props} buildBusy />); expect(build.disabled).toBe(true);
  view.rerender(<BuildGraphPane {...props} observation={{ ...graph, status: "stale" }} />); expect(build.disabled).toBe(true);
});

it("checks response workspace and does not permit build data on unrelated commands", () => {
  const request = { protocolVersion: PROTOCOL_VERSION, requestId: "check", type: "build.observe" as const, repositoryId: snapshot.project.id, worldId: snapshot.world.id };
  const valid = response(request);
  expect(parseCoreResponseForRequest(valid, request).ok).toBe(true);
  expect(() => parseCoreResponseForRequest({ ...valid, buildJobs: { ...observation(), repositoryId: "other" } }, request)).toThrow(/workspace mismatch/);
  expect(() => parseCoreResponseForRequest(valid, { protocolVersion: PROTOCOL_VERSION, requestId: "check", type: "workspace.snapshot" })).toThrow(/different command/);
});

it("polls only active jobs, retains completed rows and never rebuilds on refresh/rerender", async () => {
  vi.useFakeTimers();
  window.swarm = { request: vi.fn(async (request) => response(request, [])), onEvent: () => () => {} };
  const h = renderHook(() => useTargetBuilds(snapshot.project.id, snapshot.world.id, "core-1", true)); await tick();
  expect(window.swarm.request).toHaveBeenCalledOnce();
  vi.mocked(window.swarm.request).mockImplementation(async (request) => response(request, [request.type === "build.start" ? job : { ...job, status: "succeeded", cleanup: "confirmed" }]));
  await act(async () => { await h.result.current.start(job.target); }); await tick(500);
  expect(h.result.current.observation?.jobs[0]?.status).toBe("succeeded");
  h.rerender(); await tick(5000); expect(window.swarm.request).toHaveBeenCalledTimes(3);
  expect(vi.mocked(window.swarm.request).mock.calls.filter(([request]) => request.type === "build.start")).toHaveLength(1);
});

it("recovers polling when Start overtakes a held older observation without overwriting the new job", async () => {
  vi.useFakeTimers(); let release!: () => void;
  window.swarm = { request: vi.fn().mockImplementationOnce((request: CoreRequest) => new Promise((resolve) => { release = () => resolve(response(request)); }))
    .mockImplementation(async (request: CoreRequest) => response(request, [request.type === "build.start" ? job : { ...job, status: "succeeded", cleanup: "confirmed" }])), onEvent: () => () => {} };
  const h = renderHook(() => useTargetBuilds(snapshot.project.id, snapshot.world.id, "core-1", true));
  await act(async () => { await h.result.current.start(job.target); }); await tick(500);
  expect(h.result.current.observation?.jobs[0]?.status).toBe("running");
  await act(async () => release()); await tick();
  expect(h.result.current.observation?.jobs[0]?.status).toBe("succeeded");
  expect(vi.mocked(window.swarm.request).mock.calls.filter(([request]) => request.type === "build.start")).toHaveLength(1);
});

it("does not retry Start after a lost response and fences old-root replies", async () => {
  vi.useFakeTimers();
  window.swarm = { request: vi.fn(async (request) => { if (request.type === "build.start") throw new Error("lost reply"); return response(request); }), onEvent: () => () => {} };
  const h = renderHook(({ id }) => useTargetBuilds(id, snapshot.world.id, "core-1", true), { initialProps: { id: snapshot.project.id } }); await tick();
  await act(async () => { await h.result.current.start(job.target); }); await tick(1500);
  expect(vi.mocked(window.swarm.request).mock.calls.filter(([request]) => request.type === "build.start")).toHaveLength(1);
  h.rerender({ id: "other" }); await tick(); expect(h.result.current.observation).toBeUndefined();
});
