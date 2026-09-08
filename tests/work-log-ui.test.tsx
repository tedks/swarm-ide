// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkLogEntryDetail, WorkLogPanel } from "../app/renderer/work-log/WorkLogPanel";
import { initialSnapshot } from "../fixtures/world";
import { PROTOCOL_VERSION, type CoreRequest } from "../protocol/schema";
import { WorkLogSettingsSchema, type WorkLogSnapshot } from "../protocol/work-log";

const observation = (): WorkLogSnapshot => ({ running: false, summarizing: false, settings: WorkLogSettingsSchema.parse({}), notice: "", entries: [
  { id: "outcome-1", sessionId: "session-1", agent: "F7", taskId: "swarm-live-fleet", at: "2026-09-08T03:00:00Z", state: "working",
    outcome: "Added a live fleet feed.", areas: ["core/external-agents.ts"], checks: ["Parser checks passed"], followUps: ["Connect the cockpit"], recorded: false },
] });
const reply = (request: CoreRequest, workLog = observation()) => ({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, sequence: 0, snapshot: initialSnapshot(), workLog });
const bridge = (request = vi.fn(async (input: CoreRequest) => reply(input))) => { vi.stubGlobal("swarm", { request, onEvent: () => () => {} }); return request; };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("online Work Log panel", () => {
  it("shows unrecorded completed outcomes as Complete, with separate failed/waiting/unknown history", async () => {
    const data = observation();
    data.entries = (["completed", "failed", "waiting", "unknown"] as const).map((state) => ({ ...data.entries[0], id: state, state, recorded: false }));
    bridge(vi.fn(async (input: CoreRequest) => reply(input, data)));
    render(<WorkLogPanel />);
    await screen.findByText("Complete");
    expect(screen.queryByText("In progress")).toBeNull();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Waiting on you")).toBeTruthy();
    expect(screen.getByText("Status unavailable")).toBeTruthy();
    expect(screen.queryByText("Recorded in Ditz")).toBeNull();
  });
  it("offers a compact accessible settings gear without starting or stopping the summarizer", async () => {
    const request = bridge(); render(<WorkLogPanel />);
    await screen.findByText("Added a live fleet feed.");
    const gear = screen.getByRole("button", { name: "Summary settings" });
    expect(gear.textContent).not.toContain("Summary settings");
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(gear);
    expect(gear.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Model")).toBeTruthy();
    fireEvent.click(gear);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    expect(request.mock.calls.map(([input]) => input.type)).toEqual(["workLog.read"]);
  });
  it("opens the exact outcome and accepts the cockpit callback names without double delivery", async () => {
    const request = bridge(), onOpen = vi.fn(), onAgent = vi.fn(), onTask = vi.fn(), legacy = vi.fn();
    render(<WorkLogPanel onOpen={onOpen} onAgent={onAgent} onTask={onTask} onOpenAgent={legacy} onOpenTask={legacy} />);
    fireEvent.click(await screen.findByRole("button", { name: "Added a live fleet feed." }));
    expect(onOpen).toHaveBeenCalledWith(observation().entries[0]);
    fireEvent.click(screen.getByRole("button", { name: "F7" })); expect(onAgent).toHaveBeenCalledWith("session-1");
    fireEvent.click(screen.getByRole("button", { name: "Task · swarm-live-fleet" })); expect(onTask).toHaveBeenCalledWith("swarm-live-fleet");
    expect(legacy).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
  });
  it("renders a pure center-pane outcome with links and no bridge requests", () => {
    const request = bridge(), onAgent = vi.fn(), onTask = vi.fn(), onClose = vi.fn();
    render(<WorkLogEntryDetail entry={observation().entries[0]} onAgent={onAgent} onTask={onTask} onClose={onClose} />);
    expect(screen.getByText("Parser checks passed")).toBeTruthy(); expect(screen.getByText("Connect the cockpit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "F7" })); expect(onAgent).toHaveBeenCalledWith("session-1");
    fireEvent.click(screen.getByRole("button", { name: "Task · swarm-live-fleet" })); expect(onTask).toHaveBeenCalledWith("swarm-live-fleet");
    fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(onClose).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Record outcome" })).toBeNull();
  });
  it("reads on mount without starting a model and opens the specific session/task", async () => {
    const request = bridge(), onOpenAgent = vi.fn(), onOpenTask = vi.fn();
    render(<WorkLogPanel onOpenAgent={onOpenAgent} onOpenTask={onOpenTask} />);
    await screen.findByText("Added a live fleet feed.");
    expect(request.mock.calls.map(([input]) => input.type)).toEqual(["workLog.read"]);
    fireEvent.click(screen.getByRole("button", { name: "F7" })); expect(onOpenAgent).toHaveBeenCalledWith("session-1");
    fireEvent.click(screen.getByRole("button", { name: "Task · swarm-live-fleet" })); expect(onOpenTask).toHaveBeenCalledWith("swarm-live-fleet");
    expect(document.querySelector("time")?.dateTime).toBe("2026-09-08T03:00:00.000Z");
  });

  it("starts explicitly with edited settings, locks running settings, and stops explicitly", async () => {
    const request = bridge(vi.fn(async (input: CoreRequest) => reply(input, { ...observation(), running: input.type === "workLog.start" })));
    render(<WorkLogPanel />); await screen.findByText("Added a live fleet feed.");
    fireEvent.click(screen.getByRole("button", { name: "Summary settings" }));
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-5.6-luna" } });
    fireEvent.change(screen.getByLabelText("Batch delay (seconds)"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Stop" });
    expect(request.mock.calls[1][0]).toMatchObject({ type: "workLog.start", settings: { harness: "codex", model: "gpt-5.6-luna", debounceSeconds: 45 } });
    expect((screen.getByLabelText("Model") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByRole("button", { name: "Start" });
    expect(request.mock.calls[2][0].type).toBe("workLog.stop");
  });

  it("records only the chosen entry and explicit completed task, without changing the task focus", async () => {
    const request = bridge(), onOpenTask = vi.fn(); render(<WorkLogPanel onOpenTask={onOpenTask} />);
    await screen.findByText("Added a live fleet feed.");
    (document.querySelector(".work-log-details") as HTMLDetailsElement).open = true;
    fireEvent.change(screen.getByLabelText("Completed Ditz issue"), { target: { value: "done-issue" } });
    fireEvent.click(screen.getByRole("button", { name: "Record outcome" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0]).toMatchObject({ type: "workLog.record", entryId: "outcome-1", taskId: "done-issue" });
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("keeps one request lane and queues one explicit mutation behind a held read", async () => {
    vi.useFakeTimers(); let release!: (value: ReturnType<typeof reply>) => void; let held!: CoreRequest;
    const request = bridge(vi.fn(async (input: CoreRequest) => reply(input)));
    render(<WorkLogPanel />); await act(async () => {});
    request.mockImplementationOnce((input) => { held = input; return new Promise((resolve) => { release = resolve; }); });
    await act(async () => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await act(async () => vi.advanceTimersByTime(9000));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => release(reply(held)));
    expect(request.mock.calls.map(([input]) => input.type)).toEqual(["workLog.read", "workLog.read", "workLog.start"]);
  });

  it("drops obsolete replies and queued mutations across core replacement", async () => {
    vi.useFakeTimers(); let release!: (value: ReturnType<typeof reply>) => void; let held!: CoreRequest;
    const request = bridge(); const view = render(<WorkLogPanel coreGeneration={1} />); await act(async () => {});
    request.mockImplementationOnce((input) => { held = input; return new Promise((resolve) => { release = resolve; }); });
    await act(async () => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    view.rerender(<WorkLogPanel coreGeneration={2} />); await act(async () => {});
    const stale = observation(); stale.entries[0].outcome = "Old core result";
    await act(async () => release(reply(held, stale)));
    expect(screen.queryByText("Old core result")).toBeNull();
    expect(request.mock.calls.some(([input]) => input.type === "workLog.start")).toBe(false);
    view.unmount(); const count = request.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(9000)); expect(request).toHaveBeenCalledTimes(count);
  });

  it("retains outcomes on a failed mutation and never retries the mutation", async () => {
    vi.useFakeTimers(); const request = bridge(); render(<WorkLogPanel />); await act(async () => {});
    request.mockRejectedValueOnce(new Error("Summary start could not be confirmed"));
    fireEvent.click(screen.getByRole("button", { name: "Start" })); await act(async () => {});
    expect(screen.getByText("Summary start could not be confirmed")).toBeTruthy();
    expect(screen.getByText("Added a live fleet feed.")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(request.mock.calls.filter(([input]) => input.type === "workLog.start")).toHaveLength(1);
  });

  it("keeps completed outcomes, renders summaries as text, and rejects invalid settings locally", async () => {
    const data = observation();
    data.entries.unshift({ ...data.entries[0], id: "outcome-2", state: "completed", agent: "K7", recorded: true,
      outcome: "<img src=x onerror=alert(1)>", at: "2026-09-08T04:00:00Z" });
    const request = bridge(vi.fn(async (input: CoreRequest) => reply(input, data)));
    render(<WorkLogPanel />); await screen.findByText("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
    expect([...document.querySelectorAll("[data-work-log-entry]")].map((entry) => entry.getAttribute("data-work-log-entry")))
      .toEqual(["outcome-1", "outcome-2"]);
    expect(screen.getByText("Recorded in Ditz")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Summary settings" }));
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "bad model --exec" } });
    expect((screen.getByRole("button", { name: "Start" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(request).toHaveBeenCalledTimes(1);
  });
});
