# Deliver the swarm-ide foundation spine

This ExecPlan is a living document maintained according to `.planning/PLANS.md`.
It is self-contained so a contributor can understand what the foundation proves,
how it is assembled, and what remains without access to the design conversation.

## Purpose / Big Picture

After this work, a developer can launch a real Linux Electron cockpit through
Nix and Bazel, navigate two coordinated software graphs, inspect contextual
information, and use a command to watch a source change reconcile from yellow
to green. The application visibly retains the last coherent graph during work
and atomically adds a mock service after the build. Tests and desktop automation
prove both the typed state rules and the actual window interaction.

## Progress

- [x] (2026-09-05 06:38Z) Created private GitHub repository, protected `master`, bare local layout, feature worktree, ditz issue, and draft PR.
- [x] (2026-09-05 06:43Z) Pinned the Nix shell and Bazel entrypoints with Electron, Node, Vite, TypeScript, React, and graph dependencies.
- [x] (2026-09-05 07:05Z) Implemented the separate local-core process, runtime contracts, deterministic fixtures, event ordering, and sandboxed Electron bridge.
- [x] (2026-09-05 07:07Z) Implemented and visually inspected the four-region workbench, coordinated repo/service graphs, contextual widgets, jobs, and `Ctrl-K` surface.
- [x] (2026-09-05 07:10Z) Automated real X11 window selection, keyboard input, click dispatch, screenshots, state assertions, and HMR measurement.
- [ ] Complete documentation, granular commits, CI, council-review convergence, normal PR merge, cleanup, and final verification.

## Surprises & Discoveries

- Observation: Electron could render the real window despite GLX initialization failures by falling back from the GPU process.
  Evidence: the X11 screenshot is 1916×1019 and displays both interactive React Flow canvases; the warnings remain noisy but non-fatal.
- Observation: the first Bazel quality target cached despite source changes because its shell test did not declare application data.
  Evidence: adding the root `quality_sources` filegroup made source changes invalidate the test action.
- Observation: visible-only X11 search failed when i3 placed Electron on another workspace.
  Evidence: removing `xdotool --onlyvisible` and activating the resolved ID made the repeatable smoke pass.
- Observation: visual verification exposed a working-focus label still pinned to `work:a1` while the world was `work:b2`.
  Evidence: fixture retagging and a runtime invariant now require focus and working revision to agree.

## Decision Log

- Decision: use Electron/Chromium with React, TypeScript, and Vite behind a utility-process local core.
  Rationale: it produces an immediate Linux window and warm HMR while preserving a replaceable privileged boundary.
  Date/Author: 2026-09-05 / Foundation Architect.
- Decision: keep repo and service topologies as separate `GraphSlice` projections coordinated by explicit mappings.
  Rationale: a file and a service have different semantics; forcing them into one graph would hide ambiguity and provenance.
  Date/Author: 2026-09-05 / Foundation Architect.
- Decision: model yellow and red as overlays retaining last-green data.
  Rationale: stale-but-identified information is safer and more useful than blanking the cockpit or presenting speculative derivation as truth.
  Date/Author: 2026-09-05 / Foundation Architect.
- Decision: make Bazel the supported build/test/dev entrypoint while Vite remains alive inside the dev process.
  Rationale: this preserves the opinionated build surface without placing Bazel startup on each renderer edit.
  Date/Author: 2026-09-05 / Foundation Architect.
- Decision: make the first computer-use driver X11-specific and explicit about Wayland.
  Rationale: the current workstation exposes reliable X11 primitives; pretending they are compositor-neutral would create a false acceptance result.
  Date/Author: 2026-09-05 / Foundation Architect.

## Outcomes & Retrospective

The foundation has passed local contract, UI-shell, and real-window proofs. The
largest deliberate gap is that service topology is fixture data rather than a
real Bazel-derived view. The narrowest useful next slice is a checked-in service
declaration and extractor feeding the same contract. Review, CI, and landing are
still pending and must be recorded here before this plan is complete.

## Context and Orientation

The repository is a bare Git repository at `/home/tedks/Projects/swarm-ide/.git`.
The implementation worktree is `/home/tedks/Projects/swarm-ide/foundation-spine`
on branch `foundation-spine`; `master` has its own sibling worktree. The renderer
is in `app/renderer/`. The Electron broker and sandboxed preload are in
`app/electron/`. `core/worker.ts` is a separate privileged process.
`protocol/schema.ts` defines and validates every message. `fixtures/world.ts`
provides deterministic mock states. `tools/` owns supported launcher and desktop
verification scripts. `docs/` records stable product and architecture choices.

A reconciliation epoch is a monotonically newer attempt to derive information
from source. A fingerprint is the exact source identity used as input. A graph
may turn green only when its fingerprint equals the working fingerprint.

## Plan of Work

Maintain the existing seams rather than broadening them. Finish the CI workflow,
run every local quality and desktop gate, push reviewable commits, run the full
provider-diverse council on PR #1, fix each important finding, and repeat review
on only the fix delta until clean. When CI and review are green, merge through
the PR with a normal merge commit, close the ditz issue, prune safely, and verify
that no local commit is stranded.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/foundation-spine`, install exact dependencies
with `nix develop --command pnpm install --frozen-lockfile`. Run
`nix develop --command bazel build //...` and
`nix develop --command bazel test //...`. Start the persistent UI with
`nix develop --command bazel run //:dev`. In a second terminal run
`nix develop --command bazel run //tools:desktop-smoke` and
`nix develop --command bazel run //tools:measure-hmr`.

Expected smoke output includes `desktop smoke passed`, a resolved window ID, a
title containing `FraudCheck visible`, and four PNG dimensions. Expected HMR
output includes `HMR measurement passed`, two measured millisecond values, and a
non-zero screenshot difference.

## Validation and Acceptance

Acceptance requires all Bazel tests to pass, the Electron window to be found by
X11 automation, the keyboard command palette and mouse dispatch to work, yellow
and green screenshots to be materially different, and the final service graph
to visibly contain `FraudCheck`. Invalid green fingerprints, stale epochs,
out-of-order sequences, ambiguous navigation, and workbench rendering all have
focused tests. GitHub CI and the council-review fixpoint must be green before
merge.

## Idempotence and Recovery

The desktop smoke resets the deterministic fixture before dispatch. The HMR
probe copies its input to a `mktemp` backup and restores it through an exit trap.
If the window is absent, launch `//:dev` and rerun; neither script starts or kills
an existing session. If Electron exits during a main-process rebuild, the dev
supervisor restarts it. The feature worktree remains isolated from `master`.

## Artifacts and Notes

Local evidence is intentionally ignored by Git under `artifacts/desktop/` and
`artifacts/hmr/`. The first passing desktop comparison changed 72,478.8 pixels.
The first recorded warm HMR sample was 55 ms edit-to-observable-title and 19 ms
Vite-event-to-next-paint.

## Interfaces and Dependencies

Zod owns runtime contracts. React owns workbench composition. React Flow is the
current replaceable graph renderer behind `graph-adapter.ts`. Electron's context
bridge and utility process isolate privilege. Vite and esbuild own the warm dev
loop inside a Bazel launcher. Nix pins all executable tooling. Vitest and Testing
Library run only through the Bazel quality target. X11 verification uses
`wmctrl`, `xdotool`, and ImageMagick supplied by Nix.

Revision note (2026-09-05): recorded the implemented foundation and measured
desktop evidence before CI/review/landing so another contributor can resume the
remaining gate from this file alone.
