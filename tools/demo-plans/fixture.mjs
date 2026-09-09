// TEST ONLY: ordinary disposable Git source and real CLI-authored task metadata.
// No product provider, parser, source checkout, or user's metadata is mutated.
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { resolveDitzExecutable } from "../task-integration/fixture.mjs";

const sourcePath = "src/main.ts";
const sourceText = "export function main() {\n  const intent = 'explicit plans, ordinary tasks';\n  return intent;\n}\n";
const docPath = "docs/design.md";
const docText = "# Demonstration plan\n\nThis authored plan links ordinary source and CLI-authored tasks.\nA recorded dependency is not dispatch authority.\n";
const demoIndex = {
  version: 1,
  nodes: [
    { id: "plan:demo", kind: "plan", title: "Demonstration plan", parentId: null,
      docs: [docPath], sourcePaths: [sourcePath], taskIds: ["graph-root"],
      contextRefs: [{ kind: "doctrine", path: "docs/doctrine.md", note: "Explicit user intent owns dispatch." }] },
    { id: "component:engine", kind: "component", title: "Planning engine", parentId: "plan:demo",
      docs: [docPath], sourcePaths: [sourcePath], taskIds: ["graph-left", "graph-right"],
      contextRefs: [{ kind: "contract", path: "docs/contract.md", note: "Authored hierarchy and recorded task blockage stay separate." }] },
    { id: "plan:implementation", kind: "plan", title: "Implementation plan", parentId: "component:engine",
      docs: [docPath], sourcePaths: [sourcePath], taskIds: ["graph-join"],
      contextRefs: [{ kind: "lesson", path: "docs/lesson.md", note: "An explicit source link is a candidate, not proof of existence." }] },
  ],
};
const graphTasks = [
  ["graph-root", "Record explicit planning intent"],
  ["graph-left", "Implement the first independent part"],
  ["graph-right", "Implement the second independent part"],
  ["graph-join", "Verify both recorded prerequisites"],
  ["graph-isolated", "Keep independent work visible"],
];

function command(executable, args, cwd, input) {
  const fixtureHome = join(cwd, ".fixture-home");
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, { cwd, encoding: "buffer", timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: fixtureHome, XDG_CONFIG_HOME: fixtureHome, LANG: "C", LC_ALL: "C",
        USER: "Fixture", LOGNAME: "Fixture", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
        GIT_AUTHOR_NAME: "Plans fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "Plans fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } },
    (error, stdout) => error ? reject(new Error(`Plans fixture command failed (${executable}, ${args[0]}): ${error.code ?? "unknown"}`)) : resolve(stdout));
    child.stdin.on("error", () => { /* execFile reports settlement */ });
    child.stdin.end(input);
  });
}
const git = (root, args, input) => command("git", ["-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", ...args], root, input);
const gitText = async (root, args) => (await git(root, args)).toString("utf8").trim();

async function regularOwnedFile(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length > 4096 || isAbsolute(relativePath) ||
      relativePath.split("/").some((part) => !part || part === "." || part === "..") || /[\\\p{Cc}]/u.test(relativePath))
    throw new Error("Expected canonical fixture file reference");
  const file = join(root, relativePath);
  if (await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error("Expected regular contained fixture source");
  return file;
}

/** Optional swarm case archives exact committed source only, with newly authored
 * disposable metadata. It never imports the source repository's task branch. */
