# Keep repository build context ready

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

When the IDE opens a selected local repository, its declared Bazel targets and
dependencies should appear without pressing Build topology. Editing build inputs
or returning to the app should update that graph while preserving its last good
result. Ordinary source typing must not launch binary builds or repeated queries.

## Progress

- [x] (2026-09-08) Inspected the existing button, provider, renderer hook and bounds.
- [x] Started `swarm-continuous-build-context` in Ditz.
- [ ] Publish the small renderer hook contract to the cockpit owner.
- [ ] Prove automatic startup/change/return, idle quietness, fencing and retention.
- [ ] Review the implementation, push a ready PR and record evidence and limits.

## Surprises & Discoveries

The existing Build topology button invokes a real build of the fixed checkout
demo service artifact. The separate `core/build-graph.ts` provider already runs a
bounded repository-wide Bazel declaration query. Its renderer hook currently
polls every 500 ms only while a graph/file consumer is visible. These are distinct
operations and must not be conflated.

## Decision Log

Use the existing query provider and existing working-source revision events,
rather than introducing another filesystem watcher or scheduler. The renderer
will debounce changed revision signals, poll only while a query is pending, and
recheck on return from inactivity. The core continues to compare actual build
definitions and filename membership so source-only edits do not run Bazel.

Keep the service artifact build explicit. Automatic declaration observation does
not advance built or deployed revisions. Retain the pinned runtime, no-rc query,
disabled downloads, private owned process, byte/time bounds and cleanup checks.
Opening a project is not authority to execute its `tools/bazel` wrapper.

## Context and Orientation

`app/renderer/repository/use-build-graph.ts` owns a shared observation consumed by
the graph and Context widgets. `core/build-graph.ts` compares build inputs, runs
the query and keeps the last consistent data. `app/renderer/App.tsx` supplies
repository/world/core identity; the cockpit-layout owner alone edits that file.
`app/renderer/startup-topology.ts` is the old one-shot service build path, not the
new automatic query. `core/working-world-observer.ts` already publishes source
revision changes, so the new hook can reuse those signals.

## Plan of Work

Extend `useBuildGraph` with an optional change-token argument, retaining its
existing return shape and explicit refresh action. Replace the unconditional
interval with one coalesced request chain, finite pending-result checks, and
visibility/focus listeners. Require exact repository/world/core lifetime for
accepted responses, including rejected promises. Keep the last graph stale
through same-repository recovery and discard it when repository/world changes.

Add narrow provider regressions where automatic revalidation exposes incorrect
retained status, failed-input recovery or redundant queries. Publish the hook
contract early to cockpit-layout; do not edit App or global layout here.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/usability-continuous-build`, run
`nix develop --command pnpm install --frozen-lockfile` only if needed, then
`nix develop --command bazel test --jobs=3 //tools/build-graph:checks`.
The dedicated target runs renderer/core type checks plus automatic observation,
build-query and startup compatibility tests. Use one owned package query proof
if necessary; never automate physical display :0 or modify the managed preview.

## Validation and Acceptance

Controlled React tests must show startup observation without a visible graph,
zero unchanged idle requests, coalesced source changes, no requests while hidden
or blurred, revalidation on return, finite pending checks and no stale identity
publication. Provider tests must show one query per changed build input, retained
data on failure, no unchanged failure retries, cleanup blocking and cancellation.
The existing real Git/filesystem input test must continue showing source text
does not change build inputs while membership and BUILD edits do.

## Idempotence and Recovery

Use only the designated feature branch and owned temporary artifacts. There is
no persisted timer or automatic replay after a transport error. Explicit Refresh
remains the retry path. Shutdown aborts the owned query and forbids new work.
ROOT merges and adopts the result; retain the pushed worktree and audit history.

## Artifacts and Notes

The step directory is `/tmp/swarm-ide-usability.BirZCk/continuous-build`.
Keep `seam.md`, `verification.md`, checkpoint replies and the final recap there.

## Interfaces and Dependencies

Keep `useBuildGraph(repositoryId, worldId, realm, enabled, options?)` and return
`{ observation, refresh }`. `options.changeToken` is the current working-source
revision string, not a render counter or camera position. App supplies enabled
only for the live core in the opened project, independent of selected pane.
The existing `buildGraph.observe` typed bridge stays unchanged.

## Outcomes & Retrospective

Implementation and checks pending. The scoped outcome is automatic declared
build context; generic service extraction and automatic binary builds are not
part of this increment.
