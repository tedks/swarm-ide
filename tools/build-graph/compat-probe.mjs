// One deliberate real-repository query. No project edits or target compilation.
import assert from "node:assert/strict";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve(process.argv[4]);
const scratch = await mkdtemp(join(tmpdir(), "swarm-query-compat-proof-"));
let provider, clean = false;
const before = execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root }).toString();
const started = Date.now();
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch], { timeout: 30_000 });
  await copyFile(process.argv[2], join(scratch, "core/compat-probe.cjs"));
  const { BuildGraphProvider } = createRequire(import.meta.url)(join(scratch, "core/compat-probe.cjs"));
  provider = new BuildGraphProvider(root, "actual-project", "working");
  let observation = provider.observe(true), previous = "";
  while (observation.status === "refreshing" || observation.status === "stale") {
    const message = JSON.stringify({ status: observation.status, loadingDependencies: observation.loadingDependencies, message: observation.message });
    if (message !== previous) { console.log(message); previous = message; }
    if (Date.now() - started > 135_000) { provider.cancel(); throw new Error("Direct proof exceeded its finite deadline"); }
    await new Promise((resolve) => setTimeout(resolve, 250)); observation = provider.observe();
  }
  console.log(JSON.stringify({ outcome: observation.status, message: observation.message, targets: observation.graph?.targets.length, edges: observation.graph?.edges.length, elapsedMs: Date.now() - started }));
  assert.equal(observation.status, "current", observation.message);
  assert.ok(observation.graph.targets.length > 0);
  const captured = observation.graph;
  await new Promise((resolve) => setTimeout(resolve, 1600));
  provider.observe();
  while ((observation = provider.observe()).status === "refreshing") await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(observation.graph.observedAt, captured.observedAt, "unchanged automatic sample must reuse the result");
  console.log(JSON.stringify({ passiveResultRetained: true }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  try { await provider?.dispose(); clean = true; console.log(JSON.stringify({ cleanup: "confirmed" })); }
  finally {
    assert.equal(execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root }).toString(), before, "project worktree status changed");
    if (clean) await rm(scratch, { recursive: true, force: true });
    else console.error(`Cleanup unconfirmed; proof scratch retained: ${scratch}`);
  }
}
