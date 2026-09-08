// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PlanIndexSchema } from "../protocol/plans";
import { DesignWorkspace, designProjection, designLinkPath } from "../app/renderer/plans/DesignWorkspace";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest, type CoreResponse } from "../protocol/schema";

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
  it("maps every design doc/source to actual files and every target to a declared local rule", () => {
    for (const node of index.nodes.filter((node) => node.design)) {
      for (const path of [...node.docs, ...node.sourcePaths]) expect(existsSync(resolve(root, path)), path).toBe(true);
      const document = readFileSync(resolve(root, node.docs[0]!), "utf8");
      expect(document.length).toBeGreaterThan(200);
      for (const target of node.design!.buildTargets) for (const label of [target.label, ...target.dependencies.map((edge) => edge.label)]) {
        const [pkg, name] = label.slice(2).split(":");
        const build = readFileSync(resolve(root, pkg!, "BUILD.bazel"), "utf8");
        expect(build, label).toMatch(new RegExp(`name\\s*=\\s*"${name!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      }
    }
  });
  it("renders connected top components then real target/input edges at component depth", () => {
    const top = designProjection(index, index.nodes[0]!);
    expect(top.nodes).toHaveLength(7);
    expect(top.edges.some((edge) => edge.label === "navigates")).toBe(true);
    const leaf = designProjection(index, index.nodes[1]!);
    expect(leaf.edges).toContainEqual(expect.objectContaining({ source: "//:desktop-bundle", target: "//:quality_sources", label: "srcs" }));
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
