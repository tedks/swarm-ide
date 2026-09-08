# Show admitted trusted runs in task context

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator viewing a Ditz task should see the trusted conversations actually launched with that task, their current or archived status, and a deliberate way to open one. Task selection must never fabricate an association or mark an issue complete when an agent turn finishes.

## Progress

- [x] (2026-09-08 00:39Z) Read assigned worktree, shared wave contract and current task/dock interfaces.
- [ ] Implement and test a pure task-run projection and contextual view.
- [ ] Join only ROOT-cleared typed producer and W6 conversation selection seam.
- [ ] Run relevant local gates, native convergence and owned virtual proof; push handoff.

## Surprises & Discoveries

The current strict trusted snapshot has no admitted task reference or run list. The task context already has a separate isolated/rehearsal run log; it must remain separate. The trusted dock stays mounted when another dock tab is selected, so its retained observation can feed task context without a second poller.

## Decision Log

Use a pure presentation subset of the agreed run shapes before the producer is available; do not change wire schemas or accept unparsed IPC. W6 will expose its already-validated observation and an exact-token conversation selection callback. This avoids duplicate polling and persistence while preserving core admission authority. Match world, repository and task ID; allow historical metadata revisions but label the actual admitted revision. Selected output requires the exact admitted reference to agree with its run summary, not merely a matching task ID.

## Outcomes & Retrospective

Implementation in progress. No live model turn or integrated trusted history is claimed.

## Context and Orientation

`app/renderer/tasks/TaskContext.tsx` renders pinned metadata, update history and existing agent/log associations. `app/renderer/agents/TrustedLocalPane.tsx` is the independent trusted conversation dock. `protocol/agent-task.ts` defines the admitted task identity; `protocol/trusted-local.ts` is the strict wire boundary owned by the fleet-core peer. New `app/renderer/tasks/TaskTrustedRuns.tsx` and its pure helper will accept only already-validated presentation data, not IPC. `App.tsx` needs only a shared observation/callback seam coordinated with the dock owner.

## Plan of Work

First add bounded selector and presentation tests covering identity, historical revision, archived status, selected transcript correlation and exact-token activation. Add the contextual view without source or task navigation side effects. After ROOT clears the typed producer, use the dock's validated observation and selection callback. Keep the old loaded-run and recorded journal sections unchanged and separately labelled.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/trusted-task-linkage`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use Bazel for all tests/builds: `nix develop --command bazel test //tools/task-runs:regressions --jobs=3`, then `nix develop --command bazel test //tools:quality --jobs=3`. The owned UI proof uses virtual display :155 and port 55235, never a user desktop.

## Validation and Acceptance

Tests must show only exact admitted world/repository/task matches, retain original metadata revision, reject mismatched selected transcript references, and never transform ready/closed into task completion. An operator click emits only the exact conversation token; late updates or a task switch cannot show the previous task's output. A joined controlled UI proof should preserve source text/cursor, draft, task focus and graph cameras while selecting a conversation. Controlled activity is not real model delivery.

## Idempotence and Recovery

This read-only view adds no storage or process authority. Missing producer support, a disconnected core or absent history is explicit and cannot initiate a run. Preserve branches, worktrees and evidence; ROOT owns normal PR landing and application adoption.

## Artifacts and Notes

Coordination and evidence live under `/tmp/swarm-ide-real-swarms.Djy75P/task-runs/`. The independently testable presentation may be pushed before the producer join; that is an explicit held boundary, not a completed live feature.

## Interfaces and Dependencies

`TaskContext` gains optional `trustedObservation` and `onOpenTrustedRun(token)` props. The observation contains a validated snapshot subset and a retained flag. `TaskTrustedRuns` filters by the task snapshot's world/repository and selected task ID; it has no bridge, timer, source navigation or write callbacks. W6 owns the observation source and exact conversation selection. F1 owns runtime declarations and core-admitted references.

Initial plan records bounded parallel implementation and the explicit producer gate.
