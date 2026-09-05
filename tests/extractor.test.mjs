// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots = [];
const extractor = resolve(process.cwd(), "tools/extract-service-topology.mjs");

function varint(value) {
  const result = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    result.push(byte);
  } while (remaining);
  return Buffer.from(result);
}

function field(number, value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
}

function descriptorSet({ file, packageName, service, method, request, response }) {
  const methodDescriptor = Buffer.concat([field(1, method), field(2, `.${packageName}.${request}`), field(3, `.${packageName}.${response}`)]);
  const serviceDescriptor = Buffer.concat([field(1, service), field(2, methodDescriptor)]);
  const fileDescriptor = Buffer.concat([
    field(1, file),
    field(2, packageName),
    field(4, field(1, request)),
    field(4, field(1, response)),
    field(6, serviceDescriptor),
  ]);
  return field(1, fileDescriptor);
}

async function inputs() {
  const root = await mkdtemp(join(tmpdir(), "swarm-extractor-"));
  roots.push(root);
  const manifest = join(root, "service.swarm.json");
  const implementation = join(root, "fraudcheck.ts");
  const fraudProto = join(root, "fraudcheck.proto");
  const paymentsProto = join(root, "payments.proto");
  const fraudDescriptor = join(root, "fraudcheck.pb");
  const paymentsDescriptor = join(root, "payments.pb");
  await writeFile(manifest, JSON.stringify({
    schemaVersion: 1,
    service: { id: "service:fraud-check", displayName: "FraudCheck" },
    providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "checkout.fraud.v1.FraudAssessmentRequest", responseType: "checkout.fraud.v1.FraudAssessmentDecision" }],
    requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "checkout.payments.v1.PaymentAuthorizationRequest", responseType: "checkout.payments.v1.PaymentAuthorizationDecision" }],
  }));
  await writeFile(implementation, "export const assess = () => true;\n");
  await writeFile(fraudProto, `syntax = "proto3";
package checkout.fraud.v1;
service FraudCheck { rpc Assess(FraudAssessmentRequest) returns (FraudAssessmentDecision); }
message FraudAssessmentRequest {}
message FraudAssessmentDecision {}
`);
  await writeFile(paymentsProto, `syntax = "proto3";
package checkout.payments.v1;
service Payments { rpc Authorize(PaymentAuthorizationRequest) returns (PaymentAuthorizationDecision); }
message PaymentAuthorizationRequest {}
message PaymentAuthorizationDecision {}
`);
  await writeFile(fraudDescriptor, descriptorSet({ file: "examples/checkout-world/services/fraudcheck/fraudcheck.proto", packageName: "checkout.fraud.v1", service: "FraudCheck", method: "Assess", request: "FraudAssessmentRequest", response: "FraudAssessmentDecision" }));
  await writeFile(paymentsDescriptor, descriptorSet({ file: "examples/checkout-world/services/payments/payments.proto", packageName: "checkout.payments.v1", service: "Payments", method: "Authorize", request: "PaymentAuthorizationRequest", response: "PaymentAuthorizationDecision" }));
  return { root, manifest, implementation, fraudProto, paymentsProto, fraudDescriptor, paymentsDescriptor };
}

function args(input, out) {
  return [
    extractor,
    "--manifest", input.manifest,
    "--owning-target", "//examples/checkout-world/services/fraudcheck:fraudcheck_sources",
    "--source", `examples/checkout-world/services/fraudcheck/fraudcheck.proto=${input.fraudProto}`,
    "--source", `examples/checkout-world/services/fraudcheck/fraudcheck.ts=${input.implementation}`,
    "--interface-descriptor", `interface:fraud-check.assess=examples/checkout-world/services/fraudcheck/fraudcheck.proto=${input.fraudDescriptor}`,
    "--interface-descriptor", `interface:payments.authorize=examples/checkout-world/services/payments/payments.proto=${input.paymentsDescriptor}`,
    "--out", out,
  ];
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("service topology extractor", () => {
  it("emits byte-identical artifacts for identical Bazel-declared inputs", async () => {
    const input = await inputs();
    const first = join(input.root, "first.json");
    const second = join(input.root, "second.json");
    execFileSync(process.execPath, args(input, first));
    execFileSync(process.execPath, args(input, second));
    expect(await readFile(first)).toEqual(await readFile(second));
    const artifact = JSON.parse(await readFile(first, "utf8"));
    expect(artifact).not.toHaveProperty("nodes");
    expect(artifact).not.toHaveProperty("reconciliation");
    expect(artifact).not.toHaveProperty("timestamp");
  });

  it("rejects unknown schema versions and missing interface source linkages", async () => {
    const input = await inputs();
    await writeFile(input.manifest, JSON.stringify({
      schemaVersion: 99,
      service: { id: "service:fraud-check", displayName: "FraudCheck" },
      providedInterfaces: [],
      requiredInterfaces: [],
    }));
    expect(() => execFileSync(process.execPath, args(input, join(input.root, "bad.json")), { stdio: "pipe" })).toThrow();

    const valid = await inputs();
    const missing = args(valid, join(valid.root, "missing.json"));
    missing.splice(missing.indexOf("--interface-descriptor"), 2);
    expect(() => execFileSync(process.execPath, missing, { stdio: "pipe" })).toThrow();
  });

  it("rejects a manifest that drifts from the Bazel-declared protobuf contract", async () => {
    const input = await inputs();
    await writeFile(input.fraudDescriptor, descriptorSet({ file: "examples/checkout-world/services/fraudcheck/fraudcheck.proto", packageName: "checkout.fraud.v1", service: "FraudCheck", method: "Score", request: "FraudAssessmentRequest", response: "FraudAssessmentDecision" }));
    expect(() => execFileSync(process.execPath, args(input, join(input.root, "drift.json")), { stdio: "pipe" })).toThrow();
  });
});
