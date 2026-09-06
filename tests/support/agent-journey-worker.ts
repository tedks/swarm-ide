/** Separate test artifact: never imported by the production entry. */
import { startCoreWorker } from "../../core/worker-runtime";
import { createJourneyAgentService } from "./agent-journey-service";
import { z } from "zod";

const envelope = z.object({ type: z.literal("fixture.control"), id: z.string().uuid(), input: z.unknown() }).strict();
let service: Promise<Awaited<ReturnType<typeof createJourneyAgentService>>>;
startCoreWorker({
  createAgents(options) { service = createJourneyAgentService(options); return service; },
  privateMessage(input) {
    const parsed = envelope.safeParse(input);
    if (!parsed.success) return false;
    const { id } = parsed.data;
    void (async () => {
      try {
        if (!service) throw new Error("Fixture service is not initialized");
        const value = await (await service).control(parsed.data.input);
        process.parentPort?.postMessage({ type: "fixture.reply", id, ok: true, value });
      } catch {
        process.parentPort?.postMessage({ type: "fixture.reply", id, ok: false });
      }
    })();
    return true;
  },
});
