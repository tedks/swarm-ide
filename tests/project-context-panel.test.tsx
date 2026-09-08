// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectContextPanel } from "../app/renderer/project-context/ProjectContextPanel";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { ProjectCatalogPanel } from "../app/renderer/project-context/ProjectCatalogPanel";

const snapshot = initialSnapshot();
function response(request: CoreRequest, name: string) {
  return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 1, snapshot,
    projectContext: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, observedAt: new Date().toISOString(),
      node: { status: "observed" }, docker: { status: "observed" },
      servers: [{ pid: 123, name, directory: "/project", association: "worktree", endpoints: [{ address: "0.0.0.0", port: 5173, protocol: "tcp", url: "http://framework0:5173" }] }], containers: [] } };
}
afterEach(() => { cleanup(); delete window.swarm; vi.restoreAllMocks(); });
it("shows real endpoints but hides empty container instruments without changing attention", async () => {
  const request = vi.fn(async (input: CoreRequest) => response(input, "Vite"));
  window.swarm = { request, onEvent: () => () => {} } as unknown as Window["swarm"];
  render(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready />);
  expect(await screen.findByText("Vite")).toBeTruthy();
  expect(screen.getByRole("link", { name: "http://framework0:5173" }).getAttribute("href")).toBe("http://framework0:5173");
  expect(screen.queryByRole("heading", { name: "Containers" })).toBeNull();
  expect(screen.queryByText("No containers for this worktree")).toBeNull();
  expect(request.mock.calls.map(([value]) => value.type)).toEqual(["projectContext.observe"]);
});
it("rejects a late response after project switching and clears old values immediately", async () => {
  let complete!: (value: unknown) => void;
  let oldRequest!: CoreRequest;
  window.swarm = { request: (input: CoreRequest) => { oldRequest = input; return new Promise((resolve) => { complete = resolve; }); }, onEvent: () => () => {} } as unknown as Window["swarm"];
  const view = render(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready />);
  view.rerender(<ProjectContextPanel repositoryId="other" worldId="other" generation={2} ready={false} />);
  await act(async () => { complete(response(oldRequest, "Old server")); });
  expect(screen.queryByText("Old server")).toBeNull();
  expect(screen.queryByRole("region", { name: "Project runtime" })).toBeNull();
});
it("marks retained same-world observations stale while the core is unavailable", async () => {
  window.swarm = { request: async (input: CoreRequest) => response(input, "Vite"), onEvent: () => () => {} } as unknown as Window["swarm"];
  const view = render(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready />);
  await screen.findByText("Vite");
  view.rerender(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready={false} />);
  expect(screen.getByText("Vite")).toBeTruthy();
  expect(screen.getByText(/^Last seen/)).toBeTruthy();
});
it("hides the empty panel on unavailable discovery instead of displaying scaffolding", async () => {
  window.swarm = { request: async () => { throw new Error("Disconnected"); }, onEvent: () => () => {} } as unknown as Window["swarm"];
  await act(async () => { render(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready />); });
  expect(screen.queryByRole("region", { name: "Project runtime" })).toBeNull();
});
it("shows declared components, workflow names, relationships and configured sites separately from running processes", () => {
  render(<ProjectCatalogPanel catalog={{ scan: { status: "observed" }, components: [
    { id: "frontend/package.json", name: "Web", directory: "frontend", family: "node", frameworks: ["React", "Vite"], evidence: "frontend/package.json", workflows: [{ name: "test:e2e", kind: "test" }] },
    { id: "core/package.json", name: "Core", directory: "core", family: "node", frameworks: [], evidence: "core/package.json", workflows: [] },
  ], relationships: [{ from: "frontend/package.json", to: "core/package.json", kind: "depends-on", evidence: "frontend/package.json" }],
  sites: [{ name: "Portfolio", url: "https://example.org/", evidence: "sites/com/hugo.toml" }] }} />);
  expect(screen.getByText("React")).toBeTruthy();
  expect(screen.getByText("test:e2e")).toBeTruthy();
  expect(screen.getByText("depends on")).toBeTruthy();
  expect(screen.getByText("Configured")).toBeTruthy();
  expect(screen.getByRole("link", { name: "https://example.org/" }).getAttribute("href")).toBe("https://example.org/");
  expect(screen.queryByText(/healthy|deployed|running/i)).toBeNull();
});
it("keeps only nonempty instruments and clears catalog immediately on project change", async () => {
  window.swarm = { request: async (input: CoreRequest) => ({ ...response(input, "ignored"), projectContext: {
    ...response(input, "ignored").projectContext, servers: [], catalog: { scan: { status: "observed" }, components: [], relationships: [], sites: [
      { name: "Personal site", url: "https://example.org/", evidence: "hugo.toml" },
    ] },
  } }), onEvent: () => () => {} } as unknown as Window["swarm"];
  const view = render(<ProjectContextPanel repositoryId={snapshot.project.id} worldId={snapshot.world.id} generation={1} ready />);
  await screen.findByText("Personal site");
  expect(screen.queryByText("Dev servers")).toBeNull();
  expect(screen.queryByText("Containers")).toBeNull();
  expect(screen.queryByText("Components")).toBeNull();
  view.rerender(<ProjectContextPanel repositoryId="other" worldId="other" generation={2} ready={false} />);
  expect(screen.queryByText("Personal site")).toBeNull();
});
