// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adaptDeclaredServices } from "../core/service-topology";
import type { ServiceDiscovery } from "../core/service-discovery";
import { ServiceDeclarationsSchema } from "../protocol/service-declarations";

const declaration: ServiceDiscovery = { services: [
  { id: "service:alpha", displayName: "Alpha", declarationPath: "compose.yaml", implementationPaths: [], interfaces: [] },
  { id: "service:beta", displayName: "Beta", declarationPath: "compose.yaml", implementationPaths: [], interfaces: [] },
], dependencies: [{ source: "service:alpha", target: "service:beta", kind: "starts-after", label: "starts after" }], paths: ["compose.yaml"], issues: [] };
const adapt = (input = declaration) => adaptDeclaredServices(input, "a".repeat(64), 2, "2026-09-08T12:00:00.000Z", "repository:" + "0".repeat(64));

describe("source service publication boundary", () => {
  it("preserves declaration provenance and startup dependencies without inventing calls or build ownership", () => {
    const result = adapt();
    expect(result.graph.nodes.map((node) => node.label)).toEqual(["Alpha", "Beta"]);
    expect(result.graph.edges).toEqual([expect.objectContaining({ source: "service:alpha", target: "service:beta", kind: "starts-after", label: "starts after" })]);
    expect(result.graph.provenance.every((item) => item.sourceKind === "repo")).toBe(true);
    expect(result.mappings.every((mapping) => mapping.targetTopology === "repo")).toBe(true);
    expect(result.mappings.flatMap((mapping) => mapping.candidates).every((candidate) => candidate.revealPath === "compose.yaml")).toBe(true);
    expect(ServiceDeclarationsSchema.parse(result.declarations)).toEqual(result.declarations);
    expect(result).not.toHaveProperty("serviceContext");
    expect(JSON.stringify(result)).not.toMatch(/bazel|artifact|sourceKind":"build/);
  });

  it("links authored interface files and only explicitly supplied implementation paths", () => {
    const result = adapt({ ...declaration, services: [{ ...declaration.services[0]!, declarationPath: "services/alpha/service.swarm.json",
      implementationPaths: ["services/alpha/main.ts"], interfaces: [
        { id: "interface:alpha.read", name: "Read", role: "provided", path: "services/alpha/api.proto", requestType: "alpha.Request", responseType: "alpha.Response" },
        { id: "interface:beta.fetch", name: "Beta.Fetch", role: "required", serviceId: "service:beta", path: "services/beta/api.proto", requestType: "beta.Request", responseType: "beta.Response" },
      ] }], dependencies: [] });
    expect(result.graph.edges.map((edge) => edge.kind)).toEqual(["provides", "requires"]);
    expect(result.graph.edges.some((edge) => edge.kind === "calls")).toBe(false);
    expect(result.mappings.flatMap((mapping) => mapping.candidates).map((candidate) => candidate.revealPath))
      .toEqual(["services/alpha/service.swarm.json", "services/alpha/main.ts", "services/alpha/api.proto", "services/beta/api.proto"]);
  });

  it("rejects escaping source paths and built-artifact fields in source declaration evidence", () => {
    const value = adapt().declarations;
    expect(() => ServiceDeclarationsSchema.parse({ ...value, services: [{ ...value.services[0]!, declarationPath: "../outside.yaml" }] })).toThrow();
    expect(() => ServiceDeclarationsSchema.parse({ ...value, services: [{ ...value.services[0]!, implementationPaths: ["/outside.ts"] }] })).toThrow();
    expect(() => ServiceDeclarationsSchema.parse({ ...value, paths: ["nested/../compose.yaml"] })).toThrow();
    expect(() => ServiceDeclarationsSchema.parse({ ...value, artifactUri: "file:///tmp/artifact.json", buildId: "b".repeat(64) })).toThrow();
    expect(() => ServiceDeclarationsSchema.parse({ ...value, observedAt: "yesterday" })).toThrow();
  });

  it("marks unsupported declarations partial and retains their useful file diagnostic", () => {
    const result = adapt({ ...declaration, issues: ["nested/compose.yaml: inherited fields are not shown"] });
    expect(result.declarations.status).toBe("partial"); expect(result.graph.reconciliation).toBe("yellow");
    expect(result.declarations.issues).toEqual(["nested/compose.yaml: inherited fields are not shown"]);
    expect(result.graph.nodes).toHaveLength(2);
  });
});
