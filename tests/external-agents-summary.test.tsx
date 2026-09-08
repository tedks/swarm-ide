// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExternalAgentRail } from "../app/renderer/external-agents/ExternalAgents";
import type { ExternalClient } from "../app/renderer/external-agents/client";
import type { ExternalAgentSummary } from "../protocol/external-agents";
import type { WorkLogEntry } from "../protocol/work-log";
import { useWorkLog, WorkLogPanel, WorkLogEntryDetail } from "../app/renderer/work-log/WorkLogPanel";
import { useState } from "react";
import { WorkLogSettingsSchema } from "../protocol/work-log";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const id = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const session = (sessionId = id): ExternalAgentSummary => ({ id: sessionId, label: "Same label", evidence: "local", status: "observed", parentId: null,
  ancestry: "root", observationId: "observed", observedAt: "2026-09-08T12:00:00Z", message: "", contextPaths: [], lifecycle: { state: "working" } });
const entry = (entryId: string, at: string, sessionId = id): WorkLogEntry => ({ id: entryId, at, sessionId, agent: "Same label", taskId: null,
  state: "completed", outcome: `Outcome ${entryId}`, recorded: false, areas: [], checks: [], followUps: [] });
const client = (): ExternalClient => ({ snapshot: { status: "observed", message: "", observedAt: "2026-09-08T12:00:00Z", sessions: [session(), session(other)] },
  detail: null, selected: null, busy: false, notice: "", read: vi.fn(async () => {}), refresh: vi.fn(async () => {}), handoff: vi.fn(async () => {}) });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("shows the latest outcome by exact session ID, expanding it on selection without replacing current status", () => {
  const current = client(), select = vi.fn();
  const latest = entry("latest", "2026-09-08T12:01:00Z"), older = entry("older", "2026-09-08T12:00:00Z"), unrelated = entry("unrelated", "2026-09-08T12:02:00Z", other);
  const view = render(<ExternalAgentRail client={current} workLogEntries={[latest, unrelated, older]} onSelect={select} />);
  const row = document.querySelector(`[data-session='${id}']`)!;
  expect(within(row as HTMLElement).getByText("Outcome latest")).toBeTruthy();
  expect(within(row as HTMLElement).queryByText("Outcome unrelated")).toBeNull();
  expect(within(row as HTMLElement).getByText("In progress")).toBeTruthy();
  const button = within(row as HTMLElement).getByRole("button", { name: "Inspect external agent Same label" });
  button.focus(); fireEvent.click(button);
  expect(select).toHaveBeenCalledTimes(1); expect(current.read).toHaveBeenCalledWith(id);
  view.rerender(<ExternalAgentRail client={{ ...current, selected: id }} workLogEntries={[older, unrelated, latest]} onSelect={select} />);
  expect(row.querySelector(".external-agent-outcome")?.classList.contains("is-expanded")).toBe(true);
  expect(document.activeElement).toBe(button);
  expect(select).toHaveBeenCalledTimes(1); expect(current.read).toHaveBeenCalledTimes(1);
  expect(row.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-08T12:01:00.000Z");
});

it("renders all published current states and a resumed turn without consulting old summaries", () => {
  const current = client(); const outcome = entry("past", "2026-09-08T12:00:00Z");
  const view = render(<ExternalAgentRail client={current} workLogEntries={[outcome]} onSelect={() => {}} />);
  for (const [state, text] of [["completed", "Complete"], ["failed", "Failed"], ["waiting", "Waiting on you"], ["unknown", "Status unavailable"], ["working", "In progress"]] as const) {
    view.rerender(<ExternalAgentRail client={{ ...current, snapshot: { ...current.snapshot!, sessions: [{ ...session(), lifecycle: { state } }] } }} workLogEntries={[outcome]} onSelect={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy(); expect(screen.getByText("Outcome past")).toBeTruthy();
  }
});

it("shares one Work Log lane across rail, panel and selected outcome and refreshes the selected ID", async () => {
  vi.useFakeTimers(); let saved = entry("selected", "2026-09-08T12:00:00Z"); saved.state = "working";
  const request = vi.fn(async (input: CoreRequest) => ({ protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true, sequence: 0,
    snapshot: initialSnapshot(), workLog: { running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), entries: [saved], notice: "" } }));
  vi.stubGlobal("swarm", { request, onEvent: () => () => {} });
  const current = client();
  function Shared() {
    const controller = useWorkLog(0), [selected, select] = useState<string | null>(null);
    const opened = controller.snapshot?.entries.find((item) => item.id === selected);
    return <><ExternalAgentRail client={current} workLogEntries={controller.snapshot?.entries} onSelect={() => {}} />
      <WorkLogPanel controller={controller} onOpen={(item) => select(item.id)} />
      {opened ? <WorkLogEntryDetail entry={opened} /> : null}</>;
  }
  render(<Shared />); await act(async () => {});
  expect(request.mock.calls.map(([input]) => input.type)).toEqual(["workLog.read"]);
  fireEvent.click(screen.getByRole("button", { name: "Outcome selected" }));
  expect(within(screen.getByRole("region", { name: "Work Log outcome" })).getByText("Saved update")).toBeTruthy();
  const gear = screen.getByRole("button", { name: "Summary settings" }); gear.focus();
  saved = { ...saved, state: "completed", recorded: true, outcome: "The same outcome, updated" };
  await act(async () => vi.advanceTimersByTime(3000));
  const detail = screen.getByRole("region", { name: "Work Log outcome" });
  expect(within(detail).getByText("The same outcome, updated")).toBeTruthy();
  expect(within(detail).getByText("Completed turn")).toBeTruthy();
  expect(within(detail).getByText("Recorded in Ditz")).toBeTruthy();
  expect(document.activeElement).toBe(gear);
  expect(request.mock.calls.map(([input]) => input.type)).toEqual(["workLog.read", "workLog.read"]);
  expect(current.read).not.toHaveBeenCalled();
});
