import { LaunchContextSchema, type LaunchContext } from "../../../protocol/agents";
import type { FocusRef } from "../../../protocol/schema";

// Compile-time dev flag plus an explicit user gesture; never a bridge capability.
export const fixturePreviewEnabled = (dev: boolean, flag: unknown): boolean => dev && flag === "1";

export function fixtureLaunchContext(focus: FocusRef, taskText: string, model: string, effort: string): LaunchContext {
  return LaunchContextSchema.parse({
    worldId: focus.worldId, repositoryId: "fixture-only", root: "/fixture/not-a-real-workspace", head: null,
    workingFingerprint: "0".repeat(64), focus, taskText,
    links: { parentRunId: null, task: null, spec: null }, requested: { model: model.trim() || null, effort: effort.trim() || null },
    attachments: [], instructionSources: [], configurationSources: [],
    submittedPrompt: `FIXTURE ONLY — no files attached, no provider contacted.\n${taskText}`,
    contextHash: "0".repeat(64), diskOnly: true,
    access: { policy: "read-only", toolNetwork: false, approvals: "never", hostConfidentiality: false, sendsSelectedContentToProvider: true },
  });
}
