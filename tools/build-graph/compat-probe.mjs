// One deliberate real-repository query. No project edits or target compilation.
import assert from "node:assert/strict";
import { mkdtemp, copyFile, mkdir, rm } from "node:fs/promises";
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
  const { BuildGraphProvider, buildInputDigest, queryBuildGraph } = createRequire(import.meta.url)(join(scratch, "core/compat-probe.cjs"));
  const cacheRoot = join(scratch, "query-cache"); await mkdir(cacheRoot);
  let queryCount = 0;
  provider = new BuildGraphProvider(root, "actual-project", "working", { digest: buildInputDigest, now: Date.now,
    async query(queryRoot, signal, trace, options) {
      queryCount++;
      const bytes = await queryBuildGraph(queryRoot, signal, trace, { ...options, cacheRoot });
      const kinds = {}, packages = {};
      let records = 0, largestRecordBytes = 0;
      const text = new TextDecoder().decode(bytes);
      assert.ok(text.endsWith("\n"), "complete final query record");
      for (let offset = 0; offset < text.length;) {
        const end = text.indexOf("\n", offset), line = text.slice(offset, end); offset = end + 1;
        if (!line) continue;
        const row = JSON.parse(line); records++; largestRecordBytes = Math.max(largestRecordBytes, Buffer.byteLength(line));
        kinds[row.type] = (kinds[row.type] ?? 0) + 1;
        const name = row.rule?.name ?? row.sourceFile?.name ?? row.generatedFile?.name ?? row.packageGroup?.name ?? row.environmentGroup?.name;
        const pkg = name?.split(":")[0] ?? "unknown"; packages[pkg] = (packages[pkg] ?? 0) + 1;
      }
      console.log(JSON.stringify({ rawOutputBytes: bytes.length, records, largestRecordBytes, kinds,
        topPackages: Object.entries(packages).sort((a, b) => b[1] - a[1]).slice(0, 8), automaticDownloads: options.allowDownloads,
        proofProcessMaxRssKiB: process.resourceUsage().maxRSS }));
      return bytes;
    },
  });
  let observation = provider.observe(false), previous = "";
  while (observation.status === "refreshing" || observation.status === "stale") {
    const message = JSON.stringify({ status: observation.status, loadingDependencies: observation.loadingDependencies, message: observation.message });
    if (message !== previous) { console.log(message); previous = message; }
    if (Date.now() - started > 135_000) { provider.cancel(); throw new Error("Direct proof exceeded its finite deadline"); }
    await new Promise((resolve) => setTimeout(resolve, 250)); observation = provider.observe();
  }
  console.log(JSON.stringify({ outcome: observation.status, message: observation.message, targets: observation.graph?.targets.length, edges: observation.graph?.edges.length, complete: observation.graph?.complete, elapsedMs: Date.now() - started }));
  assert.equal(observation.status, "current", observation.message);
  assert.ok(observation.graph.targets.length > 0);
  const captured = observation.graph;
  await new Promise((resolve) => setTimeout(resolve, 1600));
  provider.observe();
  while ((observation = provider.observe()).status === "refreshing") await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(observation.graph.observedAt, captured.observedAt, "unchanged automatic sample must reuse the result");
  assert.equal(queryCount, 1, "startup and unchanged passive reads share exactly one query");
  console.log(JSON.stringify({ passiveResultRetained: true, queryCount }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  try { await provider?.dispose(); clean = true; console.log(JSON.stringify({ cleanup: "confirmed" })); }
  finally {
    assert.equal(execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root }).toString(), before, "project worktree status changed");
    if (clean) await rm(scratch, { recursive: true, force: true });
    else console.error(`Cleanup unconfirmed; proof scratch retained: ${scratch}`);
  }
}
