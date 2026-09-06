// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDock, type AgentDockProps } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState, type LiveAgentState } from "../app/renderer/agents/live-state";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";
import { paymentsFileFocus } from "../fixtures/world";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
function state(withRuns = false): LiveAgentState {
  const snapshot = emptyAgentWorkbench().snapshot;
  snapshot.capabilities.reason = { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Policy has not been verified." };
  if (withRuns) snapshot.runs = [firstId, secondId].map((runId, index) => ({ runId, state: "completed", taskLabel: `Run ${index + 1}`,
    focusLabel: "core/files.ts", createdAt: "2026-09-06T20:00:00.000Z", updatedAt: "2026-09-06T20:01:00.000Z", endedAt: "2026-09-06T20:01:00.000Z" }));
  return { ...emptyLiveAgentState(), connected: true, snapshot, notice: "ADAPTER_POLICY_UNAVAILABLE: Policy has not been verified." };
}
function props(current = state()): AgentDockProps {
  return { state: current, client: new AgentBridgeClient(current), onDraft: vi.fn(), runContent: <div>Retained run output</div>,
    draftContent: null, jobsContent: <div>Build job evidence</div> };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("agent-first bottom dock", () => {
  it("starts on Agents with honest unavailable evidence, not fabricated runs", () => {
    const input = props(); render(<AgentDock {...input} />);
    expect(screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Execution is unavailable/)).toBeTruthy();
    expect(screen.getByText(/ADAPTER_POLICY_UNAVAILABLE/)).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Prepare an agent draft" }));
    expect(input.onDraft).toHaveBeenCalledOnce();
  });

  it("selects real run tabs through the existing client and follows sidebar selection", () => {
    const initial = state(true), input = props(initial), select = vi.spyOn(input.client, "select");
    const view = render(<AgentDock {...input} />);
    fireEvent.click(screen.getByRole("tab", { name: "Run 1 completed" }));
    expect(select).toHaveBeenCalledExactlyOnceWith(firstId);
    view.rerender(<AgentDock {...input} state={{ ...initial, selectedRunId: firstId, paneOpen: true }} />);
    expect(screen.getByRole("tab", { name: "Run 1 completed" }).getAttribute("aria-selected")).toBe("true");
    view.rerender(<AgentDock {...input} state={{ ...initial, selectedRunId: secondId, paneOpen: true }} />);
    expect(screen.getByRole("tab", { name: "Run 2 completed" }).getAttribute("aria-selected")).toBe("true");
    expect(select).toHaveBeenCalledOnce();
  });

  it("keeps Jobs selected through background updates without closing the run or remounting its contents", () => {
    const initial = { ...state(true), selectedRunId: firstId, paneOpen: true }, input = props(initial);
    const close = vi.spyOn(input.client, "closePane");
    const view = render(<AgentDock {...input} />);
    const output = screen.getByText("Retained run output");
    fireEvent.click(screen.getByRole("tab", { name: "Jobs & activity" }));
    view.rerender(<AgentDock {...input} state={{ ...initial, notice: "New background observation", reading: true }} />);
    expect(screen.getByRole("tab", { name: "Jobs & activity" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Retained run output")).toBe(output);
    expect(output.closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("reactivates the same sidebar run on an explicit selection version, without a replay", () => {
    const initial = { ...state(true), selectedRunId: firstId, paneOpen: true }, input = props(initial);
    const select = vi.spyOn(input.client, "select");
    const view = render(<AgentDock {...input} selectionVersion={0} />);
    fireEvent.click(screen.getByRole("tab", { name: "Jobs & activity" }));
    view.rerender(<AgentDock {...input} selectionVersion={1} />);
    expect(screen.getByRole("tab", { name: "Run 1 completed" }).getAttribute("aria-selected")).toBe("true");
    expect(select).not.toHaveBeenCalled();
  });

  it("retains the exact draft textarea and local text when switching to Jobs and back", () => {
    const initial = state(), input = props(initial);
    const draft = { focus: paymentsFileFocus, task: "Private task", model: "", prepared: null, confirmed: false, preparing: false };
    const view = render(<AgentDock {...input} />);
    fireEvent.click(screen.getByRole("tab", { name: "Jobs & activity" }));
    view.rerender(<AgentDock {...input} state={{ ...initial, draft }} draftContent={<textarea aria-label="Protected draft" defaultValue="Private task" />} />);
    expect(screen.getByRole("tab", { name: "Agents · draft" }).getAttribute("aria-selected")).toBe("true");
    const textarea = screen.getByRole("textbox", { name: "Protected draft" }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Exact unsent text" } });
    fireEvent.click(screen.getByRole("tab", { name: "Jobs & activity" }));
    expect(textarea.closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Agents · draft" }));
    expect(screen.getByRole("textbox", { name: "Protected draft" })).toBe(textarea);
    expect(textarea.value).toBe("Exact unsent text");
  });

  it("moves tab focus with arrows without selecting or reading another run", () => {
    const input = props(state(true)), select = vi.spyOn(input.client, "select");
    render(<AgentDock {...input} />);
    const agents = screen.getByRole("tab", { name: "Agents" });
    agents.focus(); fireEvent.keyDown(agents, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Run 1 completed" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Jobs & activity" }));
    expect(agents.getAttribute("aria-selected")).toBe("true");
    expect(select).not.toHaveBeenCalled();
  });

  it("keeps an unconfirmed admission inspectable before it appears in the run list", () => {
    const initial = { ...state(), selectedRunId: firstId, paneOpen: true };
    const input = props(initial), select = vi.spyOn(input.client, "select");
    const view = render(<AgentDock {...input} />);
    expect(screen.getByRole("tab", { name: "Unconfirmed run unknown" }).getAttribute("aria-selected")).toBe("true");
    const output = screen.getByText("Retained run output");
    expect(output.closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(false);
    view.rerender(<AgentDock {...input} state={{ ...state(true), selectedRunId: firstId, paneOpen: true }} />);
    expect(screen.getByRole("tab", { name: "Run 1 completed" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Retained run output")).toBe(output);
    expect(select).not.toHaveBeenCalled();
  });

  it("keeps optional fixture output explicitly separate from real run tabs", () => {
    const input = props();
    const view = render(<AgentDock {...input} fixtureContent={<div>Deterministic preview</div>} />);
    const fixture = screen.getByRole("tab", { name: "Fixture · no model turn" });
    expect(fixture.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Jobs & activity" }));
    view.rerender(<AgentDock {...input} fixtureContent={<div>Updated deterministic preview</div>} />);
    expect(fixture.getAttribute("aria-selected")).toBe("false");
    view.rerender(<AgentDock {...input} fixtureSelectionVersion={1} fixtureContent={<div>Updated deterministic preview</div>} />);
    expect(fixture.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Fixture preview · not a live agent or model turn")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});
