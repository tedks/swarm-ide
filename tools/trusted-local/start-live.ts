// MANUAL: one explicitly authorized real Codex turn in a disposable Git repo.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { TrustedLocalService, findTrustedExecutable } from "../../core/agents/trusted-local";
import { TrustedLocalSession } from "../../core/agents/trusted-local-session";
import { FileTrustedLocalStore } from "../../core/agents/trusted-local-store";
import { createOwnedCodexTransport } from "../../core/agents/owner";
import { PROTOCOL_VERSION } from "../../protocol/common";
import type { CleanupEvidence } from "../../protocol/agents";

async function main() {
  assert.equal(process.env.SWARM_NEW_AGENT_LIVE, "1", "manual one-turn authorization required");
  const evidence = process.env.SWARM_NEW_AGENT_EVIDENCE!;
  assert(evidence && isAbsolute(evidence));
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const mark = await open(join(evidence, "one-turn-started.json"), "wx", 0o600);
  await mark.writeFile(JSON.stringify({ at: new Date().toISOString(), maximumTurns: 1 })); await mark.close();
  const scratch = await mkdtemp(join(tmpdir(), "swarm-new-agent-live-"));
  const root = join(scratch, "launch"), selected = join(scratch, "selected");
  await mkdir(root); await mkdir(selected);
  execFileSync("git", ["init", "-q"], { cwd: selected, timeout: 10000 });
  const [executable, nodeExecutable, unshareExecutable, setprivExecutable] = await Promise.all([
    "/tmp/swarm-ide-codex-runtime.70xtjj/codex", "node", "unshare", "setpriv",
  ].map(findTrustedExecutable));
  let starts = 0, turns = 0, cleanup: CleanupEvidence | undefined;
  const prompt = "Reply exactly SWARM_NEW_AGENT_READY. Do not read or modify files or use tools.";
  const store = new FileTrustedLocalStore(join(scratch, "history", "runs.json"));
  const service = new TrustedLocalService({ root, store,
    context: { prepare: async () => { throw new Error("Direct start must not prepare source context"); }, dispose: async () => {} },
    async createSession(onChange, runRoot) {
      assert.equal(runRoot, selected); assert.equal(++starts, 1);
      return new TrustedLocalSession({ root: runRoot, executable, openTransport(sink) {
        const transport = createOwnedCodexTransport({ root: runRoot, executable, nodeExecutable, unshareExecutable, setprivExecutable,
          ownerScript: process.argv[2]!, args: ["app-server", "--listen", "stdio://"] }, sink);
        return { write(line) {
          const message = JSON.parse(line);
          if (message.method === "turn/start") assert.equal(++turns, 1);
          transport.write(line);
        }, async close() { cleanup = await transport.close(); return cleanup; } };
      } }, onChange);
    } });
  const token = randomUUID(); let beforeStop, error: unknown;
  const started = Date.now();
  try {
    await service.request({ protocolVersion: PROTOCOL_VERSION, requestId: randomUUID(), type: "trusted.start", token, text: prompt, model: null }, selected);
    for (;;) {
      const snapshot = service.snapshot(token);
      if (snapshot.status === "ready" || snapshot.status === "failed" || snapshot.approvals.length) { beforeStop = snapshot; break; }
      if (Date.now() - started > 75000) throw new Error("One-turn proof deadline");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(beforeStop.status, "ready", beforeStop.message);
    assert.equal(beforeStop.approvals.length, 0);
    assert.equal(beforeStop.workspace, selected);
    assert(beforeStop.output.slice(beforeStop.output.indexOf(prompt) + prompt.length).includes("SWARM_NEW_AGENT_READY"));
  } catch (cause) { error = cause; }
  finally { await service.shutdown(); }
  const restoredStore = new FileTrustedLocalStore(join(scratch, "history", "runs.json"));
  const retained = await restoredStore.load();
  await restoredStore.close();
  assert.equal(retained[0]?.summary.initialText, prompt);
  const proof = { ok: !error && cleanup?.status === "confirmed", starts, turns, modelOverride: null, preparedSources: 0,
    selectedWorktree: beforeStop?.workspace === selected, exactTextRetained: retained[0]?.summary.initialText === prompt,
    output: beforeStop?.output.slice(-2048), status: beforeStop?.status, cleanup, elapsedMs: Date.now() - started,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}) };
  await writeFile(join(evidence, "proof.json"), JSON.stringify(proof, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(proof));
  if (cleanup?.status === "confirmed") await rm(scratch, { recursive: true, force: true });
  if (!proof.ok) process.exitCode = 1;
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
