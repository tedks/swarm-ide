# Run a component's mapped tests from its design

This ExecPlan follows `.planning/PLANS.md` and is kept current with the work.

## Purpose / Big Picture

Select a component in the graph, read its design document, and see its
real Bazel build and test targets in the right Context sidebar. An explicit Test
click executes `bazel test` in the selected workspace; the existing jobs panel
shows running, pass/fail, output and Stop without changing the document or camera.
This reuses authored `.swarm/plans.json` relationships rather than inventing test
ownership or inferring architectural boundaries from shared build inputs.

## Progress

- [x] (2026-09-09) Inspected existing design/doc mappings, query rule classes and build-only job owner; created dedicated worktree and Ditz issue `swarm-design-component-tests`.
- [x] Implement typed build/test operation and focused backend proof.
- [x] Publish current selected component into Context and add classified target controls, including design → task → Back/Read design restoration.
- [x] Verify 65 focused cases and both TypeScript boundaries, the actual-index reader, and an owned packaged click-to-test journey. Native review of the implementation returned CLEAN.
- [ ] Normal PR142 merge, Ditz accomplishment, and managed local window on Agent owners and steering with tests visible.

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

Implemented with existing authored linkage and the existing owned job runner.
The UI distinguishes observed test rules from ordinary executables and filegroups;
it does not infer exhaustive test ownership from source paths. The owned packaged
journey clicked Test and ran a genuine custom Bazel test, not a compiled binary.
It retained the document, component highlight and zoomed camera with no renderer
errors or model request, then confirmed owned cleanup. Native `sh_test` and
`test_suite` classification is covered in focused tests, not misattributed to that
custom-rule GUI fixture. A separate actual-worker probe proved passing, failing
and no-tests outcomes, including a build that succeeds where running its test fails.

The older broad `//tools/build-graph:target-checks` aggregate encountered two
unchanged plan-first cockpit task fixtures with identity errors. Those are not
claimed fixed or green. The new scoped gate includes the relevant backend and UI
files and passes all 65 cases. The actual-index regression passed independently.

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

    nix develop --command bazel test --jobs=3 //tools/design-tests:checks
    nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests --test_arg=tests/plans-reader.test.ts
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
ordinary controls to select Agent owners and steering, Read design and display mapped tests. Do
not automate any unrelated desktop or discard protected source/chat buffers.

## Idempotence and Recovery

Work stays on the dedicated branch; no master or peer edits. A failed request is
observed, not resent automatically. Stop owns only the launched job. Preserve
failed evidence and report exact limitations. Use normal PR merge and Ditz sync.

## Artifacts and Notes

- PR142 implementation review: native CLEAN for `906ccfc2..dfb876e`.
- `//tools/design-tests:checks`: 65 tests, both TypeScript boundaries and harness syntax checks passed in 15.5s.
- Actual-index reader target: passed in 13.5s.
- Owned packaged proof: `/tmp/swarm-design-ui-proof.LY3V1c/run.ss1XTC/design-tests-proof.json`; screenshot `02-real-test-complete.png` in that directory. Native Test click succeeded in the actual packaged core, zero renderer errors/model calls, cleanup confirmed. This predates only final button theming and plan/evidence notes.
- Actual-worker proof: `//tools/build-graph:target-probe` passed all operation/cleanup cases, using output base `/tmp/swarm-design-component-backend-bazel`.

## Interfaces and Dependencies

`build.start.operation?: "build" | "test"` defaults to build.
`TargetBuildJob.operation?` records the operation without breaking old fixtures.
`TargetBuildExecutor.run` receives the optional operation as its final argument.
Selected-component publication carries node/current/repository/world/generation;
App fences it before exposing Context actions. No dependencies are added.

Initial plan records the agreed reuse-first boundary and the visible acceptance.
