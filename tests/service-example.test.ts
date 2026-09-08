// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { discoverServices } from "../core/service-discovery";
import { RealWorkspaceProvider } from "../core/provider";
import { WorkspaceSnapshotSchema } from "../protocol/schema";
import { assess } from "../examples/checkout-world/services/fraudcheck/fraudcheck";
import { authorize } from "../examples/checkout-world/services/payments/payments";

const scratch: string[] = [];
afterEach(async () => { await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const prefix = "examples/checkout-world/services/";

it("reads the actual restored example as ordinary source-backed services and interfaces", async () => {
  const root = process.cwd();
  const declared = await discoverServices(root);
  expect(declared.issues).toEqual([]);
  const example = declared.services.filter((service) => service.declarationPath.startsWith(prefix));
  expect(example.map((service) => service.displayName)).toEqual(["FraudCheck", "Payments"]);
  expect(example.map((service) => service.owningTarget)).toEqual([
    "//examples/checkout-world/services/fraudcheck:fraudcheck_sources",
    "//examples/checkout-world/services/payments:payments_sources",
  ]);
  expect(example.map((service) => service.implementationPaths)).toEqual([
    [prefix + "fraudcheck/fraudcheck.ts"], [prefix + "payments/payments.ts"],
  ]);
  const interfaces = example.flatMap((service) => service.interfaces);
  expect(interfaces.map(({ name, role, path }) => ({ name, role, path }))).toEqual([
    { name: "Assess", role: "provided", path: prefix + "fraudcheck/fraudcheck.proto" },
    { name: "Payments.Authorize", role: "required", path: prefix + "payments/payments.proto" },
    { name: "Authorize", role: "provided", path: prefix + "payments/payments.proto" },
  ]);
  expect(interfaces[1]).toMatchObject({ serviceId: "service:payments", requestType: interfaces[2]!.requestType, responseType: interfaces[2]!.responseType });
  for (const service of example) {
    for (const path of [service.declarationPath, ...service.implementationPaths, ...service.interfaces.map((entry) => entry.path)]) {
      expect((await readFile(join(root, path))).byteLength).toBeGreaterThan(0);
    }
  }
  const provider = await RealWorkspaceProvider.create(root);
  try {
    await provider.startReconciliation(() => {});
    const snapshot = provider.snapshot();
    expect(WorkspaceSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const graph = snapshot.graphs.find((entry) => entry.topologyId === "service")!;
    const ids = new Set(example.flatMap((service) => [service.id, ...service.interfaces.map((entry) => entry.id)]));
    expect(graph.nodes.filter((node) => ids.has(node.id))).toHaveLength(5);
    expect(graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => edge.label).sort()).toEqual(["provides", "provides", "requires"]);
    for (const service of example) {
      expect(graph.nodes.find((node) => node.id === service.id)?.focus.path).toBe(service.declarationPath);
      expect(snapshot.mappings.find((mapping) => mapping.from.key === service.id)?.candidates.map((candidate) => candidate.revealPath)).toEqual([service.declarationPath, ...service.implementationPaths]);
    }
    expect(snapshot.jobs).toEqual([]);
    expect(snapshot.revisions.built.id).toBe(""); expect(snapshot.revisions.deployed.id).toBe("");
    expect(snapshot.serviceContext).toBeUndefined();
  } finally { provider.dispose(); }
});

it("never injects the checkout example into an unrelated repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "swarm-no-example-fallback-")); scratch.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  await writeFile(join(root, "README.md"), "A separate application.\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Example test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Independent repository"], { cwd: root });
  expect(await discoverServices(root)).toEqual({ services: [], dependencies: [], paths: [], issues: [] });
  const provider = await RealWorkspaceProvider.create(root);
  try {
    await provider.startReconciliation(() => {});
    expect(provider.snapshot().graphs.find((graph) => graph.topologyId === "service")?.nodes).toEqual([]);
    expect(provider.snapshot().reconciliation.message).toBe("No service declarations found");
    expect(provider.snapshot().jobs).toEqual([]);
  } finally { provider.dispose(); }
});

it("keeps the sample implementations deterministic and local", () => {
  expect(assess({ orderId: "order-1", accountId: "account-1", amountMinor: 100_000 }).disposition).toBe("review");
  expect(assess({ orderId: "order-1", accountId: "account-1", amountMinor: 20 }).disposition).toBe("allow");
  expect(authorize({ orderId: "order-1", amountMinor: 20 })).toEqual({ authorized: true, authorizationId: "example-order-1" });
  expect(authorize({ orderId: "order-1", amountMinor: -1 })).toEqual({ authorized: false, authorizationId: "" });
  expect(authorize({ orderId: "", amountMinor: 20 }).authorized).toBe(false);
});
