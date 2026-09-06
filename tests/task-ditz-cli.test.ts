// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { TaskProvider } from "../core/tasks/contracts";
import { TaskGitReader } from "../core/tasks/git-reader";
import { createDitzTaskProvider } from "../core/tasks/provider";
import { advanceTaskFixture, createTaskFixture, invalidateTaskFixture, removeTaskMetadata,
  restoreTaskFixture } from "../tools/task-integration/fixture.mjs";

const exec = promisify(execFile);

describe("actual installed Ditz CLI authoring joined to the real provider", () => {
  it("pins literal CLI data, retains last-good across stale/invalid/missing updates, and disposes", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "swarm-task-cli-"));
    let provider: TaskProvider | undefined;
    let emptyProvider: TaskProvider | undefined;
    try {
      const fixture = await createTaskFixture(parent);
      expect(fixture.ditzExecutable).toMatch(/^\/nix\/store\/.+\/bin\/ditz$/);
      expect(fixture.ditzVersion).toContain("0.1.0");
      const git = (args: string[]) => exec("git", ["-C", fixture.root, ...args]);
      const before = (await git(["show-ref"])).stdout;
      const statusBefore = (await git(["status", "--porcelain"])).stdout;
      expect(statusBefore).toBe("");
      provider = await createDitzTaskProvider({ root: fixture.root, worldId: "cli-world", repositoryId: "cli-repository" });
      const observed = await provider.snapshot({ refresh: true });
      expect(observed).toMatchObject({ status: "observed", localRef: fixture.firstCommit,
        snapshot: { metadataCommit: fixture.firstCommit } });
      expect(observed.snapshot?.summaries.map((task) => task.id)).toEqual([fixture.taskId, fixture.secondId]);
      const blob = (await git(["rev-parse", `${fixture.firstCommit.hex}:.ditz/issue-${fixture.taskId}.yaml`])).stdout.trim();
      const detail = await provider.read({ metadataCommit: fixture.firstCommit, taskId: fixture.taskId });
      expect(detail).toMatchObject({ result: { ok: true, detail: { id: fixture.taskId, title: fixture.title,
        description: fixture.description, blob: { algorithm: "sha1", hex: blob },
        blocks: [{ taskId: fixture.secondId, status: "unstarted", diagnostics: [] }],
        fileRefs: expect.arrayContaining([
          { path: fixture.sourcePath, line: fixture.sourceLine, note: "Explicit current working file", navigation: "candidate" },
          { path: fixture.missingPath, line: 2, note: "Deliberately missing file", navigation: "candidate" },
          { path: fixture.docPath, line: 1, note: "Read this document as literal source", navigation: "candidate" },
          { path: "../outside-task-root.ts", line: null, note: "Unsupported reference must remain literal", navigation: "unsupported" },
        ]) } } });
      expect((await git(["show-ref"])).stdout).toBe(before);
      expect((await git(["status", "--porcelain"])).stdout).toBe(statusBefore);
      expect(await readFile(path.join(fixture.root, fixture.sourcePath), "utf8")).toBe(fixture.sourceText);

      const second = await advanceTaskFixture(fixture);
      const scan = vi.spyOn(TaskGitReader.prototype, "scan");
      expect(await provider.snapshot({ refresh: false })).toMatchObject({ status: "stale", localRef: second,
        snapshot: { metadataCommit: fixture.firstCommit } });
      expect(scan).not.toHaveBeenCalled();
      expect(await provider.read({ metadataCommit: fixture.firstCommit, taskId: fixture.taskId }))
        .toMatchObject({ result: { ok: true, detail: { title: fixture.title, status: "unstarted" } } });
      expect(await provider.snapshot({ refresh: true })).toMatchObject({ status: "observed", snapshot: { metadataCommit: second } });
      expect(scan).toHaveBeenCalledTimes(1);
      scan.mockRestore();
      expect(await provider.read({ metadataCommit: fixture.firstCommit, taskId: fixture.taskId }))
        .toMatchObject({ result: { ok: false, error: { code: "TASK_REVISION_EXPIRED" } } });
      expect(await provider.read({ metadataCommit: second, taskId: fixture.taskId }))
        .toMatchObject({ result: { ok: true, detail: { title: "Updated CLI-authored primary task", status: "in_progress" } } });

      const invalid = await invalidateTaskFixture(fixture);
      expect(await provider.snapshot({ refresh: true })).toMatchObject({ status: "malformed", localRef: invalid,
        reason: { code: "TASK_METADATA_MALFORMED" }, snapshot: { metadataCommit: second } });
      expect(await provider.snapshot({ refresh: false })).toMatchObject({ status: "malformed", snapshot: { metadataCommit: second } });
      expect(await provider.read({ metadataCommit: second, taskId: fixture.taskId })).toMatchObject({ result: { ok: true } });
      await restoreTaskFixture(fixture, second);
      expect(await provider.snapshot({ refresh: true })).toMatchObject({ status: "observed", snapshot: { metadataCommit: second } });

      await removeTaskMetadata(fixture);
      expect(await provider.snapshot({ refresh: true })).toMatchObject({ status: "unavailable", localRef: null,
        snapshot: { metadataCommit: second } });
      emptyProvider = await createDitzTaskProvider({ root: fixture.root, worldId: "empty-world", repositoryId: "empty-repository" });
      expect(await emptyProvider.snapshot({ refresh: true })).toMatchObject({ status: "unavailable", snapshot: null });
      await restoreTaskFixture(fixture, second);
      expect(await provider.snapshot({ refresh: false })).toMatchObject({ status: "unavailable", snapshot: { metadataCommit: second } });
      expect(await provider.snapshot({ refresh: true })).toMatchObject({ status: "observed", snapshot: { metadataCommit: second } });
      const disposal = provider.dispose();
      expect(provider.dispose()).toBe(disposal);
      await disposal;
      await expect(provider.snapshot({ refresh: true })).rejects.toThrow("disposed");
      await expect(provider.read({ metadataCommit: second, taskId: fixture.taskId })).rejects.toThrow("disposed");
      expect((await git(["status", "--porcelain"])).stdout).toBe(statusBefore);
      expect(await readFile(path.join(fixture.root, fixture.sourcePath), "utf8")).toBe(fixture.sourceText);
    } finally {
      vi.restoreAllMocks();
      await Promise.all([provider?.dispose(), emptyProvider?.dispose()]);
      await rm(parent, { recursive: true, force: true });
    }
  }, 90_000);
});
