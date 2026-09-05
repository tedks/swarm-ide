// @vitest-environment node
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_EDITABLE_FILE_BYTES } from "../protocol/schema";
import { readWorkspaceFile, WorkspaceFileError, writeWorkspaceFile } from "../core/files";

const roots: string[] = [];

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "swarm-files-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "swarm@example.invalid"], { cwd: root });
  await writeFile(join(root, "source.ts"), "export const value = 1;\n", { encoding: "utf8", mode: 0o640 });
  execFileSync("git", ["add", "source.ts"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try { await promise; return undefined; } catch (error) { return error instanceof WorkspaceFileError ? error.code : "unexpected"; }
}

describe("sandboxed workspace files", () => {
  it("reads UTF-8 with a revision and saves atomically with mode and fingerprint evidence", async () => {
    const root = await repository();
    const opened = await readWorkspaceFile(root, "source.ts");
    const beforeMode = (await stat(join(root, "source.ts"))).mode & 0o777;
    const saved = await writeWorkspaceFile(root, "source.ts", opened.revision, "export const value = 2;\n");
    expect(saved.revision).not.toBe(opened.revision);
    expect(saved.workingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(join(root, "source.ts"), "utf8")).toContain("value = 2");
    expect((await stat(join(root, "source.ts"))).mode & 0o777).toBe(beforeMode);
  });

  it("preserves the caller buffer contract on expected-revision mismatch", async () => {
    const root = await repository();
    const opened = await readWorkspaceFile(root, "source.ts");
    await writeFile(join(root, "source.ts"), "external edit\n", "utf8");
    expect(await code(writeWorkspaceFile(root, "source.ts", opened.revision, "local buffer\n"))).toBe("REVISION_CONFLICT");
    expect(await readFile(join(root, "source.ts"), "utf8")).toBe("external edit\n");
  });

  it("serializes concurrent optimistic saves so only one matching revision commits", async () => {
    const root = await repository();
    const opened = await readWorkspaceFile(root, "source.ts");
    const results = await Promise.allSettled([
      writeWorkspaceFile(root, "source.ts", opened.revision, "first writer\n"),
      writeWorkspaceFile(root, "source.ts", opened.revision, "second writer\n"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "REVISION_CONFLICT" });
    expect(["first writer\n", "second writer\n"]).toContain(await readFile(join(root, "source.ts"), "utf8"));
  });

  it("reads the validated descriptor when its pathname is raced to an outside symlink", async () => {
    const root = await repository();
    const opened = await readWorkspaceFile(root, "source.ts", {
      afterValidatedOpen: async () => {
        await rename(join(root, "source.ts"), join(root, "source-original.ts"));
        await symlink("/etc/passwd", join(root, "source.ts"));
      },
    });
    expect(opened.content).toBe("export const value = 1;\n");
    expect(opened.content).not.toContain("root:");
  });

  it("rejects traversal, symlink escape, binary data, oversized data, and write failure", async () => {
    const root = await repository();
    const outside = await mkdtemp(join(tmpdir(), "swarm-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "secret"), "outside\n");
    await mkdir(join(root, "inside"));
    await symlink(outside, join(root, "inside", "alias"));
    await symlink("/etc/passwd", join(root, "escape"));
    await writeFile(join(root, "binary"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "control-binary"), Buffer.from([65, 7, 66]));
    await writeFile(join(root, "large"), Buffer.alloc(MAX_EDITABLE_FILE_BYTES + 1, 65));
    expect(await code(readWorkspaceFile(root, "../outside"))).toBe("INVALID_PATH");
    expect(await code(readWorkspaceFile(root, "escape"))).toBe("SYMLINK_ESCAPE");
    expect(await code(readWorkspaceFile(root, "inside/alias/secret"))).toBe("SYMLINK_ESCAPE");
    expect(await code(readWorkspaceFile(root, "binary"))).toBe("BINARY_FILE");
    expect(await code(readWorkspaceFile(root, "control-binary"))).toBe("BINARY_FILE");
    expect(await code(readWorkspaceFile(root, "large"))).toBe("FILE_TOO_LARGE");

    const opened = await readWorkspaceFile(root, "source.ts");
    expect(await code(writeWorkspaceFile(root, "source.ts", opened.revision, "alert\u0007"))).toBe("BINARY_FILE");
    expect(await code(writeWorkspaceFile(root, "source.ts", opened.revision, "unpaired \ud800"))).toBe("INVALID_UTF8");
    await chmod(root, 0o555);
    try {
      await expect(writeWorkspaceFile(root, "source.ts", opened.revision, "cannot write\n")).rejects.toThrow();
    } finally {
      await chmod(root, 0o755);
    }
  });
});
