# Run exact Bazel targets from the command palette

This living ExecPlan follows `.planning/PLANS.md`. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while implementing it.

## Purpose / Big Picture

After this change, an operator can press Ctrl+K (or Cmd+K), choose **Bazel build…** or **Bazel test…**, filter the Bazel rules already observed for the open worktree, and deliberately run one exact target. The ordinary command and filename workflow remains available. Build output, progress, and cancellation continue to appear only in **Builds & resources**.

## Assumptions and boundaries

The renderer receives a bounded build-graph observation whose repository and world identify the open worktree. It may offer only local exact rule labels accepted by `SelectedBuildTargetSchema`; source-file graph nodes, target patterns, flags, and arbitrary shell commands are never candidates. A rule is a test only when its observed rule class is `test_suite` or ends in `_test`, matching the existing component-target behavior. Starting a target uses the unchanged `useTargetBuilds().start(label, operation)` path. Known targets from a partial but current catalogue may run; labels retained under loading, refreshing, stale, error, mismatched, or unavailable authority remain disabled and visibly qualified.

The palette owns only keyboard and presentation intent. Typing, selecting with arrows, entering target mode, refreshing, IME confirmation, repeated keys, or activating a disabled/stale row cannot start a build. Activation revalidates the exact row against the latest repository, world, workspace visit, core generation, observation identity, readiness, and busy state. Workspace/core changes retire target-mode authority. Escape closes the palette and restores prior focus. Another modal keeps its keyboard ownership. Existing source buffers, agent/chat drafts, graph cameras, Context selection, and file commands are not rewritten by palette actions. When protected source buffers exist, target mode says that Bazel uses files on disk and excludes unsaved editor changes.

## Progress

- [x] (2026-09-13 20:00Z) Read the assignment, shared contract, repository instructions, planning format, named renderer seams, related contracts, tests, and living design.
- [ ] Implement the shared observed-rule classification and target catalogue/activation authority.
- [ ] Generalize the existing palette for command, exact-path, build-target, and test-target modes without adding an execution/history path.
- [ ] Wire App scope/readiness guards and preserve focus/modal/file-search behavior.
- [ ] Add focused renderer and App proofs plus a Bazel-owned check target.
- [ ] Align cockpit design and additive plan mappings, run focused quality gates, review to clean fixpoint, and finish the pushed ready PR/Ditz handoff.

## Surprises & Discoveries

- Observation: `useTargetBuilds` already fences repository/world changes and automatically retries only observation, never Start; `BuildResources` already owns the output/progress/cancel surface.
  Evidence: `app/renderer/build-resources/use-target-builds.ts` and `app/renderer/build-resources/BuildResources.tsx` require no new execution lane.
- Observation: the declaration chooser already states modal ownership, but App's window-capture Ctrl+K handler currently runs before that dialog's bubbling handler.
  Evidence: the global listener is registered with capture `true`, so the palette shortcut must explicitly respect a foreign modal target.

## Decision Log

- Decision: Preserve `FileSearchPalette` as the single surface and add explicit target-mode inputs rather than mount a second dialog.
  Rationale: This keeps shortcut, focus restoration, arrows, Escape, and exact-path behavior under one owner and makes file-search suppression explicit.
  Date/Author: 2026-09-13 / Codex
- Decision: Extract pure Bazel palette catalogue and activation checks beside renderer build resources, and have `ComponentTargets` reuse the same rule classifier.
  Rationale: One small helper makes the exact-label/test-classification invariant directly testable without growing App's orchestration logic.
  Date/Author: 2026-09-13 / Codex

## Outcomes & Retrospective

Implementation is in progress. Completion will record usable behavior, proof counts, review convergence, PR/head, and any honest remaining environment limitation.

## Context and Orientation

`app/renderer/App.tsx` owns Ctrl+K, palette mode, workspace/core identity, `useBuildGraph`, and `useTargetBuilds`. `app/renderer/repository/FileSearchPalette.tsx` owns the existing dialog, query input, arrows, Enter, Escape, commands, and filename rows. `app/renderer/repository/file-search.ts` performs debounced filename reads and must be disabled outside ordinary command search. `app/renderer/plans/ComponentTargets.tsx` currently classifies observed test rules. `protocol/build-jobs.ts` defines `SelectedBuildTargetSchema` and the unchanged start request. `docs/design/cockpit.md` and the `design:cockpit` record in `.swarm/plans.json` describe renderer composition and actual Bazel inputs.

