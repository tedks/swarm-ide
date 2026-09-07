// The shared harness validates availability and owns the listener's process group.
// This launcher must agree with its configured port, never silently substitute one.
function resolveOwnedPort(environment) {
  const actual = environment.SWARM_DEV_PORT;
  const expected = environment.SWARM_VIRTUAL_DESKTOP_PORT ?? "55174";
  if (typeof actual !== "string" || !/^[0-9]+$/.test(actual) ||
      typeof expected !== "string" || !/^[0-9]+$/.test(expected) ||
      Number(actual) < 1 || Number(actual) > 65535 || Number(actual) !== Number(expected)) {
    throw new Error("Plans proof port must match the configured owned virtual desktop port");
  }
  return Number(actual);
}
module.exports = { resolveOwnedPort };
