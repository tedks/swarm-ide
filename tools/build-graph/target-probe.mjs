// Actual worker routing and owned Bazel processes; an in-process parent port
// supplies the utility-process transport, not a fake build executor.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, chmod, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const scratch = await mkdtemp(join(tmpdir(), "swarm-target-proof-"));
let stopped = false, shutdown;
const deadline = setTimeout(() => { console.error(`Target proof exceeded 180 seconds; scratch retained ${scratch}`); process.exit(1); }, 180_000);
try {
  execFileSync("tar", ["-xzf", process.argv[3], "-C", scratch], { timeout: 30_000 });
  await copyFile(process.argv[2], join(scratch, "core/target-proof.cjs"));
  const { startCoreWorker, parseCoreRequest, parseCoreResponseForRequest } = createRequire(import.meta.url)(join(scratch, "core/target-proof.cjs"));
  const root = join(scratch, "repo"); await mkdir(root);
  const system = process.arch === "arm64" ? "aarch64-linux" : "x86_64-linux";
  await copyFile(join(process.cwd(), "flake.lock"), join(root, "flake.lock"));
  const lockedFlake = await readFile(join(root, "flake.lock"), "utf8");
  const locked = JSON.parse(lockedFlake), nixpkgsLock = locked.nodes[locked.nodes.root.inputs.nixpkgs];
  assert.deepEqual(nixpkgsLock.original, { owner: "NixOS", ref: "nixos-unstable", repo: "nixpkgs", type: "github" });
  await writeFile(join(root, "flake.nix"), `{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    pkgs = nixpkgs.legacyPackages.${system};
    proof = pkgs.writeShellScriptBin "swarm-dev-shell-proof" ''
      printf 'dev-shell-tool-ran\\n'
    '';
  in { devShells.${system}.default = pkgs.mkShell { packages = [ proof ]; }; };
}
`);
  await writeFile(join(root, "MODULE.bazel"), 'module(name="selected_target_proof")\nbazel_dep(name="platforms",version="0.0.9")\nlocal_path_override(module_name="platforms",path="offline-platforms")\n');
  // Bazel's test wrapper consults the Windows constraint even on Linux. Supply
  // that constraint locally, with no downloads or host-machine cache reliance.
  await mkdir(join(root, "offline-platforms/os"), { recursive: true });
  await writeFile(join(root, "offline-platforms/MODULE.bazel"), 'module(name="platforms",version="0.0.9",compatibility_level=1)\n');
  await writeFile(join(root, "offline-platforms/os/BUILD"), 'package(default_visibility=["//visibility:public"])\nconstraint_setting(name="os")\nconstraint_value(name="windows",constraint_setting=":os")\n');
  // A real executable test rule avoids sh_test's unrelated C++ launcher
  // toolchain, keeping this fixture independent of remote repositories.
  await writeFile(join(root, "fixture.bzl"), 'def _fixture_test(ctx):\n    ctx.actions.symlink(output=ctx.outputs.executable,target_file=ctx.file.src,is_executable=True)\n    return [DefaultInfo(executable=ctx.outputs.executable)]\nfixture_test=rule(implementation=_fixture_test,test=True,attrs={"src":attr.label(allow_single_file=True,mandatory=True)})\n');
  await writeFile(join(root, "BUILD"), 'load(":fixture.bzl","fixture_test")\nplatform(name="local_platform")\ngenrule(name="environment_build",outs=["environment.txt"],cmd="swarm-dev-shell-proof > $@")\ngenrule(name="useful",outs=["result.txt"],cmd="sleep 3; echo useful > $@")\ngenrule(name="broken",outs=["broken.txt"],cmd="echo intentional-build-failure >&2; exit 7")\nfixture_test(name="environment_test",src="environment.sh")\nfixture_test(name="passing_test",src="passing.sh",tags=["manual"])\nfixture_test(name="failing_test",src="failing.sh")\n');
  await writeFile(join(root, "environment.sh"), '#!/bin/sh\nset -eu\nswarm-dev-shell-proof\n');
  await writeFile(join(root, "passing.sh"), '#!/bin/sh\necho actual-test-passed\nexit 0\n');
  await writeFile(join(root, "failing.sh"), '#!/bin/sh\necho intentional-test-failure >&2\nexit 9\n');
  await chmod(join(root, "environment.sh"), 0o755); await chmod(join(root, "passing.sh"), 0o755); await chmod(join(root, "failing.sh"), 0o755);
  await writeFile(join(root, ".bazelrc"), 'build --host_platform=//:local_platform\nbuild --platforms=//:local_platform\nbuild --repository_disable_download\nbuild --lockfile_mode=off\nbuild --action_env=PATH\ntest --test_env=PATH\ntest --nobuild\ntest --test_tag_filters=-manual\n');
  const git = (...args) => execFileSync("git", args, { cwd: root, timeout: 10_000, stdio: "pipe" });
  git("init", "-q"); git("add", "."); git("-c", "user.name=Swarm proof", "-c", "user.email=proof@localhost", "commit", "-qm", "Actual target proof");
  const runtimeBin = join(scratch, "runtime-bin"); await mkdir(runtimeBin);
  const runtimePrograms = { node: process.execPath, ...Object.fromEntries(["git", "nix", "setpriv", "unshare"].map((name) =>
    [name, execFileSync("which", [name], { encoding: "utf8" }).trim()])) };
  for (const [name, path] of Object.entries(runtimePrograms)) await symlink(path, join(runtimeBin, name));
  process.env.PATH = runtimeBin;
  for (const name of ["IN_NIX_SHELL", "NIX_BUILD_TOP", "NIX_BUILD_CORES", "NIX_LDFLAGS", "NIX_CFLAGS_COMPILE"]) delete process.env[name];
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
  for (const [target, operation, status] of [["//:environment_build", undefined, "succeeded"], ["//:environment_test", "test", "succeeded"],
    ["//:useful", undefined, "succeeded"], ["//:broken", undefined, "failed"],
    ["//:failing_test", "build", "succeeded"], ["//:passing_test", "test", "succeeded"], ["//:failing_test", "test", "failed"], ["//:useful", "test", "failed"]]) {
    const admission = await send({ ...identity, type: "build.start", target, ...(operation ? { operation } : {}) }); assert.equal(admission.ok, true);
    assert.equal(admission.buildJobs.jobs[0].target, target);
    assert.equal(admission.buildJobs.jobs[0].operation, operation ?? "build");
    for (;;) {
      const state = await read(), job = state.jobs.find((item) => item.target === target);
      if (job.status === "running" && !milestones.some((item) => item.message === job.message)) milestones.push({ target, message: job.message, elapsedMs: job.elapsedMs });
      if (job.status !== "running") {
        assert.equal(job.status, status, JSON.stringify(job)); assert.equal(job.cleanup, "confirmed");
        if (operation === "test") assert.match(job.message, status === "succeeded" ? /^Tests passed$/ : /^Tests failed:/);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const cancelName = `swarm-cancel-${process.pid}-${Date.now()}`;
  await writeFile(join(root, "flake.nix"), `{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    pkgs = nixpkgs.legacyPackages.${system};
    cancelProof = pkgs.runCommand "${cancelName}" {} "sleep 10; mkdir -p $out";
  in {
    packages.${system}.cancelProof = cancelProof;
    devShells.${system}.default = pkgs.mkShell { packages = [ cancelProof ]; };
  };
}
`);
  const cancelOutput = execFileSync(runtimePrograms.nix,
    ["eval", "--no-update-lock-file", "--raw", `.#packages.${system}.cancelProof`],
    { cwd: root, encoding: "utf8", timeout: 30_000 }).trim();
  const cancelAdmission = await send({ ...identity, type: "build.start", target: "//:environment_build" });
  assert.equal(cancelAdmission.ok, true); const cancelJobId = cancelAdmission.buildJobs.jobs[0].id;
  for (;;) {
    const job = (await read()).jobs.find((item) => item.id === cancelJobId);
    if (job.message === "Preparing project development environment") break;
    assert.equal(job.status, "running", JSON.stringify(job));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const cancelResponse = await send({ ...identity, type: "build.cancel", jobId: cancelJobId }); assert.equal(cancelResponse.ok, true);
  for (;;) {
    const job = (await read()).jobs.find((item) => item.id === cancelJobId);
    if (job.status !== "running" && job.status !== "stopping") {
      assert.equal(job.status, "cancelled", JSON.stringify(job)); assert.equal(job.cleanup, "confirmed");
      assert.match(job.output, new RegExp(`building '.+${cancelName}\\.drv'`));
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  assert.throws(() => execFileSync(runtimePrograms.nix, ["path-info", cancelOutput],
    { cwd: root, timeout: 10_000, stdio: "pipe" }), /Command failed/);
  assert.equal(await readFile(join(root, "flake.lock"), "utf8"), lockedFlake);
  const before = await read(); assert.equal(before.jobs.length, 9);
  assert.match(before.jobs.find((job) => job.target === "//:broken").output, /intentional-build-failure/);
  assert.match(before.jobs.find((job) => job.target === "//:failing_test" && job.operation === "test").output, /intentional-test-failure/);
  const noTests = before.jobs.find((job) => job.target === "//:useful" && job.operation === "test");
  assert.equal(noTests.exitCode, 4); assert.match(noTests.message, /no tests were found/);
  assert.ok(milestones.some((item) => item.target === "//:useful" && item.message.startsWith("Configured //:useful")), JSON.stringify(milestones));
  assert.ok(milestones.some((item) => item.target === "//:environment_build" && item.message === "Preparing project development environment"), JSON.stringify(milestones));
  // Editing source and publishing a new workspace snapshot must not clear jobs.
  const source = await send({ type: "file.read", path: "BUILD" }); assert.equal(source.ok, true);
  const changed = await send({ type: "file.write", path: "BUILD", expectedRevision: source.file.revision, content: `${source.file.content}\n# changed through the real editor broker\n` });
  assert.equal(changed.ok, true); assert.ok(changed.file.workingFingerprint);
  assert.deepEqual((await read()).jobs, before.jobs);
  const query = await send({ ...identity, type: "buildGraph.observe", refresh: true }); assert.equal(query.ok, true);
  assert.equal(query.buildGraph.status, "refreshing");
  for (;;) {
    const queried = await send({ ...identity, type: "buildGraph.observe", refresh: false }); assert.equal(queried.ok, true);
    if (queried.buildGraph.status === "current") break;
    assert.equal(queried.buildGraph.status, "refreshing", JSON.stringify(queried.buildGraph));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.deepEqual((await read()).jobs, before.jobs);
  await shutdown();
  console.log(JSON.stringify({ passed: true, actualWorkerRouting: true, lockedFlakeDevelopmentEnvironment: true,
    lockRemainedByteIdentical: true, daemonPreparationCancelled: true,
    scrubbedRuntimePathCommands: Object.keys(runtimePrograms).sort(), actualPassingAndFailingTests: true, noTestsFails: true,
    buildOnlyDoesNotPassFailingTests: true, explicitTestOverridesNoBuildAndManualFilter: true, targets: before.jobs, beforeExitMilestones: milestones,
    retainedAfterBrokerSaveAndCompletedDependencyQuery: true, ownedCleanup: stopped }, null, 2));
} finally {
  if (!stopped && shutdown) await shutdown();
  clearTimeout(deadline);
  if (stopped) await rm(scratch, { recursive: true, force: true });
  else console.error(`Unconfirmed cleanup; scratch retained at ${scratch}`);
}
