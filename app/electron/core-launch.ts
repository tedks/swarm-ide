import { utilityProcess } from "electron";
import { join } from "node:path";

/** Fixed local entry; neither renderer nor repository configuration chooses it. */
export function launchLocalCore(root: string, storeRoot: string) {
  return utilityProcess.fork(join(__dirname, "../../core/worker.js"), [], {
    serviceName: "swarm-ide-local-core", stdio: "pipe",
    env: { ...process.env, SWARM_WORKSPACE_ROOT: root, SWARM_AGENT_STORE_ROOT: storeRoot },
  });
}
