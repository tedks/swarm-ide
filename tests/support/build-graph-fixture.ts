import type { BuildGraphObservation } from "../../protocol/build-graph";
import type { WorkspaceSnapshot } from "../../protocol/schema";
import capture from "../../fixtures/ui-build-links.snapshot.json";
import { buildTargets } from "../../app/renderer/repository/build-view";

/** Labelled mock bridge data only. Production never imports this historical capture. */
export function fixtureBuildObservation(snapshot: WorkspaceSnapshot): BuildGraphObservation {
  const rules = new Set(buildTargets(capture));
  const endpoints = new Map(capture.links.flatMap((link) => [[link.from, link.fromPath], [link.to, link.toPath]] as Array<[string, string]>));
  return { repositoryId: snapshot.project.id, worldId: snapshot.world.id, generation: 1, status: "current", message: "MOCK query observation for mounted component tests",
    graph: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, inputDigest: "f".repeat(64), observedAt: "2026-09-07T18:00:00.000Z", command: "MOCK query", complete: true, coverage: "MOCK historical entries only",
      targets: [...endpoints].map(([label, path]) => ({ label, path, kind: rules.has(label) ? "rule" : "source" })),
      edges: capture.links.map(({ from, to }) => ({ from, to })) } };
}
