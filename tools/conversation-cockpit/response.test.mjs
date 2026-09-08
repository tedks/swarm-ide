import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../../fixtures/world";
import { PROTOCOL_VERSION, parseCoreResponseForRequest } from "../../protocol/schema";
import { ResponseEnvelopeSchema } from "../../app/lifecycle";
import { controlledSendEnvelope } from "./response.cjs";

describe("controlled conversation Send envelope", () => {
  it("retains the actual generation, sequence and snapshot required by production preload", () => {
    const input = { protocolVersion: PROTOCOL_VERSION, requestId: "controlled-send", type: "externalAgents.send",
      sessionId: "10000000-0000-4000-8000-000000000001", observationId: "1".repeat(64), text: "Never delivered" };
    const receipt = "30000000-0000-4000-8000-000000000001";
    const base = { generation: 4, response: { protocolVersion: PROTOCOL_VERSION, requestId: input.requestId, ok: true,
      sequence: 8, snapshot: initialSnapshot(), external: { kind: "snapshot", snapshot: { status: "observed", message: "Test read",
        observedAt: "2026-09-08T00:00:00.000Z", sessions: [] } } } };
    const envelope = controlledSendEnvelope(base, input, receipt);
    expect(ResponseEnvelopeSchema.parse(envelope)).toEqual(envelope);
    const parsed = parseCoreResponseForRequest(envelope.response, input);
    expect(parsed.external).toEqual({ kind: "send", sessionId: input.sessionId, status: "delivery-unknown", receiptId: receipt,
      message: "Controlled test response; no queue invocation or agent message." });
    expect(envelope.response.snapshot).toBe(base.response.snapshot);
    expect(envelope.generation).toBe(4);
    expect(envelope.response.sequence).toBe(8);
    const { sequence, snapshot, ...originalMalformed } = envelope.response;
    expect(() => ResponseEnvelopeSchema.parse({ generation: 4, response: originalMalformed })).toThrow();
  });
});
