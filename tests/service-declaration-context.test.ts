import { describe, expect, it } from "vitest";
import { adaptDeclaredServices } from "../core/service-topology";
import { contextSnapshot } from "./context-fixture";
import { composeContext, indexCapture, indexService } from "../app/renderer/context/compose";
import { resolveDeclarations } from "../app/renderer/context/declarations";
import { WorkspaceSnapshotSchema } from "../protocol/schema";
import { retainDerived } from "../app/renderer/recovery";

describe("source declaration Context and navigation", () => {
  it("opens a real declaration identity and attributes file membership without built or deployed claims", async () => {
    const base = await contextSnapshot();
    const adapted = adaptDeclaredServices({ paths: ["compose.yaml"], issues: [], dependencies: [], services: [{ id: "service:compose:api", displayName: "API", declarationPath: "compose.yaml", implementationPaths: [], interfaces: [] }] },
      base.revisions.working.fingerprint, 1, "2026-09-08T10:00:00.000Z", base.project.id);
    const snapshot = WorkspaceSnapshotSchema.parse({ ...base, graphs: base.graphs.map((entry) => entry.topologyId === "service" ? adapted.graph : entry), mappings: adapted.mappings,
      revisions: { ...base.revisions, built: { id: "", sourceFingerprint: "" } }, widgets: adapted.widgets, serviceContext: undefined, serviceDeclarations: adapted.declarations });
    const focus = adapted.graph.nodes[0]!.focus;
    expect(resolveDeclarations(snapshot, focus).candidates).toEqual([{ path: "compose.yaml", relations: [] }]);
    const sections = composeContext({ repositoryId: snapshot.project.id, worldId: snapshot.world.id, kind: "service", id: focus.key }, {
      snapshot, files: [], service: indexService(undefined), capture: indexCapture(undefined), realm: "r", session: "s", ready: true,
    });
    expect(sections.find((entry) => entry.id === "services")).toMatchObject({ evidence: { provider: "Service declarations", revisionKind: "source-read", freshness: "current" }, rows: [{ label: "Service", value: "API" }, { label: "Declaration", value: "compose.yaml" }] });
    const other = composeContext({ repositoryId: snapshot.project.id, worldId: snapshot.world.id, kind: "file", path: "unrelated.ts" }, {
      snapshot, files: [], service: indexService(undefined), capture: indexCapture(undefined), realm: "r", session: "s", ready: true,
    });
    expect(other.find((entry) => entry.id === "services")?.rows).toEqual([]);
    expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceDeclarations: { ...adapted.declarations, repositoryId: "wrong" } }).success).toBe(false);
    expect(WorkspaceSnapshotSchema.safeParse({ ...snapshot, serviceDeclarations: { ...adapted.declarations, services: [] } }).success).toBe(false);
    const incoming = { ...snapshot, serviceDeclarations: undefined, mappings: [], graphs: snapshot.graphs.map((entry) => entry.topologyId === "service" ? { ...entry, nodes: [], edges: [], reconciliation: "gray" as const } : entry),
      reconciliation: { ...snapshot.reconciliation, status: "gray" as const, lastConsistentFingerprint: "unobserved" } };
    const recovered = retainDerived(snapshot, incoming);
    expect(recovered.serviceDeclarations).toEqual(snapshot.serviceDeclarations);
    expect(WorkspaceSnapshotSchema.safeParse(recovered).success).toBe(true);
    const partial = { ...snapshot, serviceDeclarations: { ...adapted.declarations, status: "partial" as const, issues: ["Included files not merged"] },
      reconciliation: { ...snapshot.reconciliation, status: "yellow" as const, lastConsistentFingerprint: "unobserved" },
      graphs: snapshot.graphs.map((entry) => entry.topologyId === "service" ? { ...entry, reconciliation: "yellow" as const } : entry) };
    expect(retainDerived(partial, incoming).serviceDeclarations).toEqual(partial.serviceDeclarations);
    expect(retainDerived(snapshot, partial)).toBe(partial);
  });
});
