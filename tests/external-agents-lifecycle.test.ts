import { describe, expect, it } from "vitest";
import { AgentLifecycleProjection } from "../core/agent-lifecycle";
import { AGENT_EXECUTION_LABELS, AgentLifecycleSchema } from "../protocol/agent-lifecycle";

const born = "2026-09-08T12:00:00.400Z", start = Date.parse(born) / 1000;
const event = (type: string, fields = {}, offset = 1) => ({ type: "event_msg", timestamp: new Date(Date.parse(born) + offset * 1000).toISOString(),
  payload: { type, turn_id: "turn-a", started_at: start, ...fields } });
const response = (type: string, fields = {}, offset = 2) => ({ type: "response_item", timestamp: new Date(Date.parse(born) + offset * 1000).toISOString(), payload: { type, ...fields } });

describe("actual agent execution lifecycle", () => {
  it("uses explicit start/completion, not prose, diagnostic errors or failing tools", () => {
    const p = new AgentLifecycleProjection({ timestamp: born });
    p.consume(response("message", { role: "assistant", content: "Done" }));
    expect(p.snapshot().state).toBe("unknown");
    p.consume(event("task_started"));
    p.consume(response("function_call_output", { output: "Exit code 1" }));
    p.consume(event("error", { message: "provider diagnostic" }));
    expect(p.snapshot().state).toBe("working");
    p.consume(event("task_complete", {}, 3));
    expect(p.snapshot()).toMatchObject({ state: "completed", turnId: "turn-a" });
    p.consume(event("task_started", {}, 4));
    expect(p.snapshot().state).toBe("completed");
    p.consume(event("task_started", { turn_id: "turn-b", started_at: start + 5 }, 5));
    expect(p.snapshot()).toMatchObject({ state: "working", turnId: "turn-b" });
    p.consume(event("task_complete", {}, 6));
    expect(p.snapshot()).toMatchObject({ state: "working", turnId: "turn-b" });
  });
  it("does not mistake failed completion or operator interruption for success", () => {
    const p = new AgentLifecycleProjection({ timestamp: born });
    p.consume(event("task_complete", { error: { codex_error_info: "usage_limit_exceeded", message: "Limit" } }));
    expect(p.snapshot().state).toBe("failed");
    const q = new AgentLifecycleProjection({ timestamp: born });
    q.consume(event("task_started")); q.consume(event("turn_aborted", { reason: "interrupted" }, 2));
    expect(q.snapshot().state).toBe("unknown");
  });
  it("keeps the owning start authoritative when a terminal omits started_at", () => {
    const p = new AgentLifecycleProjection({ timestamp: born });
    expect(p.consume(event("task_started"))).toBe(true);
    expect(p.consume(event("task_complete", { started_at: undefined }, 2))).toBe(false);
    expect(p.snapshot()).toMatchObject({ state: "completed", turnId: "turn-a" });
  });
  it("correlates blocking human requests and does not treat async acceptance as waiting or an answer", () => {
    const p = new AgentLifecycleProjection({ timestamp: born }); p.consume(event("task_started"));
    p.consume(response("function_call", { name: "functions.request_user_input_async", call_id: "async" }));
    expect(p.snapshot().state).toBe("working");
    p.consume(response("function_call", { name: "functions.request_user_input", call_id: "question" }));
    expect(p.snapshot().state).toBe("waiting");
    p.consume(response("function_call_output", { call_id: "async", output: '{"accepted":true}' }, 3));
    expect(p.snapshot().state).toBe("waiting");
    p.consume(response("function_call_output", { call_id: "question", output: '{"answers":{}}' }, 4));
    expect(p.snapshot().state).toBe("working");
    p.consume(event("task_complete", {}, 5));
    p.consume(response("function_call", { name: "functions.request_user_input", call_id: "late" }, 6));
    expect(p.snapshot().state).toBe("completed");
  });
  it("excludes inherited fork records even when outer timestamps were rewritten", () => {
    const p = new AgentLifecycleProjection({ timestamp: born, forked_from_id: "parent" });
    p.consume(event("task_started", { started_at: start - 60 }));
    p.consume(event("task_complete", { started_at: start - 60, error: { message: "parent failed" } }));
    p.consume(response("function_call", { name: "request_user_input", call_id: "parent-question" }));
    expect(p.snapshot().state).toBe("unknown");
    expect(p.consume(event("task_started"))).toBe(true);
    expect(p.snapshot().state).toBe("working");
    expect(p.consume(event("task_complete", { started_at: undefined }, 4))).toBe(false);
    expect(p.snapshot().state).toBe("completed");
    const unknownBirth = new AgentLifecycleProjection({ forked_from_id: "parent" });
    unknownBirth.consume(event("task_started")); expect(unknownBirth.snapshot().state).toBe("unknown");
  });
  it("preserves correlated pending requests across a copied incremental observation", () => {
    const p = new AgentLifecycleProjection({ timestamp: born }); p.consume(event("task_started"));
    p.consume(response("function_call", { name: "request_user_input", call_id: "question" }));
    const q = p.clone(); q.consume(response("function_call_output", { call_id: "question" }, 3));
    expect(p.snapshot().state).toBe("waiting"); expect(q.snapshot().state).toBe("working");
    expect(AgentLifecycleSchema.parse(q.snapshot())).toEqual(q.snapshot());
    expect(AGENT_EXECUTION_LABELS).toMatchObject({ working: "In progress", waiting: "Waiting on you", failed: "Failed", completed: "Complete" });
  });
});
