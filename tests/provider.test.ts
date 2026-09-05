// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../protocol/schema";
import { RealWorkspaceProvider, SERVICE_TOPOLOGY_TARGET, type ProviderDependencies } from "../core/provider";
import { ServiceTopologyArtifactSchema, type ServiceTopologyArtifact } from "../core/service-topology";

const artifact: ServiceTopologyArtifact = {
  schemaVersion: 1,
  service: { id: "service:fraud-check", displayName: "FraudCheck" },
  providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "checkout.fraud.v1.FraudAssessmentRequest", responseType: "checkout.fraud.v1.FraudAssessmentDecision" }],
  requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "checkout.payments.v1.PaymentAuthorizationRequest", responseType: "checkout.payments.v1.PaymentAuthorizationDecision" }],
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

function dependencies(
  fingerprints: string[],
  build: () => Promise<void> = async () => undefined,
  readArtifact: ProviderDependencies["readArtifact"] = async () => ({ bytes: Buffer.from(JSON.stringify(artifact)), artifact }),
): ProviderDependencies {
  return {
    fingerprint: async () => fingerprints.shift() ?? (() => { throw new Error("unexpected fingerprint request"); })(),
    build: async () => { await build(); return { artifactPath: "/unused/service-topology.json" }; },
    readArtifact,
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
    const serviceGraph = green.graphs.find((graph) => graph.topologyId === "service")!;
    expect(serviceGraph.nodes.map((node) => [node.label, node.position.x])).toEqual([
      ["FraudCheck", 310],
      ["Assess", 20],
      ["Payments.Authorize", 600],
    ]);
    expect(serviceGraph.edges.map((edge) => [edge.source, edge.target, edge.label])).toEqual([
      ["interface:fraud-check.assess", "service:fraud-check", "handled by"],
      ["service:fraud-check", "interface:payments.authorize", "calls"],
    ]);
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
    expect(red.mappings.every((mapping) => mapping.from.revisionId === c)).toBe(true);
  });

  it("turns a first build or artifact failure red without fabricating a topology", async () => {
    for (const deps of [
      dependencies(["a".repeat(64), "b".repeat(64)], async () => { throw new Error("bazel failed"); }),
      dependencies(["a".repeat(64), "b".repeat(64)], undefined, async () => { throw new Error("artifact is malformed"); }),
    ]) {
      const provider = await RealWorkspaceProvider.create("/unused", deps);
      const published: WorkspaceSnapshot[] = [];
      await provider.startReconciliation((_type, snapshot) => published.push(snapshot));
      expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["yellow", "red"]);
      expect(provider.snapshot().reconciliation.lastConsistentFingerprint).toBe("unobserved");
      expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
    }
  });

  it("turns red instead of green when the workspace changes during a successful build", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", dependencies(["a".repeat(64), "b".repeat(64), "c".repeat(64)]));
    await provider.startReconciliation(() => undefined);
    expect(provider.snapshot().reconciliation.status).toBe("red");
    expect(provider.snapshot().reconciliation.message).toContain("changed during the build");
  });

  it("revokes green immediately when a saved or observed source fingerprint changes", async () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const c = "c".repeat(64);
    const provider = await RealWorkspaceProvider.create("/unused", dependencies([a, b, b]));
    await provider.startReconciliation(() => undefined);
    const events: Array<{ type: string; snapshot: WorkspaceSnapshot }> = [];
    provider.markWorkingWorldChanged(c, (type, snapshot) => events.push({ type, snapshot }));
    expect(events.map((event) => event.type)).toEqual(["workspace.changed"]);
    expect(provider.snapshot().reconciliation.status).toBe("yellow");
    expect(provider.snapshot().revisions.working.fingerprint).toBe(c);
    expect(provider.snapshot().revisions.built.sourceFingerprint).toBe(b);
    expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes.some((node) => node.label === "FraudCheck")).toBe(true);
    expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.reconciliation).toBe("yellow");
    expect(provider.snapshot().mappings.every((mapping) => mapping.from.revisionId === c)).toBe(true);
  });

  it("recovers an observer-caused red state even when the fingerprint is unchanged", async () => {
    const fingerprint = "a".repeat(64);
    const provider = await RealWorkspaceProvider.create("/unused", dependencies([fingerprint]));
    const events: WorkspaceSnapshot[] = [];
    provider.markWorkingWorldUnknown("git briefly unavailable", (_type, snapshot) => events.push(snapshot));
    provider.markWorkingWorldChanged(fingerprint, (_type, snapshot) => events.push(snapshot));
    expect(events.map((snapshot) => snapshot.reconciliation.status)).toEqual(["red", "yellow"]);
    expect(provider.snapshot().reconciliation.message).toContain("build to observe");
  });

  it("publishes a bounded red state when fingerprint preflight fails", async () => {
    const provider = await RealWorkspaceProvider.create("/unused", dependencies(["a".repeat(64)]));
    const published: WorkspaceSnapshot[] = [];
    await expect(provider.startReconciliation((_type, snapshot) => published.push(snapshot))).resolves.toBeUndefined();
    expect(published.map((snapshot) => snapshot.reconciliation.status)).toEqual(["red"]);
    expect(provider.snapshot().jobs[0]?.label).toBe(`bazel build ${SERVICE_TOPOLOGY_TARGET}`);
    expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
  });

  it("never publishes an older overlapping build after a newer attempt completes", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstBuild = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    let buildNumber = 0;
    const provider = await RealWorkspaceProvider.create("/unused", dependencies(
      ["a".repeat(64), "b".repeat(64), "c".repeat(64), "c".repeat(64)],
      async () => {
        buildNumber += 1;
        if (buildNumber === 1) { markFirstStarted(); await firstBuild; }
      },
    ));
    const published: WorkspaceSnapshot[] = [];
    const first = provider.startReconciliation((_type, snapshot) => published.push(snapshot));
    await firstStarted;
    await provider.startReconciliation((_type, snapshot) => published.push(snapshot));
    releaseFirst();
    await first;
    expect(provider.snapshot().reconciliation.status).toBe("green");
    expect(provider.snapshot().reconciliation.epoch).toBe(2);
    expect(provider.snapshot().reconciliation.inputFingerprint).toBe("c".repeat(64));
    expect(published.filter((snapshot) => snapshot.reconciliation.status === "green")).toHaveLength(1);
  });

  it("rejects malformed versions, duplicate ids, escaping paths, and missing provided interfaces", () => {
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, schemaVersion: 2 })).toThrow();
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, requiredInterfaces: [{ ...artifact.requiredInterfaces[0]!, id: artifact.providedInterfaces[0]!.id }] })).toThrow("unique");
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, implementationPaths: ["../escape.ts"] })).toThrow("canonical");
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, providedInterfaces: [] })).toThrow();
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, providedInterfaces: [{ ...artifact.providedInterfaces[0]!, id: "service:not-an-interface" }] })).toThrow();
    expect(() => ServiceTopologyArtifactSchema.parse({ ...artifact, requiredInterfaces: [{ ...artifact.requiredInterfaces[0]!, serviceId: "service:orders" }] })).toThrow("disagree");
  });
});
