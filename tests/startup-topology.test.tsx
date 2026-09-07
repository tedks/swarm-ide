// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStartupTopology, type StartupTopologyContext, type StartupTopologyMemory } from "../app/renderer/startup-topology";
import { PROTOCOL_VERSION, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../protocol/schema";

const fingerprint = "a".repeat(64);
const observedAt = "2026-09-06T12:00:00.000Z";
function snapshot(): WorkspaceSnapshot {
  const focus = { worldId: "world:working", revisionKind: "working" as const, revisionId: fingerprint, domain: "repo", key: "dir:" };
  const provenance = [{ sourceKind: "repo" as const, uri: "repo://test/", version: "capture:root", observedAt }];
  return WorkspaceSnapshotSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    project: { id: "repository:test", name: "test" }, world: { id: "world:working", label: "working tree" },
    revisions: { working: { id: fingerprint, fingerprint, evidence: "observed" },
      built: { id: "", sourceFingerprint: "" }, deployed: { id: "", buildId: "", environment: "not configured" } },
    focus,
    graphs: [
      { schemaVersion: PROTOCOL_VERSION, topologyId: "repo", title: "Repository", scope: "/", zoomBand: "file", epoch: 0,
        reconciliation: "gray", inputFingerprint: fingerprint, provenance,
        nodes: [{ id: "directory:", label: "/", kind: "directory", status: "gray", position: { x: 0, y: 0 }, focus }], edges: [],
        directory: { directory: "", observationId: "capture:root", capturedAt: observedAt, state: "observed", complete: true,
          capturedCount: 0, filteredCount: 0, page: 0, pageCount: 1, filter: "", entries: [] } },
      { schemaVersion: PROTOCOL_VERSION, topologyId: "service", title: "Service topology", scope: "//examples:topology", zoomBand: "service", epoch: 1,
        reconciliation: "yellow", inputFingerprint: fingerprint, nodes: [], edges: [], provenance },
    ],
    mappings: [], widgets: [], jobs: [], activity: [],
    reconciliation: { epoch: 1, status: "yellow", inputFingerprint: fingerprint, lastConsistentFingerprint: "unobserved", message: "Build to observe service topology" },
  });
}
function context(patch: Partial<StartupTopologyContext> = {}): StartupTopologyContext {
  return { snapshot: snapshot(), coreGeneration: 1, observedCoreGeneration: 1, ready: true, restoredDocument: false, ...patch };
}
function setup(initial = context(), memory: StartupTopologyMemory = {}) {
  const start = vi.fn();
  const view = renderHook((input: StartupTopologyContext) => useStartupTopology(input, start, memory), { initialProps: initial,
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
  return { ...view, start, memory };
}
afterEach(cleanup);

describe("one-shot startup topology reconciliation", () => {
  it("does not build an externally selected repository without automatic authority", () => {
    const h = setup({ ...context(), automatic: false });
    expect(h.start).not.toHaveBeenCalled();
    expect(h.memory.settled).toBe(true);
  });

  it("denied startup is consumed before readiness and cannot revive through rerender, HMR or core recovery", () => {
    const h = setup({ ...context({ ready: false, snapshot: null }), automatic: false });
    h.rerender(context());
    h.unmount();
    const remount = setup(context(), h.memory);
    remount.rerender(context({ coreGeneration: 2, observedCoreGeneration: 2 }));
    expect(h.start).not.toHaveBeenCalled();
    expect(remount.start).not.toHaveBeenCalled();
  });

  it("builds the first observed yellow repository once under StrictMode and ordinary updates", () => {
    const state = snapshot();
    const h = setup(context({ snapshot: state }));
    expect(h.start).toHaveBeenCalledOnce();
    h.rerender(context({ snapshot: { ...state, reconciliation: { ...state.reconciliation, epoch: 2 } } }));
    h.rerender(context({ snapshot: { ...state, revisions: { ...state.revisions, working: { id: "b".repeat(64), fingerprint: "b".repeat(64), evidence: "observed" } } } }));
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("waits for the actual live-core snapshot, not a restored or early event snapshot", () => {
    const h = setup(context({ ready: false, observedCoreGeneration: null }));
    h.rerender(context({ observedCoreGeneration: null }));
    expect(h.start).not.toHaveBeenCalled();
    h.rerender(context({ snapshot: null }));
    expect(h.start).not.toHaveBeenCalled();
    h.rerender(context());
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("waits through unavailable registration evidence without inventing a fingerprint", () => {
    const state = snapshot();
    const unobserved = { ...state, revisions: { ...state.revisions, working: { id: "unobserved:test", fingerprint: "", evidence: "unavailable" as const } },
      reconciliation: { ...state.reconciliation, epoch: 0, status: "gray" as const } };
    const h = setup(context({ snapshot: unobserved }));
    expect(h.start).not.toHaveBeenCalled();
    h.rerender(context({ snapshot: { ...unobserved, revisions: { ...unobserved.revisions, working: { ...unobserved.revisions.working, fingerprint } } } }));
    expect(h.start).not.toHaveBeenCalled();
    h.rerender(context());
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("does not repeat an attempt across HMR remounts, failure, or core recovery", () => {
    const h = setup();
    h.unmount();
    const replacement = setup(context(), h.memory);
    replacement.rerender(context({ ready: false }));
    replacement.rerender(context({ coreGeneration: 2, observedCoreGeneration: 2 }));
    const failed = snapshot(); failed.reconciliation.status = "red";
    replacement.rerender(context({ snapshot: failed, coreGeneration: 2, observedCoreGeneration: 2 }));
    expect(h.start).toHaveBeenCalledOnce();
    expect(replacement.start).not.toHaveBeenCalled();
  });

  it("does not replay if an attempt has not produced any job acknowledgement", () => {
    const memory: StartupTopologyMemory = {};
    const start = vi.fn(() => new Promise<void>(() => undefined));
    const view = renderHook((input: StartupTopologyContext) => useStartupTopology(input, start, memory), { initialProps: context() });
    view.rerender(context());
    view.unmount();
    renderHook(() => useStartupTopology(context(), start, memory));
    expect(start).toHaveBeenCalledOnce();
  });

  it("cancels a still-waiting startup when its core is replaced", () => {
    const h = setup(context({ observedCoreGeneration: null }));
    h.rerender(context({ ready: false, coreGeneration: 2, observedCoreGeneration: null }));
    h.rerender(context({ coreGeneration: 2, observedCoreGeneration: 2 }));
    expect(h.start).not.toHaveBeenCalled();
  });

  it("does not treat a document/preload refresh as another app launch", () => {
    const h = setup(context({ restoredDocument: true }));
    h.rerender(context());
    expect(h.start).not.toHaveBeenCalled();
  });

  it.each(["queued", "running", "succeeded", "failed"] as const)("defers to an existing %s build and never retries it", (status) => {
    const state = snapshot();
    state.jobs = [{ id: "build:1", label: "Topology build", kind: "build", status, progress: 0,
      resources: { cpuPercent: 0, memoryMiB: 0 } }];
    const h = setup(context({ snapshot: state }));
    h.rerender(context());
    expect(h.start).not.toHaveBeenCalled();
  });

  it("remembers previous build activity after jobs have been cleared by a source change", () => {
    const state = snapshot();
    state.activity = [{ id: "attempt:1", at: observedAt, kind: "build", status: "red", summary: "Previous build failed" }];
    const h = setup(context({ snapshot: state }));
    h.rerender(context());
    expect(h.start).not.toHaveBeenCalled();
  });

  it.each(["red", "green"] as const)("does not override a pre-existing %s reconciliation outcome", (status) => {
    const state = snapshot(); state.reconciliation.status = status;
    const h = setup(context({ snapshot: state }));
    h.rerender(context());
    expect(h.start).not.toHaveBeenCalled();
  });

  it.each(["fingerprint", "built"] as const)("does not rebuild retained consistent topology identified by %s", (evidence) => {
    const state = snapshot();
    if (evidence === "fingerprint") state.reconciliation.lastConsistentFingerprint = fingerprint;
    else state.revisions.built = { id: "built:old", sourceFingerprint: fingerprint };
    const h = setup(context({ snapshot: state }));
    h.rerender(context());
    expect(h.start).not.toHaveBeenCalled();
  });

  it.each(["repo", "service"])("does not dispatch without the real %s projection", (topologyId) => {
    const state = snapshot(); state.graphs = state.graphs.filter((graph) => graph.topologyId !== topologyId);
    const h = setup(context({ snapshot: state }));
    expect(h.start).not.toHaveBeenCalled();
  });

  it("does not dispatch for fixture-only repository graphs", () => {
    const state = snapshot(); delete state.graphs[0]!.directory;
    const h = setup(context({ snapshot: state }));
    expect(h.start).not.toHaveBeenCalled();
  });

  it("starts independently in a genuinely new app document", () => {
    const first = setup(); first.unmount();
    const next = setup();
    expect(first.start).toHaveBeenCalledOnce();
    expect(next.start).toHaveBeenCalledOnce();
  });
});
