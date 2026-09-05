import { describe, expect, it } from "vitest";
import { initialSnapshot, paymentsFileFocus } from "../fixtures/world";
import { adaptGraph } from "../app/renderer/graph-adapter";

describe("coordinated graph projections", () => {
  it("highlights every candidate when a mapping is ambiguous", () => {
    const snapshot = initialSnapshot(paymentsFileFocus);
    const service = snapshot.graphs.find((graph) => graph.topologyId === "service");
    if (!service) throw new Error("service fixture missing");
    const highlighted = adaptGraph(service, snapshot.focus, snapshot.mappings).nodes.filter((node) => node.data.focused);
    expect(highlighted.map((node) => node.id).sort()).toEqual(["service-checkout", "service-payments"]);
  });
});
