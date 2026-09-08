// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GithubPullRequests, useGithubPullRequests } from "../app/renderer/changelog/GithubPullRequests";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { JournalActivity, JournalPanel } from "../app/renderer/changelog/JournalPanel";
import { syntheticJournal } from "./journal-fixture";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const snapshot = initialSnapshot();
const reply = (request: CoreRequest, title = "Synthetic PR") => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 0, snapshot,
  githubPrs: { repositoryId: snapshot.project.id, worldId: snapshot.world.id, githubRepository: "example/project", observedAt: "2026-09-07T12:00:00Z",
    pullRequests: [{ number: 2, title, state: "OPEN", isDraft: false, author: "operator", updatedAt: "2026-09-07T11:00:00Z", url: "https://github.com/example/project/pull/2", changedFiles: 4, paths: ["src/real-path.ts"] }] } });
function Host({ repositoryId = snapshot.project.id, generation = 1, onOpen = vi.fn() }: { repositoryId?: string; generation?: number; onOpen?: (path: string) => void }) {
  return <GithubPullRequests state={useGithubPullRequests(repositoryId, snapshot.world.id, generation)} onOpenSource={onOpen} />;
}
it("fetches only explicitly, shows scope/files and does not open unsafe external content", async () => {
  const request = vi.fn(async (input: CoreRequest) => reply(input)), onOpen = vi.fn();
  vi.stubGlobal("swarm", { request }); render(<Host onOpen={onOpen} />);
  expect(request).not.toHaveBeenCalled(); fireEvent.click(screen.getByLabelText("Refresh pull requests"));
  await screen.findByText("Synthetic PR"); expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText("example/project")).toBeTruthy(); expect(screen.getByText("4 changed files · showing 1")).toBeTruthy();
  document.querySelector<HTMLDetailsElement>(".github-prs li details")!.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Open working file · src/real-path.ts" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("src/real-path.ts"); expect(document.querySelector("a")).toBeNull();
});
it("retains same-world data on failure without raw diagnostic disclosure", async () => {
  const request = vi.fn(async (input: CoreRequest) => reply(input)); vi.stubGlobal("swarm", { request }); render(<Host />);
  fireEvent.click(screen.getByLabelText("Refresh pull requests")); await screen.findByText("Synthetic PR");
  request.mockRejectedValue(new Error("credential-ish debug DO-NOT-EXPOSE")); fireEvent.click(screen.getByLabelText("Refresh pull requests"));
  await screen.findByText(/Showing previous results. GitHub unavailable/); expect(screen.getByText("Synthetic PR")).toBeTruthy();
  expect(screen.queryByText(/DO-NOT-EXPOSE/)).toBeNull();
});
it("hides foreign repositories immediately and rejects held replies across switches and core recovery", async () => {
  let release!: (value: unknown) => void, held!: CoreRequest;
  const request = vi.fn((input: CoreRequest) => { held = input; return new Promise((resolve) => { release = resolve; }); });
  vi.stubGlobal("swarm", { request }); const view = render(<Host />);
  fireEvent.click(screen.getByLabelText("Refresh pull requests")); const first = release, firstRequest = held;
  view.rerender(<Host repositoryId="other" />);
  await act(async () => first(reply(firstRequest, "Wrong repository"))); expect(screen.queryByText("Wrong repository")).toBeNull();
  view.rerender(<Host />); fireEvent.click(screen.getByLabelText("Refresh pull requests")); const second = release, secondRequest = held;
  view.rerender(<Host generation={2} />); await act(async () => second(reply(secondRequest, "Old core")));
  expect(screen.queryByText("Old core")).toBeNull(); expect(request).toHaveBeenCalledTimes(2);
});
it("rejects malformed and mismatched replies instead of displaying them", async () => {
  const request = vi.fn(async (input: CoreRequest) => ({ ...reply(input), githubPrs: { ...reply(input).githubPrs, repositoryId: "foreign" } }));
  vi.stubGlobal("swarm", { request }); render(<Host />); fireEvent.click(screen.getByLabelText("Refresh pull requests"));
  await waitFor(() => expect(screen.getByText(/GitHub unavailable/)).toBeTruthy()); expect(screen.queryByText("Synthetic PR")).toBeNull();
});
it("drops both decorative headings while retaining recorded entry activation", () => {
  const state = { observation: syntheticJournal().result, busy: false, notice: "", refresh: vi.fn() }, onOpen = vi.fn();
  render(<><JournalActivity state={state} onOpen={onOpen} /><JournalPanel open state={state} selectedEntry={null} onClose={vi.fn()} onOpenSource={vi.fn()} /></>);
  expect(screen.queryByText("Logical changes")).toBeNull(); expect(screen.queryByText(/The work, reconstructed/)).toBeNull();
  expect(screen.getByRole("heading", { name: "Activity log" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Synthetic change/ })); expect(onOpen).toHaveBeenCalledExactlyOnceWith("change-a");
});
it("the actual dock heading opens Activity without choosing or preparing a run", () => {
  const state = emptyLiveAgentState(), client = new AgentBridgeClient(state), onOpen = vi.fn(), onDraft = vi.fn();
  const select = vi.spyOn(client, "select");
  render(<AgentDock state={state} client={client} onDraft={onDraft} onOpenActivity={onOpen} runContent={null} draftContent={null} jobsContent={null} activityContent={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Recent Activity" }));
  expect(onOpen).toHaveBeenCalledTimes(1); expect(onDraft).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
});
it("keeps PRs separate from recorded changes and reveals an explicitly selected entry", async () => {
  const state = { observation: syntheticJournal().result, busy: false, notice: "", refresh: vi.fn() };
  const pullRequests = { observation: null, busy: false, notice: "", stale: false, refresh: vi.fn() };
  const props = { state, pullRequests, onClose: vi.fn(), onOpenSource: vi.fn() };
  const view = render(<JournalPanel open selectedEntry={null} {...props} />);
  expect(screen.getByText("Synthetic change")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pull requests" }));
  expect(screen.getByRole("button", { name: "Refresh pull requests" })).toBeTruthy(); expect(pullRequests.refresh).not.toHaveBeenCalled();
  view.rerender(<JournalPanel open selectedEntry="change-a" selectionVersion={1} {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Changes" }).getAttribute("aria-pressed")).toBe("true"));
  expect(document.querySelector<HTMLDetailsElement>("[data-change-id]")!.open).toBe(true);
});
