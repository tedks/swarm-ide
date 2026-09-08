# Follow deliberate graph navigation

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Clicking a task, service, interface or build target should bring the relevant existing node into view. Refreshing data, receiving agent activity, resizing the editor and changing interface zoom must not reset a camera. Moving the camera manually takes precedence over an older pending reveal.

## Progress

- [x] (2026-09-08 21:18Z) Read current selection, camera and task ownership paths.
- [ ] Record focused failing tests and agree the additive task-selection seam.
- [ ] Implement one-shot camera requests and wire deliberate navigation.
- [ ] Run focused tests, native review, and an inexpensive owned desktop check if practical.
- [ ] Push a ready PR, document exact evidence, sync Ditz and hand off to ROOT.

## Surprises & Discoveries

Selection is intentionally separate from camera movement today. `GraphPane` has a full-graph reframe counter, but App always passes zero. `BuildGraphPane` frames scope changes, not node clicks. `TaskGraph` has a private selection unrelated to the selected task in its client. Those are distinct missing gesture paths, not a layout algorithm failure.

## Decision Log

Use explicit request identities rather than watching all snapshot changes. Resolve only actual loaded nodes and explicit declared service/file membership; never infer task-to-service connections. Preserve existing Fit controls and library-owned camera state. The concurrent complete-task-graph worker owns `TaskGraph.tsx`, so coordinate a small prop seam rather than editing that file concurrently. These decisions were made on 2026-09-08 to keep passive updates harmless.

## Outcomes & Retrospective

Implementation and proof are pending. The plan index target-count failure and task graph truncation are independently owned and are not part of this repair.

## Context and Orientation

`app/renderer/repository/reframe.ts` owns explicit camera hooks. `GraphPane.tsx` renders repository/service projections; `repository/BuildGraphPane.tsx` renders observed Bazel targets. `plans/ProjectionCanvas.tsx` renders design and task projections. App owns deliberate cross-pane navigation. A reveal request contains a unique gesture identity, a workspace/graph scope and existing node IDs. It is not an instruction to select source, change worktrees or run a build.

## Plan of Work

First add focused mounted/helper regressions that show clicks currently do not request a node-scoped fit. Add a reusable reveal hook that waits for the mounted graph and measured nodes, consumes each gesture once, cancels on manual movement, and fences requests by scope. Wire service/build gestures and source membership through their existing selection paths. Add backward-compatible ProjectionCanvas props for the task owner to consume. Finally document navigation versus passive retention in the living design and test only the affected surfaces.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/graph-click-recenter`. Materialize dependencies using `nix develop --command pnpm install --frozen-lockfile`. Add a Bazel-owned focused target at `//tools/graph-recenter:checks`, then run `nix develop --command bazel test --jobs=3 //tools/graph-recenter:checks`. It runs the affected tests and both TypeScript boundaries. Create a draft PR early and push granular commits. ROOT, not this worker, performs the normal merge and managed-app adoption.

## Validation and Acceptance

Tests must demonstrate node-scoped fit for deliberate clicks (including repeated clicks), no fit for passive refresh/zoom/unmatched focus, deferred measured-node readiness, and cancellation when the user pans or changes repository. Source-to-service tests use declared exact paths and retain multiple matches. A task seam test should demonstrate external task selection highlighting and reveal without rereading metadata. Any desktop proof uses a disposable X11 display, never the user's display.

## Idempotence and Recovery

No data migration, background observer or agent turn is required. Changes stay on the feature branch. Preserve branches, existing user buffers and other workers. Cancel only this worker's builds and disposable GUI resources at handoff.

## Artifacts and Notes

Progress, focused logs and the final review summary live under `/tmp/swarm-ide-graph-recenter.PYIk1o`. Ditz issue: `swarm-click-graph-recenter`.

## Interfaces and Dependencies

Use the installed ReactFlow camera and measurement events, React hooks and existing typed graph contracts. Keep new props optional. Do not add provider calls, graph nodes or dependencies. New source files are tracked by the existing renderer glob and new tests by `//:quality_sources`; any new focused target must be mapped in the living design.

Initial plan recorded before implementation, with ownership and failure boundaries explicit.
