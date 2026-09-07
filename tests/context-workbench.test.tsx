// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse, type FocusRef, type GraphSlice } from "../protocol/schema";
import { contextArtifact } from "./context-fixture";
import { adaptServiceTopology } from "../core/service-topology";
import { openContextPath } from "./context-navigation";
vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph, onFocus }: { graph: GraphSlice; onFocus: (focus: FocusRef) => void }) => <section data-testid={`graph-${graph.topologyId}`}>
  {graph.nodes.map((node) => <button key={node.id} onClick={() => onFocus(node.focus)}>Inspect {node.id}</button>)}
  <input aria-label={`Camera ${graph.topologyId}`} defaultValue="unchanged" />
</section> }));
import { App } from "../app/renderer/App";
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.localStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
const subject = () => document.querySelector(".artifact-context")?.getAttribute("data-context-subject");
const serviceText = () => document.querySelector("[data-context-section='services']")?.textContent ?? "";
function setup() {
  const snapshot = initialSnapshot(); snapshot.revisions.working = { id: "a".repeat(64), fingerprint: "a".repeat(64), evidence: "observed" };
  snapshot.revisions.built = { id: "b".repeat(64), sourceFingerprint: "a".repeat(64) };
  snapshot.focus = { ...snapshot.focus, revisionId: snapshot.revisions.working.id };
  snapshot.reconciliation = { ...snapshot.reconciliation, status: "green", inputFingerprint: snapshot.revisions.working.id, lastConsistentFingerprint: snapshot.revisions.working.id };
  const adapted = adaptServiceTopology(contextArtifact, "bazel://test-artifact", snapshot.revisions.built.id, snapshot.revisions.working.id, snapshot.reconciliation.epoch, "2026-09-07T03:00:00.000Z", snapshot.project.id);
  const repo = snapshot.graphs[0]!;
  snapshot.graphs = [{ ...repo, inputFingerprint: snapshot.revisions.working.id, provenance: repo.provenance.map((item) => ({ ...item, version: snapshot.revisions.working.id })), nodes: repo.nodes.map((node) => ({ ...node, focus: { ...node.focus, revisionId: snapshot.revisions.working.id } })) }, adapted.graph];
  snapshot.serviceContext = adapted.serviceContext; snapshot.mappings = []; snapshot.widgets = [];
  let delayed: { path: string; resolve: (response: CoreResponse) => void; request: CoreRequest } | undefined;
  let delayPath = "", failPath = "";
  const response = (input: CoreRequest): CoreResponse => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot,
    ...(input.type === "file.read" ? { file: { kind: "read", path: input.path, content: `source ${input.path}\n`, revision: "c".repeat(64), size: 10 } } : {}) });
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (input.type === "file.read" && input.path === delayPath) return new Promise((resolve) => { delayed = { path: input.path, resolve, request: input }; });
    if ((input.type === "file.read" || input.type === "file.watch") && input.path === failPath) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "FILE_NOT_FOUND", message: "No file" } };
    return response(input);
  });
  window.swarm = { request, onEvent: () => () => undefined }; window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { request, delay: (path: string) => { delayPath = path; }, fail: (path: string) => { failPath = path; }, finish: async () => { if (!delayed) throw new Error("No delayed read"); const held = delayed; await act(async () => held.resolve(response(held.request))); } };
}
describe("truthful Context in the mounted workbench", () => {
  it("distinguishes files, lets graph inspection win without closing source, and returns to the dirty editor without extra reads", async () => {
    const test = setup(); render(<App />);
    await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    expect(serviceText()).not.toContain("Implementation member of");
    await openContextPath("example/fraudcheck.ts"); await waitFor(() => expect(subject()).toBe("example/fraudcheck.ts"));
    expect(serviceText()).toContain("Implementation member ofFraudCheck");
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
    act(() => editor.dispatch({ changes: { from: 0, insert: "dirty " }, selection: { anchor: 2 } }));
    const graph = screen.getByTestId("graph-service"), before = test.request.mock.calls.filter(([r]) => r.type === "file.read").length;
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    expect(subject()).toBe("service:fraud-check"); expect(document.querySelector(".cm-editor")).toBe(editor.dom);
    fireEvent.pointerDown(editor.contentDOM);
    expect(subject()).toBe("example/fraudcheck.ts"); expect(editor.state.selection.main.anchor).toBe(2);
    expect(screen.getByTestId("graph-service")).toBe(graph);
    expect(test.request.mock.calls.filter(([r]) => r.type === "file.read")).toHaveLength(before);
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    test.fail("example/fraudcheck.ts"); await openContextPath("example/fraudcheck.ts"); await screen.findByText("FILE_NOT_FOUND: No file");
    expect(subject()).toBe("service:fraud-check"); expect(editor.state.doc.toString()).toMatch(/^dirty /); expect(editor.state.selection.main.anchor).toBe(2);
    test.fail("");
    await openContextPath("example/payments.proto"); await waitFor(() => expect(subject()).toBe("example/payments.proto"));
    expect(serviceText()).toContain("Declares required interface"); expect(serviceText()).not.toContain("Implementation member of");
  });
  it("keeps A on pending/failed B, rejects superseded B and does not promote palette preview", async () => {
    const test = setup(); render(<App />);
    await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    test.delay("example/fraudcheck.ts"); await openContextPath("example/fraudcheck.ts");
    await screen.findByText("Opening working file example/fraudcheck.ts…"); expect(subject()).toBe("core/files.ts");
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    await test.finish(); expect(subject()).toBe("service:fraud-check");
    fireEvent.pointerDown(document.querySelector(".cm-content")!); expect(subject()).toBe("core/files.ts");
    test.fail("deleted.ts"); await openContextPath("deleted.ts"); await screen.findByText("FILE_NOT_FOUND: No file"); expect(subject()).toBe("core/files.ts");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); fireEvent.change(screen.getByRole("textbox", { name: "Workspace command" }), { target: { value: "preview" } });
    expect(subject()).toBe("core/files.ts"); fireEvent.keyDown(screen.getByRole("textbox", { name: "Workspace command" }), { key: "Escape" });
    expect(subject()).toBe("core/files.ts");
  });
});
