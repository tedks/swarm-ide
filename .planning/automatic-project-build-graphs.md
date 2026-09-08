# Load a project's build graph without a setup button

This ExecPlan is maintained according to `.planning/PLANS.md`.

## Purpose / Big Picture

Opening a trusted Bazel project should load its declared build dependencies without a prerequisite refresh click. Switching worktrees or changing build definitions should update that worktree's graph while retaining the last usable graph. Goals must no longer fail merely because Bazel's query representation exceeds the old 4 MiB raw-output cutoff.

## Progress

- [x] (2026-09-08) Read the provider, hook, worktree router and existing compatibility checks. Confirmed streamed JSON records, whole-output collection, and offline automatic queries.
- [ ] Record a real Goals query failure/output measurement and focused behavior regressions.
- [ ] Implement automatic declared-dependency loading and the minimum output correction, preserving cancellation and cache ownership.
- [ ] Run focused tests, native review, actual read-only query and an owned virtual startup proof; update living design and handoff.

## Surprises & Discoveries

The 4 MiB limit currently counts stdout plus stderr in the process collector, then checks stdout again in the parser. It is unrelated to the number or size of source files. The renderer already observes on project open, changes and reactivation; the privileged provider deliberately forbids dependency downloads unless refresh is explicit. The worktree router already creates one immutable runtime/provider per opened worktree and reuses it.

## Decision Log

Preserve the existing provider and typed observation path. Do not add a second watcher, service discovery, build executor or project-specific case. Automatic queries may load declared dependencies under the user's trusted-project authority, but unchanged successful or failed inputs must not re-query on status ticks. Keep cancellation, owned process cleanup, three loading workers, the 512 MiB Bazel JVM budget and finite query deadlines. Raw query byte policy will follow the user's latest explicit direction; graph rendering bounds remain separate and visible.

## Outcomes & Retrospective

Implementation and measured outcomes are pending.

## Context and Orientation

`core/build-graph.ts` fingerprints tracked/nonignored file membership and BUILD/module definitions, owns the private Bazel query and caches the last graph. `protocol/build-graph.ts` validates the observation sent through the core bridge. `app/renderer/repository/use-build-graph.ts` coalesces source changes and observes pending work only while the window is active; `BuildGraphPane.tsx` presents state and retry/cancel. `core/workspace-context.ts` retains providers for immutable selected worktrees. `tools/build-graph/compat-probe.mjs` runs a real query against an explicit repository without editing its files. Existing `tools/build-graph` Bazel targets own tests and package proofs.

## Plan of Work

First reproduce the Goals failure with the existing query and add tests for automatic dependency loading, unchanged failure/success quietness and large raw output. Then change only build-query collection/parsing and automatic provider semantics. Use the existing renderer hook and per-worktree runtime cache rather than remounting graphs or forcing refresh. Improve status text only where the old offline policy becomes false. Finally use the actual Goals query, a second ordinary repository as useful, and an owned virtual window to show startup needs no Refresh click. Keep typed graph coverage truthful if the existing target/edge display caps truncate the result.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/startup-build-graphs`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile` if absent. Run `nix develop --command bazel test --jobs=3 //tools/build-graph:compat-checks` for provider, hook, compatibility and TypeScript checks. Run the existing `//tools/build-graph:compat-probe` against `/home/tedks/Projects/goals/master` and update the probe to record automatic startup/output counts. Use `//tools/build-graph:smoke` or a narrowly scoped startup scenario with an owned Xvfb display/port, never the physical desktop. Record exact targets and results in this document as work proceeds.

## Validation and Acceptance

A controlled provider needing downloads succeeds from `observe(false)` and does not query again when inputs remain unchanged. A changed definition runs one new query; cancelled or failed unchanged input is not retried automatically. A valid query beyond 4 MiB follows the user's selected policy without silently truncating records. Real Goals query prints output volume and graph coverage, succeeds without compiling targets, and preserves `git status`. The packaged window displays its real build graph after startup without a refresh gesture. All owned processes are confirmed stopped after tests.

## Idempotence and Recovery

Explicit refresh is the retry action after a query error or user cancellation. Existing graphs stay visible through updates/failure. Tests use disposable directories and owned displays; user projects receive read-only queries only. Never remove scratch after unconfirmed process cleanup. Commit and push incremental work on the assigned feature branch; ROOT handles normal merge and shared app adoption.

## Artifacts and Notes

Progress and concise verification are written under `/tmp/swarm-ide-startup-simple.Wz8BqH/project-graphs/`. Historical failing runs stay attributed to their original code; a later passing test is not evidence of unrelated historical causes.

## Interfaces and Dependencies

Retain `BuildGraphProvider.observe(refresh?)`, `cancel()` and `dispose()`, and `useBuildGraph`'s observation/refresh/cancel interface. No added dependency is planned. If raw-output measurement is exposed, keep it optional and bounded typed metadata, not captured full output in UI or logs. Update `docs/design/runtime.md`, the build-graph documentation and `.swarm/plans.json` only for actual touched source/target mappings.
