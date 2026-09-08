# Make activity time and freshness visible

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Operators should be able to distinguish when work was recorded, when a narrative was generated, and when the IDE last read it. Add compact local timestamps to workspace events and recorded activity summaries without changing navigation, observation, or generation behavior.

## Progress

- [x] (2026-09-08 02:40Z) Inspected the existing journal and selected-agent activity surfaces.
- [x] (2026-09-08 02:44Z) Implemented presentation-only timestamps and four focused regressions; executable 4ffcf61.
- [x] (2026-09-08 02:47Z) Local typechecks, 15 focused tests and desktop bundle passed. Native layout finding repaired and convergence CLEAN. Owned virtual normal/150% screenshots captured with cleanup confirmed.
- [ ] ROOT intake, normal merge and managed app adoption.

## Surprises & Discoveries

The journal has no per-entry occurrence timestamp. Cited evidence has timestamps, whereas the document has a separate generation time and the reader has an observation time. Refresh reads saved artifacts; it does not generate a new summary.

The pre-implementation run recorded two new timestamp failures and one existing `tests/task-workbench.test.tsx:133` exact request-array mismatch from the background read-only `trusted.snapshot`. The latter is independently owned by F2. After implementation, all four timestamp tests passed and the broader run had 1,938 passes, that same one failure, and four existing skips. This is not an all-green quality claim.

## Decision Log

Use explicitly labelled cited-evidence ranges for narrative entries. Always include a calendar date in the compact local format: this avoids midnight ambiguity without adding a clock or timer. Preserve exact ISO instants and timezone in hover/accessibility information. Leave the existing selected-agent observer behavior untouched.

Native review found that a nowrap timestamp in the auto metadata column could crowd out the summary. Put the timestamp on its own grid row spanning the text columns; the final native delta is CLEAN and the actual 150% screenshot shows event text retained above its timestamp.

## Outcomes & Retrospective

PR81 supplies visible cited-evidence, generation and read times, semantic exact timestamps, and workspace-event times without changing selection or refresh behavior. This does not implement continuous summarization or all-swarm activity aggregation. The known independently owned task-test mismatch remains attributed; ROOT owns integration and adoption.

## Context and Orientation

`app/renderer/changelog/JournalPanel.tsx` renders saved summaries both in the Recent Activity feed and the central document area. `app/renderer/App.tsx` also renders workspace event rows whose `at` timestamp is currently omitted. `protocol/changelog.ts` provides cited evidence with `at`, document `generatedAt`, and result `observedAt`. No protocol changes are needed.

## Plan of Work

Add a small shared presentation component using the browser's local date/time formatter with semantic `time` markup. In the journal, calculate the earliest and latest timestamps of only the entry's cited evidence. Show report generation and last-read separately, with recorded/manual-refresh wording. Add focused tests for source time versus read time, different days, exact offset normalization, defensive unknown time, and unchanged deliberate navigation.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/activity-timestamps`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //:quality --jobs=3` and build the desktop bundle with Bazel. Use any existing focused target where practical. Obtain a native Codex review and fix actionable findings before handing off the ready PR. ROOT owns normal merge and app adoption.

## Validation and Acceptance

Tests must show separate semantic time elements for cited evidence, report generation, and last read. Crossing midnight must visibly change the date. Missing or invalid presentation inputs must not throw or produce invalid dateTime markup. Existing Journal source opening, filter, selection and stale-reply assertions remain. A proportional owned virtual screenshot is desirable if the existing harness can exercise the updated surface cheaply; no models or physical desktop automation.

## Idempotence and Recovery

No data, timers, backend, schema, or saved summaries change. All files are isolated in this feature branch. Preserve other worktrees and owned-process boundaries. Commit and push the reviewed result and sync Ditz; do not merge or update shared previews.

## Artifacts and Notes

Operational notes and review/gate outcomes live in `/tmp/swarm-ide-activity-time.KG9R5w/seam.md` and `verification.md`.

Actual owned development-window images: `virtual-proof/activity-log.png` and `compact-150-proof/compact-events.png` below that directory. These read existing saved repository summaries, not newly generated narratives or live model output. Ignored local `artifacts/j3-timestamp-proof` contains the small Bazel-driven screenshot and focused-test entry points used for this bounded check; it is not a new product subsystem.

## Interfaces and Dependencies

Use existing React and browser Intl only. The time component accepts an optional ISO timestamp and renders a valid semantic time or an explicit unknown label. No dependency or protocol changes.
