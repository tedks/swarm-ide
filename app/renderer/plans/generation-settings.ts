import { PlanGenerationSettingsSchema, type PlanGenerationSettings } from "../../../protocol/plan-generation";

const key = "swarm.component-plan.settings.v1";
export function readPlanGenerationSettings(storage?: Pick<Storage, "getItem">): PlanGenerationSettings {
  try {
    const saved = (storage ?? window.localStorage).getItem(key);
    if (saved) return PlanGenerationSettingsSchema.parse(JSON.parse(saved));
  } catch { /* Bad/absent local preference never authorizes a model call. */ }
  return PlanGenerationSettingsSchema.parse({});
}
export function savePlanGenerationSettings(settings: PlanGenerationSettings, storage?: Pick<Storage, "setItem">): void {
  (storage ?? window.localStorage).setItem(key, JSON.stringify(PlanGenerationSettingsSchema.parse(settings)));
}
