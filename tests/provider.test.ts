// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../protocol/schema";
import { RealWorkspaceProvider, SERVICE_TOPOLOGY_TARGET, type ProviderDependencies } from "../core/provider";
import { ServiceTopologyArtifactSchema, type ServiceTopologyArtifact } from "../core/service-topology";

const artifact: ServiceTopologyArtifact = {
  schemaVersion: 1,
  service: { id: "service:fraud-check", displayName: "FraudCheck" },
  providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "FraudAssessmentRequest", responseType: "FraudAssessmentDecision" }],
  requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "PaymentAuthorizationRequest", responseType: "PaymentAuthorizationDecision" }],
  owningTarget: "//examples/checkout-world/services/fraudcheck:fraudcheck_sources",
  implementationPaths: [
    "examples/checkout-world/services/fraudcheck/fraudcheck.proto",
    "examples/checkout-world/services/fraudcheck/fraudcheck.ts",
  ],
  interfaceDeclarationPaths: [
    { interfaceId: "interface:fraud-check.assess", path: "examples/checkout-world/services/fraudcheck/fraudcheck.proto" },
    { interfaceId: "interface:payments.authorize", path: "examples/checkout-world/services/payments/payments.proto" },
  ],
  inputDigest: "d".repeat(64),
};

function dependencies(fingerprints: string[], build: () => Promise<void> = async () => undefined): ProviderDependencies {
  return {
    fingerprint: async () => fingerprints.shift() ?? (() => { throw new Error("unexpected fingerprint request"); })(),
    build: async () => build(),
    readArtifact: async () => ({ bytes: Buffer.from(JSON.stringify(artifact)), artifact }),
    now: () => "2026-09-05T12:00:00.000Z",
  };
}

describe("real workspace provider", () => {
  it("starts with an honest gray graph and publishes exact yellow then green", async () => {
    const initialFingerprint = "a".repeat(64);
    const buildFingerprint = "b".repeat(64);
    const provider = await RealWorkspaceProvider.create("/unused", dependencies([initialFingerprint, buildFingerprint, buildFingerprint]));
    const initial = provider.snapshot();
    expect(initial.reconciliation.status).toBe("gray");
    expect(initial.graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
    expect(initial.jobs).toEqual([]);
    expect(JSON.stringify(initial)).not.toMatch(/Gateway|Checkout hardening|deploy:|agent-07|sourceKind":"mock|sourceKind":"runtime/);

    const published: WorkspaceSnapshot[] = [];
    await provider.startReconciliation((_type, snapshot) => published.push(snapshot));
    expect(published[0]?.reconciliation.status).toBe("yellow");
    expect(published[0]?.reconciliation.inputFingerprint).toBe(buildFingerprint);
    expect(published[0]?.jobs[0]?.label).toBe(`bazel build ${SERVICE_TOPOLOGY_TARGET}`);
    const green = published.at(-1)!;
    expect(green.reconciliation.status).toBe("green");
    expect(green.graphs.find((graph) => graph.topologyId === "service")?.nodes.map((node) => node.label)).toEqual(["FraudCheck", "Assess", "Payments.Authorize"]);
    expect(green.widgets.find((widget) => widget.id === "deployment")?.value).toBe("not configured");
    expect(green.revisions.built.sourceFingerprint).toBe(buildFingerprint);
  });

  it("rejects source mutation and retains a prior green graph after later failure", async () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const c = "c".repeat(64);
    let shouldFail = false;
    const deps = dependencies([a, b, b, c], async () => { if (shouldFail) throw new Error("bazel failed"); });
    const provider = await RealWorkspaceProvider.create("/unused", deps);
    await provider.startReconciliation(() => undefined);
    expect(provider.snapshot().reconciliation.status).toBe("green");
    shouldFail = true;
    const published: WorkspaceSnapshot[] = [];
    await provider.startReconciliation((_type, snapshot) => published.push(snapshot));
    const red = published.at(-1)!;
    expect(red.reconciliation.status).toBe("red");
    expect(red.graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "FraudCheck")).toBe(true);
  });

  it("turns red instead of green when the workspace changes during a successful build", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", dependencies(["a".repeat(64), "b".repeat(64), "c".repeat(64)]));
    await provider.startReconciliation(() => undefined);
    expect(provider.snapshot().reconciliation.status).toBe("red");
    expect(provider.snapshot().reconciliation.message).toContain("changed during the build");
  });

  it("rejects malformed versions, duplicate ids, escaping paths, and missing provided interfaces", () => {
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, schemaVersion: 2 })).toThrow();
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, requiredInterfaces: [{ ...artifact.requiredInterfaces[0]!, id: artifact.providedInterfaces[0]!.id }] })).toThrow("unique");
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, implementationPaths: ["../escape.ts"] })).toThrow("canonical");
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, providedInterfaces: [] })).toThrow();
  });
});
