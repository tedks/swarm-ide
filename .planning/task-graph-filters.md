# Keep completed tasks available without crowding the graph

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Task blockage should start with active work, not every completed issue. Operators can use a compact Filters disclosure to choose actual Ditz statuses or Active/All presets. The graph, keyboard outline and edge list show the same tasks. No issue is edited or deleted, and hidden dependencies never become invented shortcuts.

## Progress

- [x] (2026-09-09) Read the task projection, loader, canvas contract and existing tests; claimed `swarm-task-graph-filters`.
- [ ] Add focused failing regressions, then implement presentation-only filtering and repository-scoped preferences.
- [ ] Verify one owned packaged filter journey, focused checks and native review.
- [ ] Push a ready PR and leave Ditz in progress for ROOT landing.

## Surprises & Discoveries

The current graph already reads all available details with four concurrent requests. It merely sorts closed issues last. The keyboard outline and edge list currently ignore Focus selected scope; they must use the same visible projection as the canvas.

## Decision Log

The filter uses summary statuses (`unstarted`, `in_progress`, `paused`, `closed`), which remain available even when relation details are unread. Missing endpoints have no status; retain them only when directly connected to a visible task. Persist only the four-status choice under a repository/world UI preference key, not a task selection or metadata revision. An invalid or unavailable preference falls back to Active. Preserve selected details while hiding their graph node, and offer Show selected/Show all. Filtering may reframe by incrementing the existing explicit scope version; unchanged refresh does not.

## Outcomes & Retrospective

Implementation and evidence pending. No canonical task metadata or shared canvas API changes are planned.

## Context and Orientation

`app/renderer/tasks/graph.ts` projects pinned task summaries and details into directed edges. `TaskGraph.tsx` owns loading, selection, scope and display. `app/renderer/plans/plans.css` contains shared planning styles; append task-scoped rules only. `tests/task-graph.test.ts` checks pure graph behavior and `tests/task-graph-surface.test.tsx` checks mounted selection/read authority. `tools/demo-plans:graph-checks` runs these plus client/scope checks and both TypeScript boundaries. The parallel component-layout owner controls `ProjectionCanvas.tsx`; do not edit it.

## Plan of Work

First add a pure status filter and a tiny validated preference parser in the existing graph module, proving mixed statuses, missing endpoints and no shortcut edges. Then integrate a Filters disclosure and consistent visible lists into TaskGraph, testing persistence, hidden selection, all-closed and empty choices, scope composition and refresh without reads or selection changes. Update only the task paragraphs in `docs/design/planning.md`. Reuse the existing packaged graph proof launcher for an isolated filter scenario rather than repairing unrelated historic UI paths.

## Concrete Steps

Run commands from `/home/tedks/Projects/swarm-ide/task-graph-filters`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile --offline`. Run `nix develop --command bazel test //tools/demo-plans:graph-checks --jobs=3 --test_output=errors`. Use a private output base if needed; never stop another worktree's server. Run the existing owned virtual-desktop wrapper through its Bazel entry point with a filter-only scenario. Open a draft PR after the plan commit, push coherent implementation commits, request native review, then make the PR ready after important fixes converge.

## Validation and Acceptance

Mixed active/closed input defaults to active, All restores every task and actual edge, and no active-to-active edge is invented across a closed node. Missing references adjacent to visible tasks remain warnings. Canvas, outline and visible edges agree under status and Focus selected choices. A hidden selected task retains its detail and can be shown without reopening or mutating it. Refresh, hide/show, repository changes and profile reload preserve the correct preferences and manual camera behavior. The packaged proof uses real CLI-authored disposable Ditz metadata and native UI gestures, preserves dirty source/cursor and another graph's camera, records zero renderer exceptions, makes no model call, and confirms owned cleanup.

## Idempotence and Recovery

Preferences are best-effort UI state; malformed storage cannot hide all tasks unexpectedly or crash rendering. The metadata loader and its cancellation/revision checks stay unchanged. Preserve the feature branch and worktree after push. ROOT alone adopts into the managed app.

## Artifacts and Notes

Concise progress and final evidence live in `/tmp/swarm-ide-task-filters.uQT94o/seam.md`, `verification.md` and `final-recap`. Actual results replace pending claims before handoff.

## Interfaces and Dependencies

Use existing React state/effects, browser localStorage and the existing `ProjectionCanvas` task scope/reveal props. Add no dependency, core request, settings protocol, or task-count bound. Pure helpers remain in the already-mapped graph module; living design mappings must continue pointing to the real graph/check targets.
