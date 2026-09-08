# Keep valid component build mappings readable

This ExecPlan follows `.planning/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

The IDE currently rejects its own component plan because one component maps 17
Bazel targets and the schema permits only 16. A Bazel target is a named build
input or action such as `//tools/services:example-checks`. Keep every authored
mapping and remove this arbitrary count restriction so the real plan opens again.
The whole index remains limited to 64 KiB and structurally validated.

## Progress

- [x] (2026-09-08) Confirm designated clean branch and exact schema cap.
- [x] (2026-09-08 21:06Z) Baseline: actual-index and 100-target regressions fail; 58 other tests and both type boundaries pass.
- [x] (2026-09-08 21:07Z) Remove only that cap; 83 reader/generation tests and both type boundaries pass.
- [x] (2026-09-08 21:10Z) Native review CLEAN with no findings; executable commit627f29d pushed in PR137.
- [ ] Push final evidence notes, mark PR ready, sync Ditz and hand off to ROOT.

## Surprises & Discoveries

The actual-index reader regression already exists in `tests/plans-reader.test.ts`.
It now also explicitly checks build mappings and refuses plan replacement.
The current plan is 37,295 raw bytes, below the existing 65,536-byte bound.
The focused target's transitive Bazel inputs include `//:.swarm/plans.json`,
verified by a query; no missing test-data declaration caused this failure.

## Decision Log

Remove `.max(16)` only from `design.buildTargets` in `protocol/plans.ts`.
Retain both restored example mappings, strict target objects/local labels, unique
labels per component, canonical paths, valid references and acyclic ancestry.
Do not regenerate the plan or alter App, graphs, reader behavior or model controls.

## Outcomes & Retrospective

The old cap is reproduced through the actual repository reader and synthetic
schema input: 2 failures / 58 passes. The one-line repair passes all 83 focused
reader and generation tests, including 100 valid targets, oversized input and
existing-plan preservation. Native review is CLEAN with no findings. ROOT owns normal PR
merge and app adoption. No index content or core/renderer behavior was rewritten.

## Context and Orientation

`protocol/plans.ts` validates the version-1 index. `core/plans.ts:readPlanIndex`
reads the fixed `.swarm/plans.json` path through the canonical-file broker and
returns observed, missing or invalid results. The `design:repository` node has
17 valid target mappings, including the restored ordinary service example.
`tests/plans-reader.test.ts` already opens the repository's actual index; the
root `//:quality_sources` data includes `.swarm/**` and these tests.

## Plan of Work

First strengthen the real-index test with exact schema/reader equality and
explicitly retained example targets. Add a larger valid target list and invalid
label/duplicate/byte-bound cases. Run the focused Bazel test target before the
production edit and retain the failure output. Then remove the one count guard,
clarify `docs/design/planning.md`, rerun focused reader/generation checks and
both type boundaries. Native review must check that the data and other guards
remain unchanged. No GUI or model turn is needed for this schema-only repair.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/plan-index-repair`:

    nix develop --command pnpm install --frozen-lockfile --offline
    nix develop --command bazel test --jobs=2 //tools/demo-syntax:editor-tests --test_arg=tests/plans-reader.test.ts

The corrected run also supplies `--test_arg=tests/plan-generation.test.ts` and
`--test_arg=tests/plan-generation-ui.test.tsx`: 83 tests passed in 3 files, with
both TypeScript boundaries, Bazel elapsed15.653s. Commit and push on
`fix/plan-index-target-count`, open a draft PR,
then mark ready after checks/review; never push directly to master.

## Validation and Acceptance

Before repair, actual-index and greater-than-16-target tests fail. After repair,
the actual repository reader returns observed with all mappings intact. Invalid
labels, duplicate targets, unknown fields, cycles and oversized indexes remain
rejected. Generation still treats missing plans differently from existing or
malformed plans and never replaces an existing plan automatically.

## Idempotence and Recovery

Tests use disposable repositories and clean their own files. Keep all existing
project/user work intact. If a focused check finds an unrelated failure, preserve
its evidence and report it rather than changing unowned assertions or retrying
to claim a fix. Stop only this worktree's Bazel server at handoff.

## Artifacts and Notes

Evidence and final handoff live in `/tmp/swarm-ide-graph-repairs.YJnbyZ/plan`.
Ditz issue `swarm-plan-target-count` records the implementation outcome.

## Interfaces and Dependencies

No new interface or dependency. `PlanIndexSchema` and `readPlanIndex` retain their
existing types and result states. Existing Bazel data already includes the actual
plan; no extra build graph mapping is required unless validation disproves that.

Plan created before implementation; updated after the recorded two-failure
baseline and successful 83-test correction to distinguish exact gate attribution.
Final review confirmed the one-line production scope, unchanged plan content and
existing build mappings; remaining steps are delivery only.
