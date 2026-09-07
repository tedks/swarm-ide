import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { adaptServiceTopology } from "../core/service-topology";
import { contextArtifact } from "./context-fixture";
import { declarationPublication, resolveDeclarations } from "../app/renderer/context/declarations";
function fixture() {
  const snapshot = initialSnapshot();
  snapshot.revisions.built = { id: "b".repeat(64), sourceFingerprint: snapshot.revisions.working.fingerprint };
  const result = adaptServiceTopology(contextArtifact, "bazel://fixture", snapshot.revisions.built.id, snapshot.revisions.built.sourceFingerprint, 1, "2026-09-07T03:00:00.000Z", snapshot.project.id);
  snapshot.serviceContext = result.serviceContext; snapshot.graphs = [result.graph];
  const focus = { ...result.graph.nodes[0]!.focus, domain: "service" as const, key: "service:fraud-check" };
  return { snapshot, focus };
}
describe("bounded declaration candidates, not implementation inference", () => {
  it("opens only provided declarations of the observed service", () => {
    const { snapshot, focus } = fixture();
    const resolved = resolveDeclarations(snapshot, { ...focus, path: "guessed/implementation.ts" });
    expect(resolved.candidates.map((item) => item.path)).toEqual(["example/fraudcheck.proto"]);
    expect(resolved.candidates[0]!.relations[0]!.role).toBe("provided");
    expect(resolved.notice).toContain("not implementation or callsite");
  });
  it("external service identity receives only explicitly related required declarations", () => {
    const { snapshot, focus } = fixture();
    const external = { ...focus, key: "service:payments" };
    snapshot.graphs[0]!.nodes.push({ ...snapshot.graphs[0]!.nodes[0]!, id: external.key, focus: external });
    const result = resolveDeclarations(snapshot, external);
    expect(result.candidates.map((item) => item.path)).toEqual(["example/payments.proto"]);
    expect(result.candidates[0]!.relations[0]).toMatchObject({ role: "required", serviceId: "service:payments" });
    expect(result.notice).toContain("external implementation unavailable");
  });
  it("exact interface maps directly; declaration identity is distinct from ownership", () => {
    const { snapshot } = fixture();
    const focus = snapshot.graphs[0]!.nodes.find((node) => node.id === "interface:payments.authorize")!.focus;
    expect(resolveDeclarations(snapshot, focus).candidates[0]!.relations[0]!.role).toBe("required");
  });
  it("deduplicates paths while keeping every interface relationship; distinct paths remain choices", () => {
    const { snapshot, focus } = fixture();
    if (snapshot.serviceContext?.status !== "observed") throw new Error("fixture");
    const service = snapshot.serviceContext.service;
    service.providedInterfaces.push({ ...service.providedInterfaces[0]!, id: "interface:fraud-check.second", name: "Second" });
    service.interfaceDeclarationPaths.push({ interfaceId: "interface:fraud-check.second", path: "example/fraudcheck.proto" });
    const dedup = resolveDeclarations(snapshot, focus);
    expect(dedup.candidates).toHaveLength(1); expect(dedup.candidates[0]!.relations).toHaveLength(2);
    service.interfaceDeclarationPaths[2]!.path = "example/second.proto";
    expect(resolveDeclarations(snapshot, focus).candidates.map((item) => item.path)).toEqual(["example/fraudcheck.proto", "example/second.proto"]);
  });
  it.each(["unknown", "world", "repository", "build", "fingerprint", "missing", "bad-path"])("rejects %s rather than inventing a fallback", (fault) => {
    const { snapshot, focus } = fixture();
    if (snapshot.serviceContext?.status !== "observed") throw new Error("fixture");
    if (fault === "unknown") focus.key = "service:absent";
    if (fault === "world") focus.worldId = "world:other";
    if (fault === "repository") snapshot.serviceContext.repositoryId = "repository:other";
    if (fault === "build") snapshot.serviceContext.buildId = "d".repeat(64);
    if (fault === "fingerprint") snapshot.serviceContext.sourceFingerprint = "other";
    if (fault === "bad-path") snapshot.serviceContext.service.interfaceDeclarationPaths[0]!.path = "../escape";
    if (fault === "missing") delete snapshot.serviceContext;
    expect(resolveDeclarations(snapshot, focus).candidates).toEqual([]);
  });
  it("retained evidence remains navigable but never current with unavailable working inputs", () => {
    const { snapshot, focus } = fixture();
    snapshot.revisions.working.evidence = "unavailable";
    expect(resolveDeclarations(snapshot, focus).candidates).toHaveLength(1);
    expect(resolveDeclarations(snapshot, focus).notice).toContain("Retained built artifact");
    const key = declarationPublication(snapshot);
    snapshot.focus = { ...focus, key: "interface:payments.authorize" };
    expect(declarationPublication(snapshot)).toBe(key);
    if (snapshot.serviceContext?.status !== "observed") throw new Error("fixture");
    snapshot.serviceContext.observedAt = "2026-09-07T04:00:00.000Z";
    expect(declarationPublication(snapshot)).not.toBe(key);
  });
});
