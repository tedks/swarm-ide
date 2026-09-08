# Make activity time and freshness visible

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Operators should be able to scan when work happened without reading an audit trail. Show time-only for today's events, short dates for older events, and a single full timestamp on hover. Keep generation/read metadata in the existing collapsed provenance, not the main activity surface. Preserve recorded-versus-live honesty without changing navigation, observation or generation behavior.

## Progress

- [x] (2026-09-08 02:40Z) Inspected the existing journal and selected-agent activity surfaces.
- [x] (2026-09-08 02:44Z) Implemented presentation-only timestamps and four focused regressions; executable 4ffcf61.
- [x] (2026-09-08 02:47Z) Local typechecks, 15 focused tests and desktop bundle passed. Native layout finding repaired and convergence CLEAN. Owned virtual normal/150% screenshots captured with cleanup confirmed.
- [ ] ROOT intake, normal merge and managed app adoption.
- [x] (2026-09-08 02:56Z) Additional direct-user correction: stable background TaskPanel refresh presentation, three new regressions and 65 focused tests/typechecks PASS; native scoped review CLEAN.
- [x] (2026-09-08) User visually confirmed task refresh no longer flashes, requested simpler timestamps and removal of prominent generated/read information. Readability baseline 4 RED / 63 PASS; corrected typechecks and 67 focused tests PASS, native delta CLEAN.

## Surprises & Discoveries

The journal has no per-entry occurrence timestamp. Cited evidence has timestamps, whereas the document has a separate generation time and the reader has an observation time. Refresh reads saved artifacts; it does not generate a new summary.

The pre-implementation run recorded two new timestamp failures and one existing `tests/task-workbench.test.tsx:133` exact request-array mismatch from the background read-only `trusted.snapshot`. The latter is independently owned by F2. After implementation, all four timestamp tests passed and the broader run had 1,938 passes, that same one failure, and four existing skips. This is not an all-green quality claim.

Additional user-reported Refresh Tasks blinking came from three presentation changes on each background read: the `is-current` class also controlled compact layout, a Checking tasks line appeared, and the disabled button dimmed. TaskClient sets refreshing synchronously and already deduplicates requests. A separate compact-layout class and a local explicit-click marker fix the appearance without changing that client or freshness authority. The new baseline has two presentation RED and 63 PASS; repaired focused tests have 65 PASS.

## Decision Log

Use explicitly labelled cited-evidence ranges for narrative entries. The initial always-date and prominent generation/read display was rejected in direct user review as too verbose. The accepted format is time-only today, short date/time otherwise, and a year only for another year. Compare local calendar dates, not UTC day strings. Recalculate on normal renders without a new timer. Preserve exact ISO in semantic datetime, with one human-readable full date/time/zone on hover. Leave the existing selected-agent observer behavior untouched.

Native review found that a nowrap timestamp in the auto metadata column could crowd out the summary. Put the timestamp on its own grid row spanning the text columns; the final native delta is CLEAN and the actual 150% screenshot shows event text retained above its timestamp.

For the explicitly added task refresh correction, keep the original current predicate and native disabled state. Suppress routine Checking tasks text and dimming only when there is a previously observed, connected, failure-free snapshot and no manual refresh gesture. Keep aria-busy, a background-check tooltip and detailed retained-state provenance. First-load, manual checking, stale, failure, and disconnected states retain their visible feedback. No polling, TaskClient, task attachment or task-workbench assertion edits.

## Outcomes & Retrospective

PR81 supplies readable cited-evidence and workspace-event times, with exact semantic timestamps and a compact human-readable hover. Generation/read metadata is retained in the existing closed provenance disclosure only. This does not implement continuous summarization or all-swarm activity aggregation. Earlier gate evidence remains historical and is not relabelled onto the final correction; ROOT owns integration and adoption.

The task-refresh follow-up is a presentation-only correction under ROOT's exact TaskPanel/CSS/test ownership and was manually accepted by the user. J4 is not launched; an optional liveContent slot in JournalPanel plus separate App mount is only reserved. J3 does not author or consume summarizer implementation.

## Context and Orientation

`app/renderer/changelog/JournalPanel.tsx` renders saved summaries both in the Recent Activity feed and the central document area. `app/renderer/App.tsx` now renders each workspace event's `at` timestamp below its description. `protocol/changelog.ts` provides cited evidence with `at`, document `generatedAt`, and result `observedAt`. No protocol changes are needed.

## Plan of Work

Use the shared presentation component with the browser's local date/time formatter and semantic `time` markup. In the journal, calculate the earliest and latest timestamps of only the entry's cited evidence. Keep the existing Recorded labels and collapsed provenance, without a separate freshness block. Test today abbreviation, local midnight on rerender, other months/years, exact offset normalization, readable hover, defensive unknown time, and unchanged deliberate navigation. Keep the accepted task-refresh correction unchanged.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/activity-timestamps`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //:quality --jobs=3` and build the desktop bundle with Bazel. Use any existing focused target where practical. Obtain a native Codex review and fix actionable findings before handing off the ready PR. ROOT owns normal merge and app adoption.

## Validation and Acceptance

Tests must show cited event time without prominent generation/read blocks; the existing provenance disclosure remains closed by default. Crossing local midnight must restore the abbreviated date on the next render. Missing or invalid presentation inputs must not throw or produce invalid dateTime markup. Existing Journal source opening, filter, selection and stale-reply assertions remain. The final user-requested readability delta uses proportional focused/native/build gates; no new GUI run or product model is required. Earlier screenshots are attributed only to their original code, not this shorter display.

## Idempotence and Recovery

No data, timers, backend, schema, or saved summaries change. All files are isolated in this feature branch. Preserve other worktrees and owned-process boundaries. Commit and push the reviewed result and sync Ditz; do not merge or update shared previews.

## Artifacts and Notes

Operational notes and review/gate outcomes live in `/tmp/swarm-ide-activity-time.KG9R5w/seam.md` and `verification.md`.

Actual owned development-window images: `virtual-proof/activity-log.png` and `compact-150-proof/compact-events.png` below that directory. These read existing saved repository summaries, not newly generated narratives or live model output. Ignored local `artifacts/j3-timestamp-proof` contains the small Bazel-driven screenshot and focused-test entry points used for this bounded check; it is not a new product subsystem.

## Interfaces and Dependencies

Use existing React and browser Intl only. The time component accepts an optional ISO timestamp and renders a valid semantic time or an explicit unknown label. No dependency or protocol changes.
