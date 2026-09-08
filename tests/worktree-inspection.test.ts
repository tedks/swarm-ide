import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRegisteredWorktree } from "../core/worktree-inspection";
import { WorktreeInspectionRequestSchema } from "../protocol/worktree-inspection";
import { parseCoreRequest, parseCoreResponseForRequest, PROTOCOL_VERSION } from "../protocol/schema";
import { initialSnapshot } from "../fixtures/world";

const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const request = (sessionId = A, path = "same.txt") => WorktreeInspectionRequestSchema.parse({
  protocolVersion: PROTOCOL_VERSION, requestId: "inspect-test", type: "worktree.inspect", sessionId, path,
});
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "swarm-worktree-inspection-")); directories.push(dir);
  const roots = [join(dir, "first"), join(dir, "second")];
  for (const [index, root] of roots.entries()) {
    await mkdir(root);
    git(root, "init", "--quiet");
    await writeFile(join(root, "same.txt"), `repository ${index} original\n`);
    git(root, "add", "same.txt");
    git(root, "-c", "user.name=Inspection test", "-c", "user.email=inspection@example.invalid", "commit", "--quiet", "-m", "Initial source");
    await writeFile(join(root, "same.txt"), `repository ${index} edited\n`);
  }
  const registry = join(dir, "agents.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions: roots.map((root, index) => ({
    id: index === 0 ? A : B, label: `Worker ${index}`, rollout: join(dir, `worker${index}.jsonl`), contextRoot: root,
  })) }), { mode: 0o600 });
  return { dir, first: roots[0]!, second: roots[1]!, registry };
}

describe("registered worktree source inspection", () => {
  it("reads the named worker's actual repository and current diff without changing either working tree or index", async () => {
    const { first, second, registry } = await setup();
    const before = await Promise.all([first, second].map(async (root) => ({
      source: await readFile(join(root, "same.txt"), "utf8"),
      index: await readFile(join(root, ".git/index")),
      mtime: (await stat(join(root, ".git/index"))).mtimeMs,
    })));
    const result = await inspectRegisteredWorktree(first, registry, request(B));
    expect(result).toMatchObject({ sessionId: B, path: "same.txt", label: "Worker 1", worktree: second, content: "repository 1 edited\n" });
    expect(result.diff).toContain("-repository 1 original");
    expect(result.diff).toContain("+repository 1 edited");
    expect(result.diff).not.toContain("repository 0");
    expect(result.diffNotice).toBeUndefined();
    for (const [index, root] of [first, second].entries()) {
      expect(await readFile(join(root, "same.txt"), "utf8")).toBe(before[index]!.source);
      expect(await readFile(join(root, ".git/index"))).toEqual(before[index]!.index);
      expect((await stat(join(root, ".git/index"))).mtimeMs).toBe(before[index]!.mtime);
    }
  });

  it("shows a deleted tracked file's current diff with absent source", async () => {
    const { first, second, registry } = await setup();
    await rm(join(second, "same.txt"));
    const result = await inspectRegisteredWorktree(first, registry, request(B));
    expect(result.content).toBeNull();
    expect(result.diff).toContain("deleted file mode");
    expect(result.diff).toContain("-repository 1 original");
    await expect(inspectRegisteredWorktree(first, registry, request(B, "absent.txt"))).rejects.toThrow("missing");
  });

  it("requires a registered session and private, out-of-repository registry", async () => {
    const { first, registry } = await setup();
    await expect(inspectRegisteredWorktree(first, undefined, request())).rejects.toThrow("Register");
    await expect(inspectRegisteredWorktree(first, registry, request("10000000-0000-4000-8000-000000000099"))).rejects.toThrow("registered worktree");
    const inRepo = join(first, "registry.json");
    await writeFile(inRepo, await readFile(registry), { mode: 0o600 });
    await expect(inspectRegisteredWorktree(first, inRepo, request())).rejects.toThrow("outside");
    await chmod(registry, 0o644);
    await expect(inspectRegisteredWorktree(first, registry, request())).rejects.toThrow("owner-only");
  });

  it("rejects renderer roots, noncanonical paths and symlink escapes", async () => {
    const { first, second, registry } = await setup();
    for (const path of ["../same.txt", "/etc/passwd", ".git/config", "./same.txt", "dir//same.txt", "dir\\same.txt"])
      expect(() => request(B, path)).toThrow();
    expect(() => WorktreeInspectionRequestSchema.parse({ ...request(B), root: first })).toThrow();
    await symlink(join(first, "same.txt"), join(second, "linked.txt"));
    await expect(inspectRegisteredWorktree(first, registry, request(B, "linked.txt"))).rejects.toThrow();
  });

  it("uses a literal filename and does not execute configured external diffs or text conversion", async () => {
    const { first, second, registry } = await setup();
    const path = "[literal].txt";
    await writeFile(join(second, path), "old\n");
    git(second, "add", path);
    git(second, "-c", "user.name=Inspection test", "-c", "user.email=inspection@example.invalid", "commit", "--quiet", "-m", "Literal file");
    await writeFile(join(second, path), "new\n");
    git(second, "config", "diff.external", "false");
    git(second, "config", "diff.block.textconv", "false");
    await writeFile(join(second, ".gitattributes"), "*.txt diff=block\n");
    const result = await inspectRegisteredWorktree(first, registry, request(B, path));
    expect(result.diff).toContain("+new");
    expect(result.diff).not.toContain("repository 1");
  });

  it("returns readable source with a bounded notice when a diff exceeds the cap", async () => {
    const { first, second, registry } = await setup();
    await writeFile(join(second, "same.txt"), "changed content\n".repeat(20_000));
    const result = await inspectRegisteredWorktree(first, registry, request(B));
    expect(result.content).toContain("changed content");
    expect(result.diff).toBe("");
    expect(result.diffNotice).toContain("limit");
  });

  it("does not start inspection after cancellation", async () => {
    const { first, registry } = await setup();
    const controller = new AbortController(); controller.abort();
    await expect(inspectRegisteredWorktree(first, registry, request(), controller.signal)).rejects.toThrow("stopped");
  });

  it("correlates the additive core response to session and path and rejects mixed authority", async () => {
    const { first, registry } = await setup();
    const command = parseCoreRequest(request());
    const worktreeInspection = await inspectRegisteredWorktree(first, registry, request());
    const response = { protocolVersion: PROTOCOL_VERSION, requestId: command.requestId, ok: true,
      sequence: 0, snapshot: initialSnapshot(), worktreeInspection };
    expect(parseCoreResponseForRequest(response, command).ok).toBe(true);
    expect(() => parseCoreResponseForRequest({ ...response, worktreeInspection: { ...worktreeInspection, sessionId: B } }, command)).toThrow("identity");
    expect(() => parseCoreResponseForRequest({ ...response, worktreeInspection: { ...worktreeInspection, path: "different.txt" } }, command)).toThrow("identity");
    expect(() => parseCoreResponseForRequest({ ...response, file: { kind: "read", path: "same.txt", content: "wrong authority", revision: "a".repeat(64), size: 15 } }, command)).toThrow("identity");
    expect(() => parseCoreResponseForRequest(response, { ...command, type: "workspace.snapshot" })).toThrow();
  });
});
