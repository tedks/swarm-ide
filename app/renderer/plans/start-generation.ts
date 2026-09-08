import type { SwarmBridge } from "../../electron/preload";
import { componentPlanPrompt, PlanGenerationSettingsSchema, type PlanGenerationSettings } from "../../../protocol/plan-generation";
import { parseCoreRequest, parseCoreResponseForRequest, PROTOCOL_VERSION } from "../../../protocol/schema";
import { PlanGenerationUnconfirmedError } from "./use-plan-generation";

/** Uses the ordinary live owner through this immutable scoped bridge. The
 * component-plan purpose adds absence admission, not a second harness. */
export async function startComponentPlan(bridge: SwarmBridge | undefined, token: string, settings: PlanGenerationSettings): Promise<void> {
  if (!bridge) throw new Error("Connect to the local core before generating a plan.");
  const config = PlanGenerationSettingsSchema.parse(settings);
  const request = parseCoreRequest({ protocolVersion: PROTOCOL_VERSION, requestId: `plan-generation:${crypto.randomUUID()}`,
    type: "trusted.start", purpose: "component-plan", token, text: componentPlanPrompt(config), model: config.model, effort: config.effort });
  try {
    const response = parseCoreResponseForRequest(await bridge.request(request), request);
    if (!response.ok) throw new PlanGenerationUnconfirmedError(`${response.error.message} Check the generation agent before another attempt.`);
    if (!response.trusted || response.trusted.snapshot.runToken !== token) throw new Error("Generation response did not identify the requested agent.");
  } catch (error) {
    if (error instanceof PlanGenerationUnconfirmedError) throw error;
    throw new PlanGenerationUnconfirmedError("Connection lost while starting the design agent. Open it to check progress; your request will not be repeated.");
  }
}
