import { describe, expect, it } from "vitest";
import { acknowledgeFleetComposer, editFleetComposer, emptyFleet, observeFleet, resetFleetAuthority, selectFleetRun, type FleetSnapshot } from "../app/renderer/agents/fleet-state";

const snapshot = (runToken: string, output = ""): FleetSnapshot => ({ instanceId: "core", profile: "trusted-local", workspace: "/repo",
  preparation: null, runToken, status: "running", threadId: runToken, turnId: "turn", output, message: "", approvals: [] });
describe("fleet presentation authority", () => {
  it("late A observation never selects A over B or rolls back the newer catalog", () => {
    let state = selectFleetRun(emptyFleet(), "B");
    state = observeFleet(state, snapshot("B", "new B"), 12);
    state = observeFleet(state, snapshot("A", "older A"), 11);
    expect(state.selected).toBe("B");
    expect(state.details.A?.snapshot.output).toBe("older A");
    expect(state.details.B?.snapshot.output).toBe("new B");
    expect(state.summaries[0]?.runToken).toBe("B");
  });
  it("same-token stale observations do not roll backward", () => {
    const newer = observeFleet(emptyFleet(), snapshot("A", "new"), 12);
    expect(observeFleet(newer, snapshot("A", "old"), 11)).toEqual(newer);
  });
  it("send acknowledgement clears only the exact run's unchanged composer revision", () => {
    let state = editFleetComposer(emptyFleet(), "A", "sent");
    state = editFleetComposer(state, "B", "unsent B");
    state = editFleetComposer(state, "A", "edited during send");
    expect(acknowledgeFleetComposer(state, "A", 1)).toBe(state);
    state = acknowledgeFleetComposer(state, "A", 2);
    expect(state.composers.A?.text).toBe("");
    expect(state.composers.B?.text).toBe("unsent B");
  });
  it("core reset retains local text but removes all executable authority", () => {
    const state = observeFleet(editFleetComposer(selectFleetRun(emptyFleet(), "A"), "A", "local draft"), snapshot("A"), 12);
    const reset = resetFleetAuthority(state);
    expect(reset.details).toEqual({});
    expect(reset.summaries).toEqual([]);
    expect(reset.composers.A?.text).toBe("local draft");
    expect(reset.catalogSequence).toBe(-1);
  });
});
