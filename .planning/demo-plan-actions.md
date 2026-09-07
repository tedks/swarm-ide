# Keep selected plan actions in reach

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Selecting a plan should immediately expose its title and deliberate document, source, task and context actions. Today these scroll out of sight with the plan outline. Separate the action header from supporting context and the outline without changing the graph, data loading or activation authority.

## Progress

- [x] (2026-09-07 21:35Z) Verified assigned branch, baseline and bounded ownership; read instructions and materialized frozen dependencies.
- [x] (2026-09-07 21:38Z) Added focused regressions and inspector-only presentation. Original implementation: 3 new RED / 11 PASS; corrected focused suite: 15 PASS including dense reference groups.
- [x] (2026-09-07 21:43Z) Local quality 1,637 tests / 118 files, desktop package build, focused interactions and actual owned virtual proof passed. Native review converged CLEAN after bounded-header correction.
- [x] (2026-09-07 21:46Z) PR58 published for ROOT review/merge. Shared app and other worktrees untouched.

## Surprises & Discoveries

The inspector currently shares one 220px scrolling region for title, actions, context and an initially expanded keyboard outline. Existing keyboard and packaged tests depend on the outline and context links remaining reachable; do not silently remove or relabel them.

Native review caught a legal long-title clipping case in the initial fixed header. The final header bounds title/id independently and separates document/source/task scrolling so one category cannot hide another. The first full quality attempt caught a test response type annotation, corrected before the passing quality run.

The first packaged proof incorrectly required the repository camera to remain unchanged across explicit docs-to-source navigation. The existing directory camera intentionally frames fresh matching navigation intent. The corrected proof checks every camera during supporting-only scroll, the Plan camera during cross-directory navigation, and the actual requested docs/src directory changes separately. The failed run remains recorded as a test-oracle mismatch, not a repaired product bug.

## Decision Log

The header retains the exact existing action labels and callbacks. Supporting guidance and the outline get an independent scroll region. A visible Why this context control reveals and focuses its disclosure without navigating a file. Existing context and outline remain initially expanded for compatibility. Document, source and task categories each have a bounded scrolling list. Long labels show two lines, with the full value retained in the native tooltip and accessible text. Title/id remain keyboard-scrollable. This is a presentation change, not new authority.

## Outcomes & Retrospective

The selected title and Read doc, Open source, Inspect task and Why this context controls remain visible at identical measured coordinates while supporting content scrolls through 917 CSS pixels. Native file/task activation works through the actual packaged bridge and a disposable real Git/Ditz repository. Dirty source, logical cursor, attached draft and Plan camera/component identity remain intact; source disk stays unchanged. No model turn occurred. Native review is CLEAN; foreign seats were intentionally omitted under the Codex-only directive. PR58 is ready, not merged; ROOT owns final merge, Ditz closure and shared preview adoption.

The screenshot uses explicitly authored disposable layout-test input, not inferred architecture or a live Swarm task history. Maximum 16/16/32 category sizes have mounted component coverage, not a separate maximum-density real-window claim. Existing exact resize warnings remain an accepted policy, but this run produced zero renderer errors of any kind. Hosted CI was ignored, not called green.

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

Final evidence lives at `/tmp/swarm-ide-demo-polish.HjpljW/plan-actions/packaged-final/run.ji0Wnc/`: `01-selected-plan-actions.png`, `02-plan-actions-retained-work.png`, `actions-proof.json` and `supervisor.log`. Native journey took 1.693 seconds, packaged target 4.7 seconds, cleanup_complete=1. Requested content size was 1440×876; measured renderer viewport was 1441×879 at devicePixelRatio 1.046875. Record measurements rather than claiming the requested dimensions were exact.

`final-local.log` records the 49.97-second passing quality/focused/packaged run on the final production code. A subsequent proof-only change added nonempty-camera guards and accurate dimensions; only its relevant packaged test was rerun, passing in 5.88 seconds including Bazel overhead. No unrelated full-suite rerun or branch-movement ceremony was required.

## Interfaces and Dependencies

No new dependencies, schemas, provider methods or graph semantics. Continue using existing `onOpenFile(path)` and `onOpenTask(snapshot, id)` callbacks and the validated `PlanReadResult`. Native React refs may target the context disclosure; never query or mutate graph state.

Revision note: initial bounded plan records input-size, stale-authority, compatibility and layout assumptions before implementation.

Completion revision: recorded actual test-oracle correction, proportional gate attribution, native convergence and real versus deterministic evidence boundaries.
