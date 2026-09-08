// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PlanIndexSchema } from "../protocol/plans";
import { DesignWorkspace, designProjection, implementationProjection, designLinkPath } from "../app/renderer/plans/DesignWorkspace";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";
import { PlanWorkspace } from "../app/renderer/plans/PlanWorkspace";
import { TaskBridgeClient } from "../app/renderer/tasks/client";
import { resolveBazelTarget } from "../app/renderer/bazel-reference";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
import { usePlanNavigation } from "../app/renderer/plans/navigation";

vi.mock("@xyflow/react", () => ({ Background: () => null, Controls: () => null, MarkerType: { ArrowClosed: "arrow" }, Position: { Right: "right", Left: "left" },
  ReactFlow: ({ nodes, onNodeClick }: { nodes: { id: string }[]; onNodeClick: (event: unknown, node: { id: string }) => void }) => <div>{nodes.map((node) => <button key={node.id} onClick={() => onNodeClick({}, node)}>{node.id}</button>)}</div> }));
afterEach(() => { cleanup(); delete window.swarm; });
const root = resolve(import.meta.dirname, "..");
const index = PlanIndexSchema.parse(JSON.parse(readFileSync(resolve(root, ".swarm/plans.json"), "utf8")));
const base = { worldId: "world:working", repositoryId: "project:swarm-ide", generation: 1, connected: true, visible: true };
function reply(request: CoreRequest): CoreResponse {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true as const, sequence: 1, snapshot: initialSnapshot(),
    ...(request.type === "plans.read" ? { plans: { status: "observed" as const, index, revision: "a".repeat(64), observedAt: "2026-09-08T00:00:00.000Z" } }
      : request.type === "file.read" ? { file: { kind: "read" as const, path: request.path, content: `# Actual document\n\n${request.path}`, revision: "a".repeat(64), size: 64 } } : {}) };
}
describe("living system design", () => {
  it("keeps authored task/guidance links in the full reading slot without mounting extra graphs", async () => {
    const request = vi.fn(async (input: CoreRequest) => reply(input));
    window.swarm = { request, onEvent: () => () => {} };
    const onOpenTask = vi.fn(), onOpenFile = vi.fn();
    render(<DesignWorkspace {...base} onOpenFile={onOpenFile} onOpenTask={onOpenTask} documentVisible
      taskPane={<div data-testid="task-pane">Task graph</div>}
      renderWorkspace={({ components, document, tasks }) => <>{components}<main>{document}</main>{tasks}</>} />);
    await screen.findByText("Actual document");
    const rootNode = index.nodes[0]!;
    const guidance = screen.getByRole("region", { name: "Design tasks and guidance" });
    for (const id of rootNode.taskIds) {
      fireEvent.click(within(guidance).getByRole("button", { name: `Task · ${id}` }));
      expect(onOpenTask).toHaveBeenLastCalledWith(id);
    }
    for (const ref of rootNode.contextRefs) {
      fireEvent.click(within(guidance).getByRole("button", { name: `${ref.kind} · ${ref.path}` }));
      expect(onOpenFile).toHaveBeenLastCalledWith(ref.path);
    }
    // The original plan forest remains reachable alongside the newer design
    // root; this actual plan carries guidance rather than an empty test list.
    const planRoot = index.nodes.find(item => !item.parentId && item.contextRefs.length)!;
    expect(planRoot).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Design or plan root" }), { target: { value: planRoot.id } });
    await waitFor(() => expect(screen.getByRole("region", { name: "Design tasks and guidance" }).textContent).toContain(planRoot.contextRefs[0]!.path));
    fireEvent.click(within(screen.getByRole("region", { name: "Design tasks and guidance" })).getByRole("button", { name: `${planRoot.contextRefs[0]!.kind} · ${planRoot.contextRefs[0]!.path}` }));
    expect(onOpenFile).toHaveBeenLastCalledWith(planRoot.contextRefs[0]!.path);
    expect(screen.getAllByTestId("task-pane")).toHaveLength(1);
    expect(document.querySelector(".design-implementation-graph")).toBeNull();
    expect(screen.getByRole("region", { name: "Design implementation" })).toBeTruthy();
  });
  it("opens only exact observed build declarations, including BUILD without the bazel suffix", () => {
    const capture: BuildLinkSnapshot = { repositoryId: base.repositoryId, revision: "a", capturedAt: "now", command: "query", links: [], targets: [
      { label: "//core:runtime", kind: "rule", path: "core", buildFile: "core/BUILD" },
      { label: "//core:service.ts", kind: "source", path: "core/service.ts", buildFile: "core/BUILD" },
      { label: "//core:generated.ts", kind: "generated", path: "core/generated.ts" },
    ] };
    expect(resolveBazelTarget("//core:runtime", capture)).toEqual({ path: "core/BUILD", target: "//core:runtime" });
    expect(resolveBazelTarget("//core:service.ts", capture)?.path).toBe("core/service.ts");
    for (const label of ["//core:missing", "//core:generated.ts", ":runtime", "@external//core:runtime", "//../private:target"]) expect(resolveBazelTarget(label, capture)).toBeNull();
    expect(resolveBazelTarget("//core:runtime", undefined)).toBeNull();
    expect(resolveBazelTarget("//core:runtime", { ...capture, targets: [...capture.targets!, capture.targets![0]!] })).toBeNull();
    expect(resolveBazelTarget("//core:runtime", { ...capture, targets: [...capture.targets!, { label: "//core:other", kind: "rule", path: "core", buildFile: "core/BUILD.bazel" }] })).toBeNull();
  });
  it("resolves repo document links without external URLs or repository escape", () => {
    expect(designLinkPath("docs/design/system.md", "cockpit.md")).toBe("docs/design/cockpit.md");
    expect(designLinkPath("docs/design/system.md", "../../core/plans.ts")).toBe("core/plans.ts");
    expect(designLinkPath("docs/design/system.md", "../../../private")).toBeNull();
    expect(designLinkPath("docs/design/system.md", "javascript:alert(1)")).toBeNull();
  });
  it("keeps existing authored forests compatible and rejects dangling design links/invalid labels", () => {
    expect(index.nodes.filter((node) => node.design)).toHaveLength(7);
    const invalid = structuredClone(index); invalid.nodes[0]!.design!.connections.push({ targetId: "missing", label: "uses" });
    expect(PlanIndexSchema.safeParse(invalid).success).toBe(false);
    const badLabel = structuredClone(index); badLabel.nodes[1]!.design!.buildTargets[0]!.label = "//../private:secret";
    expect(PlanIndexSchema.safeParse(badLabel).success).toBe(false);
    const legacy = { ...index, nodes: index.nodes.map(({ design: _design, ...node }) => node) };
    expect(PlanIndexSchema.safeParse(legacy).success).toBe(true);
  });
  it("maps every design doc/source to actual files and every target to a declared rule or referenced source", () => {
    for (const node of index.nodes.filter((node) => node.design)) {
      for (const path of [...node.docs, ...node.sourcePaths]) expect(existsSync(resolve(root, path)), path).toBe(true);
      const document = readFileSync(resolve(root, node.docs[0]!), "utf8");
      expect(document.length).toBeGreaterThan(200);
      for (const target of node.design!.buildTargets) for (const label of [target.label, ...target.dependencies.map((edge) => edge.label)]) {
        const [pkg, name] = label.slice(2).split(":");
        const build = readFileSync(resolve(root, pkg!, "BUILD.bazel"), "utf8");
        const literal = name!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rule = new RegExp(`name\\s*=\\s*"${literal}"`).test(build);
        // Bazel source labels can be implicit exports referenced by local rules,
        // e.g. :virtual-desktop-run.sh. They are files, not named rules.
        const referencedSource = new RegExp(`":?${literal}"`).test(build) && existsSync(resolve(root, pkg!, name!));
        expect(rule || referencedSource, label).toBe(true);
      }
    }
  });
  it("renders connected top components then real target/input edges at component depth", () => {
    const top = designProjection(index, index.nodes[0]!);
    expect(top.nodes).toHaveLength(7);
    expect(top.edges.some((edge) => edge.label === "Files & target definitions")).toBe(true);
    const leaf = implementationProjection(index.nodes[1]!);
    expect(leaf.edges).toContainEqual(expect.objectContaining({ source: "//:desktop-bundle", target: "//:quality_sources", label: "srcs" }));
  });
  it("shows the component's inbound and outbound connections without inventing hierarchy", () => {
    const graph = designProjection(index, index.nodes[1]!);
    expect(graph.nodes.some((node) => node.id === "design:repository")).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "design:cockpit", target: "design:repository", label: "Files & target definitions" }));
    expect(graph.nodes.some((node) => node.id.startsWith("//"))).toBe(false);
    expect(graph.edges.some((edge) => edge.label === "contains")).toBe(false);
  });
  it("does not invent a build filename when no target activation is wired", async () => {
    window.swarm = { request: vi.fn(async (req: CoreRequest) => reply(req)), onEvent: () => () => {} };
    const onOpenFile = vi.fn();
    render(<DesignWorkspace {...base} onOpenFile={onOpenFile} />);
    await screen.findByText("docs/design/system.md");
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
    fireEvent.click(screen.getAllByRole("button", { name: "//:desktop-bundle" })[0]!);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Open the Build view/)).toBeTruthy();
  });
  it("collapses large source lists but lets the operator expand and open the last link", async () => {
    window.swarm = { request: vi.fn(async (req: CoreRequest) => reply(req)), onEvent: () => () => {} };
    const onOpenFile = vi.fn();
    render(<DesignWorkspace {...base} onOpenFile={onOpenFile} />);
    await screen.findByText("docs/design/system.md");
    fireEvent.click(screen.getByRole("button", { name: "design:repository" }));
    await screen.findByText("docs/design/repository.md");
    expect(screen.queryByRole("button", { name: "BUILD.bazel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Show all ${index.nodes.find(node => node.id === "design:repository")!.sourcePaths.length} source files` }));
    fireEvent.click(screen.getByRole("button", { name: "BUILD.bazel" }));
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith("BUILD.bazel");
    fireEvent.click(screen.getByRole("button", { name: "Show fewer source files" }));
    expect(screen.queryByRole("button", { name: "BUILD.bazel" })).toBeNull();
  });
  it("opens the top design by default and shares one selection/read across outline and design", async () => {
    const request = vi.fn(async (req: CoreRequest) => reply(req));
    window.swarm = { request, onEvent: () => () => {} };
    const client = new TaskBridgeClient();
    const onOpenFile = vi.fn();
    render(<PlanWorkspace {...base} client={client} tasks={client.getSnapshot()} onOpenFile={onOpenFile} onOpenTask={vi.fn(async () => true)} />);
    await screen.findByText("docs/design/system.md");
    expect(request.mock.calls.filter(([req]) => req.type === "plans.read")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Plans & components" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect plan design:repository" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Planning projections" })).getByRole("button", { name: "System design" }));
    await screen.findByText("docs/design/repository.md");
    expect(within(screen.getByRole("navigation", { name: "Design breadcrumb" })).getByRole("button", { name: "Repository, build & context" }).getAttribute("aria-current")).toBe("page");
    expect(request.mock.calls.filter(([req]) => req.type === "plans.read")).toHaveLength(1);
    expect(onOpenFile).not.toHaveBeenCalled();
  });
  it("loads under React strict effect replay and ignores another repository's pending plan", async () => {
    const request = vi.fn(async (req: CoreRequest) => reply(req));
    window.swarm = { request, onEvent: () => () => {} };
    const view = render(<StrictMode><DesignWorkspace {...base} onOpenFile={vi.fn()} /></StrictMode>);
    await screen.findByText("docs/design/system.md");
    request.mockImplementation(() => new Promise(() => {}));
    view.rerender(<StrictMode><DesignWorkspace {...base} repositoryId="different-project" onOpenFile={vi.fn()} /></StrictMode>);
    expect(screen.queryByRole("button", { name: "design:cockpit" })).toBeNull();
    expect(screen.queryByText("docs/design/system.md")).toBeNull();
  });
  it.each([false, true])("reconnects at the same generation without reauthorizing an old completed/pending read (%s)", async (completeFirst) => {
    const pending: Array<{ request: CoreRequest; resolve: (reply: CoreResponse) => void }> = [];
    window.swarm = { request: (request) => new Promise((resolve) => { pending.push({ request, resolve }); }), onEvent: () => () => {} };
    const view = renderHook((props) => usePlanNavigation(props), { initialProps: base });
    if (completeFirst) { await act(async () => pending[0]!.resolve(reply(pending[0]!.request))); expect(view.result.current.current).toBe(true); }
    view.rerender({ ...base, connected: false });
    expect(view.result.current.current).toBe(false);
    view.rerender(base);
    expect(view.result.current.current).toBe(false);
    expect(pending).toHaveLength(2);
    if (!completeFirst) await act(async () => pending[0]!.resolve(reply(pending[0]!.request)));
    expect(view.result.current.current).toBe(false);
    await act(async () => pending[1]!.resolve(reply(pending[1]!.request)));
    expect(view.result.current.current).toBe(true);
  });
  it("drills down, reads design without changing source, and activates explicit source/task/build callbacks", async () => {
    const request = vi.fn(async (req: CoreRequest) => reply(req));
    window.swarm = { request, onEvent: () => () => {} };
    const onOpenFile = vi.fn(), onOpenBuild = vi.fn(), onOpenTask = vi.fn();
    render(<DesignWorkspace {...base} onOpenFile={onOpenFile} onOpenBuild={onOpenBuild} onOpenTask={onOpenTask} />);
    await screen.findByText("docs/design/system.md");
    expect(onOpenFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
    fireEvent.click(screen.getByRole("button", { name: "app/renderer/App.tsx" }));
    expect(onOpenFile).toHaveBeenCalledWith("app/renderer/App.tsx");
    fireEvent.click(screen.getAllByRole("button", { name: "//:desktop-bundle" })[0]!);
    expect(onOpenBuild).toHaveBeenCalledWith("//:desktop-bundle");
    fireEvent.click(screen.getByRole("button", { name: "Up one level" }));
    fireEvent.click(screen.getByRole("button", { name: "Task · swarm-living-design" }));
    expect(onOpenTask).toHaveBeenCalledWith("swarm-living-design");
    expect(request.mock.calls.every(([req]) => req.type === "file.read" || req.type === "plans.read")).toBe(true);
  });
  it("does not publish a late doc after navigation or core replacement, and hidden mounts do not read", async () => {
    let release!: (value: CoreResponse) => void;
    const request = vi.fn(async (req: CoreRequest): Promise<CoreResponse> => req.type === "file.read" && req.path.endsWith("system.md")
      ? new Promise((resolve) => { release = resolve; }) : reply(req));
    window.swarm = { request, onEvent: () => () => {} };
    const view = render(<DesignWorkspace {...base} visible={false} onOpenFile={vi.fn()} />);
    expect(request).not.toHaveBeenCalled();
    view.rerender(<DesignWorkspace {...base} onOpenFile={vi.fn()} />);
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "design:cockpit" }));
    await screen.findByText("docs/design/cockpit.md");
    await act(async () => release(reply(request.mock.calls.find(([req]) => req.type === "file.read")![0])));
    expect(screen.queryByText("docs/design/system.md")).toBeNull();
    view.rerender(<DesignWorkspace {...base} connected={false} generation={2} onOpenFile={vi.fn()} />);
    expect((screen.getByRole("button", { name: "app/renderer/App.tsx" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
