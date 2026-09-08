// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { adaptServiceTopology } from "../core/service-topology";
import { contextArtifact } from "./context-fixture";
import { fixtureBuildObservation } from "./support/build-graph-fixture";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import type { GraphFocusNavigation } from "../app/renderer/repository/focus-reveal";
const observed = vi.hoisted(() => ({ navigations: [] as GraphFocusNavigation[] }));
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: (props: Record<string, any>) => {
  if (props.navigation && !observed.navigations.some((entry) => entry.nonce === props.navigation.nonce)) observed.navigations.push(props.navigation);
  return <div>{props.graph.nodes.map((node: any) => <button key={node.id} onClick={() => props.onActivate?.(node.focus)}>{`Activate ${node.id}`}</button>)}</div>;
} }));
vi.mock("../app/renderer/repository/BuildGraphPane", () => ({ TopologyViews: ({ service }: { service: import("react").ReactNode }) => <>{service}</> }));
vi.mock("@xyflow/react", () => ({ ReactFlow: () => null, Background: () => null, Controls: () => null, MarkerType: { ArrowClosed: "arrow" }, Position: { Left: "left", Right: "right" } }));
import { App } from "../app/renderer/App";
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); observed.navigations.length = 0; delete window.swarm; delete window.swarmView; vi.restoreAllMocks(); });

it("a held service declaration read completes source focus without issuing a second camera gesture", async () => {
  const snapshot = initialSnapshot();
  snapshot.revisions.working = { id: "a".repeat(64), fingerprint: "a".repeat(64), evidence: "observed" };
  snapshot.revisions.built = { id: "b".repeat(64), sourceFingerprint: snapshot.revisions.working.id };
  snapshot.focus = { ...snapshot.focus, revisionId: snapshot.revisions.working.id };
  snapshot.reconciliation = { ...snapshot.reconciliation, status: "green", inputFingerprint: snapshot.revisions.working.id, lastConsistentFingerprint: snapshot.revisions.working.id };
  const adapted = adaptServiceTopology(contextArtifact, "bazel://test", snapshot.revisions.built.id, snapshot.revisions.working.id, snapshot.reconciliation.epoch, "2026-09-08T21:00:00Z", snapshot.project.id);
  snapshot.graphs = snapshot.graphs.map((graph) => graph.topologyId === "service" ? adapted.graph : { ...graph, inputFingerprint: snapshot.revisions.working.id,
    provenance: graph.provenance.map((entry) => ({ ...entry, version: snapshot.revisions.working.id })), nodes: graph.nodes.map((node) => ({ ...node, focus: { ...node.focus, revisionId: snapshot.revisions.working.id } })) });
  snapshot.serviceContext = adapted.serviceContext; snapshot.mappings = adapted.mappings; snapshot.widgets = [];
  let held: { request: CoreRequest; resolve: (response: CoreResponse) => void } | null = null;
  const reply = (input: CoreRequest): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot,
    ...(input.type === "buildGraph.observe" ? { buildGraph: fixtureBuildObservation(snapshot) } : {}),
    ...(input.type === "file.read" ? { file: { kind: "read", path: input.path, content: `source ${input.path}\n`, revision: "c".repeat(64), size: 10 } } : {}) });
  window.swarm = { onEvent: () => () => {}, request: async (input) => {
    if (input.type === "file.read" && input.path === "example/validator.proto") return new Promise((resolve) => { held = { request: input, resolve }; });
    return reply(input);
  } };
  window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Activate service:validator" }));
  await waitFor(() => expect(held).not.toBeNull());
  expect(observed.navigations).toHaveLength(1);
  expect(observed.navigations[0]!.focus.domain).toBe("service");
  const before = observed.navigations[0];
  await act(async () => { const waiting = held!; waiting.resolve(reply(waiting.request)); });
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("example/validator.proto"));
  expect(observed.navigations).toEqual([before]);
});
