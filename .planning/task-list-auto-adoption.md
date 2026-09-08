# Keep the visible task list current

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

When the local Ditz metadata branch changes, the visible Tasks list should adopt
the new complete revision without requiring Refresh. Keep the previous rows during
the read and on failure. A task already attached to an agent draft or explicitly
opened at a pinned revision must not change underneath the operator.

## Progress

- [x] (2026-09-08) Read the client/provider and source-level diagnosis; claim `swarm-task-list-auto-adoption`.
- [ ] Prove automatic adoption and bounded failure/lifetime behavior with direct regression tests.
- [ ] Implement the small client change, update scoped living documentation, and obtain focused native review.
- [ ] Push the reviewed PR, record Ditz outcomes, and hand off to ROOT without adopting the shared app.

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
cheap observation whose local ref differs from both its retained snapshot and
the last full attempt schedules one full read after the cheap request settles.
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
Bazel check entry point for `tests/task-client.test.ts` and both type boundaries;
record its exact invocation and before/after counts below once confirmed. Native
review checks the changed client, regressions, and living documentation. No broad
suite, provider turn, physical GUI, user metadata test writes or peer dependency
is required. ROOT handles normal PR merging and shared-window adoption.

## Decision Log

Use one automatic full read per cheap check and remember the last attempted ref;
this bounds work while allowing a newer revision to recover from a failed one.
Do not expand the separately reported initial-failure retry policy into a new
scheduler. File it as follow-up if still separate after implementation.

## Surprises & Discoveries

The provider intentionally preserves failed full-read status during cheap checks,
even when the reference changes. Therefore automatic adoption cannot rely only
on the `TASK_REF_CHANGED` reason code; it must compare validated revisions.

## Outcomes & Retrospective

Implementation and evidence pending. No claim that this fixes the user's exact
intermittent startup error; the changed-ref manual-refresh policy is confirmed.

## Idempotence and Recovery

Tests use controlled isolated data. Keep explicit Refresh, old rows, selection,
and pinned task context. Commit small changes and preserve the pushed branch;
do not change master, ui-sprint, shared preview, or peer files.

## Artifacts and Notes / Interfaces and Dependencies

The task bridge protocol, provider methods, component graph edges and dependency
versions remain unchanged. Evidence and handoff live in
`/tmp/swarm-ide-usability.BirZCk/task-refresh/`.

Initial plan: bounded client-only automatic metadata adoption, 2026-09-08.
