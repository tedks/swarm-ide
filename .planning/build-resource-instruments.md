# Make build resources legible without inventing live telemetry

This ExecPlan is maintained according to `.planning/PLANS.md`.

## Purpose / Big Picture

The bottom-left Builds & resources panel should help a developer distinguish job progress from resource pressure. A user can inspect CPU and memory separately and open an illustrative Bazel profile with a small distribution summary. A distribution means a collection of samples, not a single current number. The example is visibly synthetic; no real telemetry collector is added.

## Progress

- [x] (2026-09-07) Read assigned scope, shared ownership, job contract and current provider.
- [x] (2026-09-07 23:05Z) Implement scoped resource instrument and deterministic/mounted tests.
- [x] (2026-09-07 23:18Z) Native review converged; actual owned virtual keyboard/source/graph proof passed with cleanup complete.
- [x] (2026-09-07 23:19Z) Frozen local quality passed 1,673 tests in 122 files, both TypeScript checks, node/renderer builds; 13 focused tests also passed.
- [x] (2026-09-07 23:22Z) Final documentation pushed, PR68 ready, Ditz synchronized and owned Bazel server stopped; reviewed handoff prepared for ROOT landing.

## Surprises & Discoveries

`core/provider.ts` supplies zero CPU and memory placeholders. `Job.resources` has no source, observation time, sample count or CPU normalization metadata. Fixture providers can supply nonzero values. Therefore the widget must not describe these fields as verified live process telemetry or manufacture a history from renderer updates.

The actual React Flow window-level Space shortcut prevents native summary activation. An actual `useKeyPress` regression was RED (1 failed / 12 passed), then GREEN after applying the library's `.nokey` ancestor guard only to this widget. Real owned X11 keyboard evidence showed the same summary activation class and passed after that correction. Other widgets remain outside scope; follow-up issue `graph-space-disclosure-keyboard` records the remaining audit.

Native review found extreme finite values could overflow the unused mean. A three-maximum-value regression was RED before using an incremental mean and GREEN afterwards. Initial test-driver assumptions also needed correction: jsdom does not model summary Tab navigation, Enter needs a character event, and the packaged application performs one existing automatic startup reconciliation. The proof records that exact startup request rather than falsely claiming no build occurred. Earlier failed proof outputs remain under the operational step directory.

## Decision Log

Use one opt-in Example profile with twelve fixed illustrative samples over a declared 60-second window, every five seconds. CPU uses 100% per logical core and can exceed 100%; memory uses aggregate resident memory in MiB (1,048,576 bytes). These are explicit scenario conventions, not claims about the machine. p95 uses nearest rank; median averages middle values. Sparklines show ordered samples with a zero baseline. No dependency or protocol changes are required.

Keep actual jobs separate, with status text as well as progress and messages. The existing all-zero resource placeholder is unavailable, not measured idle. Nonzero provider snapshots may be shown as unverified single values with unspecified CPU basis and no timing metadata; never give them percentile labels. Genuine zeros in the declared illustrative series remain valid values.

## Outcomes & Retrospective

The widget is implemented and checked, with job identity/status/progress/errors retained and CPU/memory separated into compact numeric summaries and sparklines. The example is opt-in and explicitly illustrative. No live collector, persistence, process or protocol was introduced. Real provider telemetry remains a follow-up (`build-resource-samples-provenance`). ROOT owns PR merge, Ditz close and managed preview adoption. No peer work or later base was consumed; this increment remains based on reviewed 83e53e7.

## Context and Orientation

`app/renderer/App.tsx` currently builds job cards inline as the `jobsContent` prop to `AgentDock`. Replace only that expression and add one import. The new `app/renderer/build-resources/BuildResources.tsx` receives `Job[]`, displays jobs and owns local example visibility. Pure helpers in that directory calculate finite nonnegative sample statistics. Styles live beside the widget. The typed job contract remains in `protocol/schema.ts`; do not modify it or actual providers.

