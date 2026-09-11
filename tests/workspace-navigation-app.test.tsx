// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { taskObservationFixture } from "../fixtures/tasks";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { PROTOCOL_VERSION, type CoreEvent, type CoreRequest, type CoreResponse, type GraphSlice, type WorkspaceSnapshot } from "../protocol/schema";
import type { WorkspaceDescriptor } from "../protocol/workspace";
import type { RepositoryObservation } from "../protocol/repository";
import { fixtureBuildObservation } from "./support/build-graph-fixture";

vi.mock("../app/renderer/GraphPane", () => ({ GraphPane: ({ graph }: { graph: GraphSlice }) => <div data-testid={`scope-${graph.topologyId}`}>{graph.scope}</div> }));
vi.mock("../app/renderer/plans/PlanWorkspace", () => ({ PlanWorkspace: ({ renderWorkspace }: {
  renderWorkspace(value: { components: ReactNode; document: ReactNode; tasks: ReactNode }): ReactNode;
}) => renderWorkspace({ components: <div>Components</div>, document: <div>Design</div>, tasks: <div>Task graph</div> }) }));
vi.mock("../app/renderer/external-agents/client", () => {
  const root = { id: "00000000-0000-4000-8000-000000000001", label: "ROOT", evidence: "local", status: "observed", parentId: null,
    ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T06:00:00Z", message: "Registered", contextPaths: [], control: "tmux", worktree: "/repo/master", lifecycle: { state: "working" } };
  const child = { ...root, id: "00000000-0000-4000-8000-000000000002", label: "Child", parentId: root.id, ancestry: "registered-parent", worktree: "/repo/child" };
  const client = { selected: root.id, detail: { session: root, handoff: "available", entries: [], coverage: { tailBytes: 0, partial: false, omittedRecords: 0, message: "Recent" } },
    snapshot: { status: "observed", observedAt: root.observedAt, message: "Registered", sessions: [root, child] }, busy: false, notice: "", fleet: [],
    read: async () => {}, refresh: async () => {}, handoff: async () => {} };
  return { useExternalAgents: () => client };
});
import { App } from "../app/renderer/App";

const CHILD = "00000000-0000-4000-8000-000000000002";
const path = "same.ts";
const scopes: Record<"A" | "B", WorkspaceDescriptor> = {
  A: { id: "workspace:A", root: "/repo/master", label: "Main workspace", projectId: "a".repeat(64), agentVisibility: "project", sessionId: null, branch: "master", base: "master", changes: [], changesComplete: true },
  B: { id: "workspace:B", root: "/repo/child", label: "Child", projectId: "a".repeat(64), agentVisibility: "worktree", sessionId: CHILD, branch: "feature/child", base: "master", changes: [{ path, status: "modified" }], changesComplete: true },
};

function snapshotFor(scope: "A" | "B"): WorkspaceSnapshot {
  const snapshot = initialSnapshot();
  const entry = { id: `file:${path}`, path, label: path, kind: "file" as const, git: "tracked" as const, actionable: true };
  const observation: RepositoryObservation = { directory: "", observationId: `directory:${scope}`, capturedAt: "2026-09-08T06:00:00Z", state: "observed", complete: true,
    capturedCount: 1, filteredCount: 1, page: 0, pageCount: 1, filter: "", entries: [entry] };
  snapshot.project = { ...snapshot.project, id: scopes[scope].id, name: scopes[scope].label };
  snapshot.focus = { ...snapshot.focus, domain: "repo", key: "dir:" };
  delete snapshot.focus.path;
  snapshot.graphs = [{ ...snapshot.graphs[0]!, scope: scopes[scope].root, directory: observation, reconciliation: "gray", edges: [],
    provenance: [{ sourceKind: "repo", uri: "repo://directory", version: observation.observationId, observedAt: observation.capturedAt }],
    nodes: [{ id: "directory:", label: scopes[scope].label, kind: "directory", status: "gray", position: { x: 0, y: 0 }, focus: snapshot.focus },
      { id: entry.id, label: path, kind: "file", status: "gray", position: { x: 0, y: 0 }, focus: { ...snapshot.focus, key: entry.id, path } }] }];
  snapshot.widgets = []; snapshot.mappings = []; delete snapshot.serviceContext;
  return snapshot;
}

function setup() {
  const snapshots = { A: snapshotFor("A"), B: snapshotFor("B") };
  const disk = { A: { content: "A disk source\n", revision: "a".repeat(64) }, B: { content: "B disk source\n", revision: "b".repeat(64) } };
  let sequence = 0, failSelection = false, failIdentity = false, holdA = false;
  let launchScope = { ...scopes.A };
  let held: { response: CoreResponse; resolve(value: CoreResponse): void } | undefined;
  let workspaceHold: string | null | undefined;
  let heldWorkspace: { request: CoreRequest; resolve(value: CoreResponse): void } | undefined;
  const listeners = new Set<(event: CoreEvent) => void>();
  const response = (input: CoreRequest): CoreResponse => {
    const scope = (input as CoreRequest & { workspaceId?: string }).workspaceId === scopes.B.id ? "B" : "A";
    const snapshot = snapshots[scope];
    const common = { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true as const, sequence: ++sequence, workspaceId: snapshot.project.id, snapshot };
    if (input.type === "workspace.open") {
      if (input.identityOnly && failIdentity) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "WORKSPACE_UNAVAILABLE", message: "Identity unavailable." } };
      if (input.sessionId === CHILD && failSelection) return { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: false, error: { code: "WORKSPACE_UNAVAILABLE", message: "Child worktree disappeared." } };
      const destination = input.sessionId === CHILD ? "B" : "A";
      const workspace = destination === "A" ? launchScope : scopes.B;
      return { ...common, workspaceId: workspace.id, snapshot: snapshots[destination], workspace };
    }
    if (input.type === "file.read") {
      const { content, revision } = disk[scope];
      return { ...common, file: { kind: "read", path: input.path, content, revision, size: content.length } };
    }
    if (input.type === "file.write") {
      disk[scope] = { content: input.content, revision: "c".repeat(64) };
      return { ...common, file: { kind: "write", path: input.path, revision: disk[scope].revision, workingFingerprint: "c".repeat(64) } };
    }
    if (input.type === "repo.list") return { ...common, repo: { kind: "list", observation: snapshot.graphs[0]!.directory! } };
    if (input.type === "agent.snapshot") return { ...common, agent: { kind: "snapshot", snapshot: emptyAgentWorkbench().snapshot } };
    if (input.type === "tasks.snapshot") {
      const observation = taskObservationFixture(); observation.repositoryId = snapshot.project.id;
      if (observation.snapshot) observation.snapshot.repositoryId = snapshot.project.id;
      return { ...common, task: { kind: "snapshot", observation } };
    }
    if (input.type === "buildGraph.observe") return { ...common, buildGraph: fixtureBuildObservation(snapshot) };
    return common;
  };
  const request = vi.fn(async (input: CoreRequest): Promise<CoreResponse> => {
    if (workspaceHold !== undefined && input.type === "workspace.open" && input.sessionId === workspaceHold) {
      return new Promise((resolve) => { heldWorkspace = { request: input, resolve }; });
    }
    if (holdA && input.type === "file.read" && (input as { workspaceId?: string }).workspaceId === scopes.A.id) {
      const captured = response(input);
      return new Promise((resolve) => { held = { response: captured, resolve }; });
    }
    return response(input);
  });
  window.swarm = { request, onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  return { request, snapshots, fail: () => { failSelection = true; }, failIdentity: () => { failIdentity = true; },
    launchScope: (patch: Partial<WorkspaceDescriptor>) => { launchScope = { ...launchScope, ...patch }; },
    hold: () => { holdA = true; }, held: () => Boolean(held),
    holdWorkspace: (sessionId: string | null) => { workspaceHold = sessionId; }, workspaceHeld: () => Boolean(heldWorkspace),
    releaseWorkspace: async () => { if (!heldWorkspace) throw new Error("No held workspace opening"); const item = heldWorkspace; workspaceHold = undefined; await act(async () => item.resolve(response(item.request))); },
    release: async (failed = false) => {
      if (!held) throw new Error("No held source read");
      const item = held; holdA = false;
      await act(async () => item.resolve(failed ? { protocolVersion: PROTOCOL_VERSION, requestId: item.response.requestId,
        ok: false, workspaceId: scopes.A.id, error: { code: "FILE_NOT_FOUND", message: "Old source read was unavailable." } } : item.response));
    },
    emit: (scope: "A" | "B") => act(() => {
      for (const listener of listeners) listener({ protocolVersion: PROTOCOL_VERSION, type: "workspace.changed", sequence: ++sequence,
        epoch: snapshots[scope].reconciliation.epoch, emittedAt: "2026-09-08T06:01:00Z", snapshot: snapshots[scope] });
    }),
  };
}

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); delete window.swarm; delete window.swarmView; delete window.swarmLifecycle; });
const editor = () => EditorView.findFromDOM(document.querySelector(".cm-editor")!)!;
async function openSource(expected: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Open file ${path}` }));
  await waitFor(() => expect(editor().state.doc.toString()).toBe(expected));
}
async function selectWorktree(value: string, root: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Worktree" }), { target: { value } });
  await waitFor(() => expect(screen.getByTestId("scope-repo").textContent).toBe(root));
}

describe("ordinary worktree navigation in the mounted cockpit", () => {
  it("places fresh-launch graph agents against a canonical root learned without switching worktrees", async () => {
    const test = setup(); render(<App />);
    const context = await screen.findByRole("region", { name: "Worktree context" });
    expect(context.textContent).toContain("/repo/master");
    expect(test.request.mock.calls.filter(([request]) => request.type === "workspace.open").map(([request]) => request))
      .toEqual([expect.objectContaining({ type: "workspace.open", sessionId: null }),
        expect.objectContaining({ type: "workspace.open", sessionId: null, identityOnly: true })]);
    expect(test.request.mock.calls.some(([request]) => request.type === "workspace.snapshot")).toBe(false);
  });
  it("refreshes mutable branch scope on observer-driven renders and narrows on identity failure", async () => {
    const test = setup(); render(<App />);
    const context = await screen.findByRole("region", { name: "Worktree context" });
    await waitFor(() => expect(test.request.mock.calls.filter(([request]) => request.type === "workspace.open" && request.identityOnly)).toHaveLength(1));
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
    test.launchScope({ branch: "feature/mutable", agentVisibility: "worktree" }); test.emit("A");
    await waitFor(() => expect(context.textContent).toContain("feature/mutable"));
    vi.mocked(Date.now).mockReturnValue(now + 20_000); test.failIdentity(); test.emit("A");
    await waitFor(() => expect(context.textContent).toContain("Detached HEAD"));
    expect(context.textContent).toContain("exact-worktree scope retained");
  });
  it("keeps separate same-path dirty editors and steering through ordinary browsing and Back/Forward", async () => {
    const test = setup(); render(<App />);
    await openSource("A disk source\n");
    const input = await screen.findByRole("textbox", { name: "Message to ROOT" });
    fireEvent.change(input, { target: { value: "Do not send this draft" } });
    act(() => editor().dispatch({ changes: { from: 0, insert: "dirty A " }, selection: { anchor: 4 } }));
    await selectWorktree(CHILD, "/repo/child");
    expect(screen.getByRole("region", { name: "Repository navigation" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Agent worktree file" })).toBeNull();
    await openSource("B disk source\n");
    act(() => editor().dispatch({ changes: { from: 0, insert: "dirty B " }, selection: { anchor: 5 } }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" })); // B file -> B worktree.
    await waitFor(() => expect((screen.getByRole("button", { name: "Go forward" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true }); // B worktree -> A file.
    await waitFor(() => expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/master"));
    await waitFor(() => expect(editor().state.doc.toString()).toBe("dirty A A disk source\n"));
    expect(editor().state.selection.main.anchor).toBe(4);
    expect((screen.getByRole("textbox", { name: "Message to ROOT" }) as HTMLTextAreaElement).value).toBe("Do not send this draft");
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/child"));
    await waitFor(() => expect(editor().state.doc.toString()).toBe("dirty B B disk source\n"));
    expect(editor().state.selection.main.anchor).toBe(5);
    const reads = test.request.mock.calls.map(([request]) => request).filter((request) => request.type === "file.read");
    expect(reads.some((request) => (request as { workspaceId?: string }).workspaceId === scopes.A.id)).toBe(true);
    expect(reads.some((request) => (request as { workspaceId?: string }).workspaceId === scopes.B.id)).toBe(true);
    expect(test.request.mock.calls.some(([request]) => request.type === "file.write" || request.type === "externalAgents.send" || request.type === "agent.launch")).toBe(false);
  });

  it("a failed worktree selection leaves the previous directory and dirty source usable", async () => {
    const test = setup(); render(<App />); await openSource("A disk source\n");
    act(() => editor().dispatch({ changes: { from: 0, insert: "keep " }, selection: { anchor: 2 } }));
    test.fail(); fireEvent.change(screen.getByRole("combobox", { name: "Worktree" }), { target: { value: CHILD } });
    await screen.findByText(/Child worktree disappeared/);
    expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/master");
    expect(editor().state.doc.toString()).toBe("keep A disk source\n");
    expect(editor().state.selection.main.anchor).toBe(2);
    expect((screen.getByRole("combobox", { name: "Worktree" }) as HTMLSelectElement).disabled).toBe(false);
    expect(within(screen.getByRole("region", { name: "Repository navigation" })).getByRole("button", { name: `Open file ${path}` })).toBeTruthy();
  });

  it("an old-worktree held read and late graph event cannot replace the selected worktree", async () => {
    const test = setup(); test.hold(); render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: `Open file ${path}` }));
    await waitFor(() => expect(test.held()).toBe(true));
    await selectWorktree(CHILD, "/repo/child");
    await openSource("B disk source\n");
    await test.release(); test.emit("A");
    expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/child");
    expect(editor().state.doc.toString()).toBe("B disk source\n");
    expect((screen.getByRole("combobox", { name: "Worktree" }) as HTMLSelectElement).value).toBe(CHILD);
  });

  it("new file navigation cancels a held cross-worktree history restore without committing its old cursor", async () => {
    const test = setup(); render(<App />);
    await openSource("A disk source\n");
    await selectWorktree(CHILD, "/repo/child"); await openSource("B disk source\n");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Go forward" }) as HTMLButtonElement).disabled).toBe(false));
    test.holdWorkspace(null);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => expect(test.workspaceHeld()).toBe(true));
    const file = screen.getByRole("button", { name: `Open file ${path}` });
    fireEvent.pointerDown(file); fireEvent.click(file);
    await waitFor(() => expect((screen.getByRole("button", { name: "Go forward" }) as HTMLButtonElement).disabled).toBe(true));
    await test.releaseWorkspace();
    expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/child");
    expect(editor().state.doc.toString()).toBe("B disk source\n");
    expect((screen.getByRole("combobox", { name: "Worktree" }) as HTMLSelectElement).value).toBe(CHILD);
    // The next Back still visits B's worktree, not A. The cancelled result did
    // not secretly move the cursor behind the newly opened B file.
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Go forward" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/child");
    expect(test.request.mock.calls.some(([request]) => request.type === "file.write" || request.type === "externalAgents.send")).toBe(false);
  });

  it("blocks Save while workspace selection is held and retains the original dirty buffer", async () => {
    const test = setup(); render(<App />); await openSource("A disk source\n");
    act(() => editor().dispatch({ changes: { from: 0, insert: "unsaved " }, selection: { anchor: 3 } }));
    test.holdWorkspace(CHILD);
    fireEvent.change(screen.getByRole("combobox", { name: "Worktree" }), { target: { value: CHILD } });
    await waitFor(() => expect(test.workspaceHeld()).toBe(true));
    const source = document.querySelector<HTMLElement>(".source-surface")!;
    fireEvent.click(within(source).getByRole("button", { name: /^Save/ }));
    fireEvent.keyDown(editor().contentDOM, { key: "s", ctrlKey: true });
    expect(test.request.mock.calls.some(([request]) => request.type === "file.write")).toBe(false);
    expect(editor().state.doc.toString()).toBe("unsaved A disk source\n");
    await test.releaseWorkspace();
    await waitFor(() => expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/child"));
    await selectWorktree("", "/repo/master");
    await waitFor(() => expect(editor().state.doc.toString()).toBe("unsaved A disk source\n"));
    expect(editor().state.selection.main.anchor).toBe(3);
    expect(test.request.mock.calls.some(([request]) => request.type === "file.write")).toBe(false);
  });

  it.each([{ kind: "successful", failed: false }, { kind: "failed", failed: true }])("an older $kind retained-buffer reread cannot overwrite a newer completed save without a watcher event", async ({ failed }) => {
    const test = setup(); render(<App />); await openSource("A disk source\n");
    await selectWorktree(CHILD, "/repo/child");
    test.hold(); await selectWorktree("", "/repo/master");
    await waitFor(() => expect(test.held()).toBe(true));
    expect(editor().state.doc.toString()).toBe("A disk source\n");
    act(() => editor().dispatch({ changes: { from: 0, insert: "newer saved " }, selection: { anchor: 5 } }));
    const source = document.querySelector<HTMLElement>(".source-surface")!;
    fireEvent.click(within(source).getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(source.querySelector(".file-state")?.classList.contains("file-saved")).toBe(true));
    expect(test.request.mock.calls.filter(([request]) => request.type === "file.write").map(([request]) => request)).toEqual([
      expect.objectContaining({ workspaceId: scopes.A.id, path, content: "newer saved A disk source\n" }),
    ]);
    // The captured read still contains the old bytes/revision, and there has
    // been no watcher event to help reject it. The completed save itself wins.
    await test.release(failed);
    expect(editor().state.doc.toString()).toBe("newer saved A disk source\n");
    expect(editor().state.selection.main.anchor).toBe(5);
    expect(source.querySelector(".file-state")?.classList.contains("file-saved")).toBe(true);
    expect(screen.getByTestId("scope-repo").textContent).toBe("/repo/master");
  });
});
