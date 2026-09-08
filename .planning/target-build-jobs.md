# Build selected targets and retain their results

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Selecting a Bazel rule should let the operator build that exact rule. Refreshing the dependency graph remains a cheap query, not a build. Builds & resources will retain recent results while the operator changes files, including real elapsed time, Bazel milestones and readable failures.

## Assumptions and boundaries

The opened repository is trusted to execute build actions. The renderer is not allowed to choose an executable, working directory or arbitrary flags. Requests name one exact local Bazel label and the repository/world already registered by the core. Each build uses the existing private process owner, at most three Bazel jobs, and one active build per workspace. Stop and shutdown wait for confirmed owner cleanup; ambiguous cleanup prevents another launch. The first increment retains 20 jobs for the core lifetime, not across application restarts. No CPU/memory values are invented.

## Progress

- [x] Inspected the graph query, topology executor, typed bridge and owned process lifecycle.
- [ ] Publish a small build start/observe/cancel protocol and scoped service.
- [ ] Mount explicit graph controls and retained build results without replacing editor state.
- [ ] Prove actual successful/failing disposable targets, progress before exit, cancellation and retention; review the narrow delta.
- [ ] Push the ready PR, update Ditz and clean owned resources.

## Surprises & Discoveries

The existing topology build is a hardcoded example and uses a separate executor. Its jobs are replaced when source changes. The graph query already uses a private PID namespace owner; its collector has a query-specific 30-second deadline and error handling, so the new build collector must not silently reuse those semantics.

## Decision Log

Use a separate typed build observation rather than pretending new jobs are topology snapshot jobs. Preserve old job widgets for compatibility; add real target jobs ahead of them. One local label is shell-free command data, never a target pattern or arbitrary option. Keep job completion distinct from the current source revision: a historical successful build does not turn current source green.

## Context and Orientation

`protocol/build-jobs.ts` defines commands and job state. `core/build-jobs.ts` owns a fixed-root service; `core/target-build-process.ts` runs pinned Bazel with `core/agents/owner.ts` and observes `core/build-progress.ts`. `core/worker-runtime.ts` validates identity, routes commands and awaits shutdown. `app/renderer/repository/BuildGraphPane.tsx` exposes distinct query/build controls. A renderer hook observes jobs, while `app/renderer/build-resources/BuildResources.tsx` displays retained results.

## Plan of Work

First publish the additive protocol and coordinate minimal worker/App mounts with the worktree-navigation owner. Then implement and directly test the service and process collector. Add graph controls for an observed local rule and a job card with target, status, timestamps, elapsed time, milestones, failure output and Stop. The observer survives source changes but fences repository/world/core lifetimes. Update the corresponding living design document and submit mapping additions to the architecture owner.

## Concrete Steps

In `/home/tedks/Projects/swarm-ide/demo-build-jobs`, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile` if needed. Run focused gates through `nix develop --command bazel test --jobs=3 //tools/build-graph:target-checks` and the actual process proof through `nix develop --command bazel run --jobs=3 //tools/build-graph:target-probe`. Build the desktop bundle through Bazel. ROOT, not this worker, adopts the merged application.

## Validation and Acceptance

Direct tests reject option/pattern/path traversal targets, mismatched repository/world responses, concurrent starts and unknown cleanup. Controlled held processes prove milestones, cancellation, shutdown and retained completed jobs independently of source snapshots. The real proof creates a disposable Bazel repository outside fraudcheck with a successful delayed genrule and a failing genrule, observes a milestone before exit, and confirms cleanup. Mounted tests prove exact target activation, retained rows, clear errors and no fabricated CPU/memory. No real model request is needed.

## Idempotence and Recovery

Each admitted build gets a new job ID. Observe never launches work; request failure never triggers an automatic retry of Build. Stop is idempotent. Scratch directories belong to the executor and are removed only after confirmed cleanup; uncertain cleanup retains diagnostics and blocks launches. Source refresh does not remove jobs. Branch/PR and Ditz preserve the work for ROOT integration.

## Artifacts and Notes

Concise progress and verification live in `/tmp/swarm-ide-demo-close.BrSWmt/build-jobs/`. New protocol fields are additive to version 7 and require current matching renderer/core packages.

## Interfaces and Dependencies

`build.start`, `build.observe` and `build.cancel` carry repositoryId/worldId. Start carries target; cancel carries jobId. Successful responses contain buildJobs with scoped immutable job snapshots. `TargetBuildService` is constructed with a canonical registered root and has observe/start/cancel/dispose methods. Worktree switching must construct/use the service corresponding to the selected root; it must never relabel an existing service.

## Outcomes & Retrospective

Implementation in progress. No build success claimed yet.
