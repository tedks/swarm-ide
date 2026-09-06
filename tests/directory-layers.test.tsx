// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { initialSnapshot } from "../fixtures/world";
import type { TopologyNodeData } from "../app/renderer/graph-adapter";
import { AgentSprites } from "../app/renderer/repository/AgentSprites";
import { directoryBuildLinks, withMockDirectoryAgents, type BuildLinkSnapshot } from "../app/renderer/repository/layers";

function node(path: string, kind = "directory"): Node<TopologyNodeData> {
  return { id: path || "root", position: { x: 11, y: 22 }, data: {
    label: path, kind, status: "gray", focused: false, ambiguous: false,
    focus: { ...initialSnapshot().focus, domain: "repo", key: `dir:${path}`, path },
  } };
}
function capture(links: BuildLinkSnapshot["links"]): BuildLinkSnapshot {
  return { repositoryId: "test", revision: "captured-only", capturedAt: "2026-09-06", command: "bazel query", links };
}
const link = (fromPath: string, toPath: string) => ({ from: `//${fromPath}:a`, to: `//${toPath}:b`, fromPath, toPath });
afterEach(cleanup);

describe("optional repository layers", () => {
  it("groups actual target dependencies onto visible directories, preserving direction and evidence", () => {
    const nodes = [node(""), node("app"), node("core")];
    const before = structuredClone(nodes);
    const edges = directoryBuildLinks(nodes, capture([link("app/main", "core/io"), link("app/ui", "core/api")]));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "app", target: "core", label: "2 build links", data: { revision: "captured-only" } });
    expect(edges[0]!.data!.labels).toEqual(["//app/main:a → //core/io:b", "//app/ui:a → //core/api:b"]);
    expect(nodes).toEqual(before);
    expect(edges[0]!.style!.strokeDasharray).toBeTruthy();
  });
  it("does not invent sibling edges for dependencies contained within one visible directory", () => {
    expect(directoryBuildLinks([node(""), node("app"), node("core")], capture([link("app/a", "app/b")]))).toEqual([]);
  });
  it("does not match common string prefixes or create off-slice endpoints", () => {
    expect(directoryBuildLinks([node("core"), node("core/io")], capture([link("core/io", "core-other")]))).toEqual([]);
  });
  it("uses the most specific observed node and retains a real reverse dependency separately", () => {
    const nodes = [node(""), node("app"), node("core"), node("core/files.ts", "file")];
    const edges = directoryBuildLinks(nodes, capture([link("app", "core/files.ts"), link("core/files.ts", "app")]));
    expect(edges.map(({ source, target }) => [source, target])).toEqual([["app", "core/files.ts"], ["core/files.ts", "app"]]);
  });
  it("adds bounded deterministic mock sprites only to available directory nodes without changing their positions", () => {
    const nodes = [node(""), node("app"), node("file.ts", "file"), { ...node("blocked"), data: { ...node("blocked").data, unavailable: true } }];
    const decorated = withMockDirectoryAgents(nodes);
    expect(decorated).toEqual(withMockDirectoryAgents(nodes));
    expect(decorated.slice(0, 2).every((item) => item.data.mockAgents! >= 1 && item.data.mockAgents! <= 3)).toBe(true);
    expect(decorated.slice(2).every((item) => item.data.mockAgents === undefined)).toBe(true);
    expect(decorated.map((item) => item.position)).toEqual(nodes.map((item) => item.position));
    expect(nodes.every((item) => item.data.mockAgents === undefined)).toBe(true);
  });
  it("labels every sprite cluster as mock and removes all animated elements when the layer is off", () => {
    const view = render(<AgentSprites count={3} />);
    expect(screen.getByRole("img", { name: "3 mock agents · visual preview only" })).toBeTruthy();
    expect(document.querySelectorAll("svg")).toHaveLength(3);
    view.rerender(<></>);
    expect(document.querySelectorAll("svg")).toHaveLength(0);
  });
});