## Plan of Work

First create a pure summarizer which filters missing/invalid observations while retaining zero, returns an unavailable result for an empty series, and reports count, median, p95 and peak. Add fixed synthetic sample data with declared target `//demo:build` (not resolved in the current repo). Build a compact keyboard-accessible disclosure, responsive metric rows and SVG lines with readable numeric alternatives. Preserve all existing job identities, status/progress and messages. Add deterministic and mounted tests, then one packaged virtual journey using only a disposable Git repository and a real source editor.

## Concrete Steps

Run from `/home/tedks/Projects/swarm-ide/build-resource-instruments`:

    nix develop --command pnpm install --frozen-lockfile
    nix develop --command bazel test //tools/build-resources:regressions --jobs=3 --test_output=errors
    nix develop --command bazel test //tools:quality --jobs=3 --test_output=errors
    nix develop --command bazel build //:desktop-bundle --jobs=3
    SWARM_VIRTUAL_DISPLAY=:140 SWARM_VIRTUAL_DESKTOP_PORT=55220 nix develop --command bazel run //tools/build-resources:smoke --jobs=3

The proof's launcher uses the existing owned X11 harness, checks collisions and must finish with cleanup_complete=1. Display and port must be free; never target physical display or shared previews.

Final local execution on ce1456e passed both requested Bazel test targets in 45.496 seconds; quality contained 1,673 tests/122 files plus the existing compilation/build checks. The desktop bundle was built by the manual proof target. Owned packaged acceptance used actual scratch Git README contents, made an unsaved edit without changing disk, then exercised Enter/Tab/Space through profile and basis disclosure. It retained the exact editor buffer/logical cursor and both graph instances/cameras. Scenario time was 1.726 seconds, total supervised run 2.621 seconds, with zero renderer errors and cleanup_complete=1. One existing startup reconciliation was recorded; resource controls issued no core requests. This is not live resource telemetry or a model turn.

## Validation and Acceptance

Empty jobs leave a small idle label and discoverable Example profile control. Running/succeeded/failed jobs retain labels, status/progress and messages; all-zero placeholders do not display a fake measured zero. A declared synthetic zero remains zero. Median and p95 match finite known series under documented nearest-rank semantics, including singleton/zero/missing samples. Opening the profile and its basis is keyboard accessible and does not replace the real source document, lose a dirty edit or reset graph cameras. The virtual screenshot must show the actual packaged widget with illustrative labelling, not injected mock DOM.

## Idempotence and Recovery

No persistent UI storage or new process is introduced. Closing the example restores the compact area. All proof repositories, profiles and processes are disposable and owned by the existing harness. Preserve evidence and branches; no shared app or source edits are part of proof cleanup.

## Artifacts and Notes

Operational evidence and concise handoff live under `/tmp/swarm-ide-demo-controls.q2i33c/build-resources`. Native Codex review is required; foreign seats are intentionally omitted by current user quota direction. Hosted CI is ignored, not called green.

The successful screenshot is `packaged-final/run.Gpr8me/02-example-profile.png` below that directory. `proof.json` records exact keyboard events, source retention and request attribution; `supervisor.log` records owned desktop cleanup. `summary-space-red.log` and `extreme-mean-red.log` preserve controlled failures, not merely post-fix passes. Native full review and each changed-logic convergence round are CLEAN.

## Interfaces and Dependencies

`BuildResources({ jobs }: { jobs: readonly Job[] })` is the single App boundary. The summarizer accepts readonly optional numeric samples and returns finite count/median/p95/peak or null. Existing React, HTML, SVG and CSS suffice. New Bazel proof files are isolated in `tools/build-resources`; no shared tool or build-provider changes.

Initial plan written before implementation to record provenance assumptions and scope.

Final update records actual local/packaged results, the small keyboard integration correction, remaining telemetry limitation and ROOT-owned landing boundary; no broader platform work was added.
