# Open the IDE with awareness already running

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening a project should show current Work Log outcomes, task dependencies and
component plans without clicking Start or Load. Automatic observation must not
launch builds, tests or coding agents. The existing configured summarizer is the
only automatic model operation; explicit Pause remains effective after restart.

## Progress

- [x] (2026-09-09) Read instructions and inspected current startup paths.
- [x] Persist summary Pause and start the primary core watcher automatically.
- [x] Recover task reads when metadata first becomes available; refresh plans.
- [x] Join ROOT-cleared PR144 (63ad77a) normally; automatic dependency replacement preserves its filters.
- [x] Focused regressions and native convergence CLEAN; actual owned packaged startup/commit-advance proof passes.
- [ ] Final documentation, pushed ready PR and ROOT handoff.

## Surprises & Discoveries

Work Log already has a cross-window producer lock and saves attempted turn IDs
before inference. The renderer only reads it. Task metadata polling already runs
but its recovery escalation incorrectly requires a previous usable snapshot.
Native review caught publication/read overlap, a retry cap shortening long saved
delays, close-before-ready watcher leakage, StrictMode replay and held-input Pause.
Corrections preserve the existing producer lane and are covered by focused checks.
The broad old planning/task-workbench target has fixture repository identities
that disagree with the current protocol; those failures remain on the existing
fixture issue, not a claimed successful full run. The owned task-client fixture
now supplies its declared repository ID; new plan tests use current identities.

## Decision Log

Automatic startup belongs to the primary core runtime, not a renderer mount or
read request. Keep existing outcome/state formats, with a separate small watcher
preference for Pause so a second producer cannot overwrite it while publishing.
TaskGraph was changed only after ROOT cleared the normally merged filter owner;
graph.ts and the component canvas/layout remain unchanged by this work.

## Context and Orientation

`core/work-log/service.ts` owns summary scheduling, private Git state and saved
outcomes. `core/worker-runtime.ts` creates its primary-workspace instance.
`app/renderer/work-log/WorkLogPanel.tsx` observes it and offers controls.
`app/renderer/tasks/client.ts` polls task metadata and retains the last snapshot.
`app/renderer/plans/navigation.ts` owns plan observation and selected component.

## Plan of Work

First add a core-owned activation method and persistent Pause preference with
bounded retries, retaining locks, cancellation and attempt bookkeeping. Exercise
this against disposable Git repositories and a controlled summary dependency,
never a real model. Then correct task recovery and coalesce plan refresh on the
existing working-input token and focus return. After the filter owner is cleared,
reuse the existing four-reader task dependency loader automatically per revision.

## Concrete Steps

From this worktree, run focused targets discovered in BUILD.bazel through
`nix develop --command bazel --output_base=/tmp/swarm-ide-ready-on-open.nCPyTL/awareness/bazel test --jobs=2`.
Use existing Work Log, task and plan targets plus both TypeScript boundaries.
Commit/push granular increments and open a draft PR early. Record exact counts
and command outcomes in the step verification file.

## Validation and Acceptance

Prove no-click startup with a controlled provider; Pause/restart/Resume, idle zero
calls, two-window deduplication, failed attempt no replay and close cancellation.
Prove missing metadata then a new valid ref triggers one full read, not repeated
failures at the same ref. Plan refresh must preserve equal index objects and
selection. Automatic graph replacement must retain its old consistent graph,
filters and cameras and cancel work from old lifetimes.

## Idempotence and Recovery

Malformed saved state is never overwritten. Disposal stops only this service's
work. Do not touch managed app, physical display, credentials, peer worktrees or
queues. Feature branches stay recoverable; ROOT owns normal merge and adoption.

## Artifacts and Notes

Step evidence lives in `/tmp/swarm-ide-ready-on-open.nCPyTL/awareness`.

## Interfaces and Dependencies

Reuse typed WorkLog requests and existing WorkLogDependencies for controlled
tests. No new renderer filesystem/process authority or provider framework.

## Outcomes & Retrospective

The focused checks pass 107 awareness and 49 graph tests, including both TypeScript
boundaries. One owned packaged check proved automatic Work Log watching and task
graph startup, then an actual CLI-authored metadata commit automatically changed
five tasks to six. All filter, dirty source/cursor and component/task cameras
survived; zero renderer errors and confirmed cleanup. No real summary/model call
was made: lifecycle tests use a controlled provider and GUI uses an empty registry.
