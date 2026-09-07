// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ServiceContextObservationSchema } from "../protocol/context";
import { WorkspaceSnapshotSchema } from "../protocol/schema";
import { RealWorkspaceProvider } from "../core/provider";
import { adaptServiceTopology, type ServiceTopologyArtifact } from "../core/service-topology";

import { contextArtifact, contextDependencies } from "./context-fixture";
describe("bounded contextual publication", () => {
  it("publishes atomically and retains original build provenance through changed and unavailable working evidence", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", contextDependencies);
    expect(provider.snapshot().serviceContext).toBeUndefined();
    await provider.startReconciliation(() => undefined);
    const original = structuredClone(provider.snapshot().serviceContext!);
    expect(original.status).toBe("observed");
    provider.markWorkingWorldChanged("b".repeat(64), () => undefined);
    expect(provider.snapshot().serviceContext).toEqual(original);
    expect(provider.snapshot().reconciliation.status).toBe("yellow");
    provider.markWorkingWorldUnknown("Unavailable", () => undefined);
    expect(provider.snapshot().serviceContext).toEqual(original);
    expect(WorkspaceSnapshotSchema.safeParse(provider.snapshot()).success).toBe(true);
    provider.dispose();
  });
  it("strictly rejects wrong repository, world, build, fingerprint and service identities", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", contextDependencies); await provider.startReconciliation(() => undefined);
    const snapshot = provider.snapshot();
    for (const patch of [{ repositoryId: "other" }, { worldId: "other" }, { buildId: "f".repeat(64) }, { sourceFingerprint: "other" }, { service: { ...contextArtifact.service, id: "service:other" } }]) {
      expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceContext: { ...snapshot.serviceContext, ...patch } }).success).toBe(false);
    }
    expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceContext: undefined }).success).toBe(true);
    provider.dispose();
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
