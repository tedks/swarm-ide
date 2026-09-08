import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { componentPlanPrompt, PlanGenerationSettingsSchema, type PlanGenerationSettings } from "../protocol/plan-generation";
import { assertRepositoryBoundary } from "./repository-boundary";

/** Missing is different from unreadable, malformed or a dangling symlink. */
export async function componentPlanMissing(root: string): Promise<boolean> {
  try {
    if (await realpath(root) !== resolve(root)) return false;
    await assertRepositoryBoundary(root, ".swarm/plans.json");
    const directory = join(root, ".swarm");
    try {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) return false;
    } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
    try { await lstat(join(directory, "plans.json")); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
  } catch { return false; }
}

/** Admission guard for the normal agent owner. It does not spawn or write.
 * The agent also gets an exclusive-create instruction for the later file race. */
export async function prepareComponentPlan(root: string, settings: PlanGenerationSettings): Promise<string> {
  const parsed = PlanGenerationSettingsSchema.parse(settings);
  if (!await componentPlanMissing(root)) throw new Error("A plan already exists or cannot be checked. Open .swarm/plans.json before changing it.");
  return componentPlanPrompt(parsed);
}
