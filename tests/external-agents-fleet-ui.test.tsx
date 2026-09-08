// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ObservedActivity } from "../app/renderer/external-agents/ObservedActivity";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalDetail } from "../protocol/external-agents";

afterEach(cleanup);
const fleet: ExternalDetail[] = [1, 2].map((n) => ({
  session: { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, label: `Worker ${n}`, evidence: "local", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: "2026-09-08T03:00:00Z", message: "", contextPaths: [], worktree: `/worktree-${n}` },
  entries: [{ id: `event-${n}`, kind: "tool-call", at: `2026-09-08T03:00:0${n}Z`, text: `Edited source-${n}.ts`, path: `source-${n}.ts`, attribution: "recorded-tool-event" }],
  handoff: "unavailable", coverage: { tailBytes: 100, partial: false, omittedRecords: 0, message: "" },
}));
const client = (): ExternalClient => ({ fleet, snapshot: null, detail: null, selected: null, busy: false, observing: true, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) });

it("shows two agents without selection and activates an event with exact worktree identity", () => {
  const state = client(), onOpen = vi.fn(), onEntry = vi.fn();
  render(<ObservedActivity client={state} onOpen={onOpen} onEntry={onEntry} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("Worker 2");
  fireEvent.click(screen.getByRole("button", { name: "Edited source-2.ts" }));
  expect(onEntry).toHaveBeenCalledExactlyOnceWith(fleet[1]!.session, fleet[1]!.entries[0]);
  expect(state.read).not.toHaveBeenCalled(); expect(state.handoff).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Worker 1" }));
  expect(state.read).toHaveBeenCalledExactlyOnceWith(fleet[0]!.session.id);
  expect(onOpen).toHaveBeenCalledOnce();
});

it("preserves focused event DOM across routine refresh and marks retained fleet disconnected", () => {
  const state = client(), view = render(<ObservedActivity client={state} onOpen={() => {}} />);
  const button = screen.getByRole("button", { name: "Edited source-1.ts" }); button.focus();
  view.rerender(<ObservedActivity client={{ ...state, refreshing: true, stale: true, fleet: fleet.map((d) => ({ ...d })) }} onOpen={() => {}} />);
  expect(document.activeElement).toBe(button);
  expect(screen.getByText("Reconnecting…")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(view.container.querySelector("[role=status],[aria-live]")).toBeNull();
});
