# Explain empty Service graphs without inventing evidence

This ExecPlan follows `.planning/PLANS.md` and remains a living record.

## Purpose / Big Picture

An empty Service canvas should explain whether topology is unobserved, needs a build, is being built, failed, or is a build-backed empty observation. This is a presentation-only change: the existing Build control remains the only deliberate action, and any populated graph remains visible and interactive.

## Progress

- [x] (2026-09-07 21:30Z) Verified assigned branch `feature/demo-service-states` at `b1db2b9`, read instructions and inspected the graph contract.
- [x] (2026-09-07 21:34Z) Added mounted state/retention tests: pre-change 8 failed / 10 passed across the focused suite; failures are missing explanations.
- [x] (2026-09-07 21:35Z) Implemented prop-only explanation and locally scoped styling.
- [ ] Run relevant local checks, native review and an owned virtual-X11 screenshot.
- [ ] Push a ready PR, sync the issue and hand back to ROOT for merge/adoption.

## Surprises & Discoveries

The Service graph has reconciliation colors and provenance but no capability flag or whole-repository coverage declaration. The running-build prop is shared. Therefore neutral copy cannot promise that arbitrary repositories support service extraction; green alone is not proof of a build-backed empty result. Native review also identified `markWorkingWorldUnknown` as a red publication without a build attempt, so red copy must describe observation failure, not assert that a build failed.

## Decision Log

Only `topologyId === "service"` with no nodes receives the explanation. Existing ReactFlow remains mounted even when empty, and no graph camera or focus effect is introduced. An empty graph with build provenance and green reconciliation may describe the recorded observation, never the entire repository. Other ambiguous green provenance is unavailable. Yellow with a running job means pending; yellow idle means a build is needed. Gray remains unobserved and red failed.

## Outcomes & Retrospective

Implementation and evidence are pending. ROOT, not this worker, owns final merge and app adoption. Foreign review seats are intentionally omitted under the user's Codex-only capacity instruction.

## Context and Orientation

`app/renderer/GraphPane.tsx` renders several graph projections using ReactFlow, the library that owns panning and zooming. `GraphSlice` in `protocol/schema.ts` provides nodes, reconciliation color and provenance, which identifies where a result came from. `core/provider.ts` creates empty gray/yellow/red Service graphs when evidence is absent, stale or failed. `core/service-topology.ts` creates build-backed green graphs. This task does not edit either core module or the protocol.

## Plan of Work

First add `tests/demo-service-states.test.tsx` with a mounted ReactFlow substitute that exposes retained camera and click behavior. Add a dedicated Bazel regression entry under `tools/demo-service-states/`. Then add a small explanation component in GraphPane and import `service-graph-status.css` locally. The explanation occupies only an empty Service canvas and leaves graph controls available. Add a dedicated owned virtual desktop scenario using the existing harness, not a new desktop platform.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/demo-service-states`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run focused tests with `nix develop --command bazel test --jobs=3 //tools/demo-service-states:regressions --test_output=errors`. Run final quality/build through Bazel. Use the dedicated smoke target with `SWARM_VIRTUAL_DISPLAY=:133` and `SWARM_VIRTUAL_DESKTOP_PORT=55213` explicitly forwarded. The shared harness owns display, window, profile and cleanup.

## Validation and Acceptance

Mounted tests must distinguish empty states, refuse a mock/unknown green empty claim, preserve populated yellow/red nodes and the mounted camera across state changes, and prove no automatic reconciliation. The actual UI proof must show the new empty-state text in the real app on an owned virtual X11 desktop. Unit inputs for rare states are synthetic and will be labelled separately from that screenshot. No provider turn is needed.

## Idempotence and Recovery

No data migration or new dependencies are required. Repeat focused tests safely. Do not kill any peer process or adopt the shared preview; the owned harness cleans only its process group and private files. Keep the feature branch and logs for ROOT intake. Do not close Ditz until actual merge.

## Artifacts and Notes

Operational logs, review and screenshots live in `/tmp/swarm-ide-demo-polish.HjpljW/service-states`. Product modifications are limited to GraphPane, its new CSS, this plan and dedicated tests/tools.

## Interfaces and Dependencies

Use the existing `GraphSlice`, `reconciliationRunning`, React and ReactFlow props; introduce no protocol, callback, provider or automatic Build. The only new import in GraphPane is local CSS. State explanation is derived during render and never changes input graph objects.
