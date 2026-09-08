// @vitest-environment node
// Manual single-message proof, never enabled by ordinary quality/CI. The session
// executing this command may target only itself, using an explicit private row.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ExternalAgentService } from "../core/external-agents";
import { PROTOCOL_VERSION } from "../protocol/schema";
import { ExternalSessionId } from "../protocol/external-agents";

it.skipIf(process.env.SWARM_STEERING_REAL_SELF !== "1")("queues one harmless instruction to this implementation session only", async () => {
  const sessionId = ExternalSessionId.parse(process.env.CODEX_THREAD_ID);
  expect(process.env.SWARM_STEERING_REAL_SELF_ID).toBe(sessionId);
  const registry = process.env.SWARM_STEERING_SELF_REGISTRY!, evidence = process.env.SWARM_STEERING_SELF_EVIDENCE!;
  const rows = JSON.parse(await readFile(registry, "utf8"));
  expect(rows.sessions).toHaveLength(1); expect(rows.sessions[0].id).toBe(sessionId);
  const service = new ExternalAgentService(process.cwd(), registry);
  try {
    const read = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID(), type: "externalAgents.read", sessionId });
    expect(read.kind).toBe("read"); if (read.kind !== "read") throw new Error("No observed target");
    expect(read.detail.session.evidence).toBe("local"); expect(read.detail.session.status).toBe("observed"); expect(read.detail.handoff).toBe("available");
    // An existing attempt file makes this deliberate command non-repeatable. A
    // timeout/failure must not be "fixed" by automatically sending it again.
    await writeFile(join(evidence, "self-send-attempt.json"), JSON.stringify({ sessionId, at: new Date().toISOString(), authorized: "one harmless self message" }), { flag: "wx", mode: 0o600 });
    const result = await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: crypto.randomUUID(), type: "externalAgents.send", sessionId,
      observationId: read.detail.session.observationId,
      text: "S3 SELF-QUEUE RECEIPT PROOF: this harmless verification instruction was deliberately queued by the session-steering implementation to its own session. Record that you consumed this message, then continue the assigned S3 work unchanged. Do not launch extra tools or agents just for this message." });
    await writeFile(join(evidence, "self-send-receipt.json"), JSON.stringify(result), { flag: "wx", mode: 0o600 });
    expect(result).toMatchObject({ kind: "send", sessionId, status: "queued" });
  } finally { await service.dispose(); }
}, 15000);
