// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JournalPanel } from "../app/renderer/changelog/JournalPanel";
import { FleetActivityView } from "../app/renderer/FleetActivityView";
import type { ExternalDetail } from "../protocol/external-agents";
import { syntheticJournal } from "./journal-fixture";

afterEach(cleanup);
const session: ExternalDetail["session"] = { id: "00000000-0000-4000-8000-000000000007", label: "Worker", worktree: "/repos/worker",
  status: "observed", evidence: "local", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T12:00:00Z", message: "", contextPaths: [] };
const entry: ExternalDetail["entries"][number] = { id: "edit", text: "Edited file.ts", path: "/repos/worker/file.ts", patch: "+exact patch",
  kind: "tool-call", attribution: "recorded-tool-event", at: "2026-09-08T12:00:00Z" };
const detail: ExternalDetail = { session, entries: [entry], handoff: "unavailable", coverage: { tailBytes: 20, partial: false, omittedRecords: 0, message: "" } };
const journalState = () => ({ observation: syntheticJournal().result, notice: "", busy: false, refresh: vi.fn() });
const liveState = () => ({ notice: "", busy: false, observing: true, refresh: vi.fn() });

it("refreshes only the selected reader, using that reader's busy state and notices", () => {
  const state = journalState(), live = liveState();
  const prs = { observation: null, notice: "", busy: false, stale: false, refresh: vi.fn() };
  const props = { open: true, selectedEntry: null, onClose: vi.fn(), onOpenSource: vi.fn(), liveContent: <p>Raw operations</p> };
  const view = render(<JournalPanel {...props} state={state} liveState={live} pullRequests={prs} />);
  const header = () => within(document.querySelector(".journal-header")! as HTMLElement);
  fireEvent.click(header().getByRole("button", { name: "Refresh activity" }));
  expect(live.refresh).toHaveBeenCalledTimes(1); expect(state.refresh).not.toHaveBeenCalled(); expect(prs.refresh).not.toHaveBeenCalled();
  view.rerender(<JournalPanel {...props} state={{ ...state, busy: true, notice: "Saved summary failure" }} liveState={{ ...live, notice: "Registry read failed" }} pullRequests={prs} />);
  expect((header().getByRole("button", { name: "Refresh activity" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("status").textContent).toContain("Registry read failed");
  view.rerender(<JournalPanel {...props} state={state} liveState={{ ...live, busy: true }} pullRequests={prs} />);
  expect((header().getByRole("button", { name: "Refresh activity" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Saved summaries" }));
  fireEvent.click(header().getByRole("button", { name: "Refresh logical changes" }));
  expect(state.refresh).toHaveBeenCalledTimes(1); expect(live.refresh).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Pull requests" }));
  fireEvent.click(header().getByRole("button", { name: "Refresh selected pull requests" }));
  expect(prs.refresh).toHaveBeenCalledTimes(1); expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Registry read failed")).toBeNull();
});

it("background saved-summary changes do not switch the chosen view or steal composer focus", () => {
  const state = journalState(), live = liveState();
  const props = { open: true, selectedEntry: null, onClose: vi.fn(), onOpenSource: vi.fn(), liveContent: <p>Raw operations</p>, liveState: live };
  const panel = (value: typeof state) => <><textarea aria-label="Unsent message" defaultValue="keep this draft" /><JournalPanel {...props} state={value} /></>;
  const view = render(panel(state));
  fireEvent.click(screen.getByRole("button", { name: "Saved summaries" }));
  const composer = screen.getByRole("textbox", { name: "Unsent message" }); composer.focus();
  const next = journalState(); next.observation.document.inputDigest = "b".repeat(64);
  view.rerender(panel(next));
  expect(screen.getByRole("button", { name: "Saved summaries" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(composer); expect((composer as HTMLTextAreaElement).value).toBe("keep this draft");
});

it("renders new fleet props without clicks, retaining list DOM, scroll and focus", () => {
  const props = { selected: null, onSelect: vi.fn(), onAgent: vi.fn(), onInspect: vi.fn() };
  const panel = (fleet: ExternalDetail[]) => <><textarea aria-label="Source" defaultValue="dirty source" /><FleetActivityView {...props} fleet={fleet} /></>;
  const view = render(panel([detail]));
  const list = screen.getByRole("list"), source = screen.getByRole("textbox"); list.scrollTop = 27; source.focus();
  const newer = { ...entry, id: "build", text: "Ran bazel build", at: "2026-09-08T12:01:00Z", path: undefined, patch: undefined };
  view.rerender(panel([{ ...detail, entries: [entry, newer] }]));
  expect(screen.getByRole("button", { name: "Worker: Ran bazel build" })).toBeTruthy();
  expect(screen.getByRole("list")).toBe(list); expect(list.scrollTop).toBe(27); expect(document.activeElement).toBe(source);
});

it("keeps deliberate event inspection stable while newer events arrive and uses the exact origin", () => {
  const onInspect = vi.fn(), onSelect = vi.fn(), props = { selected: { session, entry }, onSelect, onAgent: vi.fn(), onInspect };
  const view = render(<FleetActivityView {...props} fleet={[detail]} />);
  const article = document.querySelector("article");
  view.rerender(<FleetActivityView {...props} fleet={[{ ...detail, entries: [{ ...entry, id: "new", text: "Newer operation" }] }]} />);
  expect(document.querySelector("article")).toBe(article); expect(screen.queryByText("Newer operation")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Inspect /repos/worker/file.ts" }));
  expect(onInspect).toHaveBeenCalledExactlyOnceWith(session.id, "file.ts", "+exact patch");
  fireEvent.click(screen.getByRole("button", { name: "All activity" })); expect(onSelect).toHaveBeenCalledWith(null);
});

it.each(["removed", "changed root", "unavailable"])("revokes selected event actions when the current registration is %s", (change) => {
  const onInspect = vi.fn(), onAgent = vi.fn(), props = { selected: { session, entry }, onSelect: vi.fn(), onAgent, onInspect };
  const view = render(<FleetActivityView {...props} fleet={[detail]} />);
  const fleet: ExternalDetail[] = change === "removed" ? [] : [{ ...detail, session: change === "changed root" ? { ...session, worktree: "/repos/reassigned" } : { ...session, status: "unavailable" } }];
  view.rerender(<FleetActivityView {...props} fleet={fleet} />);
  expect(screen.getByRole("status").textContent).toContain("no longer available");
  fireEvent.click(screen.getByRole("button", { name: "Inspect /repos/worker/file.ts" }));
  fireEvent.click(screen.getByRole("button", { name: "Open agent" }));
  expect(onInspect).not.toHaveBeenCalled(); expect(onAgent).not.toHaveBeenCalled();
});
