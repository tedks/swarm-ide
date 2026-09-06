import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const metadataRef = "refs/heads/ditz-metadata";
const owned = new WeakMap();
let installedDitz;

function command(executable, args, cwd, env, input = "") {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, { cwd, env, encoding: "utf8", timeout: 30_000,
      killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error(`Task fixture command failed (${path.basename(executable)}, ${args[0]}): ${error.code ?? "unknown"}`));
      else resolve(stdout.trim());
    });
    child.stdin.on("error", () => { /* execFile reports process settlement */ });
    child.stdin.end(input);
  });
}

/** Resolve the already installed Nix package offline; never fetch in acceptance. */
export async function resolveDitzExecutable() {
  installedDitz ??= command("nix", ["shell", "--offline", "github:tedks/ditz#ditz", "--command", "which", "ditz"],
    process.cwd(), process.env).then(realpath);
  const executable = await installedDitz;
  if (!executable.startsWith("/nix/store/") || !executable.endsWith("/bin/ditz")) throw new Error("Expected installed Nix Ditz executable");
  return executable;
}

function state(fixture) {
  const value = owned.get(fixture);
  if (!value) throw new Error("Task fixture is not owned by this helper instance");
  return value;
}

async function revision(git) {
  return Object.freeze({ algorithm: "sha1", hex: await git(["rev-parse", "--verify", metadataRef]) });
}

/** All source files and metadata are disposable inputs, never product fixtures.
 * The caller owns parentDir and removes it after all providers/processes stop. */
export async function createTaskFixture(parentDir, options = {}) {
  const executable = options.ditzExecutable ? await realpath(options.ditzExecutable) : await resolveDitzExecutable();
  if (!executable.startsWith("/nix/store/") || !executable.endsWith("/bin/ditz")) throw new Error("Expected installed Nix Ditz executable");
  const root = await mkdtemp(path.join(await realpath(parentDir), "task-repository-"));
  const fixtureHome = path.join(root, ".fixture-home");
  await mkdir(fixtureHome);
  const env = { PATH: process.env.PATH, HOME: fixtureHome, XDG_CONFIG_HOME: fixtureHome,
    LANG: "C", LC_ALL: "C", USER: "Fixture", LOGNAME: "Fixture",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Task fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Task fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
  const git = (args, input) => command("git", ["-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", ...args], root, env, input);
  const ditz = (args) => command(executable, args, root, env);
  const taskId = "task-browser-primary";
  const secondId = "task-browser-secondary";
  const sourcePath = "src/task-target.ts";
  const sourceLine = 3;
  const missingPath = "src/missing-task-target.ts";
  const docPath = "docs/task-note.md";
  const title = '<img src=x onerror="globalThis.__taskLiteralExecuted=true"> literal task';
  const description = '<script>globalThis.__taskLiteralExecuted=true</script>\nLiteral metadata, not executable instructions.\nOnly explicit file references are navigable.';
  const sourceText = "export const taskFixture = true;\n\nexport function taskTarget() {\n  return \"current working source\";\n}\n";
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, sourcePath), sourceText);
  await writeFile(path.join(root, docPath), "# CLI-authored task reference\n\nThis is ordinary source text, not rendered HTML.\n");
  await writeFile(path.join(root, ".gitignore"), ".ditz-worktree/\n.fixture-home/\n");
  await git(["init", "--object-format=sha1", "-b", "main"]);
  await git(["config", "user.name", "Task fixture"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await git(["add", "."]);
  await git(["commit", "-m", "Disposable task browser source"]);
  const sourceCommit = Object.freeze({ algorithm: "sha1", hex: await git(["rev-parse", "HEAD"]) });
  const ditzVersion = await ditz(["--version"]);
  await ditz(["init", "--no-onboarding"]);
  await ditz(["add", title, "--id", taskId, "--desc", description, "--type", "task"]);
  await ditz(["add", "Secondary CLI-authored task", "--id", secondId, "--desc", "Recorded dependency, not a dispatch queue.", "--type", "feature"]);
  await ditz(["ref", taskId, `${sourcePath}:${sourceLine}`, "--note", "Explicit current working file"]);
  await ditz(["ref", taskId, `${missingPath}:2`, "--note", "Deliberately missing file"]);
  await ditz(["ref", taskId, `${docPath}:1`, "--note", "Read this document as literal source"]);
  await ditz(["ref", taskId, "../outside-task-root.ts", "--note", "Unsupported reference must remain literal"]);
  await ditz(["blocks", taskId, secondId]);
  const firstCommit = await revision(git);
  const fixture = Object.freeze({ root, firstCommit, sourceCommit, taskId, secondId,
    sourcePath, sourceLine, missingPath, docPath, sourceText, title, description, ditzVersion, ditzExecutable: executable });
  owned.set(fixture, { git, ditz, validRevisions: new Set([firstCommit.hex]) });
  return fixture;
}

export async function advanceTaskFixture(fixture) {
  const { git, ditz, validRevisions } = state(fixture);
  await ditz(["set", fixture.taskId, "--title", "Updated CLI-authored primary task", "--status", "in_progress"]);
  const result = await revision(git);
  validRevisions.add(result.hex);
  return result;
}

/** Explicit Git-structure fault injection, NOT claimed to be CLI-authored YAML.
 * Replaces the metadata directory with a source blob in a new disposable commit. */
export async function invalidateTaskFixture(fixture) {
  const { git } = state(fixture);
  const previous = await revision(git);
  const sourceBlob = await git(["rev-parse", `${fixture.sourceCommit.hex}:${fixture.sourcePath}`]);
  const tree = await git(["mktree"], `100644 blob ${sourceBlob}\t.ditz\n`);
  const hex = await git(["commit-tree", tree, "-p", previous.hex, "-m", "TEST FAULT: metadata directory replaced by source blob"]);
  await git(["update-ref", metadataRef, hex, previous.hex]);
  return Object.freeze({ algorithm: "sha1", hex });
}

export async function restoreTaskFixture(fixture, commit) {
  const { git, validRevisions } = state(fixture);
  if (commit?.algorithm !== "sha1" || !validRevisions.has(commit.hex)) throw new Error("Revision was not authored by this fixture");
  await git(["update-ref", metadataRef, commit.hex]);
}

export async function removeTaskMetadata(fixture) {
  const { git } = state(fixture);
  const previous = await revision(git);
  await git(["update-ref", "-d", metadataRef, previous.hex]);
}
