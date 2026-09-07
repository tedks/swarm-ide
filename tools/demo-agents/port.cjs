function resolveOwnedPort(environment) {
  const raw = environment.SWARM_DEV_PORT;
  const expected = environment.SWARM_VIRTUAL_DESKTOP_PORT ?? "55174";
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw) ||
      typeof expected !== "string" || !/^[0-9]+$/.test(expected) ||
      Number(raw) < 1 || Number(raw) > 65535 || Number(raw) !== Number(expected)) {
    throw new Error("Owned test port must match the configured virtual desktop port");
  }
  return Number(raw);
}
module.exports = { resolveOwnedPort };
