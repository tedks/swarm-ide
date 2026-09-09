# Give component contracts room and let people arrange nodes

This plan follows `.planning/PLANS.md` and is updated as the slice progresses.

## Purpose / Big Picture

The component design keeps its authored relationships but gains enough space to read them. A person can drag one node without panning, drag the background to pan, and reset only the current arrangement. Geometry is renderer-session presentation, never an edit to `.swarm/plans.json`.

## Progress

- [x] 2026-09-09: Confirmed clean designated worktree at PR142, read source/instructions, materialized frozen dependencies, started `swarm-component-layout-drag`.
- [ ] Add spacing and scoped drag regressions; demonstrate failure before correction.
- [ ] Implement opt-in component layout and update living design.
- [ ] Run focused checks, one owned packaged input proof, and native review to convergence.
- [ ] Push a ready PR and hand off to ROOT for normal merge/adoption.

## Surprises & Discoveries

The existing projection has 200-pixel columns/65-pixel rows for 184-by-52-pixel nodes. Shared `ProjectionCanvas` disables dragging but holds a dormant unscoped drag-stop map. Enabling that alone would neither control live movement nor separate arrangements.

## Decision Log

Use a small optional layout scope on the shared canvas; only Component design opts in. Retain position overrides in renderer memory keyed by world, repository/worktree identity, selected component and selected-contract versus overview. Remove vanished IDs. Keep camera behavior and full-graph Fit unchanged. Reset returns to authored default positions without rewriting plan metadata. No cross-restart storage or new graph engine.

## Outcomes & Retrospective

Implementation and proof pending.

## Context and Orientation

`app/renderer/plans/DesignWorkspace.tsx` creates the component projection from the plan. `ProjectionCanvas.tsx` controls ReactFlow nodes and camera reveal. `tests/component-graph-stability.test.tsx` checks real plan relationships and mounted navigation; `tools/living-design` owns packaged virtual-desktop checks. Other users of the shared canvas must stay non-draggable.

## Plan of Work

Increase positions in `designProjection` without changing membership or edges. Add opt-in scoped position changes to `ProjectionCanvas`, forwarding measurement events to existing camera code. Disable drag auto-pan for this feature and preserve click/keyboard selection. Add a small Reset layout button. Test scope transitions, refresh, removed IDs, reset and unchanged default consumers. Extend the existing living-design driver with a layout-only mode for actual node/background input and selected-document checks; do not repeat unrelated long journeys.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/component-layout`, run `nix develop --command bazel test --jobs=3 //tools/living-design:checks` and `nix develop --command bazel run --jobs=3 //tools/living-design:smoke` with the owned layout-only mode. Record actual output and artifacts in the handoff. Use the existing desktop harness, never inherited DISPLAY=:0.

## Validation and Acceptance

Focused tests must show bigger gaps, identical IDs/directions/labels, live dragged positions, A→B→A retention, separate contract/workspace arrangements, removed IDs discarded and current-only reset. Packaged input must move exactly one node with an unchanged viewport; background drag must pan; a later click must still select and open the design. Source plan bytes must remain unchanged. Reviewer checks implementation, regressions and scoped living design mappings.

## Idempotence and Recovery

All changes stay on `feature/component-layout`; ROOT merges the pushed PR. Test profiles/displays are disposable and owned. Do not delete worktrees or branch history. Reset affects renderer geometry only. Preserve unrelated failures rather than waiving or researching them.

## Artifacts and Notes

Step handoff: `/tmp/swarm-ide-component-layout.2CBDrF`; retain concise seam, review, focused output, owned proof, verification and final recap there.

## Interfaces and Dependencies

Use installed ReactFlow position-change events and existing `useGraphReveal` measurement callback. Introduce only an optional scoped layout prop; no App, protocol, core, filesystem or provider capability changes.

Initial plan recorded before implementation; direct scoped verification replaces broad gate repetition under current user authority.
