import { z } from "zod";

export const DEFAULT_PLAN_PROMPT = `Explain this repository as a navigable software system, grounded in the code that exists.
Inspect the instructions, entrypoints, source tree and build declarations first. Write a concise top-level design and component documents under docs/design/. Start with a few meaningful responsibility areas; descend only when it makes the system easier to understand. Describe responsibilities, inputs, outputs, important constraints and the actual interfaces between components. Link concrete source files. Where Bazel is present, record only declared local targets and verified srcs/data/tools/actual/tests relationships. Omit unknown relationships; a build dependency is not a runtime call.
Create the accompanying .swarm/plans.json hierarchy using the format below. Keep interface edges sparse and meaningful: containment already comes from parentId. Explain the system to a new contributor, not to an auditor. Preserve existing prose and user work. Do not modify application behavior, install dependencies, run services, commit or push.`;

export const PlanGenerationSettingsSchema = z.object({
  harness: z.literal("codex").default("codex"),
  model: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/).default("gpt-5.6-sol"),
  effort: z.enum(["low", "medium", "high", "xhigh"]).default("xhigh"),
  prompt: z.string().min(1).max(8000).refine((value) => Boolean(value.trim()) && !value.includes("\0")).default(DEFAULT_PLAN_PROMPT),
}).strict();
export type PlanGenerationSettings = z.infer<typeof PlanGenerationSettingsSchema>;

/** The editable intent is followed by the real repository format, not an
 * opaque generated graph or a claim that source proves runtime behavior. */
export function componentPlanPrompt(settings: PlanGenerationSettings): string {
  return `${settings.prompt}\n\nOutput contract (Swarm component plan version 1):
Work only in the current worktree. Before writing, check .swarm/plans.json again. If ANY file, directory or symlink exists there, STOP and explain that the existing plan needs an explicit edit decision. Never replace it. Do not overwrite existing design documents; choose new document names when necessary. Partial files may remain if interrupted. Write the index LAST, exclusively (create only if absent), after documents are ready.
Use this JSON shape; replace all example identities, paths and text with actual repository content:
{"version":1,"nodes":[{"id":"system","kind":"component","title":"System","parentId":null,"docs":["docs/design/system.md"],"sourcePaths":[],"taskIds":[],"contextRefs":[],"design":{"summary":"What this system does","state":"implemented","constraints":[],"connections":[],"buildTargets":[]}}]}
Every node needs id, kind (plan|component), title, parentId (existing id or null), docs, sourcePaths, taskIds and contextRefs. IDs use letters, digits, underscore/hyphen and optional colon-separated segments. Paths must be canonical repository-relative paths, never absolute or traversal. Use an acyclic parent hierarchy and unique IDs. Mark unimplemented components design.state=planned. Do not invent task IDs. contextRefs entries are {kind:doctrine|contract|lesson,path,note:string|null}.
Optional design has summary (up to 2048 characters), state implemented|planned, constraints (strings up to 512), connections and buildTargets. connections entries are {targetId,label,kind:request|result|data|navigation,detail}; targetId must be another existing node, label up to 128, detail up to 1024; omit detail if unnecessary. At most 16 connections per component. buildTargets entries are {label,role,dependencies:[{label,relation:srcs|data|tools|actual|tests}]}; only actual local //package:target labels, at most 16 targets per component and 32 declared dependencies per target. Exported source files are inputs, not invented rules. No unknown keys. Keep the index under 64 KiB and 128 nodes; keep titles under 256 bytes. Empty lists are fine.
Validate the JSON, all parent/connection IDs and actual referenced paths before finishing. Your final reply should summarize the documents and components created or explain the concrete failure. Do not claim validation solely because you wrote a final message.`;
}
