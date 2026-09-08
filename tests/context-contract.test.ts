// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ServiceContextObservationSchema } from "../protocol/context";
import { WorkspaceSnapshotSchema } from "../protocol/schema";
import { staleSnapshot } from "../app/renderer/recovery";
import { adaptServiceTopology, type ServiceTopologyArtifact } from "../core/service-topology";

import { contextArtifact, contextDependencies, contextSnapshot } from "./context-fixture";
describe("bounded contextual publication", () => {
  it("retains original built provenance through changed and unavailable working evidence", async () => {
    const snapshot = await contextSnapshot();
    const original = structuredClone(snapshot.serviceContext!);
    expect(original.status).toBe("observed");
    const changed = staleSnapshot(snapshot, "Synthetic source change");
    changed.revisions.working = { id: "changed", fingerprint: "changed", evidence: "observed" };
    changed.focus.revisionId = "changed";
    changed.reconciliation.inputFingerprint = "changed";
    expect(changed.serviceContext).toEqual(original);
    expect(changed.reconciliation.status).toBe("yellow");
    changed.revisions.working.evidence = "unavailable";
    changed.reconciliation.status = "red";
    expect(changed.serviceContext).toEqual(original);
    expect(WorkspaceSnapshotSchema.safeParse(changed).success).toBe(true);
  });
  it("strictly rejects wrong repository, world, build, fingerprint and service identities", async () => {
    const snapshot = await contextSnapshot();
    for (const patch of [{ repositoryId: "other" }, { worldId: "other" }, { buildId: "f".repeat(64) }, { sourceFingerprint: "other" }, { service: { ...contextArtifact.service, id: "service:other" } }]) {
      expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceContext: { ...snapshot.serviceContext, ...patch } }).success).toBe(false);
    }
    expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceContext: undefined }).success).toBe(true);
  });
  it("reports producer-local unavailable for overflow or unsupported paths without accepting malformed incoming data", () => {
    const adapt = (artifact: ServiceTopologyArtifact) => adaptServiceTopology(artifact, "bazel://artifact", "b".repeat(64), "a".repeat(64), 1, contextDependencies.now(), "repository:example");
    for (const path of [".git/config", "../escape", "bad\u0000file", "bad\\file"])
      expect(adapt({ ...contextArtifact, implementationPaths: [path] }).serviceContext.status).toBe("unavailable");
    const oversized = { ...contextArtifact, implementationPaths: Array.from({ length: 64 }, (_, n) => `${n}/${"x".repeat(4080)}`) };
    // UTF-8/JSON plus declaration/provenance bytes exceeds 256KiB.
    oversized.interfaceDeclarationPaths = oversized.interfaceDeclarationPaths.map((item) => ({ ...item, path: "z".repeat(4090) }));
    expect(adapt(oversized).serviceContext.status).toBe("unavailable");
    const valid = adapt(contextArtifact).serviceContext;
    expect(ServiceContextObservationSchema.safeParse({ ...valid, arbitrary: true }).success).toBe(false);
    expect(ServiceContextObservationSchema.safeParse({ ...valid, service: { ...contextArtifact, implementationPaths: [".git/config"] } }).success).toBe(false);
  });
});
