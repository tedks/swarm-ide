// @vitest-environment node
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../protocol/common";
import { RepositoryObservationSchema, type RepositoryRequest } from "../protocol/repository";
import { RepositoryReader } from "../core/repository";
import { queryRepositoryGit } from "../core/repository-boundary";
import { readWorkspaceFile } from "../core/files";

const roots: string[] = [];
const readers: RepositoryReader[] = [];
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "swarm-directory-reader-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
  return root;
}
function reader(root: string, options: ConstructorParameters<typeof RepositoryReader>[2] = {}) {
  const value = new RepositoryReader(root, "project:test", options);
  readers.push(value);
  return value;
}
function request(directory = "", delta: Partial<RepositoryRequest> = {}): RepositoryRequest {
  return { protocolVersion: PROTOCOL_VERSION, requestId: "directory-test", type: "repo.list", directory, page: 0, filter: "", refresh: true, ...delta };
}
afterEach(async () => {
  readers.splice(0).forEach((value) => value.dispose());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("bounded real repository directory observations", () => {
  it("shows immediate tracked, untracked, hidden and ignored entries; directories stay neutral", async () => {
    const root = await repository();
    await mkdir(join(root, "directory"));
    await writeFile(join(root, "directory", "nested.ts"), "not recursively included");
    await writeFile(join(root, ".gitignore"), "ignored\ntracked\n");
    await writeFile(join(root, "tracked"), "tracked");
    await writeFile(join(root, "untracked"), "untracked");
    await writeFile(join(root, "ignored"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, ".hidden"), "hidden");
    execFileSync("git", ["add", "-f", "tracked", "directory/nested.ts"], { cwd: root });
    const observation = await reader(root).list(request());
    expect(RepositoryObservationSchema.safeParse(observation).success).toBe(true);
    expect(observation.entries[0]).toMatchObject({ kind: "directory", git: "unknown", path: "directory", actionable: true });
    expect(observation.entries.find((entry) => entry.path === "tracked")?.git).toBe("tracked");
    expect(observation.entries.find((entry) => entry.path === "ignored")).toMatchObject({ git: "ignored", actionable: true });
    expect(observation.entries.find((entry) => entry.path === ".hidden")?.git).toBe("untracked");
    expect(observation.entries.map((entry) => entry.path)).not.toContain(".git");
    expect(observation.entries.map((entry) => entry.path)).not.toContain("directory/nested.ts");
  });

  it("never opens symlinks, nested repositories, index-only submodules or FIFOs", async () => {
    const root = await repository();
    await symlink("/etc/passwd", join(root, "link"));
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", ".git"), "malicious config is not evaluated");
    await mkdir(join(root, "submodule"));
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `160000,${head},submodule`], { cwd: root });
    execFileSync("mkfifo", [join(root, "fifo")]);
    const observation = await reader(root).list(request());
    for (const path of ["link", "nested", "submodule", "fifo"])
      expect(observation.entries.find((entry) => entry.path === path)).toMatchObject({ actionable: false, reason: expect.any(String) });
    expect(observation.entries.find((entry) => entry.path === "submodule")?.kind).toBe("repository");
  });

  it("preserves invalid UTF-8 and noncanonical names only as escaped nonactionable notices", async () => {
    const root = await repository();
    await writeFile(Buffer.concat([Buffer.from(`${root}/`), Buffer.from([0xff, 0x61])]), "invalid name");
    await writeFile(join(root, "line\nbreak"), "unsupported name");
    await writeFile(join(root, "valid.ts"), "valid");
    const observation = await reader(root).list(request());
    const unsupported = observation.entries.filter((entry) => entry.kind === "unsupported");
    expect(unsupported).toHaveLength(2);
    expect(unsupported.every((entry) => entry.path === null && !entry.actionable && !entry.label.includes("\n"))).toBe(true);
    expect(unsupported.some((entry) => entry.label === "\\xffa")).toBe(true);
    expect(observation.entries.find((entry) => entry.path === "valid.ts")?.actionable).toBe(true);
    expect(RepositoryObservationSchema.safeParse(observation).success).toBe(true);
  });

  it("preserves BOM-prefixed filenames without aliasing their plain counterparts", async () => {
    const root = await repository();
    const plainName = "safe.ts";
    const bomName = "\uFEFFsafe.ts";
    await writeFile(join(root, plainName), "plain file bytes\n");
    await writeFile(join(root, bomName), "BOM-named file bytes\n");
    execFileSync("git", ["add", "--", plainName], { cwd: root });
    const value = reader(root);
    const observation = await value.list(request());
    expect(observation.entries.map((entry) => entry.path)).toEqual([plainName, bomName]);
    expect(new Set(observation.entries.map((entry) => entry.id)).size).toBe(2);
    expect(observation.entries.find((entry) => entry.path === plainName)?.git).toBe("tracked");
    expect(observation.entries.find((entry) => entry.path === bomName)).toMatchObject({ label: bomName, git: "untracked", actionable: true });
    expect(RepositoryObservationSchema.safeParse(observation).success).toBe(true);
    const selected = await value.list(request("", { refresh: false, observationId: observation.observationId, revealPath: bomName }));
    expect(selected.reveal).toEqual({ path: bomName, status: "selected" });
    expect((await readWorkspaceFile(root, selected.reveal!.path)).content).toBe("BOM-named file bytes\n");
    expect((await readWorkspaceFile(root, plainName)).content).toBe("plain file bytes\n");
    expect((await value.list(request())).entries.map((entry) => entry.id)).toEqual(observation.entries.map((entry) => entry.id));
  });

  it("preserves BOM-prefixed directory paths through actual descent and file activation", async () => {
    const root = await repository();
    const plainName = "directory";
    const bomName = "\uFEFFdirectory";
    await mkdir(join(root, plainName));
    await mkdir(join(root, bomName));
    await writeFile(join(root, plainName, "child.ts"), "plain directory child\n");
    await writeFile(join(root, bomName, "child.ts"), "BOM directory child\n");
    const value = reader(root);
    const observation = await value.list(request());
    expect(observation.entries.map((entry) => entry.path)).toEqual([plainName, bomName]);
    const bomDirectory = observation.entries.find((entry) => entry.path === bomName)!;
    expect(bomDirectory).toMatchObject({ label: bomName, kind: "directory", actionable: true });
    const child = await value.list(request(bomDirectory.path!));
    expect(child.entries.map((entry) => entry.path)).toEqual([`${bomName}/child.ts`]);
    expect((await readWorkspaceFile(root, child.entries[0]!.path!)).content).toBe("BOM directory child\n");
    expect(RepositoryObservationSchema.safeParse(child).success).toBe(true);
  });

  it("checks a BOM-prefixed nested repository's own marker instead of a plain-name alias", async () => {
    const root = await repository();
    const plainName = "nested";
    const bomName = "\uFEFFnested";
    await mkdir(join(root, plainName));
    await mkdir(join(root, bomName));
    await writeFile(join(root, bomName, ".git"), "gitdir: /not-executed\n");
    const observation = await reader(root).list(request());
    expect(observation.entries.find((entry) => entry.path === bomName)).toMatchObject({ label: bomName, kind: "repository", actionable: false });
    expect(observation.entries.find((entry) => entry.path === plainName)).toMatchObject({ kind: "directory", actionable: true });
    expect(new Set(observation.entries.map((entry) => entry.id)).size).toBe(2);
    expect(RepositoryObservationSchema.safeParse(observation).success).toBe(true);
  });

  it("uses stable kind/path identities and bytewise directory-first order on refresh", async () => {
    const root = await repository();
    await mkdir(join(root, "z-dir"));
    await writeFile(join(root, "z-file"), "z");
    await writeFile(join(root, "A-file"), "a");
    const value = reader(root);
    const first = await value.list(request());
    const second = await value.list(request());
    expect(second.observationId).not.toBe(first.observationId);
    expect(second.entries.map((entry) => entry.id)).toEqual(first.entries.map((entry) => entry.id));
    expect(first.entries.map((entry) => entry.path)).toEqual(["z-dir", "A-file", "z-file"]);
  });

  it("reuses captured pages/filters without rescanning and marks age/hints stale", async () => {
    const root = await repository();
    await writeFile(join(root, "old.ts"), "old");
    let now = 0;
    const opened = vi.fn(async () => undefined);
    const value = reader(root, { now: () => now, afterDirectoryOpen: opened });
    const first = await value.list(request());
    await writeFile(join(root, "new.ts"), "new");
    now = 5_001;
    const stale = await value.list(request("", { refresh: false, observationId: first.observationId, filter: "old" }));
    expect(stale.state).toBe("stale");
    expect(stale.entries.map((entry) => entry.path)).toEqual(["old.ts"]);
    expect(opened).toHaveBeenCalledTimes(1);
    const refreshed = await value.list(request());
    expect(refreshed.state).toBe("observed");
    expect(refreshed.entries).toHaveLength(2);
    value.markStale();
    expect((await value.list(request("", { refresh: false, observationId: refreshed.observationId }))).state).toBe("stale");
  });

  it("selects an offpage captured target and resets a filter without another capture", async () => {
    const root = await repository();
    await Promise.all(Array.from({ length: 220 }, (_, index) => writeFile(join(root, `entry-${index.toString().padStart(3, "0")}`), "x")));
    const opened = vi.fn(async () => undefined);
    const value = reader(root, { afterDirectoryOpen: opened });
    const first = await value.list(request());
    const selected = await value.list(request("", { refresh: false, observationId: first.observationId, filter: "no-match", revealPath: "entry-219" }));
    expect(selected).toMatchObject({ page: 1, filter: "", reveal: { path: "entry-219", status: "selected" } });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(RepositoryObservationSchema.safeParse(selected).success).toBe(true);
  });

  it("captures no more than 4096 entries and distinguishes uncaptured paths from absent files", async () => {
    const root = await repository();
    const names = Array.from({ length: 4105 }, (_, index) => `file-${index.toString().padStart(4, "0")}`);
    for (let offset = 0; offset < names.length; offset += 100)
      await Promise.all(names.slice(offset, offset + 100).map((name) => writeFile(join(root, name), "x")));
    const value = reader(root);
    const first = await value.list(request());
    expect(first).toMatchObject({ complete: false, capturedCount: 4096, pageCount: 21 });
    const seen = new Set<string>();
    for (let page = 0; page < first.pageCount; page += 1) {
      const slice = await value.list(request("", { refresh: false, observationId: first.observationId, page }));
      slice.entries.forEach((entry) => seen.add(entry.path!));
    }
    const omitted = names.find((name) => !seen.has(name))!;
    expect(omitted).toBeDefined();
    const reveal = await value.list(request("", { refresh: false, observationId: first.observationId, revealPath: omitted }));
    expect(reveal.reveal?.status).toBe("outside-capture");
    expect(reveal.notice).toContain("outside this partial directory capture");
  }, 30_000);

  it("caps serialized names/metadata at 1 MiB before 4096 long entries", async () => {
    const root = await repository();
    const names = Array.from({ length: 2100 }, (_, index) => `${index.toString().padStart(4, "0")}-${"z".repeat(245)}`);
    for (let offset = 0; offset < names.length; offset += 100)
      await Promise.all(names.slice(offset, offset + 100).map((name) => writeFile(join(root, name), "")));
    const observation = await reader(root).list(request());
    expect(observation.complete).toBe(false);
    expect(observation.capturedCount).toBeLessThan(2100);
  }, 30_000);

  it("keeps filesystem entries when bounded Git classification fails", async () => {
    const root = await repository();
    await writeFile(join(root, "file"), "x");
    const observation = await reader(root, { git: async () => { throw new Error("arbitrary secret stderr never exposed"); } }).list(request());
    expect(observation.entries).toHaveLength(1);
    expect(observation.entries[0]?.git).toBe("unknown");
    expect(observation.notice).toContain("Git classification is unavailable");
    expect(observation.notice).not.toContain("secret");
  });

  it("rejects stale IDs, wrong paths and unavailable pages without destroying the retained slice", async () => {
    const root = await repository();
    await writeFile(join(root, "file"), "x");
    const value = reader(root);
    const first = await value.list(request());
    await expect(value.list(request("", { refresh: false, observationId: "old-observation" }))).rejects.toMatchObject({ code: "REPOSITORY_STALE" });
    await expect(value.list(request("../outside"))).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(value.list(request("", { refresh: false, observationId: first.observationId, page: 1 }))).rejects.toMatchObject({ code: "REPOSITORY_PAGE_UNAVAILABLE" });
    await expect(value.list(request("deleted"))).rejects.toMatchObject({ code: "REPOSITORY_NOT_FOUND" });
    expect((await value.list(request("", { refresh: false, observationId: first.observationId }))).observationId).toBe(first.observationId);
  });

  it("late A cannot replace B and disposal invalidates an open in-flight observation", async () => {
    const root = await repository();
    await mkdir(join(root, "a")); await mkdir(join(root, "b"));
    let release!: () => void;
    let started!: () => void;
    const opened = new Promise<void>((resolve) => { started = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const value = reader(root, { afterDirectoryOpen: async (directory) => { if (directory === "a") { started(); await held; } } });
    const a = value.list(request("a"));
    const rejected = expect(a).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
    await opened;
    const b = await value.list(request("b"));
    release(); await rejected;
    expect((await value.list(request("b", { refresh: false, observationId: b.observationId }))).directory).toBe("b");
    value.dispose();
    await expect(value.list(request())).rejects.toMatchObject({ code: "REPOSITORY_CANCELLED" });
  });

  it("rejects a directory renamed/replaced after descriptor validation", async () => {
    const root = await repository();
    await mkdir(join(root, "dir"));
    await writeFile(join(root, "dir", "old"), "old");
    const value = reader(root, { afterDirectoryOpen: async () => {
      await rename(join(root, "dir"), join(root, "moved"));
      await mkdir(join(root, "dir"));
      await writeFile(join(root, "dir", "new"), "new");
    } });
    await expect(value.list(request("dir"))).rejects.toMatchObject({ code: "REPOSITORY_PATH_CHANGED" });
  });

  it("rejects final/parent symlink aliases and unreadable directories", async () => {
    const root = await repository();
    await mkdir(join(root, "real")); await mkdir(join(root, "real", "child"));
    await symlink("real", join(root, "alias"));
    const value = reader(root);
    await expect(value.list(request("alias"))).rejects.toMatchObject({ code: "REPOSITORY_UNSUPPORTED" });
    await expect(value.list(request("alias/child"))).rejects.toMatchObject({ code: "REPOSITORY_PATH_CHANGED" });
    await chmod(join(root, "real"), 0o000);
    try { await expect(value.list(request("real"))).rejects.toMatchObject({ code: "REPOSITORY_PERMISSION_DENIED" }); }
    finally { await chmod(join(root, "real"), 0o755); }
  });

  it("bounds actual Git output and handles pre-cancelled queries without children", async () => {
    const root = await repository();
    await writeFile(join(root, "file"), "x");
    execFileSync("git", ["add", "file"], { cwd: root });
    await expect(queryRepositoryGit(root, ["ls-files", "--stage", "-z"], { maximumBytes: 1 })).rejects.toThrow("bound");
    const controller = new AbortController(); controller.abort();
    await expect(queryRepositoryGit(root, ["ls-files"], { signal: controller.signal })).rejects.toThrow("cancelled");
  });
});
