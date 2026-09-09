# Keep completed tasks available without crowding the graph

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Task blockage should start with active work, not every completed issue. Operators can use a compact Filters disclosure to choose actual Ditz statuses or Active/All presets. The graph, keyboard outline and edge list show the same tasks. No issue is edited or deleted, and hidden dependencies never become invented shortcuts.

## Progress

- [x] (2026-09-09) Read the task projection, loader, canvas contract and existing tests; claimed `swarm-task-graph-filters`.
- [x] (2026-09-09 14:52Z) Reproduced three new failing UI cases with 38 existing cases passing; implemented filtering and repository-scoped preferences.
- [x] (2026-09-09 15:00Z) Final 46 focused tests and both TypeScript boundaries pass. Actual-index reader: 60 tests pass. Native implementation and final UI/proof review CLEAN.
- [x] (2026-09-09 14:58Z) Actual packaged filter proof passes in 1.359s with zero renderer errors and owned cleanup; source text/cursor and component camera retained.
- [x] (2026-09-09 14:59Z) Coherent implementation pushed in PR144; final test/report commit and ready handoff follow. Ditz stays in progress until ROOT lands.

## Surprises & Discoveries

The current graph already reads all available details with four concurrent requests. It merely sorts closed issues last. The keyboard outline and edge list currently ignore Focus selected scope; they must use the same visible projection as the canvas.

The first new-check run produced three intended UI failures and 38 passes. After implementation, 44 tests passed but one newly added test used an unsupported Testing Library `exact` role option; removing that test-only option restored typechecking. A broader `//tools/living-design:checks` run exposed 14 unchanged fixture identity failures (planning-ui 5, component stability 4, plan actions 5). Native review traced `project:test-fixture` responses to `project:swarm-ide` requests, rejected before document activation. This is recorded on existing issue `swarm-plan-cockpit-fixture-identities`, not repaired or waived by this slice.

## Decision Log

The filter uses summary statuses (`unstarted`, `in_progress`, `paused`, `closed`), which remain available even when relation details are unread. Missing endpoints have no status; retain them only when directly connected to a visible task. Persist only the four-status choice under a repository/world UI preference key, not a task selection or metadata revision. An invalid or unavailable preference falls back to Active. Preserve selected details while hiding their graph node, and offer Show selected/Show all. Filtering may reframe by incrementing the existing explicit scope version; unchanged refresh does not.

## Outcomes & Retrospective

Implemented active/all/individual status filters, consistent scoped graph/outline/edges, hidden-selected-task recovery and validated per-world/repository local-profile preferences. No canonical task metadata, loader or shared canvas API changed. The first packaged proof passed in 1.310s; its screenshot showed that expanded options consumed the compact card. A small task-scoped dropdown/button correction and stronger camera-presence assertion produced the final 1.359s proof with the graph visible beside the dirty editor. Both runs had zero errors and cleanup=1. Persistence/repository changes, malformed preferences, unavailable storage and selection/scope/refresh are mounted or pure tests, not claims of separate physical-desktop proof. No model calls were made.

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

Concise progress and final evidence live in `/tmp/swarm-ide-task-filters.uQT94o/seam.md`, `verification.md` and `final-recap`. Final owned evidence is `packaged-final/run.yfYlcS/plans-proof.json` and `02-show-completed-retained-source.png` under that step. `final-filter-checks.log` records the 46-case/typecheck gate; `index-reader.log` records actual-index checks. The broader failure log remains `focused-final.log` with precise issue attribution. Hosted CI and foreign seats were not used under the user's local-only/native-review directive.

## Interfaces and Dependencies

Use existing React state/effects, browser localStorage and the existing `ProjectionCanvas` task scope/reveal props. Add no dependency, core request, settings protocol, or task-count bound. Pure helpers remain in the already-mapped graph module; living design mappings must continue pointing to the real graph/check targets.
