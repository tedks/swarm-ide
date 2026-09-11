# Quiet graphs when agents have no matching location

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Remove the graph overlay saying “13 unplaced” and its conversation list. Agents
without a matching visible node should simply be absent from that graph. The
ordinary agent list remains their home. Located sprites keep their existing
conversation buttons and worktree scope.

## Progress

- [x] Inspected the shared overlay and identified its count/list and callers.
- [x] Created `fix/quiet-graph-agents` from merged master in the existing sprite worktree; recorded Ditz `swarm-quiet-graph-agents`.
- [x] Removed the shared summary and obsolete styles; updated focused regressions and owned proof expectations.
- [x] Focused local checks and one owned packaged proof passed on `5e33095b`; native and Google review CLEAN, Claude unavailable at the two-minute bound.
- [x] Implementation committed and pushed in PR #153; ROOT performs the normal merge after this outcome note.

## Assumptions and Context

`app/renderer/graph-agents/GraphAgents.tsx` supplies graph sprites from existing
registered observations. `locations.ts` maps their recorded paths or exact task
IDs to visible nodes. `GraphAgentLayer` provides those mappings and preserves
graph geometry. Its separate `GraphAgentPlacementSummary` renders the unwanted
count/list. This is presentation removal, not an instruction to change discovery,
retire sessions, infer a location or introduce a new activity-expiry timer.
Existing bounded Activity observations and project/worktree membership remain
unchanged. Unknown or pathless observations must not gain a fallback position.

## Plan of Work

Remove only `GraphAgentPlacementSummary`, the set computed solely for it, and its
CSS. Keep the layer and sprite controls. Change
`tests/graph-agent-overlay.test.tsx` to exercise all-unplaced and mixed data,
absence of the count/list, retained graph children, exact sprite clicks and the
existing toggle. Update `tools/live-sprites/proof.cjs` to assert absence of the
summary while keeping source/camera, worktree scope and visible task hit targets.
Update current design prose and its existing test mapping without rewriting
historical acceptance records.

## Validation and Acceptance

From this worktree, run:

    nix develop --command bazel test --jobs=3 //tools/live-sprites:checks --test_output=errors

The affected renderer/type tests must pass. A graph with only pathless agents
has no agent badge or count; mixed input shows only matched sprite buttons and
clicking one opens that exact session. Validate the owned packaged proof if the
changed script or layout assertions require it, never on the user's display.
Review the exact diff proportionally before a normal PR merge. Hosted CI remains
informational under the user's local-only directive.

## Surprises & Discoveries

The summary is shared across all graph surfaces; removing it does not require
per-graph edits or any changes to the agent registry.

## Decision Log

Remove both the count and fallback list, not merely the word “unplaced”: neither
adds useful node-specific information. Retain the previously fixed layout wrapper
and task sprite strip. Do not invent an arbitrary new time limit.

## Outcomes & Retrospective

PR #153 removes the count/list on all graph surfaces without touching placement,
the ordinary agent list or discovery. The focused target passed in 23.837s:
116 cases plus one selected mounted case (eight unrelated cases filtered), with
the existing type/syntax checks. The owned packaged proof passed in 1.490s
(2.622s harness), zero renderer errors, zero model turns and confirmed cleanup.
It verified 20 unmatched agents add no graph UI, matched sprite click identity,
task hit targets, worktree exclusions and retained source/cameras. Native Codex
and Google reviews returned CLEAN; Claude Sonnet produced no review within 120s
and remains an explicitly unfilled seat. No repeat or substitute review.

The dedicated test Bazel server was shut down; evidence remains in
`/tmp/swarm-quiet-graphs.Qb7Sso/ui`. Goals and its active buffers were untouched;
the installed Goals process is not hot-swapped by this small change. Previous
unrelated black-screen and aggregate navigation issues are not claimed fixed.

## Idempotence and Recovery

No data migration or agent/process action is needed. Preserve source history and
the separate agent list. Only task-owned test processes may be cleaned up. ROOT
owns merge and any later safe app adoption; do not disturb Goals buffers.

## Interfaces and Dependencies

No protocol, provider, dependency or caller API changes. All edits stay in the
shared renderer, its existing focused checks/proof and living design documents.

Initial plan records the user's 2026-09-11 graph-clutter refinement.

Final note records the tested implementation and review limits; no extra
production or provider scope was added.
