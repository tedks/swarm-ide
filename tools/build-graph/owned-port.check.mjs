import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("packaged build graph uses the shared owned allocation before listening", async () => {
  const launch = await readFile(new URL("./launch.mjs", import.meta.url), "utf8");
  assert.match(launch, /import \{ resolveOwnedVirtualPort \} from "\.\.\/task-integration\/owned-port\.mjs"/);
  assert.match(launch, /const port = await resolveOwnedVirtualPort\(\)/);
  assert.match(launch, /server\.listen\(port, "127\.0\.0\.1", resolve\)/);
  assert(!launch.includes("55174"), "the default belongs to the shared guard, not another fixed launcher");
  assert(launch.indexOf("await resolveOwnedVirtualPort()") < launch.indexOf("server = createServer"));
  assert(launch.includes('mkdtemp(join(owner, "swarm-build-graph-package-"))'));
  assert(launch.includes('await rm(scratch, { recursive: true, force: true })'));
});
