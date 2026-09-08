// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, parseCoreRequest } from "../protocol/schema";
import { TrustedActivitySchema, TrustedRunSummarySchema, TrustedSnapshotSchema } from "../protocol/trusted-local";

describe("compatible trusted fleet seam", () => {
  it("accepts legacy and exact targeted snapshot/send controls", () => {
    const base = { protocolVersion: PROTOCOL_VERSION, requestId: "contract" };
    expect(parseCoreRequest({ ...base, type: "trusted.snapshot" })).toMatchObject({ type: "trusted.snapshot" });
    const token = randomUUID();
    expect(parseCoreRequest({ ...base, type: "trusted.snapshot", token })).toMatchObject({ token });
    for (const expectedTurnId of [undefined, null, "turn-1"]) {
      expect(parseCoreRequest({ ...base, type: "trusted.send", token, text: "hello", ...(expectedTurnId === undefined ? {} : { expectedTurnId }) })).toMatchObject({ token });
    }
    expect(() => parseCoreRequest({ ...base, type: "trusted.snapshot", token: "other" })).toThrow();
  });
  it("keeps old snapshots valid and bounds summary/activity payloads", () => {
    const snapshot = { instanceId: randomUUID(), profile: "trusted-local", workspace: "/repo", preparation: null,
      runToken: null, status: "idle", threadId: null, turnId: null, output: "", message: "", approvals: [] };
    expect(TrustedSnapshotSchema.parse(snapshot).runs).toBeUndefined();
    const summary = { runToken: randomUUID(), title: "Run", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      status: "ready", archived: false, approvalCount: 0, taskReference: null, message: "Ready" };
    expect(TrustedRunSummarySchema.parse(summary).status).toBe("ready");
    expect(() => TrustedSnapshotSchema.parse({ ...snapshot, runs: Array(21).fill(summary) })).toThrow();
    const activity = { id: "item", at: new Date(0).toISOString(), turnId: "turn", kind: "command", status: "running", summary: "Run tests" };
    expect(TrustedActivitySchema.parse(activity).kind).toBe("command");
    expect(() => TrustedSnapshotSchema.parse({ ...snapshot, activities: Array(101).fill(activity) })).toThrow();
    expect(() => TrustedActivitySchema.parse({ ...activity, summary: "λ".repeat(4096) })).toThrow();
  });
});
