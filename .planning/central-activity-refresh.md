# Keep central Activity live and refresh the selected source

This ExecPlan follows `.planning/PLANS.md` and is maintained with implementation.

## Purpose / Big Picture

Opening Activity should show the current registered fleet operations as the existing observer updates. Choosing one event should deliberately show that event, until the operator returns to the overview. Refresh must read the selected source: fleet Activity, saved summaries, or GitHub PRs. Background data must not steal editor or composer focus.

## Progress

- [x] (2026-09-08) Created fresh fix/central-activity-refresh from reviewed 3ee62d63 in the assigned worktree; preserved completed PR105 branch.
- [x] Inspected current readers and mount. The observer already polls; the header unconditionally calls changelog.read, and overview activation retains selectedActivity.
- [x] Reproduced seven failing mounted cases with eight passing controls; one later stale-row authority case also failed before its fix.
- [x] Implemented JournalPanel, FleetActivityView and narrow App activity callbacks; updated component design/map.
- [x] (2026-09-08) Final 21 focused mounted tests and both TypeScript boundaries passed on 6471c49; native fix-delta review CLEAN.
- [x] Owned packaged central proof passed: 3.364 seconds of interaction, automatic publication after 1.303 seconds, correct manual reader, retained source/cursor/draft/cameras, zero renderer errors and complete cleanup.
- [x] PR119 pushed/ready; Ditz outcome recorded. ROOT owns normal merge and app adoption.
- [x] Additional design target: 80 passed / 1 stale repository-source-count expectation failed. Filed swarm-design-source-count-expectation; no unrelated edit or green claim.

## Surprises & Discoveries

JournalPanel's selection effect depended on the saved document digest, so a background summary update could also reset the current view and focus. Fleet data itself was already passed as current props; an explicit event article obscured the updating list. The corrected tests initially reached a previously unexecuted test gesture: with no source open, closing the only document hides its tab strip. The test now reopens from the actual dock heading; a separate source-open case checks document-tab reopening. This was a test setup correction, not a product change.

Native review found an observed session with no worktree could still offer Inspect because two absent worktree values compared equal. An exact regression failed before correction; file inspection now requires a present matching registered root, while conversation opening remains available.

The first owned GUI attempt reached central Activity, then the driver's pointer helper rejected a clipped draft field after prior settings-keyboard navigation. The screenshot confirms the draft was outside the scrolled dock viewport. The test now reaches it through ordinary Tab, preserving the original failure artifacts and every retention/error/cleanup assertion. The corrected run passes; this is not a claim about the historical user report's GUI cause.

## Decision Log

- Decision: Reuse each reader and the observer's existing single transport lane/timer.
  Rationale: A second poller would not correct the wrong button or retained event selection.
- Decision: Distinguish explicit overview activation from event activation and check repository/world/core plus current registration before exposing old event source actions.
  Rationale: Retained event text must not grant source navigation into a replaced or revoked root.
- Decision: Use focused mounted checks first, with one owned virtual proof only if it adds useful evidence within this bounded repair.
  Rationale: The defect is renderer routing and state, not new transport or model functionality.

## Outcomes & Retrospective

The central overview now stays current through the existing observer. Explicit event detail is intentionally historical, and the header refreshes the selected source rather than always reading saved summaries. Background publication does not move focus or select a different tab. No backend, protocol, agent conversation or shared app was changed. Tests exposed and corrected two narrowly related authority affordances. The only additional failing gate is an unchanged design test's hardcoded 20-versus-22 source count, filed separately; the repair's focused and packaged checks pass.

## Context and Orientation

`app/renderer/App.tsx` owns document visibility and selectedActivity. `app/renderer/FleetActivityView.tsx` displays either current fleet rows or a selected event. `app/renderer/changelog/JournalPanel.tsx` owns Activity/Saved summaries/Pull requests tabs and their common header. `app/renderer/external-agents/client.ts` already publishes registered snapshots every three seconds while visible and connected. Its refresh method schedules the existing snapshot reader; it must not be rewritten here. `GithubPullRequests.tsx` and useJournal own their separate notices and read methods.

## Plan of Work

Add focused tests before changing production. Give the Journal header the live reader's refresh/busy/notice state, route its action by selected view, and remove observation-driven focus changes. Keep saved-entry reveal pending until data arrives, without treating every data arrival as an operator action. Make App overview opening explicitly clear activity selection, while the event-opening callback preserves the selected event. Fence that selection to the current repository/world/core and current registered worktree before navigation. New data must retain existing source, graph and composer DOM.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/usability-activity-ui`. Use `nix develop --command bazel test --jobs=3 //tools/operator-cockpit:activity-refresh --test_output=errors` for new mounted tests and both TypeScript boundaries, and focused existing journal/cockpit checks as relevant. Add the small target/script in the existing package, not a new test platform. Commit a draft PR early; ROOT performs normal merge and adoption.

## Validation and Acceptance

Prove current published fleet props update the overview without clicking; the selected header reads exactly the chosen source; failures and busy state do not leak across tabs; overview reopening clears an inspected event, but explicit event activation survives opening. Exercise revoked/replaced roots, repo/core changes and pending updates. Hold editor/composer focus while fleet and saved-summary observations change; no source mutation, message or model request may be introduced. Distinguish controlled mounted data from any real packaged proof.

## Idempotence and Recovery

No migration or persisted data changes. Preserve the old feature branch and all proof failures. Keep tests and cleanup restricted to owned worktree/processes. A new failure gets diagnosed directly, not retried unchanged until green.

## Artifacts and Notes

Concise current seam and logs live under `/tmp/swarm-ide-usability.BirZCk/activity-ui`; final handoff uses CENTRAL-ACTIVITY-REFRESH-20260908-V4P8. The original completed increment is not reopened.

Main failure log: refresh-baseline.log (7 failed, 8 passed). Current targeted log: refresh-final-focused.log (21 passed plus types). Native rootless reproduction: refresh-rootless-red.log (1 failed, 20 passed). Final package: central-packaged-corrected.log and artifacts/activity-usability/run.XyoSh8; initial driver failure retained at run.3MXLdV. Extra design-target boundary: refresh-design-check.log (80 passed, 1 failed).

## Interfaces and Dependencies

Reuse ExternalClient refresh/busy/refreshing/notice/observing and JournalState/GithubPrState. No new protocol fields. Preserve callbacks carrying session ID, worktree-relative path and optional recorded patch. The component design in `docs/design/activity.md` and its exact `.swarm/plans.json` node must describe the new routing and actual focused Bazel target.

Completion update: recorded implemented behavior, exact native/local/owned evidence and the unrelated design-test boundary. No further implementation scope was added.
