import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_DEV_PORT, parseDevPort, resolveDevEndpoint } from "./dev-port.mjs";

const cli = fileURLToPath(new URL("./dev-port.mjs", import.meta.url));

test("defaults only when absent and accepts TCP port boundaries", () => {
  assert.equal(parseDevPort(undefined), DEFAULT_DEV_PORT);
  assert.equal(parseDevPort("1"), 1);
  assert.equal(parseDevPort("65535"), 65535);
  assert.equal(resolveDevEndpoint({}).rendererUrl, "http://127.0.0.1:5173/");
});

test("rejects malformed, empty, and out-of-range ports", () => {
  for (const value of ["", " 5173", "5173 ", "+5173", "1e3", "12.5", "-1", "0", "65536", "nope", 5173]) {
    assert.throws(() => parseDevPort(value), /decimal integer between 1 and 65535/);
  }
});

test("derives all loopback endpoints from the same port", () => {
  assert.deepEqual(resolveDevEndpoint({ SWARM_DEV_PORT: "55173" }), {
    host: "127.0.0.1",
    port: 55173,
    rendererUrl: "http://127.0.0.1:55173/",
    rendererProcessArgument: "--swarm-window-marker=http://127.0.0.1:55173/",
    webSocketOrigin: "ws://127.0.0.1:55173",
  });
});

test("CLI emits marker and rejects an unsupported invocation", () => {
  const environment = { SWARM_DEV_PORT: "55173" };
  const valid = spawnSync(process.execPath, [cli, "renderer-process-argument"], { encoding: "utf8", env: environment });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, "--swarm-window-marker=http://127.0.0.1:55173/\n");
  const invalid = spawnSync(process.execPath, [cli], { encoding: "utf8", env: environment });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /usage: dev-port\.mjs renderer-process-argument/);
});
