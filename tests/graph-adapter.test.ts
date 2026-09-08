import { describe, expect, it } from "vitest";
import { initialSnapshot, writerFileFocus } from "../fixtures/world";
import { adaptGraph, describeGraphConnection } from "../app/renderer/graph-adapter";

describe("coordinated graph projections", () => {
  it("highlights every candidate when a mapping is ambiguous", () => {
    const snapshot = initialSnapshot(writerFileFocus);
    const service = snapshot.graphs.find((graph) => graph.topologyId === "service");
    if (!service) throw new Error("service fixture missing");
    const highlighted = adaptGraph(service, snapshot.focus, snapshot.mappings).nodes.filter((node) => node.data.focused);
    expect(highlighted.map((node) => node.id).sort()).toEqual(["service-reader", "service-writer"]);
  });

  it("turns a selectable edge into contextual relationship information", () => {
    const snapshot = initialSnapshot(writerFileFocus);
    const service = snapshot.graphs.find((graph) => graph.topologyId === "service")!;
    const connection = describeGraphConnection(service, "service-e1");
    expect(connection).toMatchObject({
      id: "service-e1",
      label: "Write (test relationship)",
      source: { label: "Reader" },
      target: { label: "Writer" },
      interfaceFocus: service.nodes.find((node) => node.id === "service-writer")!.focus,
    });
    expect(describeGraphConnection(service, "missing-edge")).toBeNull();
    expect(adaptGraph(service, snapshot.focus, snapshot.mappings).edges.every((edge) => edge.focusable && edge.interactionWidth === 28)).toBe(true);
  });
});
