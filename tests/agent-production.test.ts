// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionAgentService, type ProductionAgentService } from "../core/agents/production";
import { RealWorkspaceProvider } from "../core/provider";
import { PROTOCOL_VERSION } from "../protocol/schema";
import type { AgentRequest } from "../protocol/agents";

const roots: string[] = [], services: ProductionAgentService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "swarm-agent-production-")); roots.push(directory);
  const root = join(directory, "repo"), storeRoot = join(directory, "app-data");
  const path = "examples/checkout-world/services/fraudcheck/fraudcheck.ts";
  await mkdir(join(root, "examples/checkout-world/services/fraudcheck"), { recursive: true });
  await writeFile(join(root, path), "export const evaluate = () => 'disk';\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe", env: {
    ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  } });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-qm", "fixture");
  const provider = await RealWorkspaceProvider.create(root);
  const focus = provider.snapshot().graphs[0]!.nodes.find((node) => node.focus.path === path)!.focus;
  const service = await createProductionAgentService({ root, storeRoot, snapshot: () => provider.snapshot(), emit() {} });
  services.push(service);
  const prepare: AgentRequest = { protocolVersion: PROTOCOL_VERSION, requestId: "prepare", type: "agent.prepare",
    worldId: focus.worldId, focus, taskText: "Explain this actual disk file", model: null, effort: null,
    links: { parentRunId: null, task: null, spec: null } };
  return { service, prepare, root, storeRoot, provider };
}
describe("real production context, no execution authority", () => {
  it("prepares actual disk context while policy-unavailable launch starts no run", async () => {
    const f = await fixture();
    const prepared = await f.service.request(f.prepare);
    expect(prepared).toMatchObject({ ok: true, value: { kind: "prepare", draft: {
      capabilities: { availability: "unavailable", reason: { code: "ADAPTER_POLICY_UNAVAILABLE" } },
      launchContext: { root: f.root, diskOnly: true, attachments: [{ content: "export const evaluate = () => 'disk';\n" }] },
    } } });
    if (!prepared.ok || prepared.value.kind !== "prepare") throw new Error("Missing draft");
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "launch", type: "agent.launch",
      runId: prepared.value.draft.runId, contextHash: prepared.value.draft.contextHash })).toMatchObject({ ok: false, error: { code: "ADAPTER_POLICY_UNAVAILABLE" } });
    expect(await f.service.request({ protocolVersion: PROTOCOL_VERSION, requestId: "snapshot", type: "agent.snapshot" })).toMatchObject({ ok: true,
      value: { kind: "snapshot", snapshot: { runs: [], activeRunId: null, capabilities: { policy: "unverified" } } } });
  });
  it("refuses unknown graph mappings and permits reference-only root context", async () => {
    const f = await fixture();
    if (f.prepare.type !== "agent.prepare") throw new Error();
    expect(await f.service.request({ ...f.prepare, focus: { ...f.prepare.focus, key: "not-registered" } })).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    const focus = f.provider.snapshot().graphs[0]!.nodes[0]!.focus;
    expect(await f.service.request({ ...f.prepare, focus })).toMatchObject({ ok: true,
      value: { kind: "prepare", draft: { launchContext: { attachments: [] } } } });
  });
  it("permits only one live writer and releases it on deliberate shutdown", async () => {
    const f = await fixture();
    await expect(createProductionAgentService({ root: f.root, storeRoot: f.storeRoot, snapshot: () => f.provider.snapshot(), emit() {} })).rejects.toThrow();
    await f.service.shutdown();
    const next = await createProductionAgentService({ root: f.root, storeRoot: f.storeRoot, snapshot: () => f.provider.snapshot(), emit() {} });
    services.push(next);
    expect(await next.request({ protocolVersion: PROTOCOL_VERSION, requestId: "snapshot", type: "agent.snapshot" })).toMatchObject({ ok: true });
  });
});