async function archiveSwarmSource(root) {
  const source = await realpath(process.env.SWARM_SOURCE_WORKSPACE || process.env.BUILD_WORKSPACE_DIRECTORY || process.cwd());
  const archivedSourceCommit = await gitText(source, ["rev-parse", "--verify", "HEAD"]);
  const archive = await git(source, ["archive", "--format=tar", archivedSourceCommit]);
  await command("tar", ["-xf", "-", "-C", root], root, archive);
  const indexPath = await regularOwnedFile(root, ".swarm/plans.json");
  const indexBytes = await readFile(indexPath);
  if (indexBytes.length > 64 * 1024) throw new Error("Committed plan index exceeds fixture bound");
  const index = JSON.parse(indexBytes.toString("utf8"));
  if (index.version !== 1 || !Array.isArray(index.nodes) || !index.nodes.length || index.nodes.length > 128)
    throw new Error("Expected committed version 1 plan index");
  // These are trusted harness inputs, not renderer-selected CLI arguments. Still
  // bound and validate IDs before creating disposable positive metadata with them.
  const taskIds = new Set();
  for (const node of index.nodes) {
    if (!node || !Array.isArray(node.docs) || !Array.isArray(node.sourcePaths) || !Array.isArray(node.taskIds) || node.taskIds.length > 32)
      throw new Error("Expected explicit committed plan references");
    for (const id of node.taskIds) {
      if (typeof id !== "string" || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid fixture task identity");
      taskIds.add(id);
    }
  }
  if (taskIds.size > 128) throw new Error("Too many CLI fixture tasks");
  const selectedSource = index.nodes.flatMap((node) => node.sourcePaths)[0];
  const selectedDoc = index.nodes.flatMap((node) => node.docs)[0];
  return { index, taskIds: [...taskIds], archivedSourceCommit,
    sourcePath: selectedSource, sourceText: await readFile(await regularOwnedFile(root, selectedSource), "utf8"),
    docPath: selectedDoc, docText: await readFile(await regularOwnedFile(root, selectedDoc), "utf8") };
}

/** parent is the launcher's private mkdtemp beneath the virtual supervisor owner.
 * All files, Git commits, Ditz worktrees and fault injection belong below it. */
export async function createPlanFixture(parent) {
  const privateParent = await realpath(parent);
  const stat = await lstat(privateParent);
  if (!isAbsolute(parent) || privateParent !== parent || !stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    throw new Error("Plans fixture requires an owned private parent");
  const kind = process.env.SWARM_PLANS_CASE || "demo";
  if (!["demo", "swarm", "filters"].includes(kind)) throw new Error("Unknown plans fixture case");
  const ditzExecutable = await resolveDitzExecutable();
  const root = await mkdtemp(join(privateParent, `plans-${kind}-`));
  let authored;
  if (kind === "swarm") authored = await archiveSwarmSource(root);
  else {
    await mkdir(join(root, "src")); await mkdir(join(root, "docs")); await mkdir(join(root, ".swarm"));
    await writeFile(join(root, sourcePath), sourceText);
    await writeFile(join(root, docPath), docText);
    await writeFile(join(root, "docs/doctrine.md"), "# Intent doctrine\n\nRecorded metadata does not authorize agent dispatch.\n");
    await writeFile(join(root, "docs/contract.md"), "# Projection contract\n\nAuthored plan ancestry is separate from task blockage.\n");
    await writeFile(join(root, "docs/lesson.md"), "# Navigation lesson\n\nOnly deliberate activation opens a referenced working file.\n");
    await writeFile(join(root, ".swarm/plans.json"), `${JSON.stringify(demoIndex, null, 2)}\n`);
    await writeFile(join(root, ".gitignore"), ".ditz-worktree/\n.fixture-home/\n");
    authored = { index: demoIndex, sourcePath, sourceText, docPath, docText, taskIds: [], archivedSourceCommit: null };
  }
  await mkdir(join(root, ".fixture-home"), { mode: 0o700 });
  await git(root, ["init", "--object-format=sha1", "-b", "main"]);
  await git(root, ["config", "user.name", "Plans fixture"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  // Also applies to archived repositories without modifying archived .gitignore.
  await writeFile(join(root, ".git/info/exclude"), ".ditz-worktree/\n.fixture-home/\n");
  await git(root, ["add", "--all"]); await git(root, ["commit", "-m", "Owned plans proof source"]);
  const sourceCommit = await gitText(root, ["rev-parse", "HEAD"]);
  const ditz = (args) => command(ditzExecutable, args, root);
  const ditzVersion = (await ditz(["--version"])).toString("utf8").trim();
  await ditz(["init", "--no-onboarding"]);
  for (const [id, title] of graphTasks) {
    await ditz(["add", title, "--id", id, "--type", "task", "--desc", "CLI-authored demo metadata. Recorded blockage is not dispatch readiness."]);
  }
  for (const id of authored.taskIds.filter((id) => !graphTasks.some(([existing]) => existing === id)))
    await ditz(["add", `CLI-authored demo task ${id}`, "--id", id, "--type", "task", "--desc", "Disposable demo metadata matching an explicit committed plan reference; not the source repository's task record."]);
  await ditz(["ref", "graph-root", `${authored.sourcePath}:1`, "--note", "Explicit current working source"]);
  await ditz(["ref", "graph-root", `${authored.docPath}:1`, "--note", "Explicit read-only design document"]);
  for (const [before, after] of [["graph-root", "graph-left"], ["graph-root", "graph-right"], ["graph-left", "graph-join"], ["graph-right", "graph-join"]])
    await ditz(["blocks", before, after]);
  if (kind === "filters") for (const id of ["graph-left", "graph-isolated"])
    await ditz(["close", id, "--reason", "Completed disposable filter proof task"]);
  const metadataCommit = await gitText(root, ["rev-parse", "--verify", "refs/heads/ditz-metadata"]);
  return { root, kind, sourcePath: authored.sourcePath, sourceText: authored.sourceText, docPath: authored.docPath, docText: authored.docText,
    metadataCommit, sourceCommit, ditzExecutable, ditzVersion, index: authored.index,
    archivedSourceCommit: authored.archivedSourceCommit, ...(kind === "swarm" ? { swarmIndex: authored.index } : {}) };
}
