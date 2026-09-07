// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepositoryFileSearch } from "../core/repository-search";
import { queryRepositoryGit } from "../core/repository-boundary";
import { PROTOCOL_VERSION } from "../protocol/common";
import { FILE_SEARCH_ENTRIES, FILE_SEARCH_NAME_BYTES, FILE_SEARCH_RESULTS, FILE_SEARCH_STALE_MS,
  type RepositorySearchRequest } from "../protocol/repository-search";

const roots: string[] = [];
const readers: RepositoryFileSearch[] = [];
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "swarm-file-search-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  return root;
}
function reader(root: string, options: ConstructorParameters<typeof RepositoryFileSearch>[2] = {}) {
  const value = new RepositoryFileSearch(root, "project:test", options);
  readers.push(value);
  return value;
}
function request(query = "", delta: Partial<RepositorySearchRequest> = {}): RepositorySearchRequest {
  return { protocolVersion: PROTOCOL_VERSION, requestId: "search-test", type: "repo.search", repositoryId: "project:test", query, refresh: false, ...delta };
}
afterEach(async () => {
  readers.splice(0).forEach((value) => value.dispose());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("real Git/filesystem filename search", () => {
  it("captures tracked and nonignored untracked names, including dotfiles and ignored tracked files", async () => {
    const root = await repository();
    await mkdir(join(root, "deep"));
    await writeFile(join(root, ".gitignore"), "ignored*\n");
    for (const name of ["tracked", "untracked", ".hidden", "ignored-untracked", "ignored-tracked", "deep/nested"])
      await writeFile(join(root, name), "names only");
    execFileSync("git", ["add", "-f", "--", "tracked", "ignored-tracked"], { cwd: root });
    const result = await reader(root).search(request());
    expect(result).toMatchObject({ state: "observed", complete: true, matchesComplete: true, capturedCount: 6 });
    expect(result.paths).toEqual([".gitignore", ".hidden", "deep/nested", "ignored-tracked", "tracked", "untracked"]);
  });

  it("ranks duplicate basenames deterministically and treats shell/glob fragments literally", async () => {
    const root = await repository();
    for (const directory of ["a", "z", "needle-folder"]) await mkdir(join(root, directory));
    for (const name of ["a/needle", "z/needle", "needle-more", "xxneedle", "needle-folder/other", "a/[x]*?$(touch sentinel);.ts"])
      await writeFile(join(root, name), "");
    const value = reader(root);
    expect((await value.search(request("NEEDLE"))).paths).toEqual(["a/needle", "z/needle", "needle-more", "needle-folder/other", "xxneedle"]);
    expect((await value.search(request("[x]*?$(touch sentinel);"))).paths).toEqual(["a/[x]*?$(touch sentinel);.ts"]);
    expect((await value.search(request("does-not-exist")))).toMatchObject({ paths: [], complete: true, matchesComplete: true });
  });

  it("reuses a name capture across keystrokes, marks age/hints stale, and refreshes explicitly", async () => {
    const root = await repository();
    await writeFile(join(root, "old.ts"), "");
    let now = 0;
    const git = vi.fn(queryRepositoryGit); // Transparent spy: capture still uses a real Git subprocess.
    const value = reader(root, { git, now: () => now });
    const first = await value.search(request("old"));
    await writeFile(join(root, "new.ts"), "");
    for (const query of ["o", "ol", "new"]) expect((await value.search(request(query))).captureId).toBe(first.captureId);
    expect(git).toHaveBeenCalledTimes(1);
    expect(git.mock.calls[0]?.[1]).toEqual(["ls-files", "--cached", "--others", "--exclude-standard", "--stage", "-z"]);
    expect(git.mock.calls[0]?.[2]).toMatchObject({ maximumBytes: 2 * 1024 * 1024, timeoutMs: 2_000 });
    now = FILE_SEARCH_STALE_MS;
    expect((await value.search(request("new")))).toMatchObject({ state: "stale", paths: [] });
    const refreshed = await value.search(request("new", { refresh: true }));
    expect(refreshed).toMatchObject({ state: "observed", paths: ["new.ts"] });
    expect(refreshed.captureId).not.toBe(first.captureId);
    value.markStale();
    expect((await value.search(request("new"))).state).toBe("stale");
    expect(git).toHaveBeenCalledTimes(2);
  });

  it("retains the previous capture after a real Git refresh failure without automatic retries", async () => {
    const root = await repository();
    await writeFile(join(root, "old.ts"), "");
    const value = reader(root);
    const first = await value.search(request());
    await rename(join(root, ".git"), join(root, "offline-administration"));
    const failed = await value.search(request("old", { refresh: true }));
    expect(failed).toMatchObject({ captureId: first.captureId, state: "stale", paths: ["old.ts"] });
    expect(failed.notice).toContain("Refresh failed");
    await rename(join(root, "offline-administration"), join(root, ".git"));
    expect((await value.search(request("old"))).state).toBe("stale");
    expect((await value.search(request("old", { refresh: true }))).state).toBe("observed");
  });

  it("rechecks deleted files, leaf links, and newly opaque directory prefixes without reading bytes", async () => {
    const root = await repository();
    await mkdir(join(root, "nested"));
    for (const path of ["deleted", "replaced", "nested/child"]) await writeFile(join(root, path), "");
    const value = reader(root);
    const first = await value.search(request());
    expect(first.paths).toHaveLength(3);
    await rm(join(root, "deleted"));
    await rm(join(root, "replaced"));
    await symlink("/etc/passwd", join(root, "replaced"));
    await writeFile(join(root, "nested/.git"), "gitdir: /never-read");
    expect(await value.search(request())).toMatchObject({ captureId: first.captureId, paths: [], matchesComplete: true });
  });

  it("omits links, special files, nested repositories, Git administration and index-only submodules", async () => {
    const root = await repository();
    for (const name of ["nested", "submodule", "linked-directory", "bare"]) await mkdir(join(root, name));
    for (const path of ["nested/child", "submodule/child", "linked-directory/child", "bare/child", "safe"])
      await writeFile(join(root, path), "");
    execFileSync("git", ["add", "--", "nested/child", "linked-directory/child", "bare/child"], { cwd: root });
    await writeFile(join(root, "nested/.git"), "not interpreted");
    for (const name of ["HEAD", "objects", "refs"]) await writeFile(join(root, "bare", name), "");
    await rename(join(root, "linked-directory"), join(root, "original-directory"));
    await symlink("original-directory", join(root, "linked-directory"));
    await symlink("safe", join(root, "leaf-link"));
    execFileSync("mkfifo", [join(root, "fifo")]);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `160000,${head},submodule`], { cwd: root });
    const result = await reader(root).search(request());
    expect(result.paths).toEqual(["original-directory/child", "safe"]);
    expect(result.paths.some((path) => path.split("/").includes(".git"))).toBe(false);
  });

  it("omits malformed byte/control names but preserves BOM and Unicode filename identities", async () => {
    const root = await repository();
    await writeFile(Buffer.concat([Buffer.from(`${root}/`), Buffer.from([0xff, 0x61])]), "");
    for (const name of ["line\nbreak", "safe.ts", "\uFEFFsafe.ts", "é😀.ts"]) await writeFile(join(root, name), "");
    const value = reader(root);
    const result = await value.search(request());
    expect(result.paths).toEqual(["safe.ts", "é😀.ts", "\uFEFFsafe.ts"]);
    expect(result.notice).toContain("Unsupported names");
    expect((await value.search(request("safe"))).paths).toEqual(["safe.ts", "\uFEFFsafe.ts"]);
  });

  it("bounds real matching results and lets a narrower fragment resolve the overflow", async () => {
    const root = await repository();
    for (let index = 0; index <= FILE_SEARCH_RESULTS; index++) await writeFile(join(root, `match-${String(index).padStart(3, "0")}`), "");
    const value = reader(root);
    const result = await value.search(request("match"));
    expect(result).toMatchObject({ complete: true, matchesComplete: false, capturedCount: FILE_SEARCH_RESULTS + 1 });
    expect(result.paths).toHaveLength(FILE_SEARCH_RESULTS);
    expect((await value.search(request("match-040")))).toMatchObject({ matchesComplete: true, paths: ["match-040"] });
  });
});

