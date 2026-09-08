// Actual worker routing and owned Bazel processes; an in-process parent port
// supplies the utility-process transport, not a fake build executor.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const scratch = await mkdtemp(join(tmpdir(), "swarm-target-proof-"));
let stopped = false, shutdown;
const deadline = setTimeout(() => { console.error(`Target proof exceeded 100 seconds; scratch retained ${scratch}`); process.exit(1); }, 100_000);
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch], { timeout: 30_000 });
  await copyFile(process.argv[2], join(scratch, "core/target-proof.cjs"));
  const { startCoreWorker, parseCoreRequest, parseCoreResponseForRequest } = createRequire(import.meta.url)(join(scratch, "core/target-proof.cjs"));
  const root = join(scratch, "repo"); await mkdir(root);
  await writeFile(join(root, "MODULE.bazel"), 'module(name="selected_target_proof")\n');
  await writeFile(join(root, "BUILD"), 'platform(name="local_platform")\ngenrule(name="useful",outs=["result.txt"],cmd="sleep 3; echo useful > $@")\ngenrule(name="broken",outs=["broken.txt"],cmd="echo intentional-build-failure >&2; exit 7")\n');
  await writeFile(join(root, ".bazelrc"), 'build --host_platform=//:local_platform\nbuild --platforms=//:local_platform\nbuild --repository_disable_download\nbuild --lockfile_mode=off\n');
  const git = (...args) => execFileSync("git", args, { cwd: root, timeout: 10_000, stdio: "pipe" });
  git("init", "-q"); git("add", "."); git("-c", "user.name=Swarm proof", "-c", "user.email=proof@localhost", "commit", "-qm", "Actual target proof");
  process.env.SWARM_WORKSPACE_ROOT = root;
  delete process.env.SWARM_AGENT_STORE_ROOT; delete process.env.SWARM_EXTERNAL_AGENTS_REGISTRY;
  const port = new EventEmitter(); process.parentPort = port;
  const responses = new Map(); let readyResolve, shutdownResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const closed = new Promise((resolve) => { shutdownResolve = resolve; });
  port.postMessage = (message) => {
    if (message.type === "core.ready") readyResolve();
    else if (message.type === "core.failed") throw new Error("Actual core registration failed");
    else if (message.type === "core.shutdown.ready") { stopped = true; shutdownResolve(); }
    else if (message.requestId) { responses.get(message.requestId)?.(message); responses.delete(message.requestId); }
  };
  let next = 0;
  const send = (input) => {
    const request = parseCoreRequest({ protocolVersion: 7, requestId: `proof-${++next}`, ...input });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { responses.delete(request.requestId); reject(new Error(`No response for ${request.type}`)); }, 10_000);
      responses.set(request.requestId, (message) => { clearTimeout(timeout); try { resolve(parseCoreResponseForRequest(message, request)); } catch (error) { reject(error); } });
      port.emit("message", { data: request });
    });
  };
  shutdown = async () => { port.emit("message", { data: { type: "core.shutdown" } }); await closed; };
  startCoreWorker(); await ready;
  const initial = await send({ type: "workspace.snapshot" }); assert.equal(initial.ok, true);
  const identity = { repositoryId: initial.snapshot.project.id, worldId: initial.snapshot.world.id };
  const read = async () => { const response = await send({ ...identity, type: "build.observe" }); assert.equal(response.ok, true); return response.buildJobs; };
  const wrong = await send({ ...identity, repositoryId: "wrong", type: "build.start", target: "//:useful" }); assert.equal(wrong.ok, false);
  const milestones = [];
  for (const [target, status] of [["//:useful", "succeeded"], ["//:broken", "failed"]]) {
    const admission = await send({ ...identity, type: "build.start", target }); assert.equal(admission.ok, true);
    assert.equal(admission.buildJobs.jobs[0].target, target);
    for (;;) {
      const state = await read(), job = state.jobs.find((item) => item.target === target);
      if (job.status === "running" && !milestones.some((item) => item.message === job.message)) milestones.push({ target, message: job.message, elapsedMs: job.elapsedMs });
      if (job.status !== "running") { assert.equal(job.status, status, JSON.stringify(job)); assert.equal(job.cleanup, "confirmed"); break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const before = await read(); assert.equal(before.jobs.length, 2);
  assert.match(before.jobs[0].output, /intentional-build-failure/);
  assert.ok(milestones.some((item) => item.target === "//:useful" && item.message.startsWith("Configured //:useful")), JSON.stringify(milestones));
  // Editing source and publishing a new workspace snapshot must not clear jobs.
  const source = await send({ type: "file.read", path: "BUILD" }); assert.equal(source.ok, true);
  const changed = await send({ type: "file.write", path: "BUILD", expectedRevision: source.file.revision, content: `${source.file.content}\n# changed through the real editor broker\n` });
  assert.equal(changed.ok, true); assert.ok(changed.file.workingFingerprint);
  assert.deepEqual((await read()).jobs, before.jobs);
  await shutdown();
  console.log(JSON.stringify({ passed: true, actualWorkerRouting: true, targets: before.jobs, beforeExitMilestones: milestones, retainedAfterSourceChange: true, ownedCleanup: stopped }, null, 2));
} finally {
  if (!stopped && shutdown) await shutdown();
  clearTimeout(deadline);
  if (stopped) await rm(scratch, { recursive: true, force: true });
  else console.error(`Unconfirmed cleanup; scratch retained at ${scratch}`);
}
