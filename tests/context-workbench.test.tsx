// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, WorkspaceSnapshotSchema, type CoreEvent, type CoreRequest, type CoreResponse, type FocusRef, type GraphSlice, type WorkspaceSnapshot } from "../protocol/schema";
import type { RepositoryObservation } from "../protocol/repository";
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
  const listeners = new Set<(event: CoreEvent) => void>(); let sequence = 0;
  const emit = (value: WorkspaceSnapshot) => act(() => { const valid = WorkspaceSnapshotSchema.parse(value); for (const listener of listeners) listener({ protocolVersion: PROTOCOL_VERSION, sequence: ++sequence, type: "workspace.changed", epoch: valid.reconciliation.epoch, emittedAt: "2026-09-07T03:00:00.000Z", snapshot: valid }); });
  window.swarm = { request, onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } }; window.swarmView = { setZoomPercent: async () => ({ ok: true, percent: 100 }) };
  return { snapshot, emit, request, delay: (path: string) => { delayPath = path; }, fail: (path: string) => { failPath = path; }, finish: async () => { if (!delayed) throw new Error("No delayed read"); const held = delayed; await act(async () => held.resolve(response(held.request))); } };
}
describe("truthful Context in the mounted workbench", () => {
  it("accepts unchanged artifact bytes with a newly built repository fingerprint", async () => {
    const test = setup(); render(<App />); await openContextPath("example/fraudcheck.ts"); await waitFor(() => expect(subject()).toBe("example/fraudcheck.ts"));
    expect(serviceText()).toContain("Implementation member of");
    const next = structuredClone(test.snapshot); const fp = "f".repeat(64);
    next.revisions.working = { id: fp, fingerprint: fp, evidence: "observed" }; next.revisions.built.sourceFingerprint = fp;
    next.focus.revisionId = fp; next.reconciliation.inputFingerprint = fp; next.reconciliation.lastConsistentFingerprint = fp;
    next.reconciliation.epoch += 1;
    next.graphs = next.graphs.map((graph) => ({ ...graph, inputFingerprint: fp, nodes: graph.nodes.map((node) => ({ ...node, focus: { ...node.focus, revisionId: fp } })), provenance: graph.provenance.map((p) => ({ ...p, version: p.sourceKind === "build" ? next.revisions.built.id : fp })) }));
    if (next.serviceContext?.status !== "observed") throw new Error("Missing fixture publication");
    next.serviceContext.sourceFingerprint = fp; next.serviceContext.observedAt = "2026-09-07T03:02:00.000Z";
    test.emit(next);
    expect(serviceText()).toContain("Implementation member of"); expect(serviceText()).toContain(fp);
    expect(document.querySelector("[data-context-section='services'] [data-context-freshness]")?.textContent).toBe("current");
  });
  it("Back uses its validated destination when acknowledgement precedes the graph event", async () => {
    const test = setup();
    const directoryGraph = (directory: string): GraphSlice => {
      const entries: RepositoryObservation["entries"] = directory ? [] : [{ id: "directory:core", path: "core", label: "core", kind: "directory", git: "tracked", actionable: true }];
      const observation: RepositoryObservation = { directory, observationId: `page:${directory}`, capturedAt: "2026-09-07T03:00:00.000Z", state: "observed", complete: true, capturedCount: entries.length, filteredCount: entries.length, page: 0, pageCount: 1, filter: "", entries };
      return { ...test.snapshot.graphs[0]!, directory: observation, reconciliation: "gray", edges: [],
        nodes: [{ id: `directory:${directory}`, label: directory || "/", kind: "directory", status: "gray", position: { x: 0, y: 0 }, focus: { ...test.snapshot.focus, domain: "repo", key: `dir:${directory}`, path: directory || undefined } },
          ...entries.map((entry) => ({ id: entry.id, label: entry.label, kind: entry.kind, status: "gray" as const, position: { x: 0, y: 0 }, focus: { ...test.snapshot.focus, domain: "repo" as const, key: `dir:${entry.path}`, path: entry.path! } }))],
        provenance: [{ sourceKind: "repo", version: observation.observationId, uri: "repo://directory", observedAt: observation.capturedAt }] };
    };
    test.snapshot.graphs[0] = directoryGraph("");
    const original = test.request.getMockImplementation()!; let held: WorkspaceSnapshot | undefined;
    test.request.mockImplementation(async (input) => {
      if (input.type !== "repo.list") return original(input);
      const next = { ...test.snapshot, graphs: [directoryGraph(input.directory), test.snapshot.graphs[1]!] };
      if (input.directory === "") held = next; else test.emit(next);
      return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0, snapshot: next, repo: { kind: "list", observation: next.graphs[0]!.directory! } };
    });
    render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Enter directory core" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Repository Back" }).getAttribute("disabled")).toBeNull());
    expect(subject()).toBe("core");
    fireEvent.click(screen.getByRole("button", { name: "Repository Back" }));
    await waitFor(() => expect(subject()).toBe("/"));
    expect(document.querySelector("[data-context-section='directory']")?.textContent).toContain("no matching current page");
    if (!held) throw new Error("Back publication not held"); test.emit(held);
    expect(subject()).toBe("/"); expect(document.querySelector("[data-context-section='directory']")?.textContent).toContain("page:");
  });
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
  it("closing a non-inspected source tab preserves explicit graph attention", async () => {
    setup(); render(<App />); await openContextPath("core/files.ts"); await waitFor(() => expect(subject()).toBe("core/files.ts"));
    fireEvent.click(screen.getByRole("button", { name: "Inspect service:fraud-check" }));
    fireEvent.click(screen.getByRole("button", { name: "Close core/files.ts" }));
    expect(subject()).toBe("service:fraud-check"); expect(document.querySelector(".cm-content")).toBeNull();
  });
});
