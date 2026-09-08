// Explicit manual proof: ONE actual generation in an owned tiny repository.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, realpath, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { TrustedLocalService, findTrustedExecutable } from "../../core/agents/trusted-local";
import { TrustedLocalSession } from "../../core/agents/trusted-local-session";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import { componentPlanPrompt, PlanGenerationSettingsSchema } from "../../protocol/plan-generation";
import { parseCoreRequest, PROTOCOL_VERSION } from "../../protocol/schema";
import { TrustedRequestSchema } from "../../protocol/trusted-local";
import { readPlanIndex } from "../../core/plans";
import type { CleanupEvidence } from "../../protocol/agents";
import { readCanonicalWorkspaceBytes } from "../../core/files";

async function main() {
  if (process.env.SWARM_PLAN_GENERATION_LIVE !== "1") throw new Error("Explicit real-generation authorization required.");
  const evidence = process.env.SWARM_PLAN_GENERATION_EVIDENCE;
  if (!evidence || !isAbsolute(evidence) || await realpath(evidence) !== evidence) throw new Error("Owned evidence directory required.");
  const consumed = await open(join(evidence, "one-generation.json"), "wx", 0o600);
  const settings = PlanGenerationSettingsSchema.parse({});
  await consumed.writeFile(JSON.stringify({ at: new Date().toISOString(), model: settings.model, effort: settings.effort, maximumTurns: 1 })); await consumed.close();
  const root = await mkdtemp(join(tmpdir(), "swarm-generated-design-"));
  await writeFile(join(root, "main.js"), 'import { greet } from "./greet.js";\nconsole.log(greet("operator"));\n');
  await writeFile(join(root, "greet.js"), 'export function greet(name) { return `Hello ${name}`; }\n');
  await writeFile(join(root, "README.md"), "# Greeting app\nmain.js passes a name into greet.js, which returns a greeting. No server, database or remote calls.\n");
  await writeFile(join(root, "BUILD.bazel"), 'filegroup(name="sources", srcs=["main.js", "greet.js"])\n');
  await writeFile(join(root, "MODULE.bazel"), 'module(name="greeting_app")\n');
  for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=Proof", "-c", "user.email=proof@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Owned plan-generation source"]]) execFileSync("git", args, { cwd: root });
  const originalHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const originals = await Promise.all(["main.js", "greet.js", "README.md", "BUILD.bazel", "MODULE.bazel"].map(async path => ({ path, bytes: await readFile(join(root, path), "utf8") })));
  const [codex, node, unshare, setpriv] = await Promise.all(["/tmp/swarm-ide-codex-runtime.70xtjj/codex", "node", "unshare", "setpriv"].map(findTrustedExecutable));
  const ownerScript = await realpath(process.argv[2]!);
  let cleanup: CleanupEvidence | undefined, starts = 0;
  const service = new TrustedLocalService({ root, context: { prepare: async () => { throw new Error("No fabricated file preparation"); }, dispose: async () => {} },
    createSession: async (onChange, selectedRoot = root) => new TrustedLocalSession({ root: selectedRoot, executable: codex!, openTransport(sink) {
      if (++starts !== 1) throw new Error("Only one actual provider start is authorized.");
      const transport = createOwnedCodexTransport({ root: selectedRoot, executable: codex!, nodeExecutable: node!, unshareExecutable: unshare!, setprivExecutable: setpriv!, ownerScript,
        args: ["app-server", "--listen", "stdio://"] }, sink);
      return { ...transport, close: async () => { cleanup = await transport.close(); return cleanup; } };
    } }, onChange) });
  const token = randomUUID();
  let reason = "deadline", before = service.snapshot();
  try {
    const request = TrustedRequestSchema.parse(parseCoreRequest({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type: "trusted.start",
      token, text: componentPlanPrompt(settings), model: settings.model, effort: settings.effort, purpose: "component-plan" }));
    await service.request(request);
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      before = service.snapshot(token);
      if (before.approvals.length) { reason = "approval-required"; break; }
      if (["ready", "failed", "closed"].includes(before.status)) { reason = before.status; break; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } catch (error) { reason = error instanceof Error ? error.message : "generation failed"; }
  finally { try { await service.shutdown(); } catch { reason = "owned-shutdown-unconfirmed"; } }
  const plan = await readPlanIndex(root);
  const docs = plan.status === "observed" ? [...new Set(plan.index.nodes.flatMap(item => item.docs))] : [];
  const contents: { path: string; content: string }[] = [], validationErrors: string[] = [];
  for (const path of docs) {
    try { contents.push({ path, content: (await readCanonicalWorkspaceBytes(root, path, 128 * 1024)).toString("utf8") }); }
    catch { validationErrors.push(`Document cannot be read: ${path}`); }
  }
  if (plan.status === "observed") for (const node of plan.index.nodes) {
    for (const path of node.sourcePaths) {
      try { await readCanonicalWorkspaceBytes(root, path, 128 * 1024); } catch { validationErrors.push(`Source does not exist: ${path}`); }
    }
    for (const target of node.design?.buildTargets ?? []) {
      if (target.label !== "//:sources") validationErrors.push(`Undeclared fixture target: ${target.label}`);
      for (const dependency of target.dependencies) if (dependency.relation !== "srcs" || !["//:main.js", "//:greet.js"].includes(dependency.label)) validationErrors.push(`Undeclared fixture input: ${dependency.label}`);
    }
  }
  const sourceUnchanged = (await Promise.all(originals.map(async source => {
    try { return (await readCanonicalWorkspaceBytes(root, source.path, 128 * 1024)).toString("utf8") === source.bytes; } catch { return false; }
  }))).every(Boolean) && execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() === originalHead
    && execFileSync("git", ["diff", "--cached", "--name-only", originalHead], { cwd: root, encoding: "utf8" }).trim() === "";
  const ok = reason === "ready" && plan.status === "observed" && plan.index.nodes.length > 0 && contents.length > 0 && !validationErrors.length && sourceUnchanged && cleanup?.status === "confirmed";
  const result = { ok, root, reason, model: settings.model, effort: settings.effort, providerStarts: starts, sourceUnchanged,
    output: before.output, message: before.message, plan, docs: contents, validationErrors, cleanup };
  await mkdir(join(evidence, "generated"), { recursive: true });
  await writeFile(join(evidence, "real-generation.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok, reason, root, providerStarts: starts, nodes: plan.status === "observed" ? plan.index.nodes.length : 0, docs: docs.length, cleanup: cleanup?.status }));
  if (!ok) process.exitCode = 1;
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Generation proof failed"); process.exitCode = 1; });
