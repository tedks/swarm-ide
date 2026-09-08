# Show admitted trusted runs in task context

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator viewing a Ditz task should see the trusted conversations actually launched with that task, their current or archived status, and a deliberate way to open one. Task selection must never fabricate an association or mark an issue complete when an agent turn finishes.

## Progress

- [x] (2026-09-08 00:39Z) Read assigned worktree, shared wave contract and current task/dock interfaces.
- [x] (2026-09-08 00:44Z) Implement pure task-run projection and contextual view; native first pass and copy-fix convergence CLEAN. New identity/excerpt/retention tests authored.
- [x] (2026-09-08 00:54Z) ROOT-cleared exact F1 contract a6e7c8c normally composed. Presentation aliases now use its exported runtime types; actual parsed-snapshot regression and typecheck PASS9/9, native delta CLEAN.
- [ ] ROOT integration gate: W6 observation/selection App join. No F1 runtime/store or W6 implementation consumed.
- [x] (2026-09-08 00:49Z) Corrected full quality1804/135 and focused8/8 passed; native source/fix/tooling review CLEAN. Owned standalone virtual proof passed1308ms, cleanup1. Push bounded handoff.

## Surprises & Discoveries

The current strict trusted snapshot has no admitted task reference or run list. The task context already has a separate isolated/rehearsal run log; it must remain separate. The trusted dock stays mounted when another dock tab is selected, so its retained observation can feed task context without a second poller. Initial quality executed 1,804 tests: 1,802 passed and two new tests failed because their purported alternate revisions accidentally equalled the fixture's original revisions. Corrected the test data; this is not claimed as a production RED/fix.

## Decision Log

Use a pure presentation subset of the agreed run shapes before the producer is available; do not change wire schemas or accept unparsed IPC. W6 will expose its already-validated observation and an exact-token conversation selection callback. This avoids duplicate polling and persistence while preserving core admission authority. Match world, repository and task ID; allow historical metadata revisions but label the actual admitted revision. Selected output requires the exact admitted reference to agree with its run summary, not merely a matching task ID.

ROOT subsequently cleared exact committed F1 contract a6e7c8c. Normally merge only that increment and replace interim interfaces with aliases/Pick of its exported types. Keep PR74's exact committed dependency explicit; do not consume the moving runtime branch. Validate this erased-type/narrow test delta with typechecking and9focused tests, not another full suite or unchanged UI proof.

## Outcomes & Retrospective

PR74 contains the bounded read-only consumer. Native code, copy-fix and proof-tooling reviews are CLEAN. Before the contract composition, corrected quality passed1,804 tests/135files plus node/renderer builds; focused8/8 and syntax checks passed. Owned :155/55235 standalone visual proof passed1308ms with zero renderer errors and cleanup confirmed. Actual CodeMirror text/cursor/DOM and draft were retained; graph was a stand-in. The subsequent exact F1 contract composition and type-alias/parsed-snapshot delta passed typecheck9/9focused in10s and native delta CLEAN; unchanged visual proof was not rerun or represented as a new joined run. No production App, actual Ditz admission or provider/model turn is claimed. W6 App/runtime integration remains ROOT-owned.

## Context and Orientation

`app/renderer/tasks/TaskContext.tsx` renders pinned metadata, update history and existing agent/log associations. `app/renderer/agents/TrustedLocalPane.tsx` is the independent trusted conversation dock. `protocol/agent-task.ts` defines the admitted task identity; `protocol/trusted-local.ts` is the strict wire boundary owned by the fleet-core peer. New `app/renderer/tasks/TaskTrustedRuns.tsx` and its pure helper will accept only already-validated presentation data, not IPC. `App.tsx` needs only a shared observation/callback seam coordinated with the dock owner.

## Plan of Work

First add bounded selector and presentation tests covering identity, historical revision, archived status, selected transcript correlation and exact-token activation. Add the contextual view without source or task navigation side effects. After ROOT clears the typed producer, use the dock's validated observation and selection callback. Keep the old loaded-run and recorded journal sections unchanged and separately labelled.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/trusted-task-linkage`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use Bazel for all tests/builds: `nix develop --command bazel test //tools/task-runs:regressions --jobs=3`, then `nix develop --command bazel test //tools:quality --jobs=3`. The owned UI proof uses virtual display :155 and port 55235, never a user desktop.

## Validation and Acceptance

Tests show only exact admitted world/repository/task matches, retain original metadata revision, reject mismatched selected transcript references, and never transform ready/closed into task completion. An operator click emits only the exact conversation token; late updates or a task switch cannot show the previous task's output. Run `nix develop --command bazel run //tools/task-runs:smoke --jobs=3` for the standalone controlled actual component/CodeMirror proof. It has no production bridge, model, actual admission or production graph; the graph is a stand-in. W6's later joined controlled UI proof must cover actual App/cameras and validated fleet observation. Controlled activity is not real model delivery.

## Idempotence and Recovery

This read-only view adds no storage or process authority. Missing producer support, a disconnected core or absent history is explicit and cannot initiate a run. Preserve branches, worktrees and evidence; ROOT owns normal PR landing and application adoption.

## Artifacts and Notes

Coordination and verification live under `/tmp/swarm-ide-real-swarms.Djy75P/task-runs/`. Local visual evidence is `artifacts/task-runs/run.Bk1NYJ/proof.json` with two PNGs. The independently testable presentation is pushed before the producer join; that is an explicit held boundary, not a completed live feature. `tools/task-runs/README.md` explains reproducible evidence boundaries.

## Interfaces and Dependencies

`TaskContext` gains optional `trustedObservation` and `onOpenTrustedRun(token)` props. The observation contains a validated snapshot subset and a retained flag. `TaskTrustedRuns` filters by the task snapshot's world/repository and selected task ID; it has no bridge, timer, source navigation or write callbacks. W6 owns the observation source and exact conversation selection. F1 owns runtime declarations and core-admitted references.

Initial plan records bounded parallel implementation and the explicit producer gate.

2026-09-08: Recorded first native-clean presentation increment, exact test-data correction and separate proof/join limits.

2026-09-08: Recorded completed local/owned proof and the intentionally held ROOT-only runtime join; no whole legacy suite or real model was repeated for this consumer.

2026-09-08: Recorded exact ROOT-authorized F1 contract consumption, direct type aliases and proportional parsed-snapshot compatibility proof. Runtime/App join remains separate.
