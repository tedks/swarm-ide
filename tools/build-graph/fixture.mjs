import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createBuildGraphFixture(parent, kind) {
  if (!["first", "second"].includes(kind)) throw new Error("Unknown owned build graph case");
  const root = await mkdtemp(join(await realpath(parent), `build-graph-${kind}-`));
  await mkdir(join(root, "a")); await mkdir(join(root, "b"));
  const sourcePath = "a/input.txt", sourceText = `ordinary source in ${kind}\n`;
  const target = kind === "first" ? "consumer" : "different";
  await writeFile(join(root, "MODULE.bazel"), `module(name = "${kind}_demo")\n`);
  await writeFile(join(root, "a/BUILD"), `filegroup(name = "${target}", srcs = ["input.txt", "//b:library"])\n`);
  await writeFile(join(root, "b/BUILD.bazel"), 'filegroup(name = "library", srcs = ["data.txt"], visibility = ["//visibility:public"])\nfilegroup(name = "isolated")\n');
  await writeFile(join(root, sourcePath), sourceText); await writeFile(join(root, "b/data.txt"), "payload\n");
  const env = { PATH: process.env.PATH, HOME: parent, LANG: "C", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Build graph proof", GIT_AUTHOR_EMAIL: "proof@example.invalid", GIT_COMMITTER_NAME: "Build graph proof", GIT_COMMITTER_EMAIL: "proof@example.invalid" };
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env, timeout: 10000 });
  git("init", "-q", "-b", "main"); git("add", "--all"); git("commit", "-qm", "Real build graph proof repository");
  return { root, kind, sourcePath, sourceText, target: `//a:${target}`, removedDefinition: `filegroup(name = "${target}", srcs = ["input.txt"])\n`, addedDefinition: `filegroup(name = "${target}", srcs = ["input.txt", "//b:library", "//b:isolated"])\n` };
}
