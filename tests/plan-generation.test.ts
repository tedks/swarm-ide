// @vitest-environment node
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { componentPlanMissing, prepareComponentPlan } from "../core/plan-generation";
import { componentPlanPrompt, PlanGenerationSettingsSchema } from "../protocol/plan-generation";
import { readPlanIndex } from "../core/plans";
import { PlanReadResultSchema } from "../protocol/plans";
import { TrustedLocalService } from "../core/agents/trusted-local";
import { TrustedRequestSchema } from "../protocol/trusted-local";
import { PROTOCOL_VERSION } from "../protocol/schema";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";

const roots: string[] = [];
const root = async () => { const path = await mkdtemp(join(tmpdir(), "swarm-plan-generation-")); roots.push(path); return path; };
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe("component-plan generation admission", () => {
  it("uses the ordinary owner with requested effort and refuses a second active generator", async () => {
    const path = await root();
    const session = { snapshot: () => ({ status: "running" as const, threadId: "thread", turnId: "turn", output: "", message: "", approvals: [] }),
      start: vi.fn(async () => {}), stop: vi.fn(async () => {}), send: vi.fn(), decide: vi.fn() };
    const createSession = vi.fn(async () => session);
    const service = new TrustedLocalService({ root: path, context: { prepare: vi.fn(), dispose: vi.fn() }, createSession });
    const request = () => TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type: "trusted.start", purpose: "component-plan",
      token: randomUUID(), text: "Plan this project", model: "gpt-5.6-sol", effort: "xhigh" });
    try {
      await service.request(request(), path);
      expect(session.start).toHaveBeenCalledWith("Plan this project", "gpt-5.6-sol", undefined, "xhigh");
      await expect(service.request(request(), path)).rejects.toThrow("already working");
      expect(createSession).toHaveBeenCalledTimes(1);
    } finally { await service.shutdown(); }
  });
  it("rechecks the selected root at admission and never starts for an existing index", async () => {
    const path = await root(), selected = await root(); await mkdir(join(selected, ".swarm")); await writeFile(join(selected, ".swarm/plans.json"), "malformed but owned");
    const createSession = vi.fn();
    const service = new TrustedLocalService({ root: path, context: { prepare: vi.fn(), dispose: vi.fn() }, createSession });
    try {
      await expect(service.request(TrustedRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type: "trusted.start", purpose: "component-plan",
        token: randomUUID(), text: "Generate", model: "gpt-5.6-sol", effort: "xhigh" }), selected)).rejects.toThrow("already exists");
      expect(createSession).not.toHaveBeenCalled();
    } finally { await service.shutdown(); }
  });
  it("starts only when the canonical index is genuinely absent", async () => {
    const path = await root();
    expect(await componentPlanMissing(path)).toBe(true);
    await mkdir(join(path, ".swarm"));
    expect(await componentPlanMissing(path)).toBe(true);
    expect(await prepareComponentPlan(path, PlanGenerationSettingsSchema.parse({}))).toContain("exclusively");
    for (const content of ["", "broken JSON", '{"version":1,"nodes":[]}']) {
      await writeFile(join(path, ".swarm/plans.json"), content);
      expect(await componentPlanMissing(path)).toBe(false);
      await expect(prepareComponentPlan(path, PlanGenerationSettingsSchema.parse({}))).rejects.toThrow("already exists");
    }
  });
  it("refuses missing roots, aliases, directories and dangling links, without creating anything", async () => {
    const path = await root(), outside = await root();
    expect(await componentPlanMissing(join(path, "absent"))).toBe(false);
    await symlink(outside, join(path, ".swarm"));
    expect(await componentPlanMissing(path)).toBe(false);
    await rm(join(path, ".swarm")); await mkdir(join(path, ".swarm"));
    await symlink(join(outside, "missing"), join(path, ".swarm/plans.json"));
    expect(await componentPlanMissing(path)).toBe(false);
    await rm(join(path, ".swarm/plans.json")); await mkdir(join(path, ".swarm/plans.json"));
    expect(await componentPlanMissing(path)).toBe(false);
  });
  it("distinguishes missing from malformed in the normal plan reader", async () => {
    const path = await root();
    expect(await readPlanIndex(path)).toMatchObject({ status: "unavailable", missing: true });
    await mkdir(join(path, ".swarm")); await writeFile(join(path, ".swarm/plans.json"), "broken");
    expect(await readPlanIndex(path)).toMatchObject({ status: "unavailable", code: "PLAN_INDEX_MALFORMED" });
    expect(await readPlanIndex(path)).not.toHaveProperty("missing");
    expect(PlanReadResultSchema.safeParse({ ...await readPlanIndex(path), missing: true }).success).toBe(false);
  });
  it("does not offer generation inside a nested repository", async () => {
    const path = await root(); await mkdir(join(path, ".swarm/.git"), { recursive: true });
    expect(await componentPlanMissing(path)).toBe(false);
    expect(await readPlanIndex(path)).not.toHaveProperty("missing");
  });
  it("keeps custom intent and the actual format/protection contract without changing the requested model", () => {
    const settings = PlanGenerationSettingsSchema.parse({ prompt: "Describe the matching engine.", model: "my-model", effort: "high" });
    expect(componentPlanPrompt(settings)).toContain("Describe the matching engine.");
    expect(componentPlanPrompt(settings)).toContain('"version":1');
    expect(componentPlanPrompt(settings)).toContain("Do not overwrite existing design documents");
    expect(settings.model).toBe("my-model");
    expect(PlanGenerationSettingsSchema.parse({})).toMatchObject({ harness: "codex", model: "gpt-5.6-sol", effort: "xhigh" });
    expect(PlanGenerationSettingsSchema.safeParse({ prompt: "\0", model: "bad name" }).success).toBe(false);
  });
});
