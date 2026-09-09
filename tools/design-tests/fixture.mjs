// Ordinary authored Git/Bazel inputs, not mocked provider or renderer state.
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createDesignTestFixture(parent, environment) {
  const root = await mkdtemp(join(await realpath(parent), "component-tests-"));
  for (const directory of ["docs", ".swarm"]) await mkdir(join(root, directory));
  const component = { id: "component:checks", title: "Repository checks" };
  const docPath = "docs/checks.md", docText = "# Repository checks\n\nThese tests exercise the current repository without a model.\n";
  const sourcePath = "input.txt", sourceText = "Component source remains untouched.\n";
  const targets = [
    { label: "//:passing_test", role: "Passing real executable test" },
    { label: "//:failing_test", role: "Failing real executable test" },
    { label: "//:misleading-checks", role: "A binary, despite its name" },
    { label: "//:assets", role: "Ordinary filegroup" },
  ];
  const index = { version: 1, nodes: [
    { id: "plan:system", kind: "plan", title: "Component test proof", parentId: null,
      docs: ["docs/system.md"], sourcePaths: [], taskIds: [], contextRefs: [] },
    { ...component, kind: "component", parentId: "plan:system", docs: [docPath], sourcePaths: [sourcePath], taskIds: [], contextRefs: [],
      design: { summary: "Authored target mappings use actual Bazel rule classes.", state: "implemented", connections: [],
        buildTargets: targets.map((target) => ({ ...target, dependencies: [] })) } },
  ] };
  await writeFile(join(root, "MODULE.bazel"), 'module(name = "component_test_proof")\nbazel_dep(name = "platforms", version = "0.0.9")\nlocal_path_override(module_name = "platforms", path = "offline-platforms")\n');
  // The real test wrapper consults this Windows constraint even on Linux.
  // Keep the proof independent of remote repositories and host Bazel caches.
  await mkdir(join(root, "offline-platforms/os"), { recursive: true });
  await writeFile(join(root, "offline-platforms/MODULE.bazel"), 'module(name = "platforms", version = "0.0.9", compatibility_level = 1)\n');
  await writeFile(join(root, "offline-platforms/os/BUILD"), 'package(default_visibility = ["//visibility:public"])\nconstraint_setting(name = "os")\nconstraint_value(name = "windows", constraint_setting = ":os")\n');
  // Genuine executable test and non-test rules avoid native sh_test's
  // unrelated C++ launcher toolchain. Native rule classification is unit-tested.
  await writeFile(join(root, "fixture.bzl"), `def _executable(ctx):
    ctx.actions.symlink(output = ctx.outputs.executable, target_file = ctx.file.src, is_executable = True)
    return [DefaultInfo(executable = ctx.outputs.executable)]
fixture_test = rule(implementation = _executable, test = True, attrs = {"src": attr.label(allow_single_file = True, mandatory = True)})
fixture_binary = rule(implementation = _executable, executable = True, attrs = {"src": attr.label(allow_single_file = True, mandatory = True)})
`);
  await writeFile(join(root, "BUILD"), `load(":fixture.bzl", "fixture_test", "fixture_binary")
platform(name = "local_platform")
fixture_test(name = "passing_test", src = "passing.sh")
fixture_test(name = "failing_test", src = "failing.sh")
fixture_binary(name = "misleading-checks", src = "misleading.sh")
filegroup(name = "assets", srcs = ["input.txt"])
`);
  await writeFile(join(root, ".bazelrc"), "build --host_platform=//:local_platform\nbuild --platforms=//:local_platform\nbuild --repository_disable_download\nbuild --lockfile_mode=off\n");
  await writeFile(join(root, "passing.sh"), "#!/bin/sh\necho component-test-passed\nexit 0\n");
  await writeFile(join(root, "failing.sh"), "#!/bin/sh\necho intentional-component-test-failure >&2\nexit 7\n");
  await writeFile(join(root, "misleading.sh"), "#!/bin/sh\necho executable-not-a-test\nexit 0\n");
  for (const script of ["passing.sh", "failing.sh", "misleading.sh"]) await chmod(join(root, script), 0o755);
  await writeFile(join(root, docPath), docText);
  await writeFile(join(root, "docs/system.md"), "# Component test proof\n\nSelect Repository checks to read its design and run its targets.\n");
  await writeFile(join(root, sourcePath), sourceText);
  await writeFile(join(root, ".swarm/plans.json"), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(join(root, ".gitignore"), "bazel-*\n");
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root, env: { ...environment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
    timeout: 10000, encoding: "utf8", stdio: "pipe",
  }).trim();
  git("init", "-q", "-b", "main"); git("add", "--all");
  git("-c", "user.name=Component test proof", "-c", "user.email=proof@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Disposable component test repository");
  return { root, component, docPath, docText, sourcePath, sourceText, index, commit: git("rev-parse", "HEAD") };
}
