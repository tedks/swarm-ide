# Explain components through their actual contracts

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The home component graph should explain six responsibility areas, not imply six
services all depending on each other. The first view shows containment. Selecting
an area shows only its incoming and outgoing contracts; choosing a contract shows
its direction and meaning without unrelated edges. Source, task and build graphs
keep their existing independent navigation and cameras.

## Progress

- [x] Read the current projection, plan schema and component documents; start
  `swarm-component-contract-clarity` on reviewed `220742e8`.
- [x] Add backwards-compatible contract kinds and a scoped graph/detail view.
- [x] Align actual authored relationships and documents with implementation.
- [x] Run 91 focused checks/types, native convergence and owned packaged default,
  selected-contract, explicit Fit and retained editor/task-camera journeys.
- [x] Push PR127, record accomplishments and the compact-controls follow-up in
  Ditz; ROOT retains final merge and managed app adoption.

## Surprises & Discoveries

The old root projection included every child's outgoing edge. All 13 links shared
one interface appearance despite representing reads, results, navigation and
explicit outcome writes. The corrected index adds the separately implemented
latest-summary data contract instead of conflating it with event navigation.
Native review found parallel contract lanes colliding, a plan-read wording error
and reusable-boundary selection restoration. Fix review caught transient refresh
detail removal and a now-closed proof disclosure. Each was corrected, with native
convergence clean. Direct screenshots also drove tighter overview spacing and
deliberate Fit for the retained zoomed camera; no new layout engine was needed.

## Decision Log

- Keep version 1 plans compatible by making connection kind/detail optional.
  Legacy connections remain generic contracts; unknown kinds fail validation.
- Overview is containment, focused detail is direct adjacency only. Never infer
  architecture from common Bazel inputs, transitively close connections or label
  conceptual responsibility areas as independent processes.
- Treat repository reads/results as two directions of one routed capability;
  distinguish owned native execution from observation of terminal owners.
- Use Codex native proportional review and local gates only, as this wave's
  explicit instructions require. ROOT owns landing and shared app adoption.
- Preserve selected read-only detail during ordinary pending refresh, disable
  actions, and clear selection on actual connection/workspace/generation changes.
- Give same-direction and reciprocal contracts stable separate curve lanes.
- Preserve every old source/build mapping; add existing observer client.ts per
  the chat-speed owner's request. New build/worktree runtime mappings belong with
  those still-active implementations, not speculative entries in this increment.

## Outcomes & Retrospective

PR127 supplies a seven-node/six-containment-edge overview and 14 explicit typed
contracts reachable through their own components. Selecting one keeps only its
two endpoints and directed edge, with full contract prose and deliberate Explore.
The actual working index, not fixture metadata, was exercised in packaged Electron
on owned :174/55434. Default four panes, component/document navigation, exact
dirty source, mounted editor, loaded task graph and cameras were retained with
zero renderer errors and confirmed owned cleanup. No live provider/model or
message was invoked. The existing compact overlay controls can cover part of a
node; `swarm-compact-diagram-controls` records this nonblocking visual follow-up.

## Context and Orientation

`protocol/plans.ts` validates the authored forest at `.swarm/plans.json`.
`app/renderer/plans/DesignWorkspace.tsx` selects a component and renders docs,
component graph and separate implementation mappings. `ProjectionCanvas.tsx`
draws nodes/edges and preserves cameras. `docs/design/` explains actual contracts.
`tools/living-design:checks` runs the focused suite; `:smoke` packages Electron
and exercises the current app on an owned virtual desktop.

## Plan of Work

Add optional request/result/data/navigation kinds and concise detail to authored
connections. The root graph draws children only. A selected component draws its
immediate contracts and offers a readable contract selector with directed detail.
Keep selection and camera identity separate from background observations. Update
the six component documents where their contract meaning was ambiguous, and retain
all existing source and Bazel mappings. Incorporate exact additive peer mappings
once available, without waiting indefinitely or copying uncommitted changes.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/demo-architecture`. Bootstrap with
`nix develop --command pnpm install --frozen-lockfile`, then run
`nix develop --command bazel test --jobs=3 //tools/living-design:checks`.
Use `SWARM_VIRTUAL_DISPLAY=:174 SWARM_VIRTUAL_DESKTOP_PORT=55434` for the existing
owned `//tools/living-design:smoke` journey, after checking availability.

## Validation and Acceptance

Actual-index tests must show seven overview nodes and six containment edges,
then exact component-only typed links without unrelated or inferred edges.
Legacy indices must parse, invalid kinds must fail, and repeated observations
must not change the selected contract or graph camera. The packaged app must
show a readable overview and one selected real contract; screenshots and zero
renderer errors are recorded. No real agent messages or model calls are needed.

## Idempotence and Recovery

Changes stay on `fix/component-contract-overview` and are pushed as a normal PR.
Preserve other workers, graph mappings, user files and shared windows. Cleanup
only this worker's owned X11/Bazel resources. A failed proof is retained and
reported accurately rather than retried into an unexplained success.

## Artifacts and Notes

Current progress and evidence live in
`/tmp/swarm-ide-demo-close.BrSWmt/architecture/seam.md` and `verification.md`.
Baseline recorded 3 new RED/84 PASS. The corrected final focused suite recorded
91 PASS plus both TypeScript boundaries. Later coordinate-only spacing and
explicit-Fit proof additions have separate native/packaged attribution; no full
legacy sweep or hosted CI was requested or claimed.

## Interfaces and Dependencies

Extend existing PlanNode design connections additively; no wire version bump,
new package, renderer filesystem access, App workspace edits or layout library.
The graph reads authored semantics only. Mechanical peer mapping additions are
validated against committed files/targets before inclusion.

Revision note: completed the bounded implementation and captured actual native,
local and owned-desktop evidence, including the remaining compact-control nit.
