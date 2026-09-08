# Follow deliberate graph navigation

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Clicking a task, service, interface or build target should bring the relevant existing node into view. Refreshing data, receiving agent activity, resizing the editor and changing interface zoom must not reset a camera. Moving the camera manually takes precedence over an older pending reveal.

## Progress

- [x] (2026-09-08 21:18Z) Read current selection, camera and task ownership paths.
- [x] (2026-09-08 21:16Z) Three click-camera tests RED, nineteen retained tests PASS; task owner agreed a post-PR138 additive seam.
- [x] (2026-09-08 21:35Z) One-shot measured-node viewport requests implemented; 33 focused tests and both typechecks pass.
- [x] (2026-09-08 21:55Z) Joined focused camera/task/sprite targets and both type boundaries pass; final native convergence CLEAN.
- [x] (2026-09-08 21:55Z) Actual packaged source/service/build gestures and independently verified manual-pan retention PASS in 5.090s, owned cleanup complete.
- [x] (2026-09-08 21:56Z) Coherent code pushed in PR139; final documentation and ROOT handoff prepared.

## Surprises & Discoveries

Selection is intentionally separate from camera movement today. `GraphPane` has a full-graph reframe counter, but App always passes zero. `BuildGraphPane` frames scope changes, not node clicks. `TaskGraph` has a private selection unrelated to the selected task in its client. Those are distinct missing gesture paths, not a layout algorithm failure.

Native review found that raw controlled ReactFlow nodes do not receive measured dimensions, and that `fitView` queues another library frame even at duration zero. The implementation now reads public internal-node measurement and uses bounds plus immediate `setViewport`. It also keeps a file request pending until the requested file's layout is active, without creating a second gesture on asynchronous read completion.

The first owned GUI run failed before source opening: its click helper did not scroll the requested file into the visible tree. The screenshot shows no opened editor. The corrected helper scrolls and checks the actual pointer hit target first; the original failure remains recorded, not attributed to a product camera defect.

Normal composition with the reviewed sprites exposed a separate concrete grid mismatch: the new service Agents toolbar added a third child to a two-row grid. A new direct regression was RED; moving the toggle into the existing header restores the canvas row. The corrected joined package passes. The earlier proof had not independently confirmed pan movement; the final driver requires a hit-tested visible pane and a changed camera before testing refresh retention.

Task selection review caught stale local fallback resurrection, freshness recovery masquerading as navigation, and delayed detail acknowledgement issuing a second camera move. Separate gesture tokens and acknowledgement-preserving retirement now cover those sequences. The sidebar currently exposes only the selected ID, so same-ID sidebar reclick after pan is a filed follow-up; canvas and outline repeats work now.

## Decision Log

Use explicit request identities rather than watching all snapshot changes. Resolve only actual loaded nodes and explicit declared service/file membership; never infer task-to-service connections. Preserve existing Fit controls and library-owned camera state. TaskGraph was initially independently owned; ROOT later cleared normally merged master 174b262 and explicitly transferred the tiny selection seam after that worker retired. The normal integration preserves complete-task scheduling, plan repair and live sprites.

## Outcomes & Retrospective

PR139 code e7cdfc4 passes 51 camera checks, 38 task-completeness checks and the existing sprite checks (52 plus one selected mapping case; seven other mapping cases are excluded by that pre-existing target filter). These targets overlap, so counts are not additive. Both TypeScript boundaries pass; native convergence is CLEAN. Actual packaged source/service/build and pan-retention proof passes in 5.090s with zero renderer errors and owned cleanup. No full-suite sweep, hosted gate or model turn was performed. ROOT owns normal landing and managed adoption. Same-ID sidebar reclick is tracked as swarm-task-repeat-sidebar-reveal.

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
