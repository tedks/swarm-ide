export function resolveElectronRuntimeArguments(environment = process.env) {
  const requested = environment.SWARM_ELECTRON_NO_SANDBOX;
  if (requested === undefined) return [];
  if (requested === "1") return ["--no-sandbox"];
  throw new Error("SWARM_ELECTRON_NO_SANDBOX must be exactly '1' when set");
}
