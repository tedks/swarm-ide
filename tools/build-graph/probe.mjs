// Owned finite diagnostic: exact production query module, no GUI or model.
import { mkdtemp, mkdir, copyFile, rm, readlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuildGraphFixture } from "./fixture.mjs";
const scratch = await mkdtemp(join(tmpdir(), "swarm-build-probe-"));
let provider;
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch]);
  await copyFile(process.argv[2], join(scratch, "core/probe.cjs"));
  const { BuildGraphProvider, buildInputDigest, queryBuildGraph } = createRequire(import.meta.url)(join(scratch, "core/probe.cjs"));
  const fixture = await createBuildGraphFixture(scratch, "first");
  provider = new BuildGraphProvider(fixture.root, "probe-repository", "probe-world", { digest: buildInputDigest, now: Date.now,
    query: (root, signal) => queryBuildGraph(root, signal, (event, value) => console.log(JSON.stringify({ event, value }))) });
  let last;
  for (let i = 0; i < 80; i++) {
    const value = provider.observe();
    const digest = await buildInputDigest(fixture.root, new AbortController().signal);
    const line = JSON.stringify({ status: value.status, generation: value.generation, message: value.message, input: digest, graph: value.graph?.inputDigest, targets: value.graph?.targets.length });
    if (line !== last) {
      console.log(line); last = line;
      const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: fixture.root }).toString().split("\0").filter(Boolean);
      console.log(JSON.stringify(await Promise.all(files.map(async (path) => ({ path, link: await readlink(join(fixture.root, path)).catch(() => null) })))));
    }
    if (value.status === "error" || value.status === "current") { if (value.status === "error") process.exitCode = 1; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
} finally { await provider?.dispose(); await rm(scratch, { recursive: true, force: true }); }
