# Keep the system visible while working in text

This ExecPlan follows .planning/PLANS.md. Keep its progress, decisions and results
current. Work only in usability-plans, on fix/unified-graph-workspace from reviewed
6e652e1; earlier plan branches and completed PRs stay preserved.

## Purpose / Big Picture

Home should show four coordinated views of the same project: component design,
task dependencies, repository files and the existing build/services chooser.
Opening source or another central document should keep those same graphs beside
a readable editor. Component labels must not flash because a selection remounts
the graph, and containment must not look like an architectural interface.

## Progress

- [x] 2026-09-08: confirmed clean designated worktree and created the fresh branch.
- [x] Read current projection, canvas and App composition; confirmed selection-key remount and fixed-column routing.
- [x] Repair component graph truth, readability and camera/identity stability; pushed 945cd22 with native CLEAN and focused checks.
- [x] Compose one four-pane workspace and central document layout without duplicate readers or graph instances; focused mounted checks pass.
- [ ] Run focused checks, native review and one owned virtual journey; record limits, push and hand off.

## Surprises & Discoveries

The root projection has seven nodes and nineteen edges: six parent/child edges
generated for navigation and thirteen actual authored connections, including
four reciprocal pairs. A React key containing the selected component destroys
the canvas and repeats its initial fit. Default measured SVG labels briefly hide
while measuring. No idle polling-induced flashing has been established.

## Decision Log

Preserve all authored nodes and connections in the index. Distinguish containment
with dashed muted edges; disclose exact incoming/outgoing interfaces in readable
inspection. Focus/hover can reveal edge labels without drawing all text at once.
Use the existing ReactFlow dependency; no new layout service or package.

Keep one shared plan selection and one instance of each graph. Central prose is
a normal document surface, not content forced into a small graph card. Old Plan
and Code preferences migrate to the unified workspace. Tests do not activate
real agents, write to user worktrees or drive the physical desktop.

## Outcomes & Retrospective

Implementation is in progress. Do not claim a joined workspace from projection
tests alone or claim the unproven idle flashing symptom fixed.

## Context and Orientation

app/renderer/plans/DesignWorkspace.tsx builds component and implementation
projections. ProjectionCanvas.tsx owns ReactFlow instances and their cameras.
navigation.ts supplies one repository-scoped index and selected component.
PlanWorkspace.tsx currently combines prose, design and task graphs while App.tsx
hides repo/service graphs under a mutually exclusive Plan/Code choice. The repo
GraphPane and TopologyViews in repository/BuildGraphPane.tsx already implement
source/build/service activation; preserve those callbacks and readers.

Peer work touches agent headers and journal/work-log actions in App. Do not edit
those components. Before integrating overlapping navigation functions, consume
only ROOT-reviewed committed inputs, or report the exact minimal overlap.

## Plan of Work

First change only plan graph files, focused tests and corresponding living docs.
Memoize unchanged projection inputs, stop keying a canvas by selected component,
retain scoped cameras and distinguish containment from actual directed links.
Reciprocal links remain separate and accessible. Verify both selected navigation
and an unchanged refresh; retain useful labels without measurement remounts.

Then expose the design graph/document as coordinated slots from the existing plan
controller, with one task graph. App arranges these and its existing repo and
build/services graphs in a permanent four-cell container. With text open, CSS
compacts that container next to a useful-width editor; use two columns where
possible and one column otherwise. Existing source buffers, graph cameras, task
documents, activity, worktree and draft actions remain authoritative.

## Concrete Steps

From /home/tedks/Projects/swarm-ide/usability-plans, use Nix and Bazel:

    nix develop --command bazel test --jobs=3 //tools/living-design:checks
    nix develop --command bazel test --jobs=3 //tools/operator-cockpit:plan-first

Add narrow graph/workspace tests to the relevant check target rather than running
the full legacy suite. Reuse the living-design or operator-cockpit owned virtual
launcher with a free display/port for overview, graph selection and source/compact
screenshots. A changed acceptance driver must retain errors/cleanup assertions.

## Validation and Acceptance

Direct tests preserve all actual interface directions and separately mark
containment; unchanged observations retain graph inputs and selecting/revisiting
components does not remount or reset pan/zoom. Mounted composition proves the
same four instances persist through source/doc open and close, with dirty text,
cursor and camera state intact. Old saved Plan/Code preferences cannot hide the
graphs. The owned virtual journey verifies actual layout and zero renderer
exceptions. Native Codex-only review converges on the touched delta; hosted and
foreign gates are excluded by the explicit user instruction.

## Idempotence and Recovery

No metadata migration deletes a saved buffer. Keep old branches and evidence.
If shared App composition is held, push the reviewed graph repair and state the
exact integration boundary. Stop only processes/displays created for this step.

## Artifacts and Notes

Record concise progress and final-recap in /tmp/swarm-ide-graph-workspace.QYZGPn.
Ditz swarm-component-graph-stability precedes swarm-unified-graph-workspace;
write human accomplishment notes and sync metadata. ROOT owns normal landing
and shared app adoption, not this child.

## Interfaces and Dependencies

Reuse PlanNavigation, ProjectionCanvas, TaskGraph, GraphPane and TopologyViews.
One repository/world scope owns the plan read; component selection changes only
the relevant projection. No protocol/provider/read loop or package dependency is
introduced. Keep docs/design/planning.md, cockpit.md and actual plan/build inputs
aligned with the final component ownership.

Initial plan records the bounded graph repair and four-pane integration.
