# A calm directory explorer and startup topology

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Replace the noisy duplicated directory list and node diagram with a familiar expandable folder tree as the initial repository view. Keep a quieter optional map, independent service graph, source editor and unsaved work. Build service topology automatically once when the initial repository evidence is usable. Changes should appear in the user's existing UI sprint canvas, not a new native window.

## Progress

- [x] (2026-09-06) Verified clean feature/ui-sprint at 7bd0ace and the owned preview on port 55175. The agent process launch cwd is master, but every editing/tool command and the preview use ui-sprint.
- [x] Inspected existing single-directory protocol, navigation/camera guards and renderer.
- [x] Implemented lazy folder tree and focused tests; hot-loaded in the human canvas.
- [x] Integrated bounded startup reconciliation and 20 focused tests (passed in first quality run).
- [x] User steering: single-line task rows, double-click/Enter task document in central workspace, source kept mounted beneath it.
- [x] User steering: Directory / Agent runs / Tasks now occupy independently collapsible, resizable thirds of the left sidebar.
- [ ] Refine map into recursive spatial directory grids (user rejected the initial linear map).
- [ ] Continue artifact tabs/shared focus and task-linkage presentation under direct steering.
- [ ] Verify local quality and owned virtual UI; retain HMR window.
- [ ] Commit/push, draft PR and proportional council convergence; record remaining work without concluding the personal sprint.

## Surprises & Discoveries

The directory browser currently duplicates a maximum-80px list with a much larger graph. The core retains only one capture, and directory reads are ordered navigation events; parallel background reads would cancel one another. Retaining visited display observations in the renderer supports an explorer without changing filesystem authority or scanning the whole repo.

## Decision Log

2026-09-06: Make Explorer the default and retain Map as an explicit alternative. Both use observed directory data, not invented service hierarchy. Expanded visited folders retain bounded dated observations, while a newly expanded folder uses existing canonical directory navigation. Only the broker authorizes opening files. Preserve ReactFlow instances while changing visibility so service and map cameras are not discarded.

2026-09-06: Startup reconciliation is one attempt per initial world/document, waits for usable working evidence, and does not continuously rebuild after edits or retry failures. Manual Build remains available. This is the existing Bazel topology, not a new generic build system.

## Outcomes & Retrospective

Live work-in-progress, not reviewed landing. First quality run typechecked and passed 1102 of 1103 tests, including all 20 startup cases. One existing owned-process cleanup assertion failed at tests/agent-owned-process.test.ts:152; the pre-existing namespace-attestation risk remains open and no assertion was relaxed. That run predates later task/sidebar edits and the new tree tests. No full green, virtual acceptance or council claimed. Normal roadmap progression remains paused. No filename search, project selection, real agents or generalized service inference added.

## Context and Orientation

`app/renderer/repository/RepositoryNavigation.tsx` owns directory controls; `navigation.ts` sequences canonical `repo.list` requests through the local core. `GraphPane.tsx` renders repository and service projections; its frame publisher prevents rapid graph-measurement feedback loops. `App.tsx` owns source buffers, focus, build requests and shared workspace snapshots. `protocol/repository.ts` defines one bounded directory page (200 entries from a maximum 4096-entry capture), coverage and unavailability. No protocol or filesystem-broker changes are required.

## Plan of Work

First add a bounded display-only tree model and replace the list with indented folder/file rows. Support expand/collapse, arrow navigation, file activation, existing exact Open path, breadcrumbs, Refresh, filtering and paging, keeping coverage in contextual controls rather than repeating metadata on every row. Preserve cached siblings and derive ancestor navigation paths when an explicit Reveal jumps into an uncached directory. Cache is not fresh evidence.

Then give the repository pane an Explorer/Map selector, preserving both graph instances, and use compact folder/file nodes and unlabelled orthogonal containment edges for the map. Integrate a standalone startup-topology hook after the existing reconciliation callback, with strict one-attempt and unavailable-evidence behavior. A bounded native helper owns only that hook and new tests; the UI owner integrates shared App changes.

## Concrete Steps

Operate in `/home/tedks/Projects/swarm-ide/ui-sprint`. The existing canvas uses `nix develop --command bazel run --jobs=3 //:dev` with SWARM_DEV_PORT=55175; renderer changes arrive through Vite hot replacement. Run `nix develop --command bazel test --jobs=3 //tools:quality --test_output=errors`. For GUI verification serialize through `flock --close /tmp/swarm-ide-overnight.UgO2Aw/virtual.lock` and use the existing Bazel-owned virtual-X11 scenarios, adapting acceptance gestures only where the deliberately changed presentation requires it. Never automate the human desktop.

## Validation and Acceptance

On first render the root and its immediate children are readable tree rows. Expanding core keeps root siblings visible and reveals actual files; collapsing hides descendants without closing source. Keyboard Right expands, Left folds or moves to parent, Up/Down moves rows and Enter activates; editor keys stay scoped. Refresh and external Reveal retain source/draft/cameras; partial captures and unreadable paths remain explicit. Map mode does not recreate either graph. Startup initiates one normal topology build with usable evidence, with no loop on failure, subsequent edits, hot replacement or core recovery. Tests must cover stale replies, cached bounds and user collapse during an in-flight expansion. Capture virtual evidence and reject renderer errors.

## Idempotence and Recovery

No source migration or dependency changes. The private canvas profile and worktree isolate user state. Failed reads retain previous visible observations; Retry/Refresh remain explicit. Keep errors and last consistent topology visible, never manufacture green. Do not restart Electron unless main-process changes require it; none are planned.

## Artifacts and Notes

Canvas ownership is `/tmp/swarm-ide-ui-sprint.Pmyccs/canvas.md`. Record proof paths and reviewed commits here as they become available. No tests or screenshots are claimed yet.

## Interfaces and Dependencies

Reuse React, existing runtime-validated repository observations, CodeMirror and ReactFlow. New display-only cache/tree helpers must not call filesystem APIs or confer file authority. Bound cache size and rendered rows; only requested folders are read. All build initiation goes through the existing typed `reconciliation.start` request. No dependencies are added.

2026-09-06 steering update: prefer fast prompt-to-visible iterations, batch heavier checks/review at checkpoints. Tree moved out of the map into the upper left third; graph position override reverted to the provider's grid while recursive spatial zoom remains pending. The large text surface is an artifact workspace, not just source editing; task/design/docs tabs and their contextual linkages are the intended next UI direction. Service and build-dependency graphs must stay distinct, without fabricated unavailable data.