## Plan of Work

Add a pure renderer helper that derives build/test rows from one matching build-graph observation, creates an authority key from repository/world/workspace/core/observation identity, and rechecks a selected row before activation. Update `ComponentTargets` to call its classifier. Extend `FileSearchPalette` with a discriminated target mode that presents full labels, rule classes, current-worktree/disk cues, catalogue status, refresh, and disabled states while preserving existing command/path props and behavior. Guard Enter for composition, repeats, mode changes, and one-shot target dispatch.

In `App.tsx`, replace the path boolean with explicit command/path/build/test modes; add the two top-level actions; enable filename reads only in command mode; derive scoped target rows from `buildGraph.observation`; and call `targetBuilds.start` only after a current ref-based revalidation. Close/retire target mode across workspace or core-generation changes and prevent Ctrl+K from stealing a foreign modal. Do not change source, drafts, graph, Context, navigation, or job state.

Add pure/component tests for filtering, `test_suite` classification, stale/partial identity, IME/repeat/disabled behaviors, mode-switch Enter, Refresh, and exact one-shot activation. Add an App integration proof for the unchanged build request and retention of dirty source/chat draft where practical. Expose the focused checks through `//tools/bazel-palette:checks`. Update the cockpit living design and only additive `design:cockpit` source/target mappings.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/bazel-command-palette`. Materialize dependencies only if absent with `nix develop --command pnpm install --frozen-lockfile`. Run `nix develop --command bazel test //tools/bazel-palette:checks` and relevant established target checks. Run `nix develop --command bazel build //:desktop-bundle` after focused checks. Commit and push granularly, maintain the draft PR, then invoke council review on the PR and each fix delta until a round is clean. Finish with pull/rebase, Ditz accomplishment/close/sync, push, status verification, and owned-process cleanup. ROOT will merge/adopt; this stream will not touch master or the physical demo.

## Validation and Acceptance

The focused test must prove: build mode lists current exact observed rules and filters literal label fragments; test mode lists only `*_test` and `test_suite` rules, never source nodes or misleading names; current partial catalogues are labelled while known rows remain usable; stale/mismatched/unavailable catalogues cannot dispatch; IME, repeated Enter, target-mode entry, typing, arrows, and refresh do not dispatch; a deliberate non-repeated Enter sends exactly one unchanged `build.start`; a second Enter cannot resend; Escape restores the initiating focus; and existing file search/exact-path commands still work. App integration must show job output in Builds & resources and no loss of protected editor/draft state attributable to the palette.

## Idempotence and Recovery

All reads and tests are repeatable. Target refresh invokes only the existing observation refresh. Failed/ambiguous start replies are not retried. If a workspace/core transition races activation, the authority comparison rejects it and the operator must reopen the palette. Git changes remain isolated on the designated feature branch and the draft PR provides recoverability.

## Artifacts and Notes

The orchestration handoff files are `/tmp/swarm-ide-bazel-palette.MwU6VN/palette/ready`, `seam.md`, and `final-recap/verification.md`. They are not implementation inputs. Any shell-only controlled fixture proof will be labelled as such and will not claim to solve the companion project-environment issue.

## Interfaces and Dependencies

The renderer consumes `BuildGraphObservation`, `BuildTarget`, `SelectedBuildTargetSchema`, `useBuildGraph`, and `useTargetBuilds`; no interface changes. The palette target row includes `label`, `ruleClass`, `operation`, `authority`, and `ready`. Activation accepts exactly that row and succeeds only when a fresh derivation from current refs contains the same ready identity. Existing `build.start`, `build.observe`, and `build.cancel` request/response shapes remain unchanged.

Updated 2026-09-13 before implementation to capture the inspected seams, safety assumptions, bounded work, and concrete proof plan.
