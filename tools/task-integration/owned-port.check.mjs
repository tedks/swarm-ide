import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOwnedVirtualPort } from "./owned-port.mjs";

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function context(port = "55174") {
  const root = await mkdtemp(join(tmpdir(), "swarm-owned-port-test-")); roots.push(root);
  const owner = join(root, "ownership"), authority = join(root, "Xauthority");
  await mkdir(owner, { mode: 0o700 });
  await writeFile(authority, "test", { mode: 0o600 });
  const token = "a".repeat(32);
  for (const [name, value] of Object.entries({ token, display: ":126", xauthority: authority }))
    await writeFile(join(owner, name), value + "\n", { mode: 0o600 });
  return { DISPLAY: ":126", XAUTHORITY: authority, SWARM_X11_DISPLAY: ":126",
    SWARM_X11_XAUTHORITY: authority, SWARM_X11_OWNERSHIP_DIR: owner, SWARM_X11_TOKEN: token,
    SWARM_DEV_PORT: port, SWARM_RENDERER_PROCESS_ARGUMENT: `--swarm-window-marker=http://127.0.0.1:${Number(port)}/`,
    ...(port === "55174" ? {} : { SWARM_VIRTUAL_DESKTOP_PORT: port }) };
}

test("default allocation still returns 55174", async () => assert.equal(await resolveOwnedVirtualPort(await context()), 55174));
test("assigned nondefault allocations are accepted", async () => {
  for (const port of ["55206", "55207"])
    assert.equal(await resolveOwnedVirtualPort(await context(port)), Number(port));
});
test("explicit default and decimal leading zeros remain compatible", async () => {
  const env = await context("055174");
  assert.equal(await resolveOwnedVirtualPort(env), 55174);
});
test("invalid dev or allocated port is rejected", async () => {
  for (const invalid of [undefined, "", " ", "0", "65536", "-1", "55e3", "0xd786", "55174x", "55174.0", " 55174", "55174\n"]) {
    const env = await context(); env.SWARM_DEV_PORT = invalid;
    await assert.rejects(resolveOwnedVirtualPort(env));
    env.SWARM_DEV_PORT = "55174"; env.SWARM_VIRTUAL_DESKTOP_PORT = invalid;
    if (invalid !== undefined && invalid !== "") await assert.rejects(resolveOwnedVirtualPort(env));
  }
});
test("port and marker must match the allocated port", async () => {
  const env = await context();
  env.SWARM_VIRTUAL_DESKTOP_PORT = "55206";
  await assert.rejects(resolveOwnedVirtualPort(env));
  delete env.SWARM_VIRTUAL_DESKTOP_PORT;
  for (const marker of [undefined, "", "--swarm-window-marker=http://0.0.0.0:55174/", "--swarm-window-marker=http://127.0.0.1:55206/"]) {
    env.SWARM_RENDERER_PROCESS_ARGUMENT = marker;
    await assert.rejects(resolveOwnedVirtualPort(env));
  }
});
test("missing or mismatched ownership/display/authority is rejected", async () => {
  for (const key of ["SWARM_X11_OWNERSHIP_DIR", "SWARM_X11_TOKEN", "SWARM_X11_DISPLAY", "DISPLAY", "XAUTHORITY", "SWARM_X11_XAUTHORITY"]) {
    const env = await context(); delete env[key];
    await assert.rejects(resolveOwnedVirtualPort(env));
  }
  for (const display of [":0", ":0.0", "localhost:126", ":127"]) {
    const env = await context(); env.DISPLAY = display; env.SWARM_X11_DISPLAY = display;
    await assert.rejects(resolveOwnedVirtualPort(env));
  }
  const env = await context(); env.SWARM_X11_TOKEN = "b".repeat(32);
  await assert.rejects(resolveOwnedVirtualPort(env));
});
test("private owner and regular bounded metadata are required", async () => {
  const env = await context();
  await chmod(env.SWARM_X11_OWNERSHIP_DIR, 0o755);
  await assert.rejects(resolveOwnedVirtualPort(env));
  await chmod(env.SWARM_X11_OWNERSHIP_DIR, 0o700);
  const token = join(env.SWARM_X11_OWNERSHIP_DIR, "token");
  await writeFile(token, "a".repeat(4096));
  await assert.rejects(resolveOwnedVirtualPort(env));
  await rm(token); await symlink(env.XAUTHORITY, token);
  await assert.rejects(resolveOwnedVirtualPort(env));
});
