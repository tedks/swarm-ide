// @vitest-environment node
import * as filesystem from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeWorkingWorldFingerprint } from "../core/fingerprint";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof filesystem>();
  return { ...actual, open: vi.fn(actual.open) };
});

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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

  it("handles spaces and rename-like delete/add changes without Git config dependence", async () => {
    const root = await repository();
    const clean = await computeWorkingWorldFingerprint(root);
    await rename(join(root, "tracked.txt"), join(root, "renamed source.txt"));
    const renamed = await computeWorkingWorldFingerprint(root);
    expect(renamed).not.toBe(clean);
    expect(renamed).toBe(await computeWorkingWorldFingerprint(root));
  });
});


it("rejects a FIFO substituted between inspection and descriptor open", async () => {
  const root = await repository();
  await writeFile(join(root, "tracked.txt"), "modified");
  const originalOpen = (await vi.importActual<typeof filesystem>("node:fs/promises")).open;
  vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
    // Fail safely on the old implementation, before opening a blocking FIFO.
    expect(Number(flags) & constants.O_NONBLOCK).not.toBe(0);
    await rm(join(root, "tracked.txt"));
    execFileSync("mkfifo", [join(root, "tracked.txt")]);
    return originalOpen(path, flags, mode);
  });
  await expect(computeWorkingWorldFingerprint(root)).rejects.toThrow("regular file");
});

it.each(["cancel", "deadline"])("drains an owned Git process on %s", async (mode) => {
  const root = await repository();
  const executable = join(root, "git");
  const pidFile = join(root, "owned.pid"), childPidFile = join(root, "owned-child.pid");
  await writeFile(executable, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' }); require('node:fs').writeFileSync(${JSON.stringify(childPidFile)}, String(child.pid)); setInterval(() => {}, 1000);\n`, { mode: 0o700 });
  vi.stubEnv("PATH", `${root}:${process.env.PATH}`);
  const controller = new AbortController();
  const pending = computeWorkingWorldFingerprint(root, controller.signal).then(() => null, (error: unknown) => error);
  let pid = 0, childPid = 0, forcedCleanup = false;
  const fallback = setTimeout(() => {
    forcedCleanup = true; controller.abort();
    // Test-owned emergency cleanup makes a regressed group kill fail safely.
    try { if (pid) process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }, 4000);
  try {
    await vi.waitFor(async () => {
      pid = Number(await filesystem.readFile(pidFile, "utf8"));
      childPid = Number(await filesystem.readFile(childPidFile, "utf8"));
      expect(pid).toBeGreaterThan(0); expect(childPid).toBeGreaterThan(0);
    });
    if (mode === "cancel") controller.abort();
    const failure = await pending;
    expect(forcedCleanup).toBe(false);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(mode === "cancel" ? /cancelled/ : /deadline/);
    expect(() => process.kill(pid, 0)).toThrow();
    // An orphan can briefly remain a zombie until the host's init reaps it.
    await vi.waitFor(async () => {
      try { expect(await filesystem.readFile(`/proc/${childPid}/stat`, "utf8")).toMatch(/\) Z /); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    });
  } finally {
    controller.abort();
    try { if (pid) process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
    await pending; clearTimeout(fallback);
  }
});

it("checks cancellation after opening and closes the descriptor before rejecting", async () => {
  const root = await repository();
  await writeFile(join(root, "tracked.txt"), "modified");
  const originalOpen = (await vi.importActual<typeof filesystem>("node:fs/promises")).open;
  const controller = new AbortController();
  let handle: Awaited<ReturnType<typeof originalOpen>> | undefined;
  vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
    handle = await originalOpen(path, flags, mode);
    controller.abort();
    return handle;
  });
  await expect(computeWorkingWorldFingerprint(root, controller.signal)).rejects.toThrow();
  expect(handle).toBeDefined();
  await expect(handle!.stat()).rejects.toMatchObject({ code: "EBADF" });
});
