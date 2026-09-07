# Put task titles before secondary sidebar chrome

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The Tasks third of the sidebar should show several real task titles at the ordinary 1440×876 window size without scrolling past provenance. Search, Open/All, refresh and task activation remain reachable by keyboard. Stale, disconnected, malformed and failed observations must stay visible rather than being folded into reassuring metadata.

## Progress

- [x] (2026-09-07 21:32Z) Verified assigned clean feature worktree at b1db2b9; read current instructions and claimed Ditz issue demo-polish-task-density-20260907.
- [x] (2026-09-07 21:34Z) Corrected test-helper typo; pre-implementation density run showed 1 RED / 44 PASS. Added mounted regressions.
- [x] (2026-09-07 21:35Z) Compacted only TaskPanel and task-panel-scoped CSS, retaining callback semantics; 45 focused tests passed.
- [x] (2026-09-07 21:45Z) Actual owned packaged proof passed: three complete initial titles, search/filter/provenance and 1080×720 keyboard document opening; no renderer errors; cleanup complete. Native convergence CLEAN.
- [x] (2026-09-07 21:47Z) Final production-tree local quality passed 1643 tests in 118 files; focused task suite 47 passed. Package rebuilt by the successful smoke target.
- [x] (2026-09-07 21:48Z) Implementation pushed as PR60; handoff is ready for ROOT's normal merge. Ditz remains in progress until actual landing, not falsely closed by this child.

## Context and Orientation

`app/renderer/tasks/TaskPanel.tsx` owns local search/filter/title-expansion state and renders supplied task observations. It does not fetch metadata or authorize task execution. `app/renderer/tasks/tasks.css` also styles task documents, so all new rules must use `.task-panel`. `WorkbenchSidebar` divides the left rail into three independently scrollable sections; it already hides the redundant Tasks heading but not refresh or observation chrome. Neither the sidebar nor task/client/core logic is owned by this change.

## Assumptions and Failure Modes

The panel may have no snapshot, a retained snapshot after failure, closed tasks hidden by the Open filter, long titles, narrow width, or a disconnected core. Filtering must not change selection or open a document. Enter and double-click keep their existing deliberate document-opening callbacks. Native details/summary provides a keyboard-operable disclosure without new state or custom key handling. A screenshot with fabricated renderer rows would not prove real task integration, so the desktop proof uses disposable metadata authored by the real Ditz CLI and loaded through the unchanged packaged core.

## Plan of Work

First add `tests/demo-task-density.test.tsx` to check disclosure placement, persistent warnings and unchanged activation/filtering. Then combine search and Open/All into a wrapping toolbar, make normal status/count compact, and move secondary snapshot provenance and the explanation of Open below the list into a native disclosure. Preserve every existing warning and callback. Finally add a small owned packaged proof under `tools/demo-task-density` using the existing virtual-desktop supervisor and real CLI fixture factory. Measure rows visible without scrolling at 1440×876, exercise search, filter, disclosure and keyboard task opening at a smaller window, and fail on renderer exceptions.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/demo-task-density`, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use `nix develop --command bazel test --jobs=3 //tools/demo-task-density:regressions`, then `nix develop --command bazel test --jobs=3 //tools:quality` and `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Run the new packaged proof with explicit owned display/port forwarding: `SWARM_VIRTUAL_DISPLAY=:131 SWARM_VIRTUAL_DESKTOP_PORT=55211 nix develop --command bazel run --jobs=3 --action_env=SWARM_VIRTUAL_DISPLAY --action_env=SWARM_VIRTUAL_DESKTOP_PORT //tools/demo-task-density:smoke`. The environment prefix supplies the executed binary, while action_env also forwards values to Bazel actions. Artifacts default to this worktree's `artifacts/demo-task-density`; set absolute `SWARM_ARTIFACT_DIR` to choose another owned output location.

## Validation and Acceptance

Mounted tests must prove disclosure is after rows, warning text remains outside closed details, filter selection is retained, and Enter/double-click retain their callbacks. Existing task-surface tests must still pass. The packaged proof must show at least three entire task rows within the initially unscrolled Tasks content at 1440×876, real CLI titles and normal usable controls. A smaller-window keyboard journey must still search and open a task document. Screenshot and numeric measurements supplement rather than replace these assertions.

## Idempotence and Recovery

The proof owns its temporary Git repository, private Electron profile, X11 display and port. The existing supervisor verifies ownership and cleans those resources on failure or success. Do not target the physical desktop or ROOT preview. Never retry unchanged failures merely to obtain a pass; diagnose one bounded cause first. Keep operational evidence and branch history at handoff.

## Interfaces and Dependencies

No dependency, protocol, provider or public component signature changes. Use React, existing TaskPanelProps, native HTML details/summary, existing task fixtures for mounted tests, and existing `tools/demo-plans/fixture.mjs` for real CLI-authored packaged input.

## Surprises & Discoveries

The shared sidebar already hides the duplicate Tasks title. Most lost vertical space comes from individually stacked observation, provenance, search label, filters, explanation and count, not from row height.

The existing task-integration packaged driver uses `.task-search input`. A compatibility test reproduced that missing wrapper (1 RED / 45 PASS) before retaining the same label wrapper in the compact toolbar. This was a presentation-induced proof compatibility issue, not a task/client semantic failure. Initial full quality and package build passed before this narrowly reviewed correction; final relevant gates run on the correction.

Actual packaged measurements showed the default Tasks content is about 166 logical pixels high. First layout exposed one complete row, then sharing healthy status/Refresh and moving count into provenance exposed two; the third row missed the clip edge by 0.21px. Removing redundant inherited healthy-row margins addresses the observed layout constraint without relaxing the requirement of three completely visible rows. Caution states remain unconstrained and expanded. Requested 1440×876 content measured 1441×879 at devicePixelRatio 1.046875 and interface zoom 1; acceptance records real dimensions and allows a bounded five-pixel native sizing tolerance, not a visibility tolerance.

## Decision Log

Keep all failure information outside the provenance disclosure. Move only secondary provenance and the Open definition; the Open button retains that definition as a tooltip. Scope CSS to this panel so task documents and Context details are unchanged. ROOT, not this child, owns normal merge and preview adoption.

## Outcomes & Retrospective

At production commit 3bf4576 the Tasks sidebar shows three complete task titles in the unscrolled default split at a requested 1440×876 window (actual renderer1441×879). Search, Open/All, native provenance disclosure and keyboard document opening also passed through the actual packaged main/preload/core on owned display :131, port55211. The five tasks are disposable CLI-authored records, not captured data or live agent activity. This is a presentation-only increment; task execution remains unavailable under existing policy gates. Native code and fix-delta review are CLEAN; foreign seats intentionally omitted per the current Codex-only directive.

The first actual screen measurement was essential: DOM tests alone missed the inherited status margins and narrow three-way split. No application-wide redesign or provider changes were needed. Final quality1643/118 and focused47 passed. PR60 is pushed for ROOT's normal merge; no master, shared integration or preview adoption was performed. Hosted CI was intentionally ignored and no model turn was made.

Plan created after inspecting actual panel/sidebar composition; validation results will be appended as they occur.

Revision note: actual geometry and packaged-selector evidence refined the narrow presentation changes; strict row visibility and unrelated-error assertions were preserved.
