import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { associateTmux, selectPanes } from "./tmux.mjs";

test("actual tmux selects the named session rather than an empty pane target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "swarm-tmux-real-")), socket = join(dir, "socket");
  const exec = promisify(execFile);
  try {
    await exec("tmux", ["-S", socket, "-f", "/dev/null", "new-session", "-d", "-s", "selected", "sleep", "30"], { timeout: 5000 });
    const result = await selectPanes({ tmuxSocket: socket, tmuxSession: "selected", cwd: dir });
    assert.equal(result.sessionId, "$0");
    assert.deepEqual(result.panes, ["%0"]);
    await assert.rejects(selectPanes({ tmuxSocket: socket, tmuxSession: "absent", cwd: dir }));
  } finally {
    await exec("tmux", ["-S", socket, "kill-server"], { timeout: 5000 }).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "swarm-tmux-cli-")), socket = join(dir, "socket");
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  try { await run({ dir, socket }); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
}
test("lists only the exact selected tmux session using literal argv", () => fixture(async ({ socket }) => {
  const commands = [];
  const selected = await selectPanes({ tmuxServer: "personal", tmuxSession: "a*project", cwd: "/caller" }, async (exe, args) => {
    assert.equal(exe, "tmux"); commands.push(args);
    return commands.length === 1 ? `${socket}\t$7\n` : "%10\n%11\n";
  });
  assert.deepEqual(commands, [["-L", "personal", "display-message", "-p", "-t", "=a*project:", "#{socket_path}\t#{session_id}"], ["-S", socket, "list-panes", "-s", "-t", "$7", "-F", "#{pane_id}"]]);
  assert.deepEqual(selected.panes, ["%10", "%11"]);
}));
test("ambiguous, duplicated and oversized pane lists fail before registration", () => fixture(async ({ socket }) => {
  for (const rows of ["%1\n%1\n", "not-a-pane\n", Array.from({ length: 65 }, (_, i) => `%${i}`).join("\n")]) {
    let calls = 0;
    await assert.rejects(selectPanes({ tmuxServer: "personal", tmuxSession: "project", cwd: "/caller" }, async () => ++calls === 1 ? `${socket}\t$7\n` : rows), /invalid or more than/);
  }
}));
test("association reuses checked registration and each owner's real worktree", () => fixture(async ({ socket, dir }) => {
  let calls = 0; const writes = [], discoveries = [];
  const result = await associateTmux({ tmuxServer: "personal", tmuxSession: "project", cwd: "/caller" }, {
    stateRoot: join(dir, "state"), command: async () => ++calls === 1 ? `${socket}\t$7\n` : "%10\n%11\n%12\n",
    api: {
      discover: async ({ pane }) => { discoveries.push(pane); return pane === "%12" ? undefined : { target: { processPid: Number(pane.slice(1)), processStart: "123" }, rollout: `/known/${pane}.jsonl` }; },
      updateRegistry: async (input) => { writes.push(input); return { sessionId: `session-${input.pane.pane}`, authority: "checked-live" }; },
    },
    contextRoot: async (target) => `/projects/worker-${target.processPid}`,
  });
  assert.deepEqual(discoveries.sort(), ["%10", "%11", "%12"]);
  assert.deepEqual(writes.map((row) => row.contextRoot).sort(), ["/projects/worker-10", "/projects/worker-11"]);
  assert(writes.every((row) => row.action === "register" && row.evidence === "local" && row.pane.socket === socket && row.pane.processStart === "123"));
  assert.equal(result.registered.length, 2); assert.deepEqual(result.skipped, [{ pane: "%12", reason: "No unique live Codex owner" }]);
  assert.equal(result.terminalCommand, `tmux -S '${socket}' attach-session -t '$7'`);
}));
test("unknown owner roots do not fall back to the opened project or create authority", () => fixture(async ({ socket, dir }) => {
  let calls = 0, writes = 0;
  await assert.rejects(associateTmux({ tmuxServer: "personal", tmuxSession: "project", cwd: "/caller" }, {
    stateRoot: join(dir, "state"), command: async () => ++calls === 1 ? `${socket}\t$7\n` : "%10\n",
    api: { discover: async () => ({ target: { processPid: 10 }, rollout: "/known/x.jsonl" }), updateRegistry: async () => { writes++; } },
    contextRoot: async () => { throw new Error("owner worktree unavailable"); },
  }), /owner worktree unavailable/);
  assert.equal(writes, 0);
}));
test("each association starts a fresh bounded registry while preserving the old generation", () => fixture(async ({ socket, dir }) => {
  const writes = [];
  const dependencies = {
    stateRoot: join(dir, "state"),
    command: async (_exe, args) => args.at(-1) === "#{socket_path}\t#{session_id}" ? `${socket}\t$0\n` : args.at(-1) === "#{window_name}" ? "Long window name" : "%10\n",
    api: { discover: async () => ({ target: { processPid: 10, processStart: "1" }, rollout: "/known/a.jsonl" }), updateRegistry: async (input) => { writes.push(input); return { sessionId: "a", authority: "checked-live" }; } },
    contextRoot: async () => "/project/actual",
  };
  const options = { tmuxServer: "personal", tmuxSession: "x".repeat(128), cwd: "/caller" };
  const first = await associateTmux(options, dependencies), next = await associateTmux(options, dependencies);
  assert.notEqual(first.registry, next.registry);
  assert.equal(writes.length, 2); assert(writes.every((row) => row.label.length === 120));
  assert.equal(writes[0].registry, first.registry); assert.equal(writes[1].registry, next.registry);
}));
