// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialSnapshot } from "../fixtures/world";
import { composeContext, indexCapture, indexService } from "../app/renderer/context/compose";
import { ContextPane } from "../app/renderer/context/ContextPane";
import type { BuildLinkSnapshot } from "../app/renderer/repository/layers";
vi.mock("@xyflow/react", () => ({
  Background: () => null, Controls: () => null, Handle: () => null,
  MarkerType: { ArrowClosed: "arrow" }, Position: { Left: "left", Right: "right" },
  ReactFlow: ({ nodes, children }: { nodes: Array<{ id: string; selected?: boolean }>; children: import("react").ReactNode }) => <div>{nodes.map((node) => <span key={node.id} data-testid={node.id} data-selected={node.selected}>{node.id}</span>)}{children}</div>,
}));
import { BuildGraphPane, TopologyViews, matchesTargetSelection } from "../app/renderer/repository/BuildGraphPane";
afterEach(cleanup);
const capture: BuildLinkSnapshot = {
  repositoryId: "repo", revision: "rev1", capturedAt: "2026-09-08T05:00:00Z", command: "bazel query //...:*",
  targets: [
    { label: "//b:data.txt", kind: "source", path: "b/data.txt", buildFile: "b/BUILD" },
    { label: "//b:library", kind: "rule", path: "b", buildFile: "b/BUILD" },
    { label: "//a:consumer", kind: "rule", path: "a", buildFile: "a/BUILD.bazel" },
  ],
  links: [{ from: "//b:library", to: "//b:data.txt", fromPath: "b", toPath: "b/data.txt" }, { from: "//a:consumer", to: "//b:library", fromPath: "a", toPath: "b" }],
};
const selection = { id: "//a:consumer", repositoryId: "repo", revision: "rev1", nonce: 1 };
describe("deliberate Context target navigation", () => {
  it("makes both direct and transitive membership clickable with exact labels", () => {
    const snapshot = initialSnapshot(); snapshot.project.id = "repo";
    const subject = { kind: "file" as const, path: "b/data.txt", repositoryId: "repo", worldId: snapshot.world.id };
    const sections = composeContext(subject, { snapshot, files: [], service: indexService(undefined), capture: indexCapture(capture), realm: "r", session: "s", ready: true });
    const onGraph = vi.fn();
    render(<ContextPane subject={subject} sections={sections} onOpen={vi.fn()} onGraph={onGraph} />);
    fireEvent.click(screen.getByRole("button", { name: "Show build target //b:library" }));
    fireEvent.click(screen.getByRole("button", { name: "Show build target //a:consumer" }));
    expect(onGraph.mock.calls.map(([link]) => link)).toEqual([{ kind: "graph", topologyId: "build", id: "//b:library" }, { kind: "graph", topologyId: "build", id: "//a:consumer" }]);
  });
  it("switches lenses without unmounting service and selects the exact target outside file-follow mode", async () => {
    const onOpenBuild = vi.fn();
    const props = { service: <textarea defaultValue="unsaved service note" />, capture, mockAgents: false, mockVersion: 0, onOpenBuild, focusedFile: "b/data.txt" };
    const view = render(<TopologyViews {...props} />), service = screen.getByRole("textbox");
    view.rerender(<TopologyViews {...props} targetSelection={selection} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Build graph" }).getAttribute("aria-pressed")).toBe("true"));
    expect(service.isConnected).toBe(true);
    expect(screen.getByTestId("//a:consumer").dataset.selected).toBe("true");
    expect((screen.getByLabelText("Follow file") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open build definition" }));
    expect(onOpenBuild).toHaveBeenLastCalledWith("a/BUILD.bazel");
    view.rerender(<TopologyViews {...props} targetSelection={{ ...selection, id: "//b:library", nonce: 2 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open build definition" }));
    expect(onOpenBuild).toHaveBeenLastCalledWith("b/BUILD");
  });
  it("rejects stale/wrong repository/unobserved target requests", () => {
    expect(matchesTargetSelection(capture, selection)).toBe(true);
    for (const change of [{ revision: "rev0" }, { repositoryId: "elsewhere" }, { id: "//a:missing" }]) expect(matchesTargetSelection(capture, { ...selection, ...change })).toBe(false);
    render(<TopologyViews service={<p>service</p>} capture={capture} mockAgents={false} mockVersion={0} onOpenBuild={vi.fn()} targetSelection={{ ...selection, revision: "rev0" }} />);
    expect(screen.getByRole("button", { name: "Service" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("does not guess a declaration from a legacy capture", () => {
    render(<BuildGraphPane capture={{ ...capture, targets: undefined }} mockAgents={false} mockVersion={0} onOpenBuild={vi.fn()} targetSelection={selection} />);
    expect(screen.getByText("Declaration path unavailable.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open BUILD/ })).toBeNull();
  });
});
