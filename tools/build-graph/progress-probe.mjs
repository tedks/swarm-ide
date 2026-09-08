// Actual disposable Bazel build, owned namespace; no IDE model or physical GUI.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const scratch = await mkdtemp(join(tmpdir(), "swarm-bep-proof-"));
let reader, cleanupConfirmed = false;
const seen = [];
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch], { timeout: 30_000 });
  await copyFile(process.argv[2], join(scratch, "core/progress-proof.cjs"));
  const { watchBuildProgress, collectBuildQuery, createOwnedCodexTransport } = createRequire(import.meta.url)(join(scratch, "core/progress-proof.cjs"));
  const root = join(scratch, "repo"); await mkdir(root);
  await writeFile(join(root, "MODULE.bazel"), 'module(name = "bep_live_proof")\n');
  // A local platform avoids fetching Bazel's default @platforms repository.
  await writeFile(join(root, "BUILD"), 'platform(name="test_platform")\ngenrule(name="slow", outs=["out.txt"], cmd="sleep 4; echo done > $@")\n');
  const events = join(scratch, "events.jsonl"), started = performance.now();
  let exited = false;
  reader = watchBuildProgress(events, (message) => seen.push({ milliseconds: Math.round(performance.now() - started), beforeExit: !exited, message }));
  await collectBuildQuery((sink) => {
    const transport = createOwnedCodexTransport({ root, executable: process.env.SWARM_BAZEL_BIN,
    nodeExecutable: process.execPath, unshareExecutable: process.argv[4], setprivExecutable: process.argv[5], ownerScript: join(scratch, "core/agents/owner-process.js"),
    args: ["--batch", "--ignore_all_rc_files", "--host_jvm_args=-Xmx512m", "--host_jvm_args=-XX:ActiveProcessorCount=3", `--server_javabase=${process.env.SWARM_BAZEL_JAVA_HOME}`,
      `--output_user_root=${join(scratch, "bazel")}`, "build", "//:slow", "--jobs=3", "--repository_disable_download", "--lockfile_mode=off", "--host_platform=//:test_platform", "--platforms=//:test_platform", "--color=no", "--curses=no", `--build_event_json_file=${events}`] },
    { ...sink, exit(code) { exited = true; sink.exit(code); } });
    return { ...transport, async close() { const evidence = await transport.close(); cleanupConfirmed = evidence.status === "confirmed"; return evidence; } };
  }, new AbortController().signal);
  await reader.stop();
  assert.ok(seen.some((event) => event.beforeExit && event.message.startsWith("Configured //:slow")), "a real configured-target milestone must arrive before process exit");
  assert.ok(seen.every((event) => event.message.length <= 300));
  console.log(JSON.stringify({ passed: true, actualBuild: "//:slow", milestones: seen, ownedProcessCleanup: true }));
} finally {
  await reader?.stop();
  if (cleanupConfirmed) await rm(scratch, { recursive: true, force: true });
  else console.error(`Build proof did not attest success; diagnostic scratch retained at ${scratch}`);
}
