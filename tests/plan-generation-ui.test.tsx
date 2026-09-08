// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanGeneration } from "../app/renderer/plans/PlanGeneration";
import { DesignWorkspace } from "../app/renderer/plans/DesignWorkspace";
import { readPlanGenerationSettings } from "../app/renderer/plans/generation-settings";
import { PLAN_READ_MESSAGES, type PlanReadResult } from "../protocol/plans";
import type { PlanNavigation } from "../app/renderer/plans/navigation";
import { PlanGenerationUnconfirmedError, usePlanGeneration } from "../app/renderer/plans/use-plan-generation";
import { PlanGenerationSettingsSchema } from "../protocol/plan-generation";
import { TrustedSnapshotSchema } from "../protocol/trusted-local";
import { startComponentPlan } from "../app/renderer/plans/start-generation";
import { workspaceBridge } from "../app/renderer/workspace-bridge";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";

vi.mock("@xyflow/react", () => ({ Position: { Right: "right", Left: "left" } }));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
describe("explicit plan generation", () => {
  const snapshot = (token: string, status: "ready" | "running" | "failed" | "closed") => TrustedSnapshotSchema.parse({
    instanceId: crypto.randomUUID(), profile: "trusted-local", workspace: "/repo", preparation: null,
    runToken: token, status, threadId: "thread", turnId: "turn", output: "", message: "", approvals: [],
  });
  it("dispatches one schema-valid start through the captured selected-worktree bridge", async () => {
    const token = crypto.randomUUID();
    const request = vi.fn(async (input: CoreRequest) => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: 1,
      snapshot: { ...initialSnapshot(), project: { ...initialSnapshot().project, id: input.workspaceId ?? initialSnapshot().project.id } }, workspaceId: input.workspaceId, trusted: { kind: "trusted" as const, snapshot: snapshot(token, "running") } }));
    const bridge = workspaceBridge({ request, onEvent: () => () => {} }, "repo:selected")!;
    await startComponentPlan(bridge, token, PlanGenerationSettingsSchema.parse({ model: "custom-model", effort: "high", prompt: "Explain the scheduler." }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toMatchObject({ type: "trusted.start", token, workspaceId: "repo:selected", purpose: "component-plan", model: "custom-model", effort: "high" });
    expect(request.mock.calls[0]![0]).not.toHaveProperty("input");
  });
  it("keeps lost acknowledgements unconfirmed instead of resubmitting", async () => {
    const request = vi.fn(async () => { throw new Error("Connection reset"); });
    await expect(startComponentPlan({ request, onEvent: () => () => {} }, crypto.randomUUID(), PlanGenerationSettingsSchema.parse({}))).rejects.toBeInstanceOf(PlanGenerationUnconfirmedError);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("launches once, selects the admitted agent and refreshes the normal reader on completion", async () => {
    let finish!: () => void;
    const launch = vi.fn((_token: string) => new Promise<void>(resolve => { finish = resolve; })), onOpen = vi.fn();
    const { result, rerender } = renderHook(({ observation }) => usePlanGeneration({ identity: "repo-a:1", connected: true, launch, onOpen, observation }),
      { initialProps: { observation: null as ReturnType<typeof snapshot> | null } });
    act(() => { result.current.start(PlanGenerationSettingsSchema.parse({})); result.current.start(PlanGenerationSettingsSchema.parse({})); });
    expect(launch).toHaveBeenCalledTimes(1); expect(onOpen).not.toHaveBeenCalled();
    await act(async () => finish());
    const token = launch.mock.calls[0]![0];
    expect(onOpen).toHaveBeenCalledWith(token);
    rerender({ observation: snapshot(token, "running") }); expect(result.current.pending).toBe(true);
    rerender({ observation: snapshot(token, "ready") });
    expect(result.current.pending).toBe(false); expect(result.current.refreshVersion).toBe(1);
    rerender({ observation: snapshot(token, "ready") }); expect(result.current.refreshVersion).toBe(1);
  });
  it("keeps an admitted run target stable and ignores a late reply after navigating away", async () => {
    let finish!: () => void;
    const launch = vi.fn((_token: string) => new Promise<void>(resolve => { finish = resolve; })), onOpen = vi.fn();
    const { result, rerender } = renderHook(({ identity }) => usePlanGeneration({ identity, connected: true, launch, onOpen, observation: null }),
      { initialProps: { identity: "repo-a:1" } });
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    rerender({ identity: "repo-b:1" });
    await act(async () => finish());
    expect(onOpen).not.toHaveBeenCalled(); expect(result.current.pending).toBe(false);
    expect(result.current.refreshVersion).toBe(0);
    rerender({ identity: "repo-a:1" });
    expect(result.current.pending).toBe(true);
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it("rejects a retained callback from an old worktree or connection", () => {
    const launch = vi.fn(async () => {});
    const { result, rerender } = renderHook(({ identity, connected }) => usePlanGeneration({ identity, connected, launch, onOpen: vi.fn(), observation: null }),
      { initialProps: { identity: "repo-a", connected: true } });
    const old = result.current.start;
    rerender({ identity: "repo-b", connected: true });
    act(() => old(PlanGenerationSettingsSchema.parse({})));
    expect(launch).not.toHaveBeenCalled();
    const previousConnection = result.current.start;
    rerender({ identity: "repo-b", connected: false });
    act(() => previousConnection(PlanGenerationSettingsSchema.parse({})));
    expect(launch).not.toHaveBeenCalled();
  });
  it.each(["failed", "closed"] as const)("shows %s and rereads partial files without relaunch", async status => {
    const launch = vi.fn(async (_token: string) => {}), onOpen = vi.fn();
    const { result, rerender } = renderHook(({ observation }) => usePlanGeneration({ identity: "repo-a:1", connected: true, launch, onOpen, observation }),
      { initialProps: { observation: null as ReturnType<typeof snapshot> | null } });
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    rerender({ observation: snapshot(launch.mock.calls[0]![0], status) });
    expect(result.current.pending).toBe(false); expect(result.current.refreshVersion).toBe(1);
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it("does not duplicate an unconfirmed admission and retains its agent link", async () => {
    const launch = vi.fn(async () => { throw new PlanGenerationUnconfirmedError("Connection lost. Check the generation agent before starting another."); });
    const { result } = renderHook(() => usePlanGeneration({ identity: "repo-a:1", connected: true, launch, onOpen: vi.fn(), observation: null }));
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    await waitFor(() => expect(result.current.notice).toContain("Connection lost"));
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    expect(launch).toHaveBeenCalledTimes(1); expect(result.current.pending).toBe(true); expect(result.current.open).toBeTypeOf("function");
  });
  it("offers explicit same-token recovery for rejection without inventing another run", async () => {
    const launch = vi.fn(async (_token: string) => { throw new PlanGenerationUnconfirmedError("Capacity unavailable"); });
    const { result, unmount } = renderHook(() => usePlanGeneration({ identity: "retry-root", connected: true, launch, onOpen: vi.fn(), observation: null }));
    act(() => result.current.start(PlanGenerationSettingsSchema.parse({})));
    await waitFor(() => expect(result.current.retry).toBeTypeOf("function"));
    const token = launch.mock.calls[0]![0];
    await act(async () => result.current.retry!(PlanGenerationSettingsSchema.parse({})));
    expect(launch.mock.calls.map(call => call[0])).toEqual([token, token]);
    unmount();
    const restored = renderHook(() => usePlanGeneration({ identity: "retry-root", connected: true, launch, onOpen: vi.fn(), observation: null }));
    await act(async () => restored.result.current.retry!(PlanGenerationSettingsSchema.parse({})));
    expect(launch.mock.calls.map(call => call[0])).toEqual([token, token, token]);
  });
  it("has working defaults and settings edits/save never start an agent", () => {
    const start = vi.fn();
    render(<PlanGeneration action={{ start, pending: false, notice: "" }} disabled={false} />);
    expect(screen.getByLabelText("Model")).toHaveProperty("value", "gpt-5.6-sol");
    expect(screen.getByLabelText("Reasoning")).toHaveProperty("value", "xhigh");
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "custom-model" } });
    fireEvent.change(screen.getByLabelText("Reasoning"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Explain this source." } });
    fireEvent.click(screen.getByText("Save settings"));
    expect(start).not.toHaveBeenCalled();
    expect(readPlanGenerationSettings()).toMatchObject({ model: "custom-model", effort: "high", prompt: "Explain this source." });
    fireEvent.click(screen.getByRole("button", { name: "Generate component plan" }));
    expect(start).toHaveBeenCalledExactlyOnceWith(readPlanGenerationSettings());
  });
  it("holds launch while disconnected or pending and keeps actionable failures visible", () => {
    const start = vi.fn();
    const rendered = render(<PlanGeneration action={{ start, pending: false, notice: "Configured model unavailable" }} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Generate component plan" }));
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Configured model unavailable");
    rendered.rerender(<PlanGeneration action={{ start, pending: true, notice: "", open: vi.fn() }} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Generating component plan…" }));
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "View generation agent" })).toBeTruthy();
  });
  it.each(["missing", "unavailable", "malformed", "observed"])("offers generation only for verified absence: %s", (kind) => {
    const code = kind === "malformed" ? "PLAN_INDEX_MALFORMED" : "PLAN_INDEX_UNAVAILABLE";
    const result: PlanReadResult = kind === "observed" ? { status: "observed", index: { version: 1, nodes: [] }, revision: "a".repeat(64), observedAt: new Date().toISOString() }
      : { status: "unavailable", code, message: PLAN_READ_MESSAGES[code], ...(kind === "missing" ? { missing: true as const } : {}) };
    const navigation: PlanNavigation = { index: result.status === "observed" ? result.index : null, node: undefined, selected: null, select: vi.fn(), read: vi.fn(),
      current: true, loading: false, notice: "No design", result, breadcrumbs: [], scopeKey: "scope" };
    render(<DesignWorkspace visible connected worldId="world" repositoryId="repo" generation={1} onOpenFile={vi.fn()} navigation={navigation}
      generationAction={{ start: vi.fn(), pending: false, notice: "" }} renderWorkspace={({ components }) => components} />);
    expect(Boolean(screen.queryByRole("button", { name: "Generate component plan" }))).toBe(kind === "missing");
  });
});