describe("deterministic injected capture bounds and cancellation faults", () => {
  it("reports initial bounded Git failures without exposing subprocess details", async () => {
    const root = await repository();
    const value = reader(root, { git: async () => { throw new Error("secret subprocess stderr"); } });
    const failure = await value.search(request()).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "REPOSITORY_SEARCH_UNAVAILABLE" });
    expect(String(failure)).not.toContain("secret subprocess stderr");
  });

  it("distinguishes no match within a partial entry capture from complete absence", async () => {
    const root = await repository();
    const names = Array.from({ length: FILE_SEARCH_ENTRIES + 1 }, (_, index) => `entry-${index}`);
    const value = reader(root, { git: async () => Buffer.from(`${names.join("\0")}\0`) });
    const result = await value.search(request("not-present"));
    expect(result).toMatchObject({ complete: false, capturedCount: FILE_SEARCH_ENTRIES, matchesComplete: true, paths: [] });
    expect(result.notice).toContain("Partial capture");
  });

  it("counts UTF-8 bytes rather than characters toward the capture name budget", async () => {
    const root = await repository();
    const names = Array.from({ length: 600 }, (_, index) => `${String(index).padStart(4, "0")}/${"é".repeat(1000)}`);
    const nameBytes = Buffer.byteLength(names[0]!);
    const result = await reader(root, { git: async () => Buffer.from(`${names.join("\0")}\0`) }).search(request("not-present"));
    expect(result).toMatchObject({ complete: false, capturedCount: Math.floor(FILE_SEARCH_NAME_BYTES / nameBytes), paths: [] });
  });

  it("bounds eligibility checks even when captured paths have all disappeared", async () => {
    const root = await repository();
    const names = Array.from({ length: 161 }, (_, index) => `missing-${index}`);
    const result = await reader(root, { git: async () => Buffer.from(`${names.join("\0")}\0`) }).search(request("missing"));
    expect(result).toMatchObject({ complete: true, matchesComplete: false, paths: [] });
  });

  it("deduplicates staged conflict records and rejects an unterminated capture", async () => {
    const root = await repository();
    await writeFile(join(root, "file"), "");
    const sha = "a".repeat(40);
    const bytes = Buffer.from(`100644 ${sha} 1\tfile\0` + `100644 ${sha} 2\tfile\0`);
    expect(await reader(root, { git: async () => bytes }).search(request())).toMatchObject({ capturedCount: 1, paths: ["file"] });
    await expect(reader(root, { git: async () => Buffer.from("partial") }).search(request())).rejects.toMatchObject({ code: "REPOSITORY_SEARCH_UNAVAILABLE" });
  });

  it("shares an in-flight capture but cancels the superseded query and preserves generation staleness", async () => {
    const root = await repository();
    let finish!: (bytes: Buffer) => void;
    const git = vi.fn(() => new Promise<Buffer>((resolve) => { finish = resolve; }));
    const value = reader(root, { git });
    const old = value.search(request("old"));
    const cancelled = expect(old).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
    value.markStale();
    const latest = value.search(request("latest"));
    finish(Buffer.alloc(0));
    await cancelled;
    expect(await latest).toMatchObject({ query: "latest", state: "stale" });
    expect(git).toHaveBeenCalledTimes(1);
  });

  it("refresh aborts the previous capture and cannot install a late old result", async () => {
    const root = await repository();
    const calls: { signal: AbortSignal | undefined; finish: (bytes: Buffer) => void }[] = [];
    const git: typeof queryRepositoryGit = async (_root, _args, options) => new Promise<Buffer>((finish) => { calls.push({ signal: options?.signal, finish }); });
    const value = reader(root, { git });
    const old = value.search(request("old"));
    const cancelled = expect(old).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
    const latest = value.search(request("new", { refresh: true }));
    expect(calls[0]!.signal?.aborted).toBe(true);
    calls[1]!.finish(Buffer.alloc(0));
    const result = await latest;
    calls[0]!.finish(Buffer.from("old\0"));
    await cancelled;
    expect((await value.search(request())).captureId).toBe(result.captureId);
  });

  it("disposal aborts pending work and rejects all future queries", async () => {
    const root = await repository();
    let signal: AbortSignal | undefined;
    let finish!: (bytes: Buffer) => void;
    const git: typeof queryRepositoryGit = async (_root, _args, options) => new Promise<Buffer>((resolve) => { signal = options?.signal; finish = resolve; });
    const value = reader(root, { git });
    const pending = value.search(request());
    const cancelled = expect(pending).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
    value.dispose();
    expect(signal?.aborted).toBe(true);
    finish(Buffer.alloc(0));
    await cancelled;
    await expect(value.search(request())).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
  });

  it("rejects another repository before starting Git", async () => {
    const root = await repository();
    const git = vi.fn(async () => Buffer.alloc(0));
    await expect(reader(root, { git }).search(request("", { repositoryId: "another" }))).rejects.toMatchObject({ code: "REPOSITORY_MISMATCH" });
    expect(git).not.toHaveBeenCalled();
  });
});
