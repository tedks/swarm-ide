import { afterEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExternalAgentService, boundFleet } from "../core/external-agents";
import { EXTERNAL_FLEET_MAX_ENTRIES, EXTERNAL_FLEET_MAX_ENTRY_BYTES, externalEntryBytes, ExternalSnapshotSchema } from "../protocol/external-agents";
import { terminalCommands, type TmuxTarget } from "../core/external-agents-handoff";
import { PROTOCOL_VERSION } from "../protocol/common";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
const dirs: string[] = [], services: ExternalAgentService[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const service of services.splice(0)) await service.dispose();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const metadata = (id: string, parent?: string) => JSON.stringify({ type: "session_meta", payload: { id, ...(parent ? { forked_from_id: parent } : {}) } }) + "\n";
const command = (cmd: string, at = "2026-09-08T03:45:00Z") => JSON.stringify({ timestamp: at, type: "response_item", payload: {
  type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd }),
} }) + "\n";
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "swarm-fleet-test-")); dirs.push(dir);
  const worktrees = ids.map((_, index) => join(dir, `worktree-${index}`));
  const rollouts = ids.map((_, index) => join(dir, `rollout-${index}.jsonl`));
  await Promise.all(worktrees.map((path) => mkdir(path)));
  await Promise.all(rollouts.map((path, index) => writeFile(path, metadata(ids[index]!, index ? ids[0] : undefined) + command(`worker-${index}`))));
  const registry = join(dir, "registry.json");
  await writeFile(registry, JSON.stringify({ version: 1, sessions: ids.map((id, index) => ({ id, label: `Worker ${index}`, evidence: "synthetic", rollout: rollouts[index], contextRoot: worktrees[index] })) }), { mode: 0o600 });
  const service = new ExternalAgentService(worktrees[0]!, registry); services.push(service);
  const snapshot = async () => {
    const result = await service.request({ type: "externalAgents.snapshot", protocolVersion: PROTOCOL_VERSION, requestId: "fleet-check" });
    if (result.kind !== "snapshot") throw new Error("Wrong result kind");
    return result.snapshot;
  };
  return { dir, worktrees, rollouts, snapshot };
}

