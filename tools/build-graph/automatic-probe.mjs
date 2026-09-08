// Finite real query proof, separate from the mounted hook tests. No model or GUI.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, rm, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildGraphFixture } from "./fixture.mjs";

const scratch = await mkdtemp(join(tmpdir(), "swarm-automatic-build-"));
let provider;
let result;
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch], { timeout: 30_000 });
  await copyFile(process.argv[2], join(scratch, "core/probe.cjs"));
  const { BuildGraphProvider, buildInputDigest, queryBuildGraph } = createRequire(import.meta.url)(join(scratch, "core/probe.cjs"));
  const fixture = await createBuildGraphFixture(scratch, "first");
  await mkdir(join(fixture.root, "tools"));
  await writeFile(join(fixture.root, "tools/bazel"), "#!/bin/sh\nprintf unexpected > wrapper-ran\nexit 81\n", { mode: 0o755 });
  const queries = [];
  provider = new BuildGraphProvider(fixture.root, "automatic-repository", "automatic-world", {
    digest: buildInputDigest, now: Date.now,
    async query(root, signal) {
      const started = performance.now();
      const bytes = await queryBuildGraph(root, signal);
      queries.push({ milliseconds: Math.round(performance.now() - started), bytes: bytes.length });
      return bytes;
    },
  });
  async function settle() {
    const deadline = Date.now() + 40_000;
    let observed = provider.observe(false);
    while (observed.status === "refreshing" || observed.status === "stale") {
      assert.ok(Date.now() < deadline, "query observation deadline");
      await new Promise((resolve) => setTimeout(resolve, 100));
      observed = provider.observe(false);
    }
    assert.equal(observed.status, "current", observed.message);
    return observed;
  }
  const initial = await settle();
  assert.ok(initial.graph.edges.some((edge) => edge.from === fixture.target && edge.to === "//b:library"));
  assert.equal(queries.length, 1);
  await writeFile(join(fixture.root, fixture.sourcePath), "source text changed, dependency membership unchanged\n");
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const sourceOnly = await settle();
  assert.equal(sourceOnly.graph.inputDigest, initial.graph.inputDigest);
  assert.equal(queries.length, 1, "ordinary source edits must not run another query");
  await writeFile(join(fixture.root, "a/BUILD"), fixture.removedDefinition);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const held = provider.observe(false);
  assert.equal(held.status, "refreshing");
  assert.equal(held.graph.inputDigest, initial.graph.inputDigest, "retain original graph during update");
  const updated = await settle();
  assert.notEqual(updated.graph.inputDigest, initial.graph.inputDigest);
  assert.ok(!updated.graph.edges.some((edge) => edge.from === fixture.target && edge.to === "//b:library"));
  assert.equal(queries.length, 2);
  await assert.rejects(access(join(fixture.root, "wrapper-ran")), { code: "ENOENT" });
  result = { passed: true, actualBazelQueries: queries, sourceOnlyExtraQueries: 0,
    actualEdgeRemoved: true, retainedDuringUpdate: true, repositoryWrapperRan: false };
} finally {
  await provider?.dispose();
  await rm(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...result, cleanupComplete: true }));
