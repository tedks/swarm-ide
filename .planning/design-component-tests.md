# Run a component's mapped tests from its design

This ExecPlan follows `.planning/PLANS.md` and is kept current with the work.

## Purpose / Big Picture

Select Planning in the component graph, read its design document, and see its
real Bazel build and test targets in the right Context sidebar. An explicit Test
click executes `bazel test` in the selected workspace; the existing jobs panel
shows running, pass/fail, output and Stop without changing the document or camera.
This reuses authored `.swarm/plans.json` relationships rather than inventing test
ownership or inferring architectural boundaries from shared build inputs.

## Progress

- [x] (2026-09-09) Inspected existing design/doc mappings, query rule classes and build-only job owner; created dedicated worktree and Ditz issue `swarm-design-component-tests`.
- [ ] Implement typed build/test operation and focused backend proof.
- [ ] Publish current selected component into Context and add classified target controls.
- [ ] Verify focused UI/operation tests and an owned packaged click-to-test journey; native review to clean.
- [ ] Normal PR merge, Ditz accomplishment, and managed local window on Planning with tests visible.

## Surprises & Discoveries

Existing component mappings mix real test rules with manual binaries and source
filegroups. For example `//tools/component-plan:checks` is a `sh_test`, while its
`:live` target is a model-running binary. Only an observed `_test` rule or
`test_suite` receives a Test action. A missing query record is unavailable, not
an invented test. The existing executor only invokes `bazel build`.

## Decision Log

Keep the existing `build.start` request with an optional `operation` of build or
test; omission remains build. Keep captured workspace ownership, cancellation,
one active job and retained results. This is a small compatible addition, not a
new job system. The existing design index needs no new test schema.

Selection is published from the single existing plan reader; Context cannot
retain runnable controls across a worktree/core change or failed plan refresh.
Build and Test are separate explicit actions. No automatic test run, model
request, manual-demo execution or full-repository test sweep is introduced.

## Outcomes & Retrospective

Implementation underway. Existing linkage is sufficient; UI selection and test
execution are the missing pieces. Record actual checks and remaining limits here
before landing; do not call building a test target a test pass.

## Context and Orientation

`app/renderer/plans/PlanWorkspace.tsx` owns the plan reader shared by document and
graph. `DesignWorkspace.tsx` already shows authored target links below the design.
`app/renderer/App.tsx` owns Context attention and workspace-specific build jobs.
`protocol/build-graph.ts` gives observed targets their Bazel rule class.
`core/build-jobs.ts` and `core/target-build-process.ts` own exact-label builds,
process lifetime and cancellation. `BuildResources.tsx` renders their results.

## Plan of Work

First extend `protocol/build-jobs.ts` and its executor with optional build/test
operation, preserving old callers. Test failure, cancellation and no-tests results
must not read as success. Next publish the selected plan node, current-read state
and repository/core identity to App. A small Context component classifies only
mapped observed labels, shows unavailable mappings as text, and calls the existing
target-job hook with explicit operation. Observe jobs, never replay Start.

Update scoped living design documents and actual Bazel check-target mappings.
ROOT owns renderer/integration/landing; one native helper owns the backend files
and another owns only `tools/design-tests/` verification support in this worktree.

## Concrete Steps

Use `/home/tedks/Projects/swarm-ide/design-component-tests`, branch
`feature/design-component-tests`, based on merged `906ccfc2`. Dependencies are
materialized through `nix develop --command pnpm install --frozen-lockfile`.
Run focused verification through Bazel:

    nix develop --command bazel test --jobs=3 //tools/design-tests:checks //tools/build-graph:target-checks
    nix develop --command bazel build --jobs=3 //:desktop-bundle
    nix develop --command bazel run --jobs=3 //tools/design-tests:smoke

## Validation and Acceptance

Unit/mounted checks cover explicit mapped test classification, non-test binaries,
unknown labels, selection changes, stale/recovered data, exact workspace and
operation, no background writes, retained document and result labels. The owned
desktop proof uses a disposable real Git/Bazel repository and a real test target;
it is not a model turn or a test of the user's live workspace. Backend proof
includes real passing/failing/no-tests outcomes with confirmed owned cleanup.

After verified landing, update only the ROOT-managed local :0 window and use
ordinary controls to select Planning, Read design and display mapped tests. Do
not automate any unrelated desktop or discard protected source/chat buffers.

## Idempotence and Recovery

Work stays on the dedicated branch; no master or peer edits. A failed request is
observed, not resent automatically. Stop owns only the launched job. Preserve
failed evidence and report exact limitations. Use normal PR merge and Ditz sync.

## Artifacts and Notes

Record focused logs, owned screenshot and final reviewer outcome at completion.

## Interfaces and Dependencies

`build.start.operation?: "build" | "test"` defaults to build.
`TargetBuildJob.operation?` records the operation without breaking old fixtures.
`TargetBuildExecutor.run` receives the optional operation as its final argument.
Selected-component publication carries node/current/repository/world/generation;
App fences it before exposing Context actions. No dependencies are added.

Initial plan records the agreed reuse-first boundary and the visible acceptance.
