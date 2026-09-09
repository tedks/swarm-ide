# Give component contracts room and let people arrange nodes

This plan follows `.planning/PLANS.md` and is updated as the slice progresses.

## Purpose / Big Picture

The component design keeps its authored relationships but gains enough space to read them. A person can drag one node without panning, drag the background to pan, and reset only the current arrangement. Geometry is renderer-session presentation, never an edit to `.swarm/plans.json`.

## Progress

- [x] 2026-09-09: Confirmed clean designated worktree at PR142, read source/instructions, materialized frozen dependencies, started `swarm-component-layout-drag`.
- [x] 2026-09-09: Added spacing/position regressions and reproduced their baseline failures.
- [x] 2026-09-09: Implemented opt-in component layout and updated living design.
- [x] 2026-09-09: Final 112 focused cases/both typechecks pass; native review converged after modifier correction. Owned packaged plain-drag journey passed; stronger modifier journey passed interactions but ended with the known ResizeObserver warning (retained below).
- [x] 2026-09-09: Implementation pushed in PR143; ready handoff records actual checks and warning for ROOT's normal merge/adoption decision.

## Surprises & Discoveries

The existing projection has 200-pixel columns/65-pixel rows for 184-by-52-pixel nodes. Shared `ProjectionCanvas` disables dragging but holds a dormant unscoped drag-stop map. Enabling that alone would neither control live movement nor separate arrangements.

Native review found default Control/Meta and Shift multi-selection could move the selected parent with a dragged child. The component opt-in now disables those modifiers; shared canvases retain defaults. The modifier regression also exposed test camera-state leakage: test cases now use distinct repository identities, while within-test roundtrips remain unchanged. The older broad plan target has unrelated fixture identity failures; only the test broker owned by this change was repaired.

The plain-drag packaged run passed with zero renderer errors. The stronger driver initially dragged Repository over the later Cockpit click center, correctly failing its hit-test; it now moves Runtime into clear space. The corrected run completed node and Ctrl-drag, background pan, unchanged camera, refresh, component roundtrip, document opening, reset and unchanged plan-byte assertions. Its final empty-console assertion reported exactly `ResizeObserver loop completed with undelivered notifications.` No unrelated investigation, unchanged-head rerun, suppression or broad green claim was made.

## Decision Log

Use a small optional layout scope on the shared canvas; only Component design opts in. Retain position overrides in renderer memory keyed by world, repository/worktree identity, selected component and selected-contract versus overview. Remove vanished IDs. Keep camera behavior and full-graph Fit unchanged. Reset returns to authored default positions without rewriting plan metadata. No cross-restart storage or new graph engine.

The final focused gate uses the existing `//tools/demo-syntax:editor-tests` entrypoint with seven explicit files, avoiding unrelated old plan fixtures. Preserve the final known resize-warning result for ROOT's landing disposition under the standing critical-only policy.

## Outcomes & Retrospective

User-visible implementation is complete in PR143; ROOT owns merge/adoption. The geometry-only feature neither runs an agent nor writes authored plans. The final packaged interactions succeeded, but its console gate is not labelled green because of the retained known resize warning. Native review is clean after correcting modifier multi-selection. A small feature can reuse the existing renderer and desktop harness without expanding into a graph platform.

## Context and Orientation

`app/renderer/plans/DesignWorkspace.tsx` creates the component projection from the plan. `ProjectionCanvas.tsx` controls ReactFlow nodes and camera reveal. `tests/component-graph-stability.test.tsx` checks real plan relationships and mounted navigation; `tools/living-design` owns packaged virtual-desktop checks. Other users of the shared canvas must stay non-draggable.

## Plan of Work

Increase positions in `designProjection` without changing membership or edges. Add opt-in scoped position changes to `ProjectionCanvas`, forwarding measurement events to existing camera code. Disable drag auto-pan for this feature and preserve click/keyboard selection. Add a small Reset layout button. Test scope transitions, refresh, removed IDs, reset and unchanged default consumers. Extend the existing living-design driver with a layout-only mode for actual node/background input and selected-document checks; do not repeat unrelated long journeys.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/component-layout`, run `nix develop --command bazel test --jobs=3 //tools/living-design:checks` and `nix develop --command bazel run --jobs=3 //tools/living-design:smoke` with the owned layout-only mode. Record actual output and artifacts in the handoff. Use the existing desktop harness, never inherited DISPLAY=:0.

Actual final focused command used `nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests` with one `--test_arg=` per file: `tests/component-graph-stability.test.tsx`, `tests/graph-click-recenter.test.tsx`, `tests/projection-selection.test.tsx`, `tests/graph-agent-overlay.test.tsx`, `tests/workspace-navigation-camera.test.tsx`, `tests/living-design.test.tsx`, `tests/plans-reader.test.ts`. Result: 112 cases and both TypeScript boundaries pass in 14.8 seconds. Owned smoke used `SWARM_DESIGN_LAYOUT_ONLY=1`, display `:186`, port `55336`; each execution confirmed cleanup.

## Validation and Acceptance

Focused tests must show bigger gaps, identical IDs/directions/labels, live dragged positions, A→B→A retention, separate contract/workspace arrangements, removed IDs discarded and current-only reset. Packaged input must move exactly one node with an unchanged viewport; background drag must pan; a later click must still select and open the design. Source plan bytes must remain unchanged. Reviewer checks implementation, regressions and scoped living design mappings.

## Idempotence and Recovery

All changes stay on `feature/component-layout`; ROOT merges the pushed PR. Test profiles/displays are disposable and owned. Do not delete worktrees or branch history. Reset affects renderer geometry only. Preserve unrelated failures rather than waiving or researching them.

## Artifacts and Notes

Step handoff: `/tmp/swarm-ide-component-layout.2CBDrF`; retain concise seam, review, focused output, owned proof, verification and final recap there.

## Interfaces and Dependencies

Use installed ReactFlow position-change events and existing `useGraphReveal` measurement callback. Introduce only an optional scoped layout prop; no App, protocol, core, filesystem or provider capability changes.

Initial plan recorded before implementation; direct scoped verification replaces broad gate repetition under current user authority.

Updated after implementation and native correction to record exact checks and final warning rather than overstate the GUI result.
