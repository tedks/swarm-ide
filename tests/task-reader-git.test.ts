// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskGitReader, TaskReaderError } from "../core/tasks/git-reader";
import { TASK_LIMITS, type GitObjectId } from "../protocol/tasks";

const roots: string[] = [];
const env = { ...process.env, GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
const signal = () => new AbortController().signal;
const deadline = () => Date.now() + TASK_LIMITS.observationMs;
async function fixture(algorithm: "sha1" | "sha256" = "sha1") {
  const root = await mkdtemp(join(tmpdir(), "swarm-task-git-")); roots.push(root);
  const git = (args: string[], input?: string | Buffer): string => execFileSync("git", ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], {
    cwd: root, env, input, stdio: "pipe", encoding: "utf8",
  }).trim();
  git(["init", "-q", `--object-format=${algorithm}`]);
  await mkdir(join(root, ".ditz"));
  await writeFile(join(root, ".ditz/project.yaml"), "name: Test\n");
  await writeFile(join(root, ".ditz/issue-whole-id.yaml"), "id: whole-id\ntitle: Original\n");
  const commit = (): GitObjectId => {
    git(["add", "--", ".ditz"]); git(["commit", "-qm", "fixture", "--allow-empty"]);
    const hex = git(["rev-parse", "HEAD"]); git(["update-ref", "refs/heads/ditz-metadata", hex]);
    return { algorithm, hex };
  };
  const head = commit();
  return { root, git, head, commit, reader: new TaskGitReader(root) };
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("read-only pinned local Git task transport", () => {
  it.each(["sha1", "sha256"] as const)("reads exact %s commit/tree/blob identities and keeps the old revision after advancement", async (algorithm) => {
    const f = await fixture(algorithm);
    expect(await f.reader.resolve(signal(), deadline())).toEqual(f.head);
    const initial = await f.reader.scan(f.head, signal(), deadline());
    expect(initial.map((entry) => entry.id)).toEqual([null, "whole-id"]);
    expect(initial[1]!.blob).toEqual({ algorithm, hex: f.git(["rev-parse", `${f.head.hex}:.ditz/issue-whole-id.yaml`]) });
    expect(Buffer.from(initial[1]!.bytes).toString()).toBe("id: whole-id\ntitle: Original\n");
    await writeFile(join(f.root, ".ditz/issue-whole-id.yaml"), "id: whole-id\ntitle: New\n");
    const next = f.commit();
    expect(await f.reader.resolve(signal(), deadline())).toEqual(next);
    expect(await f.reader.scan(f.head, signal(), deadline())).toEqual(initial);
    expect(Buffer.from((await f.reader.scan(next, signal(), deadline()))[1]!.bytes).toString()).toContain("New");
  });

  it("does not consult worktree metadata, origin refs, ambient Git authority or invoke configured helpers", async () => {
    const f = await fixture(); const other = await fixture();
    const marker = join(f.root, "helper-ran");
    const helper = join(f.root, "fixture-helper");
    await writeFile(helper, `#!/bin/sh\nprintf unsafe > '${marker}'\n`);
    await chmod(helper, 0o700);
    // Positive control: this is an executable helper, not an inert string.
    execFileSync(helper);
    expect(await readFile(marker, "utf8")).toBe("unsafe");
    await rm(marker);
    for (const [key, value] of [["core.fsmonitor", helper], ["core.sshCommand", helper],
      ["core.askPass", helper], ["credential.helper", helper], ["diff.external", helper],
      ["filter.evil.smudge", helper], ["core.alternateRefsCommand", helper]]) f.git(["config", key!, value!]);
    await writeFile(join(f.root, ".gitattributes"), "* filter=evil diff=evil\n");
    await writeFile(join(f.root, ".ditz/issue-whole-id.yaml"), "DIRTY INVALID DATA");
    const indexBefore = await readFile(join(f.root, ".git/index"));
    const refsBefore = f.git(["show-ref"]);
    vi.stubEnv("GIT_DIR", join(other.root, ".git"));
    vi.stubEnv("GIT_CONFIG_COUNT", "1"); vi.stubEnv("GIT_CONFIG_KEY_0", "core.fsmonitor"); vi.stubEnv("GIT_CONFIG_VALUE_0", helper);
    vi.stubEnv("GIT_TRACE", marker); vi.stubEnv("PATH", ".");
    expect(await f.reader.resolve(signal(), deadline())).toEqual(f.head);
    expect(Buffer.from((await f.reader.scan(f.head, signal(), deadline()))[1]!.bytes).toString()).toContain("Original");
    expect(await readFile(join(f.root, ".git/index"))).toEqual(indexBefore);
    expect(await readFile(join(f.root, ".ditz/issue-whole-id.yaml"), "utf8")).toBe("DIRTY INVALID DATA");
    expect(await readdir(f.root)).not.toContain("helper-ran");
    expect(f.git(["show-ref"])).toBe(refsBefore);
  });

  it("does not fall back to a remote-tracking metadata ref or a working directory", async () => {
    const f = await fixture();
    f.git(["update-ref", "refs/remotes/origin/ditz-metadata", f.head.hex]);
    f.git(["update-ref", "-d", "refs/heads/ditz-metadata"]);
    expect(await f.reader.resolve(signal(), deadline())).toBeNull();
  });

  it("requires project metadata and rejects special or nested metadata entries", async () => {
    for (const kind of ["missing-project", "project-symlink", "issue-symlink", "nested", "submodule", "bad-name"] as const) {
      const f = await fixture();
      if (kind === "missing-project" || kind === "project-symlink") await rm(join(f.root, ".ditz/project.yaml"));
      if (kind === "project-symlink") await symlink("../outside", join(f.root, ".ditz/project.yaml"));
      if (kind === "issue-symlink") { await rm(join(f.root, ".ditz/issue-whole-id.yaml")); await symlink("../outside", join(f.root, ".ditz/issue-whole-id.yaml")); }
      if (kind === "nested") { await mkdir(join(f.root, ".ditz/nested")); await writeFile(join(f.root, ".ditz/nested/issue-hidden.yaml"), "id: hidden"); }
      if (kind === "bad-name") await writeFile(join(f.root, ".ditz/issue-bad space.yaml"), "id: valid");
      if (kind === "submodule") f.git(["update-index", "--add", "--cacheinfo", `160000,${f.head.hex},.ditz/issue-submodule.yaml`]);
      const head = kind === "submodule" ? (() => {
        f.git(["commit", "-qm", "fixture submodule"]);
        return { algorithm: "sha1" as const, hex: f.git(["rev-parse", "HEAD"]) };
      })() : f.commit();
      await expect(f.reader.scan(head, signal(), deadline())).rejects.toMatchObject({ code: kind === "missing-project" ? "TASK_METADATA_UNAVAILABLE" : "TASK_METADATA_MALFORMED" });
    }
  });

  it("rejects invalid UTF-8 names and duplicate raw tree entries instead of silently skipping", async () => {
    const f = await fixture();
    const blob = f.git(["hash-object", "-w", "--stdin"], "name: Test\n");
    const row = (name: Buffer) => Buffer.concat([Buffer.from("100644 "), name, Buffer.from([0]), Buffer.from(blob, "hex")]);
    for (const body of [Buffer.concat([row(Buffer.from("project.yaml")), row(Buffer.from([0xff]))]),
      Buffer.concat([row(Buffer.from("project.yaml")), row(Buffer.from("project.yaml"))])]) {
      const ditz = f.git(["hash-object", "-w", "--literally", "-t", "tree", "--stdin"], body);
      const tree = f.git(["mktree"], `040000 tree ${ditz}\t.ditz\n`);
      const commit = f.git(["commit-tree", tree], "malformed fixture\n");
      await expect(f.reader.scan({ algorithm: "sha1", hex: commit }, signal(), deadline())).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
    }
  });

  it("rejects oversize blobs and issue rosters without partial output", async () => {
    const f = await fixture();
    await writeFile(join(f.root, ".ditz/issue-whole-id.yaml"), Buffer.alloc(TASK_LIMITS.blobBytes + 1));
    await expect(f.reader.scan(f.commit(), signal(), deadline())).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    await writeFile(join(f.root, ".ditz/issue-whole-id.yaml"), "id: whole-id\n");
    for (let i = 0; i < TASK_LIMITS.issues; i++) await writeFile(join(f.root, `.ditz/issue-${i}.yaml`), `id: '${i}'\n`);
    await expect(f.reader.scan(f.commit(), signal(), deadline())).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
  });

  it("detects corrupted object bytes rather than trusting the object filename", async () => {
    const f = await fixture();
    const blob = f.git(["rev-parse", `${f.head.hex}:.ditz/issue-whole-id.yaml`]);
    const content = Buffer.from("id: spoofed\ntitle: Corrupted\n");
    await rm(join(f.root, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    await writeFile(join(f.root, ".git/objects", blob.slice(0, 2), blob.slice(2)),
      deflateSync(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content])));
    await expect(f.reader.scan(f.head, signal(), deadline())).rejects.toMatchObject({ code: "TASK_METADATA_MALFORMED" });
  });

  it("preflights oversized commit and tree objects before reading their contents", async () => {
    const f = await fixture();
    const tree = f.git(["rev-parse", `${f.head.hex}^{tree}`]);
    const commit = f.git(["commit-tree", tree], "x".repeat(2 * 1024 * 1024));
    await expect(f.reader.scan({ algorithm: "sha1", hex: commit }, signal(), deadline())).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    const blob = f.git(["hash-object", "-w", "--stdin"], "ordinary");
    const hugeTree = f.git(["mktree"], Array.from({ length: 5000 }, (_, i) => `100644 blob ${blob}\tfile-${i}\n`).join(""));
    const treeCommit = f.git(["commit-tree", hugeTree], "large tree");
    await expect(f.reader.scan({ algorithm: "sha1", hex: treeCommit }, signal(), deadline())).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
  });

  it("caps actual hostile-config stderr and reaps its process before rejecting", async () => {
    const f = await fixture();
    f.git(["config", "core.fsync", Array.from({ length: 2000 }, () => "unknown-component").join(",")]);
    const control = spawnSync("git", ["cat-file", "-t", f.head.hex], { cwd: f.root, env, encoding: "buffer", maxBuffer: 1024 * 1024 });
    expect(control.status).toBe(0);
    expect(control.stderr.length).toBeGreaterThan(16 * 1024);
    const kills = vi.spyOn(process, "kill");
    await expect(f.reader.scan(f.head, signal(), deadline())).rejects.toMatchObject({ code: "TASK_LIMIT_EXCEEDED" });
    const groups = kills.mock.calls.filter(([, kind]) => kind === "SIGKILL").map(([pid]) => pid);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(() => process.kill(group, 0)).toThrow();
  });

  it("does not lazy-fetch a missing promised object or invoke a remote transport helper", async () => {
    const f = await fixture(); const marker = join(f.root, "network-helper-ran");
    const blob = f.git(["rev-parse", `${f.head.hex}:.ditz/issue-whole-id.yaml`]);
    f.git(["config", "core.repositoryformatversion", "1"]);
    f.git(["config", "extensions.partialClone", "origin"]);
    f.git(["config", "remote.origin.promisor", "true"]);
    f.git(["config", "remote.origin.url", `ext::sh -c 'echo unsafe > ${marker}'`]);
    f.git(["config", "protocol.ext.allow", "always"]);
    await rm(join(f.root, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    await expect(f.reader.scan(f.head, signal(), deadline())).rejects.toMatchObject({ code: "TASK_METADATA_UNAVAILABLE" });
    expect(await readdir(f.root)).not.toContain("network-helper-ran");
  });

  it.each(["abort", "deadline"] as const)("kills and reaps a Git process blocked on a hostile config FIFO on %s", async (action) => {
    const f = await fixture();
    const fifo = join(f.root, "config-fifo"); execFileSync("mkfifo", [fifo]);
    f.git(["config", "include.path", fifo]);
    const kills = vi.spyOn(process, "kill");
    const controller = new AbortController();
    const timer = action === "abort" ? setTimeout(() => controller.abort(), 75) : null;
    const started = Date.now();
    try {
      await expect(f.reader.resolve(controller.signal, started + 200)).rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    } finally { if (timer) clearTimeout(timer); }
    expect(Date.now() - started).toBeLessThan(1500);
    const groups = kills.mock.calls.filter(([, kind]) => kind === "SIGKILL").map(([pid]) => pid);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(() => process.kill(group, 0)).toThrow();
  });

  it("fails expired/aborted inputs without spawning and sanitizes Git diagnostics", async () => {
    const f = await fixture(); const kills = vi.spyOn(process, "kill");
    const aborted = new AbortController(); aborted.abort();
    await expect(f.reader.resolve(aborted.signal, deadline())).rejects.toBeInstanceOf(TaskReaderError);
    await expect(f.reader.resolve(signal(), Date.now() - 1)).rejects.toMatchObject({ code: "TASK_OBSERVATION_FAILED" });
    expect(kills).not.toHaveBeenCalled();
    await writeFile(join(f.root, ".git/config"), "VERY_PRIVATE_SECRET\n");
    await expect(f.reader.resolve(signal(), deadline())).rejects.toMatchObject({ message: "Metadata Git read failed or exceeded its deadline." });
  });
});
