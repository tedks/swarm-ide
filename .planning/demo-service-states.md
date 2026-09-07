# Explain empty Service graphs without inventing evidence

This ExecPlan follows `.planning/PLANS.md` and remains a living record.

## Purpose / Big Picture

An empty Service canvas should explain whether topology is unobserved, needs a build, is being built, failed, or is a build-backed empty observation. This is a presentation-only change: the existing Build control remains the only deliberate action, and any populated graph remains visible and interactive.

## Progress

- [x] (2026-09-07 21:30Z) Verified assigned branch `feature/demo-service-states` at `b1db2b9`, read instructions and inspected the graph contract.
- [x] (2026-09-07 21:34Z) Added mounted state/retention tests: pre-change 8 failed / 10 passed across the focused suite; failures are missing explanations.
- [x] (2026-09-07 21:35Z) Implemented prop-only explanation and locally scoped styling.
- [x] (2026-09-07 21:40Z) Owned virtual X11 proof passed: actual external Git repository and source opening, readable full/narrow empty canvas, zero renderer errors, cleanup complete. Native substantive/fix-delta review CLEAN.
- [x] (2026-09-07 21:41Z) Final quality 1,644 tests across 118 files, focused 19 tests across 4 files, type checks/renderer/node builds and desktop bundle passed.
- [x] (2026-09-07 21:42Z) PR59 pushed; preparing ready handoff and Ditz sync. ROOT retains merge/adoption authority and closes the issue only after actual merge.

## Surprises & Discoveries

The Service graph has reconciliation colors and provenance but no capability flag or whole-repository coverage declaration. The running-build prop is shared. Therefore neutral copy cannot promise that arbitrary repositories support service extraction; green alone is not proof of a build-backed empty result. Native review also identified `markWorkingWorldUnknown` as a red publication without a build attempt, so red copy must describe observation failure, not assert that a build failed. The real provider's first fingerprint replaces its transient gray bootstrap with yellow epoch 1 without a build; initial smoke assertions incorrectly waited for settled gray. Preserved failure screenshots showed the correct new yellow explanation. The driver now asserts the actual settled state instead of inventing gray startup persistence.

## Decision Log

Only `topologyId === "service"` with no nodes receives the explanation. Existing ReactFlow remains mounted even when empty, and no graph camera or focus effect is introduced. An empty graph with build provenance and green reconciliation may describe the recorded observation, never the entire repository. Other ambiguous green provenance is unavailable. Yellow with a running job means pending; yellow idle means a build is needed. Gray remains unobserved and red failed.

## Outcomes & Retrospective

The formerly blank Service canvas now explains its available evidence without new capabilities or actions. PR59 contains 22 lines of GraphPane presentation logic plus locally scoped CSS and dedicated proof. Actual full-width and source-adjacent screenshots show the settled yellow needs-build state; rare gray/pending/red/green-empty states are covered by synthetic mounted inputs, not claimed as real observed runs. Existing populated graphs, focus and mounted cameras passed the focused regressions. ROOT, not this worker, owns final merge and app adoption. Foreign review seats are intentionally omitted under the user's Codex-only capacity instruction. No actual service discovery for arbitrary repositories was added.

## Context and Orientation

`app/renderer/GraphPane.tsx` renders several graph projections using ReactFlow, the library that owns panning and zooming. `GraphSlice` in `protocol/schema.ts` provides nodes, reconciliation color and provenance, which identifies where a result came from. `core/provider.ts` creates empty gray/yellow/red Service graphs when evidence is absent, stale or failed. `core/service-topology.ts` creates build-backed green graphs. This task does not edit either core module or the protocol.

## Plan of Work

First add `tests/demo-service-states.test.tsx` with a mounted ReactFlow substitute that exposes retained camera and click behavior. Add a dedicated Bazel regression entry under `tools/demo-service-states/`. Then add a small explanation component in GraphPane and import `service-graph-status.css` locally. The explanation occupies only an empty Service canvas and leaves graph controls available. Add a dedicated owned virtual desktop scenario using the existing harness, not a new desktop platform.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/demo-service-states`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run focused tests with `nix develop --command bazel test --jobs=3 //tools/demo-service-states:regressions --test_output=errors`. Final checks are `nix develop --command bazel test --jobs=3 //:quality //tools/demo-service-states:regressions --test_output=errors` and `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Run the actual UI proof with `SWARM_VIRTUAL_DISPLAY=:133 SWARM_VIRTUAL_DESKTOP_PORT=55213 nix develop --command bazel run --jobs=3 //tools/demo-service-states:smoke`. These run-target environment values are forwarded to the shared harness, which owns display, window, private profile, disposable Git input and cleanup. Use another free display/port if occupied; never stop another project.

## Validation and Acceptance

Mounted tests must distinguish empty states, refuse a mock/unknown green empty claim, preserve populated yellow/red nodes and the mounted camera across state changes, and prove no automatic reconciliation. The actual UI proof must show the new empty-state text in the real app on an owned virtual X11 desktop. Unit inputs for rare states are synthetic and will be labelled separately from that screenshot. No provider turn is needed.

## Idempotence and Recovery

No data migration or new dependencies are required. Repeat focused tests safely. Do not kill any peer process or adopt the shared preview; the owned harness cleans only its process group and private files. Keep the feature branch and logs for ROOT intake. Do not close Ditz until actual merge.

## Artifacts and Notes

Operational logs, review and screenshots live in `/tmp/swarm-ide-demo-polish.HjpljW/service-states`. `virtual-settled/service-needs-build.png` and `virtual-settled/service-with-source.png` were visually inspected. `virtual-settled/supervisor.log` records 2.516 seconds scenario / 5.007 seconds total and `cleanup_complete=1`. The earlier failed driver assumptions remain in `virtual-final` and the first local `artifacts/service-states` run. They were test-only startup-state errors, not fixed product failures. Product modifications are limited to GraphPane, its new CSS, this plan and dedicated tests/tools.

## Interfaces and Dependencies

Use the existing `GraphSlice`, `reconciliationRunning`, React and ReactFlow props; introduce no protocol, callback, provider or automatic Build. The only new import in GraphPane is local CSS. State explanation is derived during render and never changes input graph objects.

Updated 2026-09-07 21:42Z to record completed local/native/actual-UI evidence, corrected smoke assumptions and the remaining ROOT merge gate. No repeated full run is required for this evidence-only plan update.
