import { afterEach, describe, expect, it, vi } from "vitest";
import * as gitBoundary from "../core/repository-boundary";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browseRegisteredWorktree, inspectRegisteredWorktree } from "../core/worktree-inspection";
import { WorktreeBrowseRequestSchema, WorktreeInspectionRequestSchema } from "../protocol/worktree-inspection";
import { parseCoreRequest, parseCoreResponseForRequest, PROTOCOL_VERSION } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const temporary: string[] = [];
afterEach(async () => { for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
});
const commit = (root: string, message: string) => git(root, "-c", "user.name=Browser test", "-c", "user.email=browser@example.invalid", "commit", "--quiet", "-m", message);
const browse = (sessionId = A, directory = "", page = 0) => WorktreeBrowseRequestSchema.parse({
  protocolVersion: PROTOCOL_VERSION, requestId: "browse-test", type: "worktree.browse", sessionId, directory, page,
});
const inspect = (sessionId = A, path = "source.txt") => WorktreeInspectionRequestSchema.parse({
  protocolVersion: PROTOCOL_VERSION, requestId: "inspect-master-test", type: "worktree.inspect", sessionId, path, comparison: "master",
});

// A real master checkout plus two actual Git worktrees, not unrelated directory fixtures.
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "swarm-worktree-browser-")); temporary.push(root);
  const master = join(root, "master"), first = join(root, "worker-a"), second = join(root, "worker-b");
  await mkdir(join(master, "src"), { recursive: true });
  git(master, "init", "--quiet", "-b", "master");
  await Promise.all([
    writeFile(join(master, "source.txt"), "base first\nbase second\n"),
    writeFile(join(master, "src", "nested.txt"), "nested base\n"),
    writeFile(join(master, "delete.txt"), "delete this base\n"),
    writeFile(join(master, "rename.txt"), "unchanged rename contents\n"),
    writeFile(join(master, "binary.bin"), Buffer.from([0, 1, 2, 3])),
    writeFile(join(master, "[literal].txt"), "literal base\n"),
    writeFile(join(master, "l.txt"), "other base\n"),
  ]);
  git(master, "add", "."); commit(master, "Base files");
  git(master, "worktree", "add", "--quiet", "-b", "worker-a", first);
  git(master, "worktree", "add", "--quiet", "-b", "worker-b", second);
  const registry = join(root, "agents.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions: [first, second].map((contextRoot, index) => ({
    id: index ? B : A, label: index ? "Worker B" : "Worker A", contextRoot, rollout: join(root, `worker-${index}.jsonl`),
  })) }), { mode: 0o600 });
  return { root, master, first, second, registry };
}

