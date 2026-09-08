// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalAgentRail } from "../app/renderer/external-agents/ExternalAgents";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalAgentSummary } from "../protocol/external-agents";

afterEach(cleanup);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, parent?: number): ExternalAgentSummary => ({ id: id(n), label: `Worker ${n}`, evidence: "local", status: "observed",
  parentId: parent ? id(parent) : null, ancestry: parent ? "registered-parent" : "root", observationId: "a".repeat(64),
  observedAt: new Date().toISOString(), message: "Registered", contextPaths: [] });
const dated = (n: number, parent?: number) => ({ ...row(n, parent), createdAt: `2020-01-${String(n).padStart(2, "0")}T00:00:00Z` });
function client(sessions: ExternalAgentSummary[], selected: string | null = null): ExternalClient {
  return { snapshot: { sessions, observedAt: new Date().toISOString(), status: "observed", message: "Registered" }, selected, detail: null,
    busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) };
}
const inspect = (n: number) => screen.queryByRole("button", { name: `Inspect external agent Worker ${n}` });

describe("older fork disclosures", () => {
  it("defaults older siblings closed, keeps newest seven and retains deliberate history expansion across refresh", () => {
    const sessions = [dated(1), ...Array.from({ length: 12 }, (_, i) => dated(i + 2, 1))], state = client(sessions);
    const select = vi.fn(), view = render(<ExternalAgentRail client={state} onSelect={select} />);
    expect(inspect(1)).toBeTruthy(); expect(inspect(13)).toBeTruthy(); expect(inspect(7)).toBeTruthy(); expect(inspect(2)).toBeNull();
    const history = screen.getByRole("button", { name: "Older sessions (5)" });
    expect(history.getAttribute("aria-expanded")).toBe("false"); fireEvent.click(history);
    expect(inspect(2)).toBeTruthy();
    view.rerender(<ExternalAgentRail client={{ ...state, snapshot: { ...state.snapshot!, sessions: [...sessions].reverse() } }} onSelect={select} />);
    expect(screen.getByRole("button", { name: "Older sessions (5)" }).getAttribute("aria-expanded")).toBe("true");
    expect([...view.container.querySelectorAll("li[data-session]")].map((node) => node.getAttribute("data-session"))).toEqual([1, ...Array.from({ length: 12 }, (_, i) => 13 - i)].map(id));
    fireEvent.click(history);
    view.rerender(<ExternalAgentRail client={{ ...state, notice: "Refreshed" }} onSelect={select} />);
    expect(inspect(2)).toBeNull(); expect(select).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled(); expect(state.handoff).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toMatch(/completed|finished/i);
  });

  it("keeps recent recorded activity, undated sessions and selected ancestry out of hidden history", () => {
    const sessions = [dated(1), ...Array.from({ length: 12 }, (_, i) => dated(i + 2, 1)), row(14, 1), { ...dated(15, 3), createdAt: "2019-01-01T00:00:00Z" }];
    sessions[1] = { ...sessions[1], control: "read-only", lastActivityAt: new Date(Date.now() - 60_000).toISOString() };
    const state = client(sessions, id(15)); render(<ExternalAgentRail client={state} onSelect={() => {}} />);
    for (const n of [1, 2, 3, 14, 15]) expect(inspect(n)).toBeTruthy();
    expect(inspect(4)).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse forks of Worker 3" }).getAttribute("disabled")).toBe("");
  });

  it("retains subtree collapse across refresh, reveals selected ancestry and restores the prior choice afterward", () => {
    const sessions = [row(1), row(2, 1), row(3, 2), row(4, 1)], state = client(sessions);
    const view = render(<ExternalAgentRail client={state} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse forks of Worker 2" }));
    expect(inspect(3)).toBeNull(); expect(inspect(4)).toBeTruthy();
    view.rerender(<ExternalAgentRail client={{ ...state, snapshot: { ...state.snapshot!, sessions: sessions.map((r) => ({ ...r })) } }} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Expand forks of Worker 2" }).getAttribute("aria-expanded")).toBe("false");
    view.rerender(<ExternalAgentRail client={{ ...state, selected: id(3) }} onSelect={() => {}} />);
    expect(inspect(3)).toBeTruthy(); expect(screen.getByRole("button", { name: "Collapse forks of Worker 2" }).getAttribute("disabled")).toBe("");
    view.rerender(<ExternalAgentRail client={{ ...state, selected: id(4) }} onSelect={() => {}} />);
    expect(inspect(3)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand forks of Worker 2" }));
    expect(inspect(3)).toBeTruthy(); expect(view.container.querySelectorAll(".external-lineage-branch")).toHaveLength(3);
    expect(state.read).not.toHaveBeenCalled(); expect(state.handoff).not.toHaveBeenCalled();
  });

  it("can fold and restore an arbitrary-depth undated chain without deriving completion from availability", () => {
    const sessions = Array.from({ length: 64 }, (_, i) => ({ ...row(i + 1, i || undefined), status: "unavailable" as const }));
    render(<ExternalAgentRail client={client(sessions)} onSelect={() => {}} />);
    expect(inspect(64)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse forks of Worker 1" }));
    expect(inspect(64)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand forks of Worker 1" }));
    expect(inspect(64)).toBeTruthy(); expect(screen.queryByRole("button", { name: /Older sessions/ })).toBeNull();
  });
});
