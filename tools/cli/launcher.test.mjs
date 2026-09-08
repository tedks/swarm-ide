import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArguments, launchConfiguration, launch } from "./launcher.mjs";

test("arguments accept explicit workspace/profile and help", () => {
  assert.deepEqual(parseArguments(["--workspace", "../project", "--user-data-dir", "./profile"]), { workspace: "../project", userDataDir: "./profile" });
  assert.deepEqual(parseArguments(["-h"]), { help: true });
  assert.deepEqual(parseArguments([]), {});
});
test("unknown, repeated and missing options fail before Electron", () => {
  for (const args of [["--workspce", "."], ["--workspace"], ["--workspace", ""], ["--workspace", "--help"], ["--workspace", ".", "--workspace", ".."], ["--user-data-dir", "x", "--user-data-dir", "y"], ["--no-sandbox"]]) assert.throws(() => parseArguments(args));
});
test("relative workspace/profile resolve from invocation, not immutable bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "swarm-cli-test-"));
  try {
    mkdirSync(join(root, "project with spaces")); mkdirSync(join(root, "caller"));
    const config = launchConfiguration(parseArguments(["--workspace", "../project with spaces", "--user-data-dir", "../my profile"]), { cwd: join(root, "caller"), environment: {}, bundleRoot: "/nix/store/install", electron: "/nix/store/electron" });
    assert.equal(config.cwd, join(root, "project with spaces"));
    assert.equal(config.env.SWARM_WORKSPACE_ROOT, config.cwd);
    assert.deepEqual(config.args, ["/nix/store/install", `--user-data-dir=${root}/my profile`]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("default workspace is caller; symlinks are canonical and file/missing paths reject", () => {
  const root = mkdtempSync(join(tmpdir(), "swarm-cli-test-"));
  try {
    mkdirSync(join(root, "repo")); symlinkSync("repo", join(root, "alias")); writeFileSync(join(root, "file"), "text");
    const runtime = { cwd: root, environment: {}, bundleRoot: "/install", electron: "/electron" };
    assert.equal(launchConfiguration({}, runtime).cwd, root);
    assert.equal(launchConfiguration({ workspace: "alias" }, runtime).cwd, join(root, "repo"));
    for (const workspace of ["file", "missing"]) assert.throws(() => launchConfiguration({ workspace }, runtime), /not an accessible directory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("development controls are removed while host tools/config/display remain", () => {
  const environment = { PATH: "/host/tools", XAUTHORITY: "/owned/auth", DISPLAY: ":155", GH_CONFIG_DIR: "/host/gh", XDG_CONFIG_HOME: "/host/config", CODEX_HOME: "/host/codex", SWARM_RENDERER_URL: "http://localhost:1", SWARM_DEV_CONTROL: "/old/dev", ELECTRON_RUN_AS_NODE: "1", SWARM_WORKSPACE_ROOT: "/old" };
  const config = launchConfiguration({}, { cwd: process.cwd(), environment, bundleRoot: "/install", electron: "/electron" });
  for (const key of ["PATH", "XAUTHORITY", "DISPLAY", "GH_CONFIG_DIR", "XDG_CONFIG_HOME", "CODEX_HOME"]) assert.equal(config.env[key], environment[key]);
  for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "ELECTRON_RUN_AS_NODE"]) assert.equal(config.env[key], undefined);
  assert.equal(environment.ELECTRON_RUN_AS_NODE, "1");
  assert.deepEqual(config.args, ["/install"]);
});
test("no-sandbox is never implicit and only exact explicit environment value is accepted", () => {
  const runtime = { cwd: process.cwd(), bundleRoot: "/install", electron: "/electron" };
  assert.deepEqual(launchConfiguration({}, { ...runtime, environment: { SWARM_ELECTRON_NO_SANDBOX: "1" } }).args, ["/install", "--no-sandbox"]);
  assert.throws(() => launchConfiguration({}, { ...runtime, environment: { SWARM_ELECTRON_NO_SANDBOX: "0" } }), /exactly '1'/);
});
test("owned-window marker is literal and cannot introduce an Electron option", () => {
  const runtime = { cwd: process.cwd(), bundleRoot: "/install", electron: "/electron" };
  const marker = "--swarm-window-marker=http://127.0.0.1:55417/";
  assert.deepEqual(launchConfiguration({}, { ...runtime, environment: { SWARM_RENDERER_PROCESS_ARGUMENT: marker } }).args, ["/install", marker]);
  assert.throws(() => launchConfiguration({}, { ...runtime, environment: { SWARM_RENDERER_PROCESS_ARGUMENT: "--no-sandbox" } }), /Invalid owned-window marker/);
});
test("foreground launch uses literal arguments and reports the owned child's exit", async () => {
  const root = mkdtempSync(join(tmpdir(), "swarm-cli-exec-"));
  try {
    const script = join(root, "fake electron.mjs");
    writeFileSync(script, `import assert from 'node:assert/strict'; assert.equal(process.cwd(), process.env.SWARM_WORKSPACE_ROOT); process.exitCode = 7;`);
    assert.equal(await launch(["--workspace", root], { bundleRoot: script, electron: process.execPath }), 7);
    await assert.rejects(launch([], { bundleRoot: script, electron: join(root, "missing") }), /ENOENT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
