// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveRunRail } from "../app/renderer/agents/LiveRunRail";
import { AgentDock } from "../app/renderer/agents/AgentDock";
import { AgentBridgeClient } from "../app/renderer/agents/bridge-client";
import { emptyLiveAgentState } from "../app/renderer/agents/live-state";
import { emptyAgentWorkbench } from "../app/renderer/agents/state";

afterEach(cleanup);
it("hides only the exact isolated capability notice with trusted controls and retains errors and draft gestures", () => {
  const snapshot = emptyAgentWorkbench().snapshot;
  snapshot.capabilities.reason = { code: "ADAPTER_POLICY_UNAVAILABLE", message: "Legacy isolated policy cannot be attested." };
  const policy = "ADAPTER_POLICY_UNAVAILABLE: Legacy isolated policy cannot be attested.";
  const state = { ...emptyLiveAgentState(), snapshot, connected: true, notice: policy };
  const client = new AgentBridgeClient(), onDraft = vi.fn();
  const surface = (trusted: boolean, notice = policy, connected = true) => <>
    <LiveRunRail state={{ ...state, notice, connected }} client={client} onDraft={onDraft} trustedLocal={trusted} />
    <AgentDock state={{ ...state, notice, connected }} client={client} onDraft={onDraft} runContent={<p>Retained run history</p>}
      draftContent={<textarea aria-label="Retained draft" defaultValue="Keep this task" />} jobsContent={null} activityContent={null}
      trustedContent={trusted ? <button>Normal Codex controls</button> : undefined} />
  </>;
  const view = render(surface(false));
  expect(screen.getAllByText(policy)).toHaveLength(2);
  const draft = screen.getByLabelText("Retained draft");
  fireEvent.change(draft, { target: { value: "Unsent task attachment" } });
  view.rerender(surface(true));
  expect(screen.queryByText(policy)).toBeNull();
  expect(screen.queryByText(/One active run/)).toBeNull();
  expect(screen.getByRole("button", { name: "Normal Codex controls" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ask an agent about this focus" }));
  fireEvent.click(screen.getByRole("button", { name: "Prepare an agent draft" }));
  expect(onDraft).toHaveBeenCalledTimes(2);
  for (const notice of ["CORE_DISCONNECTED: Reconnect the local core", "AGENT_DELIVERY_UNKNOWN: Send was not confirmed", `${policy} Run failed.`]) {
    view.rerender(surface(true, notice));
    expect(screen.getAllByText(notice)).toHaveLength(2);
  }
  view.rerender(surface(true, policy, false));
  expect(screen.getAllByText(policy)).toHaveLength(2);
  expect(screen.getByLabelText("Retained draft")).toBe(draft);
  expect((draft as HTMLTextAreaElement).value).toBe("Unsent task attachment");
  expect(snapshot.capabilities.controls.launch).toBe(false);
  expect(document.body.textContent).toContain("Retained run history");
});
