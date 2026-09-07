import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const launcher = fileURLToPath(new URL("./launch.mjs", import.meta.url));
function launch(extra) {
  // No virtual owner: even the unfixed negative cannot reach any Git command.
  // The regression requires Git redirection rejection BEFORE owner/setup work.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") &&
    !key.startsWith("SWARM_X11_") && !["DISPLAY", "XAUTHORITY"].includes(key)));
  return spawnSync(process.execPath, [launcher], { env: { ...env, ...extra }, encoding: "utf8", timeout: 3000 });
}
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG_COUNT", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_PARAMETERS"]) {
  test(`reject ambient ${key} before owned setup`, () => {
    const result = launch({ [key]: "/must-not-be-used" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ambient Git environment is unsupported for the disposable tour/);
    assert(!result.stderr.includes("/must-not-be-used"), "Do not echo supplied path/config values");
  });
}
test("even an empty override fails closed", () => {
  assert.match(launch({ GIT_DIR: "" }).stderr, /Ambient Git environment is unsupported/);
});
test("no redirection proceeds to the existing virtual-owner guard", () => {
  const result = launch({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Owned virtual X11 required/);
});
for (const name of ["GIT_EDITOR", "GIT_PAGER"]) test(`inert ${name} is permitted then cleared for Git`, () => {
  const result = launch({ [name]: "false" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Owned virtual X11 required/);
});
