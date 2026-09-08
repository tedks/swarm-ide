import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { parseArguments, launchConfiguration, launch } from "./launcher.mjs";

test("arguments accept explicit workspace/profile and help", () => {
  assert.deepEqual(parseArguments(["--workspace", "../project", "--user-data-dir", "./profile"]), { workspace: "../project", userDataDir: "./profile" });
  assert.deepEqual(parseArguments(["-h"]), { help: true });
  assert.deepEqual(parseArguments([]), {});
});
test("unknown, repeated and missing options fail before Electron", () => {
  for (const args of [["toString", "x"], ["__proto__", "x"], ["--workspce", "."], ["--workspace"], ["--workspace", ""], ["--workspace", "--help"], ["--workspace", ".", "--workspace", ".."], ["--user-data-dir", "x", "--user-data-dir", "y"], ["--no-sandbox"]]) assert.throws(() => parseArguments(args));
});
test("tmux scope is explicit and cannot be confused with a Codex session or registry", () => {
  assert.deepEqual(parseArguments(["--tmux-server", "personal", "--tmux-session", "project"]), { tmuxServer: "personal", tmuxSession: "project" });
  assert.deepEqual(parseArguments(["--tmux-socket", "./socket", "--tmux-session", "project"]), { tmuxSocket: "./socket", tmuxSession: "project" });
  for (const args of [["--tmux-session", "project"], ["--tmux-server", "personal"], ["--tmux-server", "../bad", "--tmux-session", "project"], ["--tmux-server", "personal", "--tmux-socket", "/socket", "--tmux-session", "project"], ["--tmux-server", "personal", "--tmux-session", "project", "--agent-registry", "/registry"]]) assert.throws(() => parseArguments(args));
});
test("relative workspace/profile resolve from invocation, not immutable bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "swarm-cli-test-"));
  try {
    mkdirSync(join(root, "project with spaces")); mkdirSync(join(root, "caller"));
    const config = launchConfiguration(parseArguments(["--workspace", "../project with spaces", "--user-data-dir", "../my profile"]), { cwd: join(root, "caller"), environment: {}, bundleRoot: "/nix/store/install", electron: "/nix/store/electron" });
    assert.equal(config.cwd, join(root, "project with spaces"));
    assert.equal(config.env.SWARM_WORKSPACE_ROOT, config.cwd);
    assert.deepEqual(config.args, ["/nix/store/install"]);
    assert.equal(config.env.SWARM_CLI_USER_DATA_DIR, `${root}/my profile`);
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
  const environment = { PATH: "/host/tools", XAUTHORITY: "/owned/auth", DISPLAY: ":155", GH_CONFIG_DIR: "/host/gh", XDG_CONFIG_HOME: "/host/config", CODEX_HOME: "/host/codex", SWARM_RENDERER_URL: "http://localhost:1", SWARM_DEV_CONTROL: "/old/dev", ELECTRON_RUN_AS_NODE: "1", SWARM_WORKSPACE_ROOT: "/old", SWARM_CLI_USER_DATA_DIR: "/old/profile" };
  const config = launchConfiguration({}, { cwd: process.cwd(), environment, bundleRoot: "/install", electron: "/electron" });
  for (const key of ["PATH", "XAUTHORITY", "DISPLAY", "GH_CONFIG_DIR", "XDG_CONFIG_HOME", "CODEX_HOME"]) assert.equal(config.env[key], environment[key]);
  for (const key of ["SWARM_RENDERER_URL", "SWARM_DEV_CONTROL", "ELECTRON_RUN_AS_NODE", "SWARM_CLI_USER_DATA_DIR"]) assert.equal(config.env[key], undefined);
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
for (const [signal, expected] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  test(`forwards ${signal} to its child and retains the signal exit status`, async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-cli-signal-"));
    let wrapper;
    try {
      const fake = join(root, "electron.mjs"), driver = join(root, "driver.mjs");
      // The bounded fallback prevents an orphan even if signal forwarding regresses.
      writeFileSync(fake, `console.log('READY'); setTimeout(() => process.exit(0), 1500);`);
      writeFileSync(driver, `import { launch } from ${JSON.stringify(new URL("./launcher.mjs", import.meta.url).href)}; process.exitCode = await launch([], {bundleRoot: ${JSON.stringify(fake)}, electron: process.execPath});`);
      wrapper = spawn(process.execPath, [driver], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
      const closed = once(wrapper, "close");
      await once(wrapper.stdout, "data");
      wrapper.kill(signal);
      assert.deepEqual(await closed, [expected, null]);
    } finally {
      if (wrapper?.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
    }
  });
}
test("installed entry applies the chosen profile before starting the fixed app", () => {
  const source = readFileSync(new URL("./electron-main.cjs", import.meta.url), "utf8");
  const run = (profile) => {
    const calls = []; let effective = "/normal/config/swarm-ide";
    runInNewContext(source, {
      process: { env: profile === undefined ? {} : { SWARM_CLI_USER_DATA_DIR: profile } },
      console: { log: (line) => calls.push(line) },
      require: (name) => {
        if (name === "electron") return { app: { setPath: (key, value) => { assert.equal(key, "userData"); calls.push("profile"); effective = value; }, getPath: () => effective } };
        if (name === "node:fs") return { mkdirSync: (path, options) => { assert.equal(path, profile); assert.equal(options.mode, 0o700); calls.push("mkdir"); } };
        if (name === "node:path") return { isAbsolute: (path) => path.startsWith("/") };
        assert.equal(name, "../app/electron/main.js"); calls.push("fixed-app");
      },
    });
    return calls;
  };
  assert.deepEqual(run("/chosen/profile"), ["mkdir", "profile", 'swarm: profile "/chosen/profile"', "fixed-app"]);
  assert.deepEqual(run(undefined), ['swarm: profile "/normal/config/swarm-ide"', "fixed-app"]);
  assert.throws(() => run("relative"), /absolute path/);
});
