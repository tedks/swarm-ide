// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCanonicalWorkspaceBytes, readWorkspaceFile, resolveWorkspaceFile, writeWorkspaceFile } from "../core/files";
import { RepositoryReader } from "../core/repository";
import { PROTOCOL_VERSION } from "../protocol/common";

const roots: string[] = [];
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "swarm-repository-boundary-")); roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("privileged repository activation boundaries", () => {
  it("rejects Git administration in all file activation/read/write paths but permits .gitignore/.gitmodules", async () => {
    const root = await repository();
    await expect(readWorkspaceFile(root, ".git/config")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(resolveWorkspaceFile(root, ".git/HEAD")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(readCanonicalWorkspaceBytes(root, ".git/HEAD", 1024)).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(writeWorkspaceFile(root, ".git/config", "irrelevant", "x")).rejects.toMatchObject({ code: "INVALID_PATH" });
    for (const name of [".gitignore", ".gitmodules"]) {
      await writeFile(join(root, name), "ordinary file\n");
      expect((await readWorkspaceFile(root, name)).content).toBe("ordinary file\n");
    }
  });

  it("rejects .git files, directories and broken symlink markers without running config", async () => {
    const root = await repository();
    for (const marker of ["file", "directory", "link"]) {
      const path = join(root, marker); await mkdir(path); await writeFile(join(path, "source"), "secret");
      if (marker === "file") await writeFile(join(path, ".git"), "gitdir: /untrusted\n");
      else if (marker === "directory") await mkdir(join(path, ".git"));
      else await symlink("missing", join(path, ".git"));
      await expect(readWorkspaceFile(root, `${marker}/source`)).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
      await expect(writeWorkspaceFile(root, `${marker}/source`, "irrelevant", "changed")).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
      expect(await readFile(join(path, "source"), "utf8")).toBe("secret");
    }
  });

  it("rejects a deep index-only gitlink without .git or .gitmodules, including directory activation", async () => {
    const root = await repository();
    await mkdir(join(root, "outer", "submodule", "inside"), { recursive: true });
    await writeFile(join(root, "outer", "submodule", "inside", "source"), "submodule secret");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `160000,${head},outer/submodule`], { cwd: root });
    await expect(readWorkspaceFile(root, "outer/submodule/inside/source")).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
    await expect(resolveWorkspaceFile(root, "outer/submodule/inside/source")).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
    const value = new RepositoryReader(root, "test");
    try {
      await expect(value.list({ protocolVersion: PROTOCOL_VERSION, requestId: "boundary", type: "repo.list", directory: "outer/submodule/inside", page: 0, filter: "", refresh: true })).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
    } finally { value.dispose(); }
  });

  it("treats shell/glob-looking path names literally without hiding adjacent gitlinks", async () => {
    const root = await repository();
    await mkdir(join(root, "literal[*]"));
    await writeFile(join(root, "literal[*]", "safe"), "safe");
    await mkdir(join(root, "literalx"));
    await writeFile(join(root, "literalx", "secret"), "secret");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `160000,${head},literalx`], { cwd: root });
    expect((await readWorkspaceFile(root, "literal[*]/safe")).content).toBe("safe");
    await expect(readWorkspaceFile(root, "literalx/secret")).rejects.toMatchObject({ code: "REPOSITORY_BOUNDARY" });
  });

  it("keeps ignored FIFO read and conditional-save rejection nonblocking", async () => {
    const root = await repository();
    await writeFile(join(root, ".gitignore"), "fifo\n");
    execFileSync("mkfifo", [join(root, "fifo")]);
    await expect(readWorkspaceFile(root, "fifo")).rejects.toMatchObject({ code: "NOT_REGULAR_FILE" });
    await expect(writeWorkspaceFile(root, "fifo", "irrelevant", "x")).rejects.toMatchObject({ code: "NOT_REGULAR_FILE" });
  });
});
