/** Synthetic built-artifact test evidence, never a production discovery fallback. */
import { RealWorkspaceProvider, type ProviderDependencies } from "../core/provider";
import { adaptServiceTopology, type ServiceTopologyArtifact } from "../core/service-topology";
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../protocol/schema";
export const contextArtifact: ServiceTopologyArtifact = {
  schemaVersion: 1, service: { id: "service:validator", displayName: "Validator" }, owningTarget: "//example:implementation",
  implementationPaths: ["example/validator.ts", "example/validator.proto"],
  providedInterfaces: [{ id: "interface:validator.assess", name: "Validate", requestType: "validator.Request", responseType: "validator.Reply" }],
  requiredInterfaces: [{ id: "interface:writer.write", name: "Writer.Write", serviceId: "service:writer", requestType: "writer.Request", responseType: "writer.Reply" }],
  interfaceDeclarationPaths: [{ interfaceId: "interface:validator.assess", path: "example/validator.proto" }, { interfaceId: "interface:writer.write", path: "example/writer.proto" }], inputDigest: "d".repeat(64),
};
export const contextDependencies: ProviderDependencies = {
  register: async (root) => ({ root, id: "repository:example", name: "Synthetic fixture" }), fingerprint: async () => "a".repeat(64),
  discover: async () => ({ services: [], dependencies: [], paths: [], issues: [] }), now: () => "2026-09-07T03:00:00.000Z",
};

export async function contextRegistration(): Promise<WorkspaceSnapshot> {
  const provider = await RealWorkspaceProvider.create("/unused", contextDependencies);
  const snapshot = provider.snapshot(); provider.dispose(); return snapshot;
}

/** Assemble an already-built receipt directly; declaration discovery never builds it. */
export async function contextSnapshot(): Promise<WorkspaceSnapshot> {
  const snapshot = await contextRegistration();
  const fingerprint = "a".repeat(64), buildId = "b".repeat(64);
  const adapted = adaptServiceTopology(contextArtifact, "fixture://built-artifact", buildId, fingerprint, snapshot.reconciliation.epoch, contextDependencies.now(), snapshot.project.id);
  snapshot.revisions.working = { id: fingerprint, fingerprint, evidence: "observed" };
  snapshot.revisions.built = { id: buildId, sourceFingerprint: fingerprint };
  snapshot.focus = { ...snapshot.focus, revisionId: fingerprint };
  snapshot.reconciliation = { ...snapshot.reconciliation, status: "green", inputFingerprint: fingerprint, lastConsistentFingerprint: fingerprint };
  snapshot.graphs = [...snapshot.graphs.filter((graph) => graph.topologyId !== "service"), adapted.graph];
  snapshot.serviceContext = adapted.serviceContext;
  snapshot.mappings = adapted.mappings;
  snapshot.widgets = adapted.widgets;
  return WorkspaceSnapshotSchema.parse(snapshot);
}
