// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";

const roots: string[] = [];

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "swarm-fingerprint-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "swarm@example.invalid"], { cwd: root });
  await writeFile(join(root, ".gitignore"), "ignored\n", "utf8");
  await writeFile(join(root, "tracked.txt"), "one\n", "utf8");
  execFileSync("git", ["add", ".gitignore", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("working-world fingerprint", () => {
  it("changes for tracked edits, deletions, and non-ignored untracked content but not ignored files", async () => {
    const root = await repository();
    const clean = await computeWorkingWorldFingerprint(root);
    await writeFile(join(root, "ignored"), "irrelevant", "utf8");
    expect(await computeWorkingWorldFingerprint(root)).toBe(clean);
    await writeFile(join(root, "tracked.txt"), "two\n", "utf8");
    const modified = await computeWorkingWorldFingerprint(root);
    expect(modified).not.toBe(clean);
    await rm(join(root, "tracked.txt"));
    const deleted = await computeWorkingWorldFingerprint(root);
    expect(deleted).not.toBe(modified);
    await writeFile(join(root, "untracked.txt"), "new\n", "utf8");
    expect(await computeWorkingWorldFingerprint(root)).not.toBe(deleted);
  });

  it("is stable for identical HEAD, diff, paths, modes, and bytes", async () => {
    const root = await repository();
    await writeFile(join(root, "untracked.txt"), "same\n", "utf8");
    expect(await computeWorkingWorldFingerprint(root)).toBe(await computeWorkingWorldFingerprint(root));
  });
});
