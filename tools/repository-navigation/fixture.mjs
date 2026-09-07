// Test inputs are ordinary disposable Git repositories, never injected core data.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDitzExecutable } from "../task-integration/fixture.mjs";

export const NAVIGATION_CASES = Object.freeze(["swarm", "unfamiliar", "invalid-name", "fingerprint-budget"]);
const sourceText = "export function main() {\n  return 'unfamiliar repository';\n}\n";
function command(executable, args, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, { cwd, encoding: "buffer", timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: join(cwd, ".fixture-home"), XDG_CONFIG_HOME: join(cwd, ".fixture-home"), LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Navigation proof", GIT_AUTHOR_EMAIL: "proof@example.invalid",
        GIT_COMMITTER_NAME: "Navigation proof", GIT_COMMITTER_EMAIL: "proof@example.invalid" } },
    (error, stdout) => error ? reject(new Error(`Navigation fixture ${executable} ${args[0]} failed: ${error.code}`)) : resolve(stdout));
    child.stdin.on("error", () => {}); child.stdin.end(input);
  });
}
const git = (root, args, input) => command("git", ["-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", ...args], root, input);

export async function createNavigationFixture(parent, kind, source) {
  if (!NAVIGATION_CASES.includes(kind)) throw new Error("Unknown navigation fixture");
  const root = await mkdtemp(join(await realpath(parent), `navigation-${kind}-`));
  let sourceCommit = null;
  if (kind === "swarm") {
    const origin = await realpath(source);
    sourceCommit = (await git(origin, ["rev-parse", "--verify", "HEAD"])).toString("utf8").trim();
    // Archive committed source bytes, without source dependencies, .git aliases,
    // local worktree changes, remote access or references to the watched checkout.
    const archive = await git(origin, ["archive", "--format=tar", sourceCommit]);
    await command("tar", ["-xf", "-", "-C", root], parent, archive);
  } else {
    await mkdir(join(root, "src")); await mkdir(join(root, "docs"));
    await writeFile(join(root, "src/main.ts"), sourceText);
    await writeFile(join(root, "docs/readme.md"), "# Ordinary local repository\n");
    await writeFile(join(root, ".hidden"), "tracked dotfile\n");
    await writeFile(join(root, ".gitignore"), "ignored.txt\nlarge/\npipe\nnested/\nsubmodule/\n.ditz-worktree/\n.fixture-home/\n");
  }
  const searchPath = kind === "swarm" ? "protocol/common.ts" : "docs/readme.md";
  if (["swarm", "unfamiliar"].includes(kind)) {
    await mkdir(join(root, "search-proof/a"), { recursive: true }); await mkdir(join(root, "search-proof/b"));
    await writeFile(join(root, "search-proof/a/same-match.ts"), "export const source = 'a';\n");
    await writeFile(join(root, "search-proof/b/same-match.ts"), "export const source = 'b';\n");
    await writeFile(join(root, "search-proof/literal [*] $(not-command).txt"), "literal shell-looking name, not a command\n");
    await writeFile(join(root, "search-proof/.dot-match"), "tracked dotfile\n");
  }
  await git(root, ["init", "--object-format=sha1", "-b", "main"]);
  await git(root, ["config", "user.name", "Navigation proof"]);
  await git(root, ["config", "user.email", "proof@example.invalid"]);
  await git(root, ["add", "--all"]); await git(root, ["commit", "-m", "Owned packaged navigation inputs"]);
  const committedHead = (await git(root, ["rev-parse", "HEAD"])).toString("utf8").trim();
  if (["swarm", "unfamiliar"].includes(kind)) await writeFile(join(root, "search-proof/untracked-match.txt"), "untracked filename\n");
  if (kind === "unfamiliar") {
    await writeFile(join(root, "untracked.txt"), "untracked\n");
    await writeFile(join(root, "ignored.txt"), "ignored\n");
    await symlink("src/main.ts", join(root, "alias.ts"));
    await mkdir(join(root, "nested")); await git(join(root, "nested"), ["init", "-b", "nested"]);
    await writeFile(join(root, "nested/secret.ts"), "must not cross repository boundary\n");
    await mkdir(join(root, "submodule"));
    await writeFile(join(root, "submodule/.git"), "gitdir: ../.git/modules/missing\n");
    await writeFile(join(root, "submodule/secret.ts"), "must not traverse gitfile\n");
    await command("mkfifo", [join(root, "pipe")], root);
    await mkdir(join(root, "large"));
    for (let offset = 0; offset < 4_120; offset += 40)
      await Promise.all(Array.from({ length: Math.min(40, 4_120 - offset) }, (_, index) =>
        writeFile(join(root, "large", `entry-${String(offset + index).padStart(5, "0")}.txt`), `entry ${offset + index}\n`)));
    const ditz = await resolveDitzExecutable();
    await mkdir(join(root, ".fixture-home"));
    await command(ditz, ["init", "--no-onboarding"], root);
    await command(ditz, ["add", "Navigation explicit Reveal", "--id", "navigation-reveal", "--desc", "An explicit source reference, not agent instructions.", "--type", "task"], root);
    await command(ditz, ["ref", "navigation-reveal", "src/main.ts:2", "--note", "Only Reveal navigates"], root);
  } else if (kind === "invalid-name") {
    await writeFile(Buffer.concat([Buffer.from(`${root}/invalid-`), Buffer.from([0xff])]), "unsupported filename\n");
  } else if (kind === "fingerprint-budget") {
    const oversized = await open(join(root, "dirty-budget.bin"), "w");
    try { await oversized.truncate(64 * 1024 * 1024 + 1); } finally { await oversized.close(); }
  }
  const sourcePath = kind === "swarm" ? "core/files.ts" : "src/main.ts";
  let backlinks = null;
  if (["swarm", "unfamiliar"].includes(kind)) {
    const ditz = await resolveDitzExecutable(); await mkdir(join(root, ".fixture-home"), { recursive: true });
    if (kind === "swarm") {
      await command(ditz, ["init", "--no-onboarding"], root);
      // Keep metadata's auxiliary worktree out of working-source observation.
      await writeFile(join(root, ".git/info/exclude"), ".ditz-worktree/\n.fixture-home/\n");
    }
    await command(ditz, ["add", "Q4 never-opened explicit task", "--id", "q4-linked", "--desc", "Structured refs only, not instructions.", "--type", "task"], root);
    await command(ditz, ["ref", "q4-linked", `${sourcePath}:1`, "--note", "First explicit reference"], root);
    await command(ditz, ["ref", "q4-linked", `${sourcePath}:3`, "--note", "Second explicit reference"], root);
    await command(ditz, ["ref", "q4-linked", "../outside-q4.ts"], root);
    await command(ditz, ["add", "Q4 closed explicit task", "--id", "q4-closed", "--type", "task"], root);
    await command(ditz, ["ref", "q4-closed", sourcePath], root);
    await command(ditz, ["close", "q4-closed", "--reason", "Explicit closed reference stays discoverable"], root);
    await command(ditz, ["add", "Q4 basename negative", "--id", "q4-basename", "--type", "task"], root);
    await command(ditz, ["ref", "q4-basename", `other/${sourcePath.split("/").at(-1)}`], root);
    await command(ditz, ["add", "Q4 prose negative", "--id", "q4-prose", "--desc", `Mention ${sourcePath} without a structured reference.`, "--type", "task"], root);
    const commit = (await git(root, ["rev-parse", "refs/heads/ditz-metadata"])).toString("utf8").trim();
    const blob = (await git(root, ["rev-parse", `${commit}:.ditz/issue-q4-linked.yaml`])).toString("utf8").trim();
    backlinks = { commit, blob, ditz };
  }
  return { root, kind, sourceCommit, committedHead, sourcePath, searchPath, searchText: await readFile(join(root, searchPath), "utf8"),
    sourceText: await readFile(join(root, sourcePath), "utf8"), directory: sourcePath.split("/")[0], backlinks };
}

