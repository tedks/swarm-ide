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
- [ ] Add backwards-compatible contract kinds and a scoped graph/detail view.
- [ ] Align actual authored relationships and documents with implementation.
- [ ] Run focused checks, native review and one owned packaged screenshot journey.
- [ ] Push the ready PR, record accomplishments in Ditz and hand back to ROOT.

## Surprises & Discoveries

The root projection currently includes every child's outgoing edge. All 13 links
share one interface appearance despite representing reads, results, navigation
and explicit outcome writes. `ProjectionCanvas` already retains independent
cameras and SVG edge labels; no new layout engine or App change is needed.

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

## Outcomes & Retrospective

Implementation and evidence pending.

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

## Interfaces and Dependencies

Extend existing PlanNode design connections additively; no wire version bump,
new package, renderer filesystem access, App workspace edits or layout library.
The graph reads authored semantics only. Mechanical peer mapping additions are
validated against committed files/targets before inclusion.
