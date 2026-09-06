/** Fixed TEST-ONLY composition; no private settlement endpoint. */
import { startCoreWorker } from "../../core/worker-runtime";
import { createRehearsalAgentService } from "./agent-rehearsal-service";

startCoreWorker({
  async createAgents(options) {
    const service = await createRehearsalAgentService(options);
    return { request: (request) => service.request(request), async shutdown() {
      await service.shutdown();
      process.parentPort?.postMessage({ type: "rehearsal.shutdown", diagnostics: service.diagnostics() });
    } };
  },
});
