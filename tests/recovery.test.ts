import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { retainDerived, staleSnapshot, NavigationSchema } from "../app/renderer/recovery";
import { WorkspaceSnapshotSchema } from "../protocol/schema";
import { RealWorkspaceProvider } from "../core/provider";
import { contextDependencies } from "./context-fixture";
import { composeContext, indexCapture, indexService } from "../app/renderer/context/compose";

describe("retained derived navigation", () => {
  it("retains exact optional Context through registration/listing/observation without promoting it", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", contextDependencies);
    const registration = provider.snapshot(); await provider.startReconciliation(() => undefined);
    const previous = provider.snapshot(); provider.dispose();
    let retained = previous;
    for (const incoming of [registration, structuredClone(registration), { ...registration, revisions: { ...registration.revisions, working: previous.revisions.working }, focus: previous.focus, reconciliation: { ...registration.reconciliation, inputFingerprint: previous.revisions.working.id } }]) {
      retained = WorkspaceSnapshotSchema.parse(retainDerived(retained, incoming));
      expect(retained.serviceContext).toEqual(previous.serviceContext);
      const sections = composeContext({ repositoryId: retained.project.id, worldId: retained.world.id, kind: "service", id: "service:fraud-check" }, {
        snapshot: retained, service: indexService(retained.serviceContext), capture: indexCapture(undefined), files: [], realm: "new core", session: "new", ready: true,
      });
      expect(sections.find((item) => item.id === "services")?.evidence?.freshness).toBe("retained");
    }
    expect(retainDerived(retained, previous)).toEqual(previous);
    expect(retainDerived(previous, { ...registration, project: { ...registration.project, id: "other" } }).serviceContext).toBeUndefined();
    const otherWorld = WorkspaceSnapshotSchema.parse({ ...registration, world: { id: "world:other", label: "Other world" }, focus: { ...registration.focus, worldId: "world:other" } });
    expect(retainDerived(previous, otherWorld)).toBe(otherWorld);
  });
  it("retains built service evidence across registration, initial listing and source observation", () => {
    const previous = initialSnapshot();
    const base = structuredClone(previous);
    base.revisions.working = { id: "unobserved:registered", fingerprint: "", evidence: "unavailable" };
    base.revisions.built = { id: "", sourceFingerprint: "" };
    base.focus = { ...base.focus, revisionId: "unobserved:registered" };
    base.reconciliation = { ...base.reconciliation, status: "gray", inputFingerprint: "unobserved:registered", lastConsistentFingerprint: "unobserved" };
    base.graphs = base.graphs.map((graph) => ({ ...graph, reconciliation: "gray", nodes: [], edges: [] }));
    base.mappings = [];
    const retainedRegistration = WorkspaceSnapshotSchema.parse(retainDerived(previous, base));
    expect(retainedRegistration.reconciliation.lastConsistentFingerprint).toBe("unobserved");
    const listed = WorkspaceSnapshotSchema.parse(retainDerived(retainedRegistration, structuredClone(base)));
    const observed = structuredClone(base);
    observed.revisions.working = { id: "fresh", fingerprint: "fresh", evidence: "observed" };
    observed.focus.revisionId = "fresh";
    observed.reconciliation.inputFingerprint = "fresh";
    const retainedObserved = WorkspaceSnapshotSchema.parse(retainDerived(listed, observed));
    const service = previous.graphs.find((graph) => graph.topologyId === "service")!;
    for (const snapshot of [retainedRegistration, listed, retainedObserved]) {
      expect(snapshot.graphs.find((graph) => graph.topologyId === "service")?.nodes.map((node) => node.id)).toEqual(service.nodes.map((node) => node.id));
      expect(snapshot.graphs.find((graph) => graph.topologyId === "service")?.provenance).toEqual(service.provenance);
      expect(snapshot.graphs.find((graph) => graph.topologyId === "service")?.reconciliation).toBe("yellow");
      expect(snapshot.revisions.built).toEqual(previous.revisions.built);
    }
    expect(retainedObserved.reconciliation.lastConsistentFingerprint).toBe(previous.revisions.built.sourceFingerprint);
    expect(retainDerived(retainedObserved, previous)).toEqual(previous);
  });
  it("retags working navigation but keeps old derivation provenance explicitly stale", () => {
    const previous = initialSnapshot();
    const next = structuredClone(previous);
    next.revisions.working = { id: "next", fingerprint: "next", evidence: "observed" };
    next.focus.revisionId = "next";
    next.reconciliation = { ...next.reconciliation, status: "gray", lastConsistentFingerprint: "unobserved" };
    const retained = retainDerived(previous, next);
    expect(retained.reconciliation.status).toBe("yellow");
    expect(retained.graphs.map((g) => g.provenance)).toEqual(previous.graphs.map((g) => g.provenance));
    for (const node of retained.graphs.flatMap((g) => g.nodes)) if (node.focus.revisionKind === "working") expect(node.focus.revisionId).toBe("next");
    for (const mapping of retained.mappings) {
      if (mapping.from.revisionKind === "working") expect(mapping.from.revisionId).toBe("next");
      for (const candidate of mapping.candidates) if (candidate.focus.revisionKind === "working") expect(candidate.focus.revisionId).toBe("next");
    }
    expect(() => WorkspaceSnapshotSchema.parse(retained)).not.toThrow();
  });
  it("round-trips a stale graph checkpoint for document refresh", () => {
    const snapshot = staleSnapshot(initialSnapshot(), "Core updating");
    const saved = NavigationSchema.parse(JSON.parse(JSON.stringify({ paths: [], activeSurface: "graphs", lens: "System", focus: snapshot.focus, snapshot })));
    expect(saved.snapshot?.graphs).toEqual(snapshot.graphs);
    expect(saved.snapshot?.reconciliation.status).toBe("yellow");
  });
});
