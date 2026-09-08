// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservedActivity } from "../app/renderer/external-agents/ObservedActivity";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalDetail, ExternalEntry } from "../protocol/external-agents";

afterEach(cleanup);
const id = "00000000-0000-4000-8000-000000000001", at = "2026-09-07T20:00:00.000Z";
function entry(n: number): ExternalEntry {
  return { id: `0:${n}`, at, kind: "assistant", text: `Reported change ${n}`, attribution: "assistant-reported" };
}
function detail(): ExternalDetail {
  return { session: { id, label: "Implementation agent", evidence: "local", status: "observed", parentId: null, ancestry: "root", observationId: "a".repeat(64), observedAt: at, message: "Registered local session", contextPaths: [] },
    entries: [entry(1)], handoff: "available", coverage: { tailBytes: 800, partial: false, omittedRecords: 0, message: "Bounded observation" } };
}
function client(overrides: Partial<ExternalClient> = {}): ExternalClient {
  return { detail: detail(), selected: id, snapshot: null, busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}), ...overrides };
}

describe("compact observed activity", () => {
  it("labels local transcript observation separately from generated summaries and opens only deliberately", () => {
    const state = client(), onOpen = vi.fn();
    const view = render(<ObservedActivity client={{ ...state, observing: true }} onOpen={onOpen} />);
    expect(screen.getByText("Local JSONL observation · not a generated summary")).toBeTruthy();
    expect(screen.getByText("Auto-refresh on")).toBeTruthy();
    expect(screen.getByText("Assistant-reported · not verified")).toBeTruthy();
    expect(view.container.querySelector("time")?.getAttribute("datetime")).toBe(at);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open observed activity for Implementation agent" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(state.read).not.toHaveBeenCalled(); expect(state.handoff).not.toHaveBeenCalled();
  });

  it("replaces bounded tails despite changed offset IDs, retaining focus and never announcing every refresh", () => {
    const before = detail(); before.entries = Array.from({ length: 8 }, (_, i) => entry(i)); before.coverage.partial = true;
    const state = client({ detail: before });
    const view = render(<ObservedActivity client={{ ...state, observing: true }} onOpen={() => {}} />);
    const button = screen.getByRole("button"); button.focus();
    const list = screen.getByRole("list", { name: "Latest observed transcript entries" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText("Reported change 0")).toBeNull();
    const next = { ...before, entries: [4, 5, 6, 7].map((n) => ({ ...entry(n), id: `1024:${n}` })) };
    view.rerender(<ObservedActivity client={{ ...state, detail: next, observing: true, refreshing: true }} onOpen={() => {}} />);
    expect(screen.getAllByText("Reported change 7")).toHaveLength(1);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(document.activeElement).toBe(button);
    expect(view.container.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(screen.getByText("Refreshing observation")).toBeTruthy();
    expect(screen.getByText(/Showing 4 latest entries/)).toBeTruthy();
  });

  it("renders only bounded plain text and never interprets transcript links, HTML or completion as verified work", () => {
    const observed = detail();
    observed.entries = [{ ...entry(1), text: '<button>Run me</button> https://example.com/private [link](file:///private)' },
      { ...entry(2), text: "x".repeat(1000), kind: "tool-call", attribution: "recorded-tool-event" },
      { ...entry(3), text: "Turn completed", kind: "turn-complete", attribution: "harness-event", at: "" }];
    render(<ObservedActivity client={client({ detail: observed })} onOpen={() => {}} />);
    const log = screen.getByRole("list");
    expect(within(log).queryByRole("button")).toBeNull(); expect(within(log).queryByRole("link")).toBeNull();
    expect(within(log).getByText("x".repeat(240) + "…")).toBeTruthy();
    expect(within(log).getByText("Time not recorded")).toBeTruthy();
    expect(within(log).getByText("Recorded tool event")).toBeTruthy();
    expect(within(log).getByText("Recorded harness event")).toBeTruthy();
  });

  it("labels synthetic records and leaves paused retained observations visible", () => {
    const observed = detail(); observed.session.evidence = "synthetic";
    render(<ObservedActivity client={{ ...client({ detail: observed }), observing: false }} onOpen={() => {}} />);
    expect(screen.getByText("Synthetic transcript · not a real agent run")).toBeTruthy();
    expect(screen.getByText("Auto-refresh paused")).toBeTruthy();
    expect(screen.getByText("Reported change 1")).toBeTruthy();
  });

  it("marks retained unavailable observations stale without rewriting their last-observed time", () => {
    const state = client({ observing: true, stale: true });
    const view = render(<ObservedActivity client={state} onOpen={() => {}} />);
    expect(screen.getByText("Retained observation · refresh unavailable")).toBeTruthy();
    expect(screen.queryByText("Auto-refresh on")).toBeNull();
    expect(screen.getByText("Reported change 1")).toBeTruthy();
    expect(view.container.querySelector("time")?.getAttribute("datetime")).toBe(at);
  });

  it("withholds a stale selected tail and distinguishes no selection from an empty eligible tail", () => {
    const state = client(); const view = render(<ObservedActivity client={{ ...state, selected: "another-agent" }} onOpen={() => {}} />);
    expect(screen.queryByText("Reported change 1")).toBeNull();
    expect(screen.getByText("Waiting for this agent’s observation.")).toBeTruthy();
    view.rerender(<ObservedActivity client={{ ...state, selected: null }} onOpen={() => {}} />);
    expect(screen.getByText("Select an external agent to follow its observed activity.")).toBeTruthy();
    view.rerender(<ObservedActivity client={{ ...state, detail: { ...detail(), entries: [] } }} onOpen={() => {}} />);
    expect(screen.getByText("No eligible entries in the observed tail; this does not mean the agent is idle.")).toBeTruthy();
  });
});
