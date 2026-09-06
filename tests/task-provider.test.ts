// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDitzTaskProvider } from "../core/tasks/provider";
import { TaskGitReader, TaskReaderError } from "../core/tasks/git-reader";
import type { TaskProvider } from "../core/tasks/contracts";
import { TASK_METADATA_REF, TaskReadResultSchema, type GitObjectId } from "../protocol/tasks";

const exec = promisify(execFile);
const roots: string[] = [];
const providers: TaskProvider[] = [];
const project = 'name: task-test\nversion: "0.1.0"\ncomponents:\n- name: core\nreleases: []\n';
const issue = (id = "first", title = "First task") => `id: ${id}\ntitle: ${title}\ndesc: Literal description\ntype: task\ncomponent: core\nstatus: unstarted\ndisposition: null\n`;
const git = (root: string, args: string[]) => exec("git", args, { cwd: root,
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } });
async function repo(withProject = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "swarm-task-provider-")); roots.push(root);
  await git(root, ["init", "-b", "ditz-metadata"]);
  await mkdir(path.join(root, ".ditz"));
  if (withProject) await writeFile(path.join(root, ".ditz/project.yaml"), project);
  return root;
}
async function commit(root: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(root, ".ditz", name), text);
  await git(root, ["add", "."]); await git(root, ["commit", "--allow-empty", "-m", "Synthetic task metadata"]);
  return { algorithm: "sha1" as const, hex: (await git(root, ["rev-parse", TASK_METADATA_REF])).stdout.trim() };
}
async function provider(root: string) {
  const item = await createDitzTaskProvider({ root, worldId: "world", repositoryId: "repository" });
  providers.push(item); return item;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(providers.splice(0).map((item) => item.dispose()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("real pinned Ditz provider", () => {
  it("binds real commit/blob/details, returns defensive copies, and never reads a source reference", async () => {
    const root = await repo();
    const revision = await commit(root, { "issue-first.yaml": issue() + "file_refs:\n- path: absent/source.ts\n  line: 9\n  note: explicit only\nreferences: [never-an-implicit-link.ts]\n" });
    const before = await git(root, ["show-ref"]);
    const configBefore = await readFile(path.join(root, ".git/config"));
    const filesBefore = await readdir(root);
    const item = await provider(root);
    const observed = await item.snapshot({ refresh: true });
    expect(observed.status).toBe("observed");
    expect(observed.snapshot?.metadataCommit).toEqual(revision);
    const blob = (await git(root, ["rev-parse", `${revision.hex}:.ditz/issue-first.yaml`])).stdout.trim();
    expect(observed.snapshot?.summaries[0].blob).toEqual({ algorithm: "sha1", hex: blob });
    const read = await item.read({ metadataCommit: revision, taskId: "first" });
    expect(TaskReadResultSchema.parse(read)).toEqual(read);
    expect(read).toMatchObject({ worldId: "world", repositoryId: "repository", provider: "ditz", metadataCommit: revision,
      taskId: "first", result: { ok: true, detail: { description: "Literal description", fileRefs: [
        { path: "absent/source.ts", line: 9, note: "explicit only", navigation: "candidate" },
      ] } } });
    observed.snapshot!.summaries[0].title = "Caller tampering";
    if (read.result.ok) read.result.detail.description = "Caller tampering";
    expect((await item.snapshot({ refresh: false })).snapshot?.summaries[0].title).toBe("First task");
    expect(await item.read({ metadataCommit: revision, taskId: "first" })).toMatchObject({ result: { ok: true,
      detail: { description: "Literal description" } } });
    expect((await git(root, ["show-ref"])).stdout).toBe(before.stdout);
    expect(await readFile(path.join(root, ".git/config"))).toEqual(configBefore);
    expect(await readdir(root)).toEqual(filesBefore);
    expect((await git(root, ["status", "--porcelain"])).stdout).toBe("");
  });

  it("ref-only checks retain M, full refresh atomically adopts N, and old detail expires", async () => {
    const root = await repo(); const first = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); await item.snapshot({ refresh: true });
    const scan = vi.spyOn(TaskGitReader.prototype, "scan");
    const second = await commit(root, { "issue-first.yaml": issue("first", "Second revision") });
    const stale = await item.snapshot({ refresh: false });
    expect(stale).toMatchObject({ status: "stale", localRef: second, snapshot: { metadataCommit: first } });
    expect(scan).not.toHaveBeenCalled();
    expect(await item.read({ metadataCommit: first, taskId: "first" })).toMatchObject({ result: { ok: true, detail: { title: "First task" } } });
    const fresh = await item.snapshot({ refresh: true });
    expect(fresh).toMatchObject({ status: "observed", snapshot: { metadataCommit: second } });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(await item.read({ metadataCommit: first, taskId: "first" })).toMatchObject({ metadataCommit: first,
      taskId: "first", result: { ok: false, error: { code: "TASK_REVISION_EXPIRED" } } });
    expect(await item.read({ metadataCommit: second, taskId: "missing" })).toMatchObject({ metadataCommit: second,
      taskId: "missing", result: { ok: false, error: { code: "TASK_NOT_FOUND" } } });
  });

  it("an actual branch advance during the pinned read never mixes or relabels issue bytes", async () => {
    const root = await repo(); const first = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root);
    const original = TaskGitReader.prototype.scan;
    let second: GitObjectId;
    vi.spyOn(TaskGitReader.prototype, "scan").mockImplementationOnce(async function (this: TaskGitReader, ...args) {
      second = await commit(root, { "issue-first.yaml": issue("first", "New branch content") });
      return original.apply(this, args);
    });
    const stale = await item.snapshot({ refresh: true });
    expect(stale).toMatchObject({ status: "stale", localRef: second!, snapshot: { metadataCommit: first } });
    expect(await item.read({ metadataCommit: first, taskId: "first" })).toMatchObject({ result: { ok: true, detail: { title: "First task" } } });
  });

  it.each([
    ["malformed", "TASK_METADATA_MALFORMED", "id: first\nid: duplicated\n"],
    ["limited", "TASK_LIMIT_EXCEEDED", "x".repeat(65537)],
  ])("retains complete cache after a %s revision and cheap checks cannot hide it", async (status, code, invalid) => {
    const root = await repo(); const first = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); await item.snapshot({ refresh: true });
    const second = await commit(root, { "issue-first.yaml": invalid });
    const failed = await item.snapshot({ refresh: true });
    expect(failed).toMatchObject({ status, reason: { code }, localRef: second, snapshot: { metadataCommit: first } });
    expect(await item.snapshot({ refresh: false })).toMatchObject({ status, snapshot: { metadataCommit: first } });
    expect(await item.read({ metadataCommit: first, taskId: "first" })).toMatchObject({ result: { ok: true } });
    expect(JSON.stringify(failed.reason)).not.toContain("duplicated");
  });

  it("distinguishes no ref, no project, valid empty and no cached observation", async () => {
    const root = await repo(false); const item = await provider(root);
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "unavailable", snapshot: null });
    const revision = await commit(root, { "issue-first.yaml": issue() });
    expect(await item.snapshot({ refresh: false })).toMatchObject({ status: "unavailable", snapshot: null, localRef: revision });
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "unavailable", snapshot: null });
    await rm(path.join(root, ".ditz/issue-first.yaml"));
    await commit(root, { "project.yaml": project });
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "observed", snapshot: { summaries: [] } });
  });

  it("coalesces concurrent full scans and gives each returned observation its own sequence", async () => {
    const root = await repo(); await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); const scan = vi.spyOn(TaskGitReader.prototype, "scan");
    const results = await Promise.all(Array.from({ length: 20 }, () => item.snapshot({ refresh: true })));
    expect(scan).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.status === "observed")).toBe(true);
    expect(new Set(results.map((result) => result.sequence)).size).toBe(20);
  });

  it("services one full refresh arriving during a cheap check without a refresh backlog", async () => {
    const root = await repo(); await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); const scan = vi.spyOn(TaskGitReader.prototype, "scan");
    const cheap = item.snapshot({ refresh: false });
    const results = await Promise.all([cheap, ...Array.from({ length: 20 }, () => item.snapshot({ refresh: true }))]);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.status === "observed")).toBe(true);
  });

  it("disposes in-flight work idempotently, rejects waiters and cannot publish afterward", async () => {
    const root = await repo(); await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root);
    const pending = item.snapshot({ refresh: true });
    const rejected = expect(pending).rejects.toThrow("disposed");
    const first = item.dispose(); expect(item.dispose()).toBe(first);
    await first; await rejected;
    await expect(item.snapshot({ refresh: true })).rejects.toThrow("disposed");
    await expect(item.read({ metadataCommit: { algorithm: "sha1", hex: "0".repeat(40) }, taskId: "first" })).rejects.toThrow("disposed");
  });

  it("retains cache on transport failure without leaking arbitrary diagnostics", async () => {
    const root = await repo(); const revision = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); await item.snapshot({ refresh: true });
    vi.spyOn(TaskGitReader.prototype, "resolve").mockRejectedValueOnce(new TaskReaderError("TASK_OBSERVATION_FAILED", "secret-bearing error"));
    const failed = await item.snapshot({ refresh: true });
    expect(failed).toMatchObject({ status: "error", snapshot: { metadataCommit: revision } });
    expect(JSON.stringify(failed)).not.toContain("secret-bearing");
    expect(await item.snapshot({ refresh: false })).toMatchObject({ status: "error", localRef: revision,
      snapshot: { metadataCommit: revision } });
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "observed" });
  });

  it("cannot erase a failed same-revision full scan with a cheap ref check, even after repair", async () => {
    const root = await repo(); const revision = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); const initial = await item.snapshot({ refresh: true });
    const hash = initial.snapshot!.summaries[0].blob.hex;
    const objectPath = path.join(root, ".git/objects", hash.slice(0, 2), hash.slice(2));
    const objectBytes = await readFile(objectPath);
    await rm(objectPath);
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "unavailable", localRef: revision,
      snapshot: { metadataCommit: revision } });
    expect(await item.snapshot({ refresh: false })).toMatchObject({ status: "unavailable", localRef: revision });
    expect(await item.read({ metadataCommit: revision, taskId: "first" })).toMatchObject({ result: { ok: true } });
    await writeFile(objectPath, objectBytes);
    expect(await item.snapshot({ refresh: false })).toMatchObject({ status: "unavailable" });
    expect(await item.snapshot({ refresh: true })).toMatchObject({ status: "observed", localRef: revision });
  });

  it("checks whole serialized envelopes rather than treating character counts as output byte limits", async () => {
    const root = await repo(); const first = await commit(root, { "issue-first.yaml": issue() });
    const item = await provider(root); await item.snapshot({ refresh: true });
    // A legal 16KiB field grows beyond the 64KiB detail envelope when serialized.
    const description = `"${"\\0".repeat(16000)}"`;
    await commit(root, { "issue-first.yaml": issue().replace("desc: Literal description", `desc: ${description}`) });
    const failed = await item.snapshot({ refresh: true });
    // YAML's two-byte escape remains below the input cap, but JSON requires
    // six bytes per NUL; a successful truncated detail would be false truth.
    expect(failed).toMatchObject({ status: "limited", snapshot: { metadataCommit: first } });
    expect(await item.read({ metadataCommit: first, taskId: "first" })).toMatchObject({ result: { ok: true } });
  });
});
