// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";

afterEach(cleanup);
it("explicit task-linked trusted selection opens Agents once without subsequent observation stealing tabs", () => {
  const state = emptyLiveAgentState(), client = new AgentBridgeClient(state);
  const props = { state, client, onDraft: vi.fn(), runContent: null, draftContent: null,
    trustedContent: <div>Trusted fleet output</div>, jobsContent: null, activityContent: null,
    mockConversation: { tabs: [{ id: "recorded", name: "Recorded agent" }], selected: "recorded", onSelect: vi.fn(), selectionVersion: 1, content: <div>Recorded output</div> } };
  const view = render(<AgentDock {...props} />);
  const recorded = screen.getByRole("tab", { name: "Recorded agent mock" }), agents = screen.getByRole("tab", { name: "Agents" });
  expect(recorded.getAttribute("aria-selected")).toBe("true");
  const output = screen.getByText("Trusted fleet output");
  view.rerender(<AgentDock {...props} trustedSelectionVersion="open-A" />);
  expect(agents.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Trusted fleet output")).toBe(output);
  fireEvent.click(recorded);
  view.rerender(<AgentDock {...props} trustedSelectionVersion="open-A" trustedContent={<div>Fresh trusted output</div>} />);
  expect(recorded.getAttribute("aria-selected")).toBe("true");
  view.rerender(<AgentDock {...props} trustedSelectionVersion="open-A-again" />);
  expect(agents.getAttribute("aria-selected")).toBe("true");
  expect(props.onDraft).not.toHaveBeenCalled();
});