describe("all-registered external fleet reads", () => {
  it("does not reopen unchanged historical transcripts, but rereads changed files", async () => {
    const { snapshot, rollouts } = await setup();
    await snapshot();
    const opens = () => vi.mocked(fsPromises.open).mock.calls.filter(([path]) => rollouts.includes(String(path))).length;
    const initial = opens(); expect(initial).toBe(3);
    await snapshot(); expect(opens()).toBe(initial);
    await appendFile(rollouts[1]!, command("new historical note"));
    const changed = await snapshot(); expect(opens()).toBe(initial + 1);
    expect(changed.fleet?.[1]?.entries.at(-1)?.command).toBe("new historical note");
  });

  it("bounds all 64 session feeds together and prioritizes interactive registrations", async () => {
    const { snapshot } = await setup();
    const base = (await snapshot()).fleet![0]!;
    const many = Array.from({ length: 64 }, (_, n) => ({ ...base,
      session: { ...base.session, id: `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`, control: n === 63 ? "tmux" as const : "read-only" as const },
      entries: Array.from({ length: 120 }, (_, index) => ({ ...base.entries[0]!, id: `event-${n}-${index}` })),
    }));
    const bounded = boundFleet(many), entries = bounded.flatMap((detail) => detail.entries);
    expect(entries).toHaveLength(EXTERNAL_FLEET_MAX_ENTRIES);
    expect(bounded[63]?.entries).toHaveLength(120);
    expect(bounded.some((detail) => detail.coverage.partial)).toBe(true);
    expect(ExternalSnapshotSchema.safeParse({ status: "observed", observedAt: new Date().toISOString(), message: "", sessions: many.map((detail) => detail.session), fleet: many }).success).toBe(false);
    const large = many.map((detail) => ({ ...detail, entries: detail.entries.map((entry) => ({ ...entry, patch: "x".repeat(16384) })) }));
    const byteBounded = boundFleet(large).flatMap((detail) => detail.entries);
    expect(byteBounded.length).toBeGreaterThan(0);
    expect(byteBounded.length).toBeLessThan(EXTERNAL_FLEET_MAX_ENTRIES);
    expect(byteBounded.reduce((sum, entry) => sum + externalEntryBytes(entry), 0)).toBeLessThanOrEqual(EXTERNAL_FLEET_MAX_ENTRY_BYTES);
  });
  it("snapshot alone exposes three live tails, exact registered worktrees and fork ancestry", async () => {
    const { snapshot, worktrees } = await setup();
    const result = await snapshot();
    expect(result.status).toBe("observed");
    expect(result.sessions.map((session) => session.id)).toEqual(ids);
    expect(result.sessions.map((session) => session.worktree)).toEqual(worktrees);
    expect(result.sessions.map((session) => [session.parentId, session.ancestry])).toEqual([
      [null, "root"], [ids[0], "registered-parent"], [ids[0], "registered-parent"],
    ]);
    expect(result.fleet?.map((detail) => detail.entries[0]?.command)).toEqual(["worker-0", "worker-1", "worker-2"]);
    expect(result.fleet?.map((detail) => detail.session.ancestry)).toEqual(["root", "registered-parent", "registered-parent"]);
    expect(result.sessions.every((session) => session.control === "read-only")).toBe(true);
  });

  it("keeps overlapping event IDs as appends move a large UTF-8 tail window", async () => {
    const { snapshot, rollouts } = await setup();
    const large = Array.from({ length: 180 }, (_, index) => command(`build-${String(index).padStart(3, "0")} ${"λ🦊".repeat(450)}`));
    await writeFile(rollouts[0]!, metadata(ids[0]!) + large.join(""));
    expect((await stat(rollouts[0]!)).size).toBeGreaterThan(262144);
    const before = (await snapshot()).fleet![0]!;
    expect(before.entries).toHaveLength(16);
    await appendFile(rollouts[0]!, command(`next ${"界".repeat(1200)}`));
    const after = (await snapshot()).fleet![0]!;
    const oldIds = new Map(before.entries.map((entry) => [entry.command, entry.id]));
    const overlapping = after.entries.filter((entry) => oldIds.has(entry.command));
    expect(overlapping.length).toBeGreaterThan(10);
    for (const entry of overlapping) expect(entry.id).toBe(oldIds.get(entry.command));
    expect(after.entries.at(-1)?.command).toMatch(/^next /);
    expect(before.coverage.partial && after.coverage.partial).toBe(true);
    expect(after.coverage.tailBytes).toBeLessThanOrEqual(262144);
  });

  it("withholds a complete JSON record until its terminating newline arrives", async () => {
    const { snapshot, rollouts } = await setup();
    await appendFile(rollouts[1]!, command("held-λ").trimEnd());
    const held = (await snapshot()).fleet![1]!;
    expect(held.entries.map((entry) => entry.command)).toEqual(["worker-1"]);
    expect(held.coverage.partial).toBe(true);
    await appendFile(rollouts[1]!, "\n");
    const complete = (await snapshot()).fleet![1]!;
    expect(complete.entries.map((entry) => entry.command)).toEqual(["worker-1", "held-λ"]);
    expect(complete.coverage.partial).toBe(false);
  });

  it("changes an event ID when content changes at the same inode, header and offset", async () => {
    const { snapshot, rollouts } = await setup();
    const path = rollouts[2]!, header = metadata(ids[2]!, ids[0]);
    await writeFile(path, header + command("echo alpha"));
    const beforeStat = await stat(path), before = (await snapshot()).fleet![2]!;
    await writeFile(path, header + command("echo bravo"));
    const afterStat = await stat(path), after = (await snapshot()).fleet![2]!;
    expect(afterStat.ino).toBe(beforeStat.ino);
    expect(afterStat.size).toBe(beforeStat.size);
    expect(after.session.observationId).toBe(before.session.observationId);
    expect(after.entries[0]?.command).toBe("echo bravo");
    expect(after.entries[0]?.id).not.toBe(before.entries[0]?.id);
  });
});

describe("copyable owner terminal commands", () => {
  const target: TmuxTarget = { socket: "/tmp/tmux-owner's/socket", windowId: "@7", paneId: "%19", panePid: 100, processPid: 101, processStart: "123" };
  it("shell-quotes the exact socket and uses only validated pane identities", () => {
    expect(terminalCommands(target)).toEqual({
      attach: "tmux -S '/tmp/tmux-owner'\\''s/socket' attach-session -t '%19'",
      switch: "tmux -S '/tmp/tmux-owner'\\''s/socket' switch-client -t '%19'",
      location: "@7 / %19",
    });
  });
  it("rejects noncanonical socket paths and shell-like pane syntax before producing commands", () => {
    for (const socket of ["relative/socket", "/tmp/a/../socket", "/tmp/socket\n", "/tmp/socket/"])
      expect(() => terminalCommands({ ...target, socket })).toThrow();
    for (const paneId of ["%19; echo bad", "-a", "19", "%1234567890123"])
      expect(() => terminalCommands({ ...target, paneId })).toThrow();
  });
});
