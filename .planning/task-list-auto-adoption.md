# Keep the visible task list current

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

When the local Ditz metadata branch changes, the visible Tasks list should adopt
the new complete revision without requiring Refresh. Keep the previous rows during
the read and on failure. A task already attached to an agent draft or explicitly
opened at a pinned revision must not change underneath the operator.

## Progress

- [x] (2026-09-08) Read the client/provider and source-level diagnosis; claim `swarm-task-list-auto-adoption`.
- [x] (2026-09-08 13:48Z) Baseline missing-behavior tests: 10 failed, 57 passed; first implementation: 67 passed plus both TypeScript boundaries.
- [x] (2026-09-08 13:51Z) Added a rollback recovery regression: 1 failed, 67 passed before the narrow eligibility correction.
- [x] (2026-09-08) Implemented client-only change and scoped living documentation; initial native review CLEAN.
- [x] (2026-09-08 13:52Z) Final focused gate: 124 tests in five files and both TypeScript boundaries passed; rollback-delta native review CLEAN.
- [x] (2026-09-08) Pushed PR113 ready for ROOT, recorded Ditz outcomes and the separate initial-read follow-up; shared app unchanged.

## Context and Orientation

`app/renderer/tasks/client.ts` owns the single visible five-second task-list
timer, focus checks and request coalescing. `tasks.snapshot` with `refresh:false`
only checks the local metadata Git reference; `refresh:true` asks
`core/tasks/provider.ts` to parse a complete revision and replace its cache
atomically. The provider retains the previous snapshot when reading fails.
`tests/task-client.test.ts` supplies controlled bridge replies and fake timers.
The current behavior deliberately detects changed metadata but waits for a user
refresh. This is source evidence, not a reproduction of the user's running error.

## Assumptions and Failure Modes

The provider remains read-only and returns validated repository/world/revision
identities. Metadata can change again during a full read, can be malformed, or
can disappear. A hidden client must not start another automatic scan. Old replies
from a disposed or replaced core must not publish. Repeated timer/focus triggers
must not create overlapping reads. A failed attempt at an unchanged revision
must not produce an endless full-scan retry loop.

## Plan of Work / Milestones

First add tests showing a cheap M-to-N change followed automatically by one full
read; hold the full reply to prove M remains visible and extra timer/focus events
do not add requests. Include failed replacement, subsequent different revision,
hidden/disposed/generation changes, and revision-pinned detail/attachment cases.
Run these before changing production code to record the missing behavior.

Then track the most recent full-read revision in `TaskBridgeClient`. A validated
cheap observation whose local ref differs from the last full attempt and either
differs from the retained snapshot or still carries a failed/stale status
schedules one full read after the cheap request settles. This also recovers when
the local ref rolls back to the retained good revision after a failed update.
Full reads never immediately chain more automatic full reads: further metadata
movement catches up at the next normal five-second check. Explicit Refresh remains
available. Keep provider publication and all detail/attachment APIs unchanged.
Update `docs/repo-task-browser.md` and `docs/design/planning.md` to state the new
list behavior and unchanged pinned-context behavior. The existing component graph
and Bazel input mappings do not change; the shared plan manifest is owned by the
parallel plan-repair worker and is not edited here.

## Concrete Steps / Validation and Acceptance

Work only in `/home/tedks/Projects/swarm-ide/usability-task-refresh` on
`feature/usability-task-refresh`. Materialize dependencies with
`nix develop --command pnpm install --frozen-lockfile`. Use the existing focused
Bazel check entry point with both type boundaries:

    nix develop --command bazel test //tools/demo-syntax:editor-tests --jobs=3 --test_arg=tests/task-client.test.ts --test_arg=tests/task-provider.test.ts --test_arg=tests/task-attachment-eligibility.test.ts --test_arg=tests/task-graph-client.test.ts --test_arg=tests/task-refresh-presentation.test.tsx --test_output=errors

The baseline and initial implementation used only the task-client test argument;
the final command adds directly affected provider, attachment, graph and steady
refresh-presentation compatibility tests. Native
review checks the changed client, regressions, and living documentation. No broad
suite, provider turn, physical GUI, user metadata test writes or peer dependency
is required. ROOT handles normal PR merging and shared-window adoption.

## Decision Log

Use one automatic full read per cheap check and remember the last attempted ref;
this bounds work while allowing a newer revision to recover from a failed one.
Do not expand the separately reported initial-failure retry policy into a new
scheduler. It remains separate and is filed as `swarm-task-first-read-recovery`.

## Surprises & Discoveries

The provider intentionally preserves failed full-read status during cheap checks,
even when the reference changes. Therefore automatic adoption cannot rely only
on the `TASK_REF_CHANGED` reason code; it must compare validated revisions.
The same applies to rolling back from failed N to retained M: comparing only the
cache with the local ref would leave a sticky failure despite the user's repair.

## Outcomes & Retrospective

The client now performs automatic changed-ref adoption and retains pinned detail
and attachment references. The final focused command passed 124 tests in five
files plus both TypeScript boundaries in 14.898 seconds. The 68 client tests
include automatic M-to-N adoption, retained rows during a held read, no overlapping
checks, failed-ref suppression, recovery on another ref or rollback, hidden and
replaced-core cancellation, and unchanged pinned references. Existing real
Git/YAML provider tests passed separately within that command; this is not a new
packaged GUI or real agent demonstration. Initial and narrow fix-delta native
reviews were CLEAN. No foreign reviews or hosted CI were requested for this wave.

The initial failure/no-cache recovery remains explicitly filed separately. No
claim that this fixes the user's exact intermittent startup error; the changed-ref
manual-refresh policy is confirmed. No layout, core provider, protocol or shared
plan-index mutation was needed. The known shared manifest validation repair stays
with the plan-repair worker; these unchanged graph/Bazel mappings remain accurate.

## Idempotence and Recovery

Tests use controlled isolated data. Keep explicit Refresh, old rows, selection,
and pinned task context. Commit small changes and preserve the pushed branch;
do not change master, ui-sprint, shared preview, or peer files.

## Artifacts and Notes / Interfaces and Dependencies

The task bridge protocol, provider methods, component graph edges and dependency
versions remain unchanged. Evidence and handoff live in
`/tmp/swarm-ide-usability.BirZCk/task-refresh/`.

Initial plan: bounded client-only automatic metadata adoption, 2026-09-08.
Updated after direct implementation and rollback regression evidence; retain
no-cache initial recovery as a separate follow-up rather than expand scope.
Final evidence update: focused checks and both native review rounds completed;
PR113 is the independent delivery, with ROOT responsible for merge/adoption.
