import type { BuildGraphObservation, BuildTarget } from "../../../protocol/build-graph";
import { SelectedBuildTargetSchema } from "../../../protocol/build-jobs";

export type BazelPaletteOperation = "build" | "test";

export interface BazelPaletteScope {
  repositoryId: string;
  worldId: string;
  coreGeneration: number;
  workspaceVisit: number;
}

export interface BazelPaletteTarget {
  label: string;
  ruleClass: string;
  operation: BazelPaletteOperation;
  authority: string;
  ready: boolean;
}

export interface BazelTargetCatalogue {
  authority: string | null;
  rows: BazelPaletteTarget[];
  state: "loading" | "unavailable" | "refreshing" | "current" | "stale" | "error" | "mismatched";
  message: string;
  complete: boolean | null;
}

/** One classifier for Component Context and the command palette. */
export function observedRuleOperation(target: BuildTarget | undefined): BazelPaletteOperation | null {
  if (target?.kind !== "rule" || !SelectedBuildTargetSchema.safeParse(target.label).success) return null;
  return target.ruleClass === "test_suite" || target.ruleClass?.endsWith("_test") ? "test" : "build";
}

function matchingGraph(scope: BazelPaletteScope, observation: BuildGraphObservation | undefined) {
  const graph = observation?.graph;
  return observation?.repositoryId === scope.repositoryId && observation.worldId === scope.worldId &&
    graph?.repositoryId === scope.repositoryId && graph.worldId === scope.worldId ? graph : undefined;
}

export function bazelPaletteAuthority(scope: BazelPaletteScope, observation: BuildGraphObservation | undefined): string | null {
  const graph = matchingGraph(scope, observation);
  return graph ? JSON.stringify([scope.repositoryId, scope.worldId, scope.coreGeneration, scope.workspaceVisit,
    observation!.generation, graph.inputDigest, graph.observedAt]) : null;
}

export function bazelTargetCatalogue(scope: BazelPaletteScope, observation: BuildGraphObservation | undefined,
  operation: BazelPaletteOperation, query: string, blocked: boolean): BazelTargetCatalogue {
  const graph = matchingGraph(scope, observation);
  const authority = bazelPaletteAuthority(scope, observation);
  const state = !observation ? "loading" : !graph ? "mismatched" : observation.status;
  const ready = state === "current" && !blocked;
  const fragment = query.toLowerCase();
  const rows = graph?.targets.flatMap((target): BazelPaletteTarget[] => {
    if (observedRuleOperation(target) !== operation || !target.label.toLowerCase().includes(fragment) || !authority) return [];
    return [{ label: target.label, ruleClass: target.ruleClass ?? "Bazel rule", operation, authority, ready }];
  }).sort((left, right) => left.label.localeCompare(right.label)) ?? [];
  const complete = graph?.complete ?? null;
  const message = state === "loading" ? "Loading observed Bazel targets…"
    : state === "mismatched" ? "The target catalogue belongs to another workspace. Reopen the palette after the workspace settles."
    : state === "refreshing" ? "Refreshing Bazel targets; retained labels are disabled until the observation is current."
    : state === "stale" ? "Bazel targets need refresh; retained labels are disabled."
    : state === "error" ? `Bazel targets unavailable: ${observation?.message ?? "observation failed"}. Retained labels are disabled.`
    : state === "unavailable" ? `No Bazel target catalogue: ${observation?.message ?? "observation unavailable"}.`
    : `${complete ? "Current complete" : "Current partial"} target catalogue · ${rows.length} matching ${operation === "test" ? "test" : "build"} ${rows.length === 1 ? "rule" : "rules"}.`;
  return { authority, rows, state, message, complete };
}

export function permitsBazelPaletteActivation(candidate: BazelPaletteTarget, scope: BazelPaletteScope,
  observation: BuildGraphObservation | undefined, operation: BazelPaletteOperation, blocked: boolean): boolean {
  if (!candidate.ready || candidate.operation !== operation || blocked) return false;
  return bazelTargetCatalogue(scope, observation, operation, candidate.label, blocked).rows.some((row) =>
    row.ready && row.label === candidate.label && row.operation === candidate.operation && row.authority === candidate.authority);
}
