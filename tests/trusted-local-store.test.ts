// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, truncate, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileTrustedLocalStore, MemoryTrustedLocalStore, type TrustedStoredRun } from "../core/agents/trusted-local-store";

const roots: string[] = [];
const stores: FileTrustedLocalStore[] = [];
function fileStore(path: string) { const store = new FileTrustedLocalStore(path); stores.push(store); return store; }
const at = "2026-09-07T23:00:00.000Z";
function run(): TrustedStoredRun {
  return {
    summary: { runToken: randomUUID(), title: "Explain source", createdAt: at, updatedAt: at,
      status: "running", archived: false, approvalCount: 0, taskReference: null, message: "Actual provider status" },
    threadId: "thread", turnId: "turn", output: "Observed output λ",
    activities: [{ id: "item", at, turnId: "turn", kind: "command", status: "completed", summary: "Read source.ts" }],
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "swarm-trusted-history-")); roots.push(root);
  const directory = join(root, "private"), path = join(directory, "history.json");
  return { root, directory, path, lockPath: join(directory, ".history.json.lock"), store: fileStore(path) };
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("bounded trusted-local history", () => {
  it("persists retired admission tokens independently of displayed history", async () => {
    const f = await fixture(), active = run(), retired = randomUUID();
    await f.store.save([active], [retired, active.summary.runToken]); await f.store.close();
    const restarted = fileStore(f.path);
    expect(await restarted.load()).toEqual([active]);
    expect(restarted.admittedTokens()).toEqual([retired, active.summary.runToken]);
  });
  it("returns detached values and captures input before the serialized write", async () => {
    const store = new MemoryTrustedLocalStore(), original = run(), expected = structuredClone(original);
    const saving = store.save([original]); original.output = "caller mutation"; original.activities[0]!.summary = "changed";
    await saving;
    const first = await store.load(); expect(first).toEqual([expected]);
    first[0]!.output = "reader mutation"; first[0]!.summary.title = "changed";
    expect(await store.load()).toEqual([expected]);
  });

  it("does not reinterpret or replay persisted active state", async () => {
    const f = await fixture(), active = run();
    active.summary.taskReference = { version: 1, provider: "ditz", worldId: "world:working", repositoryId: "repository:fixture",
      metadataCommit: { algorithm: "sha1", hex: "a".repeat(40) }, taskId: "original-task",
      issueBlob: { algorithm: "sha1", hex: "b".repeat(40) } };
    await f.store.save([active]);
    await f.store.close(); const restarted = fileStore(f.path);
    expect(await restarted.load()).toEqual([active]);
    active.summary.archived = true; active.summary.status = "failed"; active.summary.message = "Interrupted on core restart; previous outcome unknown.";
    await restarted.save([active]); await restarted.close();
    expect(await fileStore(f.path).load()).toEqual([active]);
  });

  it("creates a private versioned file atomically and preserves UTF-8", async () => {
    const f = await fixture(); expect(await f.store.load()).toEqual([]);
    const original = run(); await f.store.save([original]);
    expect((await stat(f.directory)).mode & 0o777).toBe(0o700);
    expect((await stat(f.path)).mode & 0o777).toBe(0o600);
    expect((await stat(f.lockPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(f.directory)).toEqual([".history.json.lock", "history.json"]);
    expect(JSON.parse(await readFile(f.path, "utf8"))).toEqual({ version: 1, runs: [original] });
    expect(await f.store.load()).toEqual([original]);
  });

  it("serializes concurrent writes and reads in invocation order without torn snapshots", async () => {
    const f = await fixture(), first = run(), second = run(), last = run();
    const writes = [f.store.save([first]), f.store.save([second]), f.store.load(), f.store.save([last]), f.store.load()];
    const results = await Promise.all(writes);
    expect(results[2]).toEqual([second]); expect(results[4]).toEqual([last]);
    expect(await readdir(f.directory)).toEqual([".history.json.lock", "history.json"]);
  });

  it("excludes another store and an actual external process until close, then hands off the same lock inode", async () => {
    const f = await fixture(), original = run(); await f.store.save([original]);
    const before = await stat(f.lockPath), competing = fileStore(f.path);
    await expect(competing.load()).rejects.toThrow("active writer");
    await expect(competing.save([run()])).rejects.toThrow("active writer");
    expect(JSON.parse(await readFile(f.path, "utf8")).runs).toEqual([original]);
    expect(spawnSync("flock", ["--exclusive", "--nonblock", f.lockPath, "true"]).status).toBe(1);
    await f.store.close();
    expect(spawnSync("flock", ["--exclusive", "--nonblock", f.lockPath, "true"]).status).toBe(0);
    expect(await competing.load()).toEqual([original]);
    const replacement = run(); await competing.save([replacement]);
    expect(await competing.load()).toEqual([replacement]);
    const after = await stat(f.lockPath); expect([after.dev, after.ino]).toEqual([before.dev, before.ino]);
  });

  it("chooses exactly one owner when independent stores race their first operation", async () => {
    const f = await fixture(), competing = fileStore(f.path), first = run(), second = run();
    const results = await Promise.allSettled([f.store.save([first]), competing.save([second])]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(JSON.parse(await readFile(f.path, "utf8")).runs).toEqual([results[0]!.status === "fulfilled" ? first : second]);
  });

  it("fences new operations immediately, drains accepted writes, and closes idempotently", async () => {
    const f = await fixture(), first = run(), last = run();
    const writes = [f.store.save([first]), f.store.save([last])];
    const closing = f.store.close(); expect(f.store.close()).toBe(closing);
    await expect(f.store.load()).rejects.toThrow("closed");
    await expect(f.store.save([run()])).rejects.toThrow("closed");
    await Promise.all(writes); await closing;
    expect(await fileStore(f.path).load()).toEqual([last]);
  });

  it("close after an acquisition failure has no ownership to release, and unused close creates nothing", async () => {
    const f = await fixture(); await f.store.load();
    const competing = fileStore(f.path); await expect(competing.load()).rejects.toThrow("active writer");
    await competing.close();
    expect(spawnSync("flock", ["--exclusive", "--nonblock", f.lockPath, "true"]).status).toBe(1);
    const unused = await fixture(); await unused.store.close();
    expect(await readdir(unused.root)).toEqual([]);
    await expect(unused.store.load()).rejects.toThrow("closed");
  });

  it("fails closed when the fixed utility cannot start or fails, and releases the unsuccessful descriptor", async () => {
    const f = await fixture(), bin = join(f.root, "bin"), previousPath = process.env.PATH;
    await mkdir(bin);
    try {
      process.env.PATH = bin;
      await expect(f.store.save([run()])).rejects.toThrow();
      await writeFile(join(bin, "flock"), `#!${process.execPath}\nprocess.exit(2);\n`, { mode: 0o700 });
      await expect(f.store.save([run()])).rejects.toThrow("acquisition failed");
      expect(await readdir(f.directory)).toEqual([".history.json.lock"]);
    } finally {
      if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    }
    const competing = fileStore(f.path); expect(await competing.load()).toEqual([]);
    await competing.close(); expect(await f.store.load()).toEqual([]);
  });

  it("kills and observes close of only the stuck acquisition utility before reporting timeout", async () => {
    const f = await fixture(), bin = join(f.root, "bin"), pidPath = join(f.root, "utility.pid"), previousPath = process.env.PATH;
    await mkdir(bin);
    await writeFile(join(bin, "flock"), `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 });
    try {
      process.env.PATH = bin;
      await expect(f.store.load()).rejects.toThrow("timed out");
      const pid = Number(await readFile(pidPath, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
      expect(await readdir(f.directory)).toEqual([".history.json.lock"]);
    } finally {
      if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    }
    expect(await fileStore(f.path).load()).toEqual([]);
  }, 10000);

  it.each(["symlink", "hardlink", "fifo", "mode"] as const)("rejects an unsafe %s lock before touching history", async (kind) => {
    const f = await fixture(); await mkdir(f.directory, { mode: 0o700 });
    const other = join(f.root, "unrelated"); await writeFile(other, "untouched", { mode: 0o600 });
    if (kind === "symlink") await symlink(other, f.lockPath);
    if (kind === "hardlink") await link(other, f.lockPath);
    if (kind === "fifo") execFileSync("mkfifo", ["-m", "600", f.lockPath]);
    if (kind === "mode") { await writeFile(f.lockPath, "not private", { mode: 0o600 }); await chmod(f.lockPath, 0o644); }
    await expect(f.store.load()).rejects.toThrow();
    await expect(f.store.save([run()])).rejects.toThrow();
    expect(await readFile(other, "utf8")).toBe("untouched");
    expect(await readdir(f.directory)).toEqual([".history.json.lock"]);
  });

  it("refuses a replaced lock inode or directory while the old inode remains owned", async () => {
    const f = await fixture(), original = run(); await f.store.save([original]);
    await unlink(f.lockPath); await writeFile(f.lockPath, "", { mode: 0o600 });
    await expect(f.store.load()).rejects.toThrow("changed");
    await expect(f.store.save([run()])).rejects.toThrow("changed");
    expect(JSON.parse(await readFile(f.path, "utf8")).runs).toEqual([original]);
    const g = await fixture(); await g.store.save([original]);
    await rename(g.directory, join(g.root, "retired")); await mkdir(g.directory, { mode: 0o700 });
    await expect(g.store.load()).rejects.toThrow();
    await expect(g.store.save([run()])).rejects.toThrow();
    expect(await readdir(g.directory)).toEqual([]);
  });

  it("recovers the operation queue after a read error, reporting that error to its caller", async () => {
    const f = await fixture(); await f.store.save([run()]);
    await writeFile(f.path, "{broken");
    const broken = expect(f.store.load()).rejects.toThrow();
    const replacement = run(); const repaired = f.store.save([replacement]);
    await broken; await repaired; expect(await f.store.load()).toEqual([replacement]);
  });

  it("reports a queued write failure without erasing history and can recover after the underlying failure is repaired", async () => {
    const f = await fixture(), original = run(); await f.store.save([original]);
    await chmod(f.directory, 0o755);
    await expect(f.store.save([run()])).rejects.toThrow("private");
    expect(JSON.parse(await readFile(f.path, "utf8")).runs).toEqual([original]);
    await chmod(f.directory, 0o700);
    const replacement = run(); await f.store.save([replacement]); expect(await f.store.load()).toEqual([replacement]);
  });

  it("does not poison future saves after invalid input and leaves the previous valid snapshot intact", async () => {
    for (const store of [new MemoryTrustedLocalStore(), (await fixture()).store]) {
      const original = run(); await store.save([original]);
      await expect(store.save([{ ...original, output: "λ".repeat(131073) }])).rejects.toThrow();
      expect(await store.load()).toEqual([original]);
      const replacement = run(); await store.save([replacement]); expect(await store.load()).toEqual([replacement]);
    }
  });

  it.each([
    ["duplicate run identities", (runs: TrustedStoredRun[]) => { runs.push(structuredClone(runs[0]!)); }],
    ["duplicate activity identities", (runs: TrustedStoredRun[]) => { runs[0]!.activities.push(structuredClone(runs[0]!.activities[0]!)); }],
    ["turn without thread", (runs: TrustedStoredRun[]) => { runs[0]!.threadId = null; }],
    ["reversed summary timestamps", (runs: TrustedStoredRun[]) => { runs[0]!.summary.updatedAt = "2026-09-07T22:59:59.000Z"; }],
    ["unbounded history", (runs: TrustedStoredRun[]) => { runs.push(...Array.from({ length: 20 }, run)); }],
    ["unbounded activity", (runs: TrustedStoredRun[]) => { runs[0]!.activities = Array.from({ length: 101 }, (_, index) => ({ ...run().activities[0]!, id: String(index) })); }],
  ] as const)("rejects %s", async (_name, mutate) => {
    const store = new MemoryTrustedLocalStore(), records = [run()]; mutate(records);
    await expect(store.save(records)).rejects.toThrow(); expect(await store.load()).toEqual([]);
  });

  it("accepts exactly 20 retained records and byte-bounded output without dropping records", async () => {
    const store = new MemoryTrustedLocalStore();
    const records = Array.from({ length: 20 }, run); records[0]!.output = "λ".repeat(131072);
    await store.save(records); expect(await store.load()).toEqual(records);
  });

  it("enforces the aggregate serialized byte budget, including JSON escaping", async () => {
    const store = new MemoryTrustedLocalStore();
    const records = Array.from({ length: 20 }, () => ({ ...run(), output: "\u0000".repeat(262144) }));
    await expect(store.save(records)).rejects.toThrow("storage bound");
    expect(await store.load()).toEqual([]);
  });

  it.each([
    { version: 2, runs: [] }, { version: 1, runs: [], replay: true }, { version: 1, runs: [{ wrong: true }] },
    { version: 1, runs: [{ ...run(), unexpected: "field" }] },
  ])("rejects unsupported or malformed on-disk structure %#", async (payload) => {
    const f = await fixture(); await f.store.save([]);
    await writeFile(f.path, JSON.stringify(payload)); await expect(f.store.load()).rejects.toThrow();
  });

  it("bounds on-disk size before parsing and rejects invalid UTF-8", async () => {
    const f = await fixture(); await f.store.save([]);
    await truncate(f.path, 8 * 1024 * 1024 + 1); await expect(f.store.load()).rejects.toThrow();
    await writeFile(f.path, Buffer.from([0xff])); await expect(f.store.load()).rejects.toThrow();
  });

  it.each(["symlink", "hardlink", "fifo", "mode"] as const)("rejects a %s destination without changing its contents", async (kind) => {
    const f = await fixture(); await f.store.load();
    const other = join(f.root, "unrelated"); await writeFile(other, "untouched", { mode: 0o600 });
    if (kind === "symlink") await symlink(other, f.path);
    if (kind === "hardlink") await link(other, f.path);
    if (kind === "fifo") execFileSync("mkfifo", ["-m", "600", f.path]);
    if (kind === "mode") { await writeFile(f.path, "not private", { mode: 0o600 }); await chmod(f.path, 0o644); }
    await expect(f.store.load()).rejects.toThrow();
    await expect(f.store.save([run()])).rejects.toThrow();
    expect(await readFile(other, "utf8")).toBe("untouched");
    expect(await readdir(f.directory)).toEqual([".history.json.lock", "history.json"]);
  });

  it("requires a normalized absolute file path and refuses nonprivate or symlinked final directories", async () => {
    expect(() => new FileTrustedLocalStore("relative/history.json")).toThrow();
    expect(() => new FileTrustedLocalStore("/tmp/../tmp/history.json")).toThrow();
    expect(() => new FileTrustedLocalStore("/")).toThrow();
    const f = await fixture(); await mkdir(f.directory, { mode: 0o700 }); await chmod(f.directory, 0o755);
    await expect(f.store.load()).rejects.toThrow();
    await rm(f.directory, { recursive: true }); await symlink(f.root, f.directory);
    await expect(f.store.save([])).rejects.toThrow();
    expect(await readdir(f.root)).toEqual(["private"]);
  });
});
