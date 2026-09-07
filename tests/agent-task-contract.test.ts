import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { agentFixtureContext } from "../fixtures/agents";
import { AgentPrepareInputSchema, LaunchContextSchema, PreparedAgentContextSchema } from "../protocol/agents";
import { PROTOCOL_VERSION } from "../protocol/common";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { AgentTaskReferenceSchema, RepositoryTaskMaterializationSchema, agentTaskBytes, canonicalJsonV1,
  formatAgentContextV2, formatRepositoryTask, type AgentTaskReference } from "../protocol/agent-task";
import { AGENT_LIMITS, LaunchContextV2Schema, utf8Bytes } from "../protocol/agents";
import { CoreRequestSchema, parseCoreResponseForRequest } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const pin = { version: 1, worldId: "fixture-world", repositoryId: "synthetic-fixture", provider: "ditz",
  taskId: "task-one", metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) },
  issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } };
const input = () => {
  const { worldId, focus, taskText, links } = agentFixtureContext().launchContext;
  return { worldId, focus, taskText, links, model: null, effort: null };
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function materialized(description = "\ufeffé\r\n\"quoted\"\t\u0000", title = "Task 🧪") {
  const reference = AgentTaskReferenceSchema.parse(pin);
  const content = formatRepositoryTask(reference, title, description);
  return { reference, encoding: "swarm-repository-task-json-v1" as const, content, bytes: utf8Bytes(content), digest: digest(content) };
}
function context(taskText = "", repositoryTask = materialized()) {
  const fields = { ...agentFixtureContext().launchContext, taskText, repositoryTask };
  const submittedPrompt = formatAgentContextV2(fields);
  return { ...fields, submittedPrompt, contextHash: digest(submittedPrompt) };
}

/** Frozen untagged historical shape, intentionally never promoted by fixtures. */
export function legacyDraft() {
  const draft = agentFixtureContext();
  const { contextVersion: _version, sourceLinks: _links, repositoryTask: _task, ...legacy } =
    draft.launchContext as typeof draft.launchContext & { contextVersion?: number; sourceLinks?: string[]; repositoryTask?: unknown };
  legacy.submittedPrompt = "Historical exact prompt\r\n\ufeffé";
  legacy.contextHash = createHash("sha256").update(legacy.submittedPrompt).digest("hex");
  return { ...draft, contextHash: legacy.contextHash, launchContext: legacy };
}

describe("D3 task identity and historical admission boundary", () => {
  it("uses wire 7 and accepts attached empty instructions, not plain whitespace", () => {
    expect(PROTOCOL_VERSION).toBe(7);
    expect(AgentPrepareInputSchema.safeParse({ ...input(), taskText: "", taskReference: pin }).success).toBe(true);
    expect(AgentPrepareInputSchema.safeParse({ ...input(), taskText: " \r\n" }).success).toBe(false);
  });
  it("preserves the strict legacy history branch but forbids new legacy preparation", () => {
    const legacy = legacyDraft();
    expect(LaunchContextSchema.parse(legacy.launchContext)).toEqual(legacy.launchContext);
    expect(PreparedAgentContextSchema.safeParse(legacy).success).toBe(false);
    for (const extra of [{ contextVersion: 3 }, { repositoryTask: null }, { sourceLinks: [] }]) {
      expect(LaunchContextSchema.safeParse({ ...legacy.launchContext, ...extra }).success).toBe(false);
    }
  });
  it("rejects foreign worlds, mixed algorithms, abbreviated objects, extra authority and null attachments", () => {
    for (const bad of [null, { ...pin, version: 2 }, { ...pin, title: "forged" }, { ...pin, provider: "other" },
      { ...pin, taskId: "task/one" }, { ...pin, taskId: "x".repeat(257) }, { ...pin, root: "/arbitrary" },
      { ...pin, metadataCommit: { algorithm: "sha1", hex: "abcd" } },
      { ...pin, issueBlob: { algorithm: "sha256", hex: "c".repeat(64) } }]) {
      expect(AgentPrepareInputSchema.safeParse({ ...input(), taskReference: bad }).success).toBe(false);
    }
    expect(AgentPrepareInputSchema.safeParse({ ...input(), taskReference: { ...pin, worldId: "other" } }).success).toBe(false);
    expect(AgentTaskReferenceSchema.safeParse({ ...pin, taskId: "x".repeat(256),
      metadataCommit: { algorithm: "sha256", hex: "a".repeat(64) }, issueBlob: { algorithm: "sha256", hex: "b".repeat(64) } }).success).toBe(true);
  });
  it("formats code-unit sorted keys, exact decoded text and only JSON values", () => {
    expect(canonicalJsonV1({ "2": "two", "10": "ten", z: ["\ufeffé\r\n", "e\u0301"], a: true }))
      .toBe('{"10":"ten","2":"two","a":true,"z":["﻿é\\r\\n","é"]}');
    for (const bad of [undefined, NaN, Infinity, new Date(), { a: undefined }, Array(1), "\ud800", "\udc00", { "\ud800": 1 }]) {
      expect(() => canonicalJsonV1(bad)).toThrow();
    }
    expect(canonicalJsonV1("🧪")).toBe('"🧪"');
    const task = materialized();
    expect(RepositoryTaskMaterializationSchema.parse(task)).toEqual(task);
    expect(JSON.parse(task.content).description).toBe("\ufeffé\r\n\"quoted\"\t\u0000");
    for (const bad of [{ ...task, bytes: task.bytes + 1 }, { ...task, content: task.content + " " },
      { ...task, reference: { ...task.reference, taskId: "different" } }]) {
      expect(RepositoryTaskMaterializationSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("counts complete escaped identity envelope at exactly 16 KiB and max+one", () => {
    const task = materialized();
    const budget = AGENT_LIMITS.taskBytes - agentTaskBytes("", task);
    const instructions = "x".repeat(budget);
    expect(agentTaskBytes(instructions, task)).toBe(AGENT_LIMITS.taskBytes);
    expect(LaunchContextV2Schema.safeParse(context(instructions, task)).success).toBe(true);
    expect(LaunchContextV2Schema.safeParse(context(instructions + "x", task)).success).toBe(false);
    expect(() => formatRepositoryTask(task.reference, "é".repeat(257), "description")).toThrow();
    expect(() => formatRepositoryTask(task.reference, "title", "x".repeat(16385))).toThrow();
    expect(() => formatRepositoryTask(task.reference, "title", "\ud800")).toThrow();
    expect(AgentPrepareInputSchema.safeParse({ ...input(), taskText: "\ud800" }).success).toBe(false);
    const legalLargeDescription = materialized("x".repeat(16384));
    expect(LaunchContextV2Schema.safeParse(context("", legalLargeDescription)).success).toBe(false);
  });
  it("binds every V2 field and task pin, even with a recomputed outer hash", () => {
    const original = context();
    expect(LaunchContextV2Schema.parse(original)).toEqual(original);
    for (const patch of [{ taskText: "changed" }, { sourceLinks: ["other.ts"] },
      { repositoryId: "other" }, { repositoryTask: { ...original.repositoryTask, reference: { ...original.repositoryTask.reference, taskId: "changed" } } }]) {
      const changed = { ...original, ...patch };
      changed.contextHash = digest(changed.submittedPrompt);
      expect(LaunchContextV2Schema.safeParse(changed).success).toBe(false);
    }
  });
  it("correlates full task identity and attachment presence in Prepare replies", () => {
    const launchContext = context();
    const draft = { ...agentFixtureContext(), launchContext, contextHash: launchContext.contextHash };
    const request = CoreRequestSchema.parse({ ...input(), taskText: "", taskReference: pin,
      protocolVersion: PROTOCOL_VERSION, requestId: "d3", type: "agent.prepare" });
    const response = { protocolVersion: PROTOCOL_VERSION, requestId: "d3", ok: true,
      sequence: 1, snapshot: initialSnapshot(), agent: { kind: "prepare", draft } };
    expect(() => parseCoreResponseForRequest(response, request)).not.toThrow();
    const changed = CoreRequestSchema.parse({ ...request, taskReference: { ...pin, issueBlob: { algorithm: "sha1", hex: "c".repeat(40) } } });
    expect(() => parseCoreResponseForRequest(response, changed)).toThrow();
    const plain = CoreRequestSchema.parse({ ...request, taskText: "plain", taskReference: undefined });
    const attached = context("plain");
    expect(() => parseCoreResponseForRequest({ ...response, agent: { kind: "prepare", draft: {
      ...draft, launchContext: attached, contextHash: attached.contextHash } } }, plain)).toThrow();
  });
  it("enforces 128 KiB serialized context including duplicated prompt, and 64 KiB source", () => {
    const make = (content: string) => {
      const fields = { ...agentFixtureContext().launchContext, attachments: [{ path: "x.ts", startLine: 1, endLine: 1, content, digest: digest(content) }] };
      const submittedPrompt = formatAgentContextV2(fields);
      return { ...fields, submittedPrompt, contextHash: digest(submittedPrompt) };
    };
    let count = Math.floor((AGENT_LIMITS.contextBytes - utf8Bytes(JSON.stringify(make("")))) / 2);
    // Escaped LF contributes five serialized bytes versus two for plain ASCII.
    const suffix = utf8Bytes(JSON.stringify(make("x".repeat(count)))) === AGENT_LIMITS.contextBytes ? "" : "\n";
    if (suffix) count -= 2;
    const full = make("x".repeat(count) + suffix);
    expect(utf8Bytes(JSON.stringify(full))).toBe(AGENT_LIMITS.contextBytes);
    expect(LaunchContextV2Schema.safeParse(full).success).toBe(true);
    expect(LaunchContextV2Schema.safeParse(make("x".repeat(count + 1) + suffix)).success).toBe(false);
    expect(LaunchContextV2Schema.safeParse(make("x".repeat(AGENT_LIMITS.attachmentBytes + 1))).success).toBe(false);
  });
  it("bundles and executes the shared schemas in a browser without Node imports", async () => {
    const result = await build({ entryPoints: ["protocol/agents.ts"], bundle: true, write: false,
      platform: "browser", format: "iife", globalName: "contract", logLevel: "silent" });
    const exports = runInNewContext(result.outputFiles[0]!.text + ";contract", { TextEncoder });
    expect(exports.AgentPrepareInputSchema.safeParse({ ...input(), taskReference: pin }).success).toBe(true);
  });
});
