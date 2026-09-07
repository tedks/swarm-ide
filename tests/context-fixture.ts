import type { ProviderDependencies } from "../core/provider";
import type { ServiceTopologyArtifact } from "../core/service-topology";
export const contextArtifact: ServiceTopologyArtifact = {
  schemaVersion: 1, service: { id: "service:fraud-check", displayName: "FraudCheck" }, owningTarget: "//example:implementation",
  implementationPaths: ["example/fraudcheck.ts", "example/fraudcheck.proto"],
  providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "fraud.Request", responseType: "fraud.Reply" }],
  requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "payments.Request", responseType: "payments.Reply" }],
  interfaceDeclarationPaths: [{ interfaceId: "interface:fraud-check.assess", path: "example/fraudcheck.proto" }, { interfaceId: "interface:payments.authorize", path: "example/payments.proto" }], inputDigest: "d".repeat(64),
};
export const contextDependencies: ProviderDependencies = {
  register: async (root) => ({ root, id: "repository:example", name: "Example" }), fingerprint: async () => "a".repeat(64),
  build: async () => ({ artifactPath: "/unused" }), readArtifact: async () => ({ bytes: Buffer.from(JSON.stringify(contextArtifact)), artifact: contextArtifact }), now: () => "2026-09-07T03:00:00.000Z",
};
