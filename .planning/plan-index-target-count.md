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
- [ ] Run actual-index and larger-component regressions against the old cap.
- [ ] Remove only that cap; run focused reader and generation checks.
- [ ] Obtain native review, push ready PR, update Ditz and hand off to ROOT.

## Surprises & Discoveries

The actual-index reader regression already exists in `tests/plans-reader.test.ts`.
It currently checks source links, and will also explicitly check build mappings.
The current plan is 37,295 raw bytes, below the existing 65,536-byte bound.

## Decision Log

Remove `.max(16)` only from `design.buildTargets` in `protocol/plans.ts`.
Retain both restored example mappings, strict target objects/local labels, unique
labels per component, canonical paths, valid references and acyclic ancestry.
Do not regenerate the plan or alter App, graphs, reader behavior or model controls.

## Outcomes & Retrospective

Pending reproduction and repair. ROOT owns normal PR merge and app adoption.

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

Use the same supported target with the generation test filenames for the final
focused checks. Commit and push on `fix/plan-index-target-count`, open a draft PR,
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

Plan created before implementation to capture the narrow repair and red/green gate.
