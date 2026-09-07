import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

const checkout = process.env.SWARM_INSTALL_CHECKOUT;
const evidence = process.env.SWARM_INSTALL_EVIDENCE;
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const environment = { ...process.env, DISPLAY: "", SWARM_DEV_PORT: String(server.address().port) };
  for (const key of ["BUILD_WORKSPACE_DIRECTORY", "BUILD_WORKING_DIRECTORY", "SWARM_WORKSPACE_ROOT", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete environment[key];
  const rejected = (args, pattern) => {
    try {
      execFileSync("nix", ["develop", "--command", "bazel", "run", "--jobs=3", "//:dev", "--", ...args],
        { cwd: checkout, env: environment, encoding: "utf8", timeout: 45000, stdio: "pipe" });
      assert.fail("Public launch unexpectedly succeeded");
    } catch (error) {
      assert.equal(error.status, 2, "public launcher error reaches caller");
      assert.match(error.stderr, pattern);
      return error.stderr;
    }
  };
  const missing = rejected(["--workspace", join(process.env.SWARM_INSTALL_SCRATCH, "missing")], /Workspace must be an existing directory/);
  const occupied = rejected(["--workspace", process.env.SWARM_INSTALL_TARGET], /EADDRINUSE.*SWARM_DEV_PORT/);
  assert(server.listening, "unrelated owned listener was not stopped");
  await assert.rejects(access(join(checkout, ".swarm-dev")), { code: "ENOENT" });
  await writeFile(join(evidence, "startup-rejections.json"), JSON.stringify({ missing, occupied, listenerPreserved: true, devOutputAbsent: true }, null, 2));
} finally { await new Promise((resolve) => server.close(resolve)); }
