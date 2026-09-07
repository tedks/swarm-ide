// Initial extraction of the two launchers' fixed-port guard, before correction.
export async function resolveOwnedVirtualPort(environment = process.env) {
  const port = Number(environment.SWARM_DEV_PORT);
  if (!Number.isInteger(port) || port !== 55174) throw new Error("Owned test port 55174 required");
  return port;
}
