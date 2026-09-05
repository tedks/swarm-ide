// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots = [];
const extractor = resolve(process.cwd(), "tools/extract-service-topology.mjs");

async function inputs() {
  const root = await mkdtemp(join(tmpdir(), "swarm-extractor-"));
  roots.push(root);
  const manifest = join(root, "service.swarm.json");
  const implementation = join(root, "fraudcheck.ts");
  const fraudProto = join(root, "fraudcheck.proto");
  const paymentsProto = join(root, "payments.proto");
  await writeFile(manifest, JSON.stringify({
    schemaVersion: 1,
    service: { id: "service:fraud-check", displayName: "FraudCheck" },
    providedInterfaces: [{ id: "interface:fraud-check.assess", name: "Assess", requestType: "checkout.fraud.v1.Request", responseType: "checkout.fraud.v1.Response" }],
    requiredInterfaces: [{ id: "interface:payments.authorize", name: "Payments.Authorize", serviceId: "service:payments", requestType: "checkout.payments.v1.Request", responseType: "checkout.payments.v1.Response" }],
  }));
  await writeFile(implementation, "export const assess = () => true;\n");
  await writeFile(fraudProto, "syntax = \"proto3\";\n");
  await writeFile(paymentsProto, "syntax = \"proto3\";\n");
  return { root, manifest, implementation, fraudProto, paymentsProto };
}

function args(input, out) {
  return [
    extractor,
    "--manifest", input.manifest,
    "--owning-target", "//examples/checkout-world/services/fraudcheck:fraudcheck_sources",
    "--source", `examples/checkout-world/services/fraudcheck/fraudcheck.proto=${input.fraudProto}`,
    "--source", `examples/checkout-world/services/fraudcheck/fraudcheck.ts=${input.implementation}`,
    "--interface-source", `interface:fraud-check.assess=examples/checkout-world/services/fraudcheck/fraudcheck.proto=${input.fraudProto}`,
    "--interface-source", `interface:payments.authorize=examples/checkout-world/services/payments/payments.proto=${input.paymentsProto}`,
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
    missing.splice(missing.indexOf("--interface-source"), 2);
    expect(() => execFileSync(process.execPath, missing, { stdio: "pipe" })).toThrow();
  });
});
