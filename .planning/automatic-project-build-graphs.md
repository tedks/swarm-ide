# Load a project's build graph without a setup button

This ExecPlan is maintained according to `.planning/PLANS.md`.

## Purpose / Big Picture

Opening a trusted Bazel project should load its declared build dependencies without a prerequisite refresh click. Switching worktrees or changing build definitions should update that worktree's graph while retaining the last usable graph. Goals must no longer fail merely because Bazel's query representation exceeds the old 4 MiB raw-output cutoff.

## Progress

- [x] (2026-09-08) Read the provider, hook, worktree router and existing compatibility checks. Confirmed streamed JSON records, whole-output collection, and offline automatic queries.
- [x] (2026-09-08 19:38Z) Actual Goals baseline failed at the raw cutoff after 10.3 seconds; two new behavior regressions failed, 64 tests passed.
- [x] (2026-09-08 19:42Z) Automatic loading and query-only raw cutoff removal implemented; 67 focused tests and both TypeScript boundaries passed.
- [x] (2026-09-08 19:47Z) Goals and Pure Sky read-only automatic queries passed; corrected owned virtual startup/change proof passed, native review CLEAN, final two focused Bazel targets passed. Documentation and ready PR handoff finishing.

## Surprises & Discoveries

The old 4 MiB limit counted stdout plus stderr in the process collector, then checked stdout again in the parser. It is unrelated to the number or size of source files. The renderer already observed on project open, changes and reactivation; the privileged provider forbade dependency downloads unless refresh was explicit. The worktree router already creates one immutable runtime/provider per opened worktree and reuses it.

Actual Goals query returns 7,566,560 bytes and 9,752 records: 9,365 RULE and 387 SOURCE_FILE records. Most records are in GoalsApp (6,948) and backend (2,753), despite 449 tracked files. It succeeds in 11.345 seconds after the correction. Pure Sky returns 1,037,458 bytes and 1,976 records in 6.827 seconds. These are Bazel declarations, not evidence of huge source trees. Existing projection caps still report both graphs partial (Goals 2,000 targets/4,198 edges; Pure Sky 2,000/6,385).

The first startup GUI already observed a current graph before lens opening, but its immediate SVG-edge assertion raced ReactFlow's initial node sizing. The test now waits for those exact nodes and edge before the unchanged assertions. The corrected proof passed in 11.014 seconds with zero renderer exceptions and confirmed cleanup. A separate large-buffer test originally used deep object equality and exceeded its deadline; Buffer.equals checks the same exact bytes without millions of object comparisons.

## Decision Log

Preserve the existing provider and typed observation path. Do not add a second watcher, service discovery, build executor or project-specific case. Automatic queries may load declared dependencies under the user's trusted-project authority, but unchanged successful or failed inputs must not re-query on status ticks. Keep cancellation, owned process cleanup, three loading workers, the 512 MiB Bazel JVM budget and finite query deadlines.

Follow the user's explicit removal of the raw-output cutoff instead of adding a larger arbitrary cap. Only actual Bazel queries pass maximumBytes:null to the shared collector; other collector consumers retain their previous bound. The parser accepts larger raw output while the compact graph's independent wire/target/edge bounds remain. Output MiB is surfaced during query progress. `swarm-build-query-output-monitoring` records the deliberate remaining buffering tradeoff; `swarm-build-graph-large-query-coverage` stays open for target access beyond the retained projection. No claim of complete project closure.

## Outcomes & Retrospective

The useful startup vertical is implemented without new App/worker routing or dependencies. Actual automatic queries succeed in Goals and Pure Sky, each proving unchanged-result reuse with exactly one query, unchanged Git status and confirmed cleanup. The owned packaged proof on :182/55442 observes graph readiness through a passive copy of real IPC responses before opening the lens, then a real BUILD edit updates it without Refresh and retains graph/camera. Local focused checks and native fix-delta review are clean; hosted and foreign review are intentionally not run under current policy. ROOT retains landing/shared-app ownership.

