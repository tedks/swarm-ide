// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeTopologyInputDigest, readBuiltTopologyArtifact } from "../core/provider";

const roots: string[] = [];
const fraudRoot = "examples/checkout-world/services/fraudcheck";
const paymentsRoot = "examples/checkout-world/services/payments";

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("real topology artifact boundary", () => {
  it("accepts only a Bazel-reported artifact whose digest matches canonical current inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "swarm-provider-boundary-"));
    const output = await mkdtemp(join(tmpdir(), "swarm-provider-output-"));
    roots.push(root, output);
    await mkdir(join(root, fraudRoot), { recursive: true });
    await mkdir(join(root, paymentsRoot), { recursive: true });
    const manifest = {
      schemaVersion: 1,
      service: { id: "service:fraud-check", displayName: "FraudCheck" },
      providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "checkout.fraud.v1.FraudAssessmentRequest", responseType: "checkout.fraud.v1.FraudAssessmentDecision" }],
      requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "checkout.payments.v1.PaymentAuthorizationRequest", responseType: "checkout.payments.v1.PaymentAuthorizationDecision" }],
    };
    await writeFile(join(root, fraudRoot, "service.swarm.json"), JSON.stringify(manifest));
    await writeFile(join(root, fraudRoot, "fraudcheck.proto"), "fraud proto\n");
    await writeFile(join(root, fraudRoot, "fraudcheck.ts"), "export const assess = true;\n");
    await writeFile(join(root, paymentsRoot, "payments.proto"), "payments proto\n");
    const artifactPath = join(output, "service-topology.json");
    const artifact = {
      ...manifest,
      owningTarget: "//examples/checkout-world/services/fraudcheck:fraudcheck_sources",
      implementationPaths: [`${fraudRoot}/fraudcheck.proto`, `${fraudRoot}/fraudcheck.ts`],
      interfaceDeclarationPaths: [
        { interfaceId: "interface:fraud-check.assess", path: `${fraudRoot}/fraudcheck.proto` },
        { interfaceId: "interface:payments.authorize", path: `${paymentsRoot}/payments.proto` },
      ],
      inputDigest: await computeTopologyInputDigest(root),
    };
    await writeFile(artifactPath, JSON.stringify(artifact));
    await expect(readBuiltTopologyArtifact(root, { artifactPath })).resolves.toMatchObject({ artifact: { inputDigest: artifact.inputDigest } });

    await writeFile(artifactPath, JSON.stringify({ ...artifact, inputDigest: "0".repeat(64) }));
    await expect(readBuiltTopologyArtifact(root, { artifactPath })).rejects.toThrow("does not match");
  });
});