describe("agent worktree browsing and master comparison", () => {
  it("lists the selected registered worktree and nested directory without editing either index or source", async () => {
    const { master, first, second, registry } = await setup();
    await writeFile(join(first, "only-a.txt"), "first worktree\n");
    await writeFile(join(second, "only-b.txt"), "second worktree\n");
    await writeFile(join(master, "source.txt"), "operator unsaved-on-disk changes\n");
    const paths = [master, first, second];
    const before = await Promise.all(paths.map(async (root) => ({
      index: await readFile(git(root, "rev-parse", "--path-format=absolute", "--git-path", "index").trim()),
      source: await readFile(join(root, "source.txt")),
    })));
    const result = await browseRegisteredWorktree(master, registry, browse(B));
    expect(result).toMatchObject({ sessionId: B, label: "Worker B", worktree: second, branch: "worker-b", base: "master", changesComplete: true });
    expect(result.directory.entries.some((entry) => entry.path === "only-b.txt")).toBe(true);
    expect(result.directory.entries.some((entry) => entry.path === "only-a.txt")).toBe(false);
    const nested = await browseRegisteredWorktree(master, registry, browse(A, "src"));
    expect(nested.directory.entries.map((entry) => entry.path)).toEqual(["src/nested.txt"]);
    for (const [index, root] of paths.entries()) {
      expect(await readFile(git(root, "rev-parse", "--path-format=absolute", "--git-path", "index").trim())).toEqual(before[index]!.index);
      expect(await readFile(join(root, "source.txt"))).toEqual(before[index]!.source);
    }
  });

  it("compares committed and uncommitted worker changes to the master ref rather than HEAD or the master directory", async () => {
    const { master, first, registry } = await setup();
    await writeFile(join(first, "source.txt"), "committed first\nbase second\n");
    git(first, "add", "source.txt"); commit(first, "Worker commit");
    await writeFile(join(first, "source.txt"), "committed first\ndirty second\n");
    await writeFile(join(master, "source.txt"), "unrelated master checkout edit\n");
    const result = await inspectRegisteredWorktree(master, registry, inspect());
    expect(result).toMatchObject({ comparison: "master", base: "master", content: "committed first\ndirty second\n" });
    expect(result.diff).toContain("-base first");
    expect(result.diff).toContain("+committed first");
    expect(result.diff).toContain("+dirty second");
    expect(result.diff).not.toContain("unrelated master checkout edit");
    const { comparison: _comparison, ...legacy } = inspect();
    const head = await inspectRegisteredWorktree(master, registry, legacy);
    expect(head.diff).not.toContain("+committed first");
    expect(head.diff).toContain("+dirty second");
  });

  it("distinguishes staged renames, deleted tracked files, and separately listed untracked files", async () => {
    const { master, first, registry } = await setup();
    git(first, "mv", "rename.txt", "renamed.txt");
    await rm(join(first, "delete.txt"));
    await writeFile(join(first, "scratch.txt"), "not tracked\n");
    const result = await browseRegisteredWorktree(master, registry, browse());
    expect(result.changes).toEqual(expect.arrayContaining([
      { path: "renamed.txt", previousPath: "rename.txt", status: "renamed" },
      { path: "delete.txt", status: "deleted" },
      { path: "scratch.txt", status: "untracked" },
    ]));
    const renamed = await inspectRegisteredWorktree(master, registry, { ...inspect(A, "renamed.txt"), previousPath: "rename.txt" });
    expect(renamed.previousPath).toBe("rename.txt");
    expect(renamed.diff).toContain("rename from rename.txt");
    expect(renamed.diff).toContain("rename to renamed.txt");
    expect(renamed.diff).not.toContain("new file mode");
    const deleted = await inspectRegisteredWorktree(master, registry, inspect(A, "delete.txt"));
    expect(deleted.content).toBeNull();
    expect(deleted.diff).toContain("deleted file mode");
    const untracked = await inspectRegisteredWorktree(master, registry, inspect(A, "scratch.txt"));
    expect(untracked.content).toBe("not tracked\n");
    expect(untracked.diff).toBe("");
  });

  it("keeps binary files in the change list while explaining why their source preview is unavailable", async () => {
    const { master, first, registry } = await setup();
    await writeFile(join(first, "binary.bin"), Buffer.from([0, 9, 8, 7]));
    const listing = await browseRegisteredWorktree(master, registry, browse());
    expect(listing.changes).toContainEqual({ path: "binary.bin", status: "modified" });
    const result = await inspectRegisteredWorktree(master, registry, inspect(A, "binary.bin"));
    expect(result.content).toBeNull();
    expect(result.contentNotice).toMatch(/binary/i);
    expect(result.diff).toContain("Binary files");
  });

  it("prefers an existing origin/master tracking ref without fetching or moving any refs", async () => {
    const { master, first, registry } = await setup();
    await writeFile(join(first, "source.txt"), "remote base\n");
    git(first, "add", "source.txt"); commit(first, "Already fetched remote base");
    git(master, "update-ref", "refs/remotes/origin/master", git(first, "rev-parse", "HEAD").trim());
    await writeFile(join(first, "source.txt"), "new working edit\n");
    const before = git(master, "show-ref");
    const result = await inspectRegisteredWorktree(master, registry, inspect());
    expect(result.base).toBe("origin/master");
    expect(result.diff).toContain("-remote base");
    expect(result.diff).not.toContain("-base first");
    expect(git(master, "show-ref")).toBe(before);
  });

  it("keeps browsing and source available when no master/main reference exists", async () => {
    const { master, first, registry } = await setup();
    git(master, "branch", "-m", "baseline");
    await writeFile(join(first, "scratch.txt"), "untracked without base\n");
    const result = await browseRegisteredWorktree(master, registry, browse());
    expect(result.base).toBeNull();
    expect(result.changesComplete).toBe(false);
    expect(result.notice).toMatch(/no local master or main/i);
    expect(result.directory.entries.some((entry) => entry.path === "source.txt")).toBe(true);
    expect(result.changes).toContainEqual({ path: "scratch.txt", status: "untracked" });
    const source = await inspectRegisteredWorktree(master, registry, inspect());
    expect(source.content).toBe("base first\nbase second\n");
    expect(source.diffNotice).toMatch(/no local master or main/i);
  });

  it("uses literal pathspecs and rejects renderer-selected roots, traversal, and symlink escapes", async () => {
    const { master, first, second, registry } = await setup();
    await writeFile(join(first, "[literal].txt"), "literal changed\n");
    await writeFile(join(first, "l.txt"), "other changed\n");
    const result = await inspectRegisteredWorktree(master, registry, inspect(A, "[literal].txt"));
    expect(result.diff).toContain("+literal changed");
    expect(result.diff).not.toContain("other changed");
    for (const directory of ["..", "/tmp", ".git", "src/../", "src\\nested", "src//nested"])
      expect(() => browse(A, directory)).toThrow();
    expect(() => WorktreeBrowseRequestSchema.parse({ ...browse(), root: second })).toThrow();
    await symlink(second, join(first, "outside"));
    await expect(browseRegisteredWorktree(master, registry, browse(A, "outside"))).rejects.toThrow();
    await expect(inspectRegisteredWorktree(master, registry, inspect(A, "outside/source.txt"))).rejects.toThrow();
  });

  it("reports partial change coverage when the change list exceeds 400 files", async () => {
    const { master, first, registry } = await setup();
    await Promise.all(Array.from({ length: 405 }, (_, index) => writeFile(join(first, `untracked-${index}.txt`), "new\n")));
    const result = await browseRegisteredWorktree(master, registry, browse());
    expect(result.changes).toHaveLength(400);
    expect(result.changesComplete).toBe(false);
    expect(result.notice).toContain("first 400");
    expect(result.changes.every((change) => change.status === "untracked")).toBe(true);
  });

  it("does not start after cancellation or accept an unknown session or public registry", async () => {
    const { master, registry } = await setup();
    const controller = new AbortController(); controller.abort();
    await expect(browseRegisteredWorktree(master, registry, browse(), controller.signal)).rejects.toThrow("stopped");
    await expect(browseRegisteredWorktree(master, registry, browse("10000000-0000-4000-8000-000000000099"))).rejects.toThrow("registered worktree");
    await chmod(registry, 0o644);
    await expect(browseRegisteredWorktree(master, registry, browse())).rejects.toThrow("owner-only");
  });

  it("correlates browse responses with session/directory/page and inspection responses with the requested comparison", async () => {
    const { master, registry } = await setup();
    const command = parseCoreRequest(browse());
    const worktreeBrowse = await browseRegisteredWorktree(master, registry, browse());
    const response = { protocolVersion: PROTOCOL_VERSION, requestId: command.requestId, ok: true,
      sequence: 0, snapshot: initialSnapshot(), worktreeBrowse };
    expect(parseCoreResponseForRequest(response, command).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...response, worktreeBrowse: { ...worktreeBrowse, sessionId: B } }, command)).toThrow();
    expect(() => parseCoreResponseForRequest(response, parseCoreRequest(browse(A, "src")))).toThrow();
    expect(() => parseCoreResponseForRequest(response, parseCoreRequest(browse(A, "", 1)))).toThrow();
    expect(() => parseCoreResponseForRequest({ ...response, file: { kind: "read", path: "source.txt", content: "wrong authority", revision: "a".repeat(64), size: 15 } }, command)).toThrow();
    const inspectionCommand = parseCoreRequest(inspect());
    const worktreeInspection = await inspectRegisteredWorktree(master, registry, inspect());
    const inspected = { ...response, requestId: inspectionCommand.requestId, worktreeBrowse: undefined, worktreeInspection };
    expect(parseCoreResponseForRequest(inspected, inspectionCommand).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...inspected, worktreeInspection: { ...worktreeInspection, comparison: undefined } }, inspectionCommand)).toThrow();
    expect(() => parseCoreResponseForRequest({ ...inspected, worktreeInspection: { ...worktreeInspection, previousPath: "wrong.txt" } }, inspectionCommand)).toThrow();
  });
  it("cancels a held Git operation within the existing five-second bridge deadline", async () => {
    const { master, registry } = await setup();
    const original = gitBoundary.queryRepositoryGit;
    let aborted = false;
    const spy = vi.spyOn(gitBoundary, "queryRepositoryGit").mockImplementation((root, args, options) => {
      if (args[0] !== "for-each-ref") return original(root, args, options);
      return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => {
        aborted = true; reject(new Error("Held Git operation cancelled"));
      }, { once: true }));
    });
    try {
      const started = Date.now();
      await expect(browseRegisteredWorktree(master, registry, browse())).rejects.toThrow("stopped");
      expect(aborted).toBe(true);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally { spy.mockRestore(); }
  }, 7_000);
});