## Context and Orientation

`core/build-graph.ts` fingerprints tracked/nonignored file membership and BUILD/module definitions, owns the private Bazel query and caches the last graph. `protocol/build-graph.ts` validates the observation sent through the core bridge. `app/renderer/repository/use-build-graph.ts` coalesces source changes and observes pending work only while the window is active; `BuildGraphPane.tsx` presents state and retry/cancel. `core/workspace-context.ts` retains providers for immutable selected worktrees. `tools/build-graph/compat-probe.mjs` runs a real query against an explicit repository without editing its files. Existing `tools/build-graph` Bazel targets own tests and package proofs.

## Plan of Work

First reproduce the Goals failure with the existing query and add tests for automatic dependency loading, unchanged failure/success quietness and large raw output. Then change only build-query collection/parsing and automatic provider semantics. Use the existing renderer hook and per-worktree runtime cache rather than remounting graphs or forcing refresh. Improve status text only where the old offline policy becomes false. Finally use the actual Goals query, a second ordinary repository as useful, and an owned virtual window to show startup needs no Refresh click. Keep typed graph coverage truthful if the existing target/edge display caps truncate the result.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/startup-build-graphs`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile` if absent. The final focused command was `nix develop --command bazel test --jobs=3 //tools/build-graph:compat-checks //tools/build-graph:checks`, with both targets passing in 15.880 seconds. Actual repository commands were `nix develop --command bazel run --jobs=3 //tools/build-graph:compat-probe -- /home/tedks/Projects/goals/master` and the same with `/home/tedks/Projects/puresky/master`. GUI command was `SWARM_VIRTUAL_DISPLAY=:182 SWARM_VIRTUAL_DESKTOP_PORT=55442 SWARM_ARTIFACT_DIR=/tmp/swarm-ide-startup-simple.Wz8BqH/project-graphs/startup-ui-corrected nix develop --command bazel run --jobs=3 //tools/build-graph:startup-smoke`.

## Validation and Acceptance

A controlled provider needing downloads succeeds from `observe(false)` and does not query again when inputs remain unchanged. A changed definition runs one new query; cancelled or failed unchanged input is not retried automatically. A valid query beyond 4 MiB follows the user's selected policy without silently truncating records. Real Goals query prints output volume and graph coverage, succeeds without compiling targets, and preserves `git status`. The packaged window displays its real build graph after startup without a refresh gesture. All owned processes are confirmed stopped after tests.

## Idempotence and Recovery

Explicit refresh is the retry action after a query error or user cancellation. Existing graphs stay visible through updates/failure. Tests use disposable directories and owned displays; user projects receive read-only queries only. Never remove scratch after unconfirmed process cleanup. Commit and push incremental work on the assigned feature branch; ROOT handles normal merge and shared app adoption.

## Artifacts and Notes

Progress and concise verification are written under `/tmp/swarm-ide-startup-simple.Wz8BqH/project-graphs/`. Historical failing runs stay attributed to their original code; a later passing test is not evidence of unrelated historical causes.

Actual query evidence is in `goals-baseline.log`, `goals-automatic.log` and `puresky-automatic.log`. Focused red/green logs and `final-checks.log` retain exact attribution. GUI proof is `startup-ui-corrected/run.TbJYzv/build-graph-proof.json`; its screenshot also shows the current compact layout clips the graph below the control row until scrolled, a separate presentation concern rather than a startup failure.

## Interfaces and Dependencies

Retain `BuildGraphProvider.observe(refresh?)`, `cancel()` and `dispose()`, and `useBuildGraph`'s observation/refresh/cancel interface. No added dependency is planned. If raw-output measurement is exposed, keep it optional and bounded typed metadata, not captured full output in UI or logs. Update `docs/design/runtime.md`, the build-graph documentation and `.swarm/plans.json` only for actual touched source/target mappings.

Revision note (2026-09-08): implementation, actual query counts, test-harness corrections and explicit remaining coverage/buffering limits recorded after focused verification.