/** Parent-authored disposable fixture only. No renderer bytes select these commands. */
export async function changeBacklinkFixture(fixture, operation) {
  if (!fixture.backlinks || await realpath(fixture.root) !== fixture.root || !["swarm", "unfamiliar"].includes(fixture.kind)) throw new Error("Expected owned Q4 fixture");
  const root = fixture.root, ref = "refs/heads/ditz-metadata";
  if (operation === "advance") await command(fixture.backlinks.ditz, ["set", "q4-linked", "--title", "Q4 deliberately newer task"], root);
  else if (operation === "restore") await git(root, ["update-ref", ref, fixture.backlinks.commit]);
  else if (operation === "missing") await git(root, ["update-ref", "-d", ref]);
  else if (operation === "malformed" || operation === "overflow") {
    // Explicit Git/YAML FAULT, not claimed to be CLI-authored positive metadata.
    const base = fixture.backlinks.commit;
    let tree;
    if (operation === "malformed") {
      const blob = (await git(root, ["hash-object", "-w", "--stdin"], "not a metadata directory")).toString().trim();
      tree = (await git(root, ["mktree"], `100644 blob ${blob}\t.ditz\n`)).toString().trim();
    } else {
      let entries = (await git(root, ["ls-tree", `${base}:.ditz`])).toString();
      for (let i = 0; i < 12; i++) {
        const data = { id: `q4-overflow-${i}`, title: "Bounded overflow fault", desc: "", type: "task", component: "", status: "unstarted", disposition: null,
          file_refs: Array.from({ length: 4 }, () => ({ path: "\u0000".repeat(1024), line: null, note: null })) };
        const blob = (await git(root, ["hash-object", "-w", "--stdin"], JSON.stringify(data))).toString().trim();
        entries += `100644 blob ${blob}\tissue-q4-overflow-${i}.yaml\n`;
      }
      const ditzTree = (await git(root, ["mktree"], entries)).toString().trim();
      tree = (await git(root, ["mktree"], `040000 tree ${ditzTree}\t.ditz\n`)).toString().trim();
    }
    const commit = (await git(root, ["commit-tree", tree, "-p", base, "-m", `Q4 TEST FAULT ${operation}`])).toString().trim();
    await git(root, ["update-ref", ref, commit]);
  } else throw new Error("Unknown Q4 fixture change");
  if (operation === "missing") return null;
  return (await git(root, ["rev-parse", ref])).toString().trim();
}
