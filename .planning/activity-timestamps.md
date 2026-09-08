# Make activity time and freshness visible

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Operators should be able to distinguish when work was recorded, when a narrative was generated, and when the IDE last read it. Add compact local timestamps to workspace events and recorded activity summaries without changing navigation, observation, or generation behavior.

## Progress

- [x] (2026-09-08 02:40Z) Inspected the existing journal and selected-agent activity surfaces.
- [ ] Implement presentation-only timestamps and focused regressions.
- [ ] Run proportional local gates, native review, push and hand off to ROOT.

## Surprises & Discoveries

The journal has no per-entry occurrence timestamp. Cited evidence has timestamps, whereas the document has a separate generation time and the reader has an observation time. Refresh reads saved artifacts; it does not generate a new summary.

## Decision Log

Use explicitly labelled cited-evidence ranges for narrative entries. Always include a calendar date in the compact local format: this avoids midnight ambiguity without adding a clock or timer. Preserve exact ISO instants and timezone in hover/accessibility information. Leave the existing selected-agent observer behavior untouched.

## Outcomes & Retrospective

Implementation and verification pending. This does not implement continuous summarization or all-swarm activity aggregation.

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

## Interfaces and Dependencies

Use existing React and browser Intl only. The time component accepts an optional ISO timestamp and renders a valid semantic time or an explicit unknown label. No dependency or protocol changes.
