# Keep selected plan actions in reach

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Selecting a plan should immediately expose its title and deliberate document, source, task and context actions. Today these scroll out of sight with the plan outline. Separate the action header from supporting context and the outline without changing the graph, data loading or activation authority.

## Progress

- [x] (2026-09-07 21:35Z) Verified assigned branch, baseline and bounded ownership; read instructions and materialized frozen dependencies.
- [ ] Add focused regressions and implement inspector-only presentation.
- [ ] Run relevant local gates, native review and actual owned virtual proof.
- [ ] Push a ready PR and hand back to ROOT for merge/adoption.

## Surprises & Discoveries

The inspector currently shares one 220px scrolling region for title, actions, context and an initially expanded keyboard outline. Existing keyboard and packaged tests depend on the outline and context links remaining reachable; do not silently remove or relabel them.

## Decision Log

The header will retain the exact existing action labels and callbacks. Supporting guidance and the outline get an independent scroll region. A visible Why this context control reveals and focuses its disclosure without navigating a file. Existing context and outline remain initially expanded for compatibility. Large action sets have their own bounded scrolling list, rather than allowing repository content to cover the whole inspector. This is a presentation change, not new authority.

## Outcomes & Retrospective

Pending implementation and proof. No managed provider or shared app changes are authorized.

## Context and Orientation

`app/renderer/plans/PlanHierarchy.tsx` loads the repo-authored `.swarm/plans.json` through the existing validated bridge. Its `ProjectionCanvas` is an independent graph instance; preserve its placement, props and identity. `plans.css` styles both plan and task projections, so new rules must be scoped to the selected-plan inspector. Tests belong in `tests/demo-plan-actions.test.tsx`; optional packaged proof scripts belong only in `tools/demo-plan-actions/`.

## Plan of Work

First add mounted tests for exact activation callbacks, retained disabled actions, unchanged graph identity and explicit context disclosure. Then wrap the selected title/actions in a header and place existing context/outline beneath it in a separate scroll body. Use native buttons, details and summary for keyboard access. Finally exercise a real authored index through the actual packaged core on an owned virtual X11 desktop, measuring the action/header bounds before and after supporting-material scroll and taking a screenshot.

## Concrete Steps

Run all commands from `/home/tedks/Projects/swarm-ide/demo-plan-actions` with the Nix environment. Materialize with `nix develop --command pnpm install --frozen-lockfile`. Run focused tests through `nix develop --command bazel test --jobs=3 //tools/demo-plan-actions:regressions`, then `//:quality` and `bazel build --jobs=3 //:desktop-bundle`. Run the dedicated packaged proof with explicit `--test_env=SWARM_VIRTUAL_DISPLAY=:132` and `--test_env=SWARM_VIRTUAL_DESKTOP_PORT=55212`; it must use the existing owned virtual harness, not physical DISPLAY 0.

## Validation and Acceptance

Selecting a plan does not open a source, task or context file. Each exact labelled action invokes only its existing callback. A core-generation change disables retained links. Scrolling supporting context/outline leaves the selected title and primary controls visible. Why this context reveals/focuses guidance but makes no bridge request. Graph instance and camera remain unchanged. The owned packaged test opens actual authored document/source/task links, retains dirty source and draft, records renderer errors honestly and cleans only its own resources.

## Idempotence and Recovery

The worktree is isolated and ROOT owns normal merging. Do not consume moving peer branches or update the shared visualization. Test fixtures, profiles and X11 resources must be private and removed by their existing supervisor. Keep logs/screenshots under the assigned step directory. File remaining issues through Ditz, never edit its metadata directly.

## Artifacts and Notes

Operational handoff: `/tmp/swarm-ide-demo-polish.HjpljW/plan-actions/verification.md`. New issue: `demo-polish-plan-actions-20260907`, left open until ROOT merges. Tests are deterministic UI fixtures unless explicitly described as real packaged filesystem observations.

## Interfaces and Dependencies

No new dependencies, schemas, provider methods or graph semantics. Continue using existing `onOpenFile(path)` and `onOpenTask(snapshot, id)` callbacks and the validated `PlanReadResult`. Native React refs may target the context disclosure; never query or mutate graph state.

Revision note: initial bounded plan records input-size, stale-authority, compatibility and layout assumptions before implementation.
