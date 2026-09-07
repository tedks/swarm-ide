# Put task titles before secondary sidebar chrome

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

The Tasks third of the sidebar should show several real task titles at the ordinary 1440×876 window size without scrolling past provenance. Search, Open/All, refresh and task activation remain reachable by keyboard. Stale, disconnected, malformed and failed observations must stay visible rather than being folded into reassuring metadata.

## Progress

- [x] (2026-09-07 21:32Z) Verified assigned clean feature worktree at b1db2b9; read current instructions and claimed Ditz issue demo-polish-task-density-20260907.
- [ ] Add focused mounted regressions and observe the density structure failure before implementation.
- [ ] Compact only TaskPanel and task-panel-scoped CSS, retaining callback semantics.
- [ ] Run relevant local quality/build, native review and an actual owned virtual packaged proof.
- [ ] Push ready PR and hand off to ROOT for merge; leave issue open until landing.

## Context and Orientation

`app/renderer/tasks/TaskPanel.tsx` owns local search/filter/title-expansion state and renders supplied task observations. It does not fetch metadata or authorize task execution. `app/renderer/tasks/tasks.css` also styles task documents, so all new rules must use `.task-panel`. `WorkbenchSidebar` divides the left rail into three independently scrollable sections; it already hides the redundant Tasks heading but not refresh or observation chrome. Neither the sidebar nor task/client/core logic is owned by this change.

## Assumptions and Failure Modes

The panel may have no snapshot, a retained snapshot after failure, closed tasks hidden by the Open filter, long titles, narrow width, or a disconnected core. Filtering must not change selection or open a document. Enter and double-click keep their existing deliberate document-opening callbacks. Native details/summary provides a keyboard-operable disclosure without new state or custom key handling. A screenshot with fabricated renderer rows would not prove real task integration, so the desktop proof uses disposable metadata authored by the real Ditz CLI and loaded through the unchanged packaged core.

## Plan of Work

First add `tests/demo-task-density.test.tsx` to check disclosure placement, persistent warnings and unchanged activation/filtering. Then combine search and Open/All into a wrapping toolbar, make normal status/count compact, and move secondary snapshot provenance and the explanation of Open below the list into a native disclosure. Preserve every existing warning and callback. Finally add a small owned packaged proof under `tools/demo-task-density` using the existing virtual-desktop supervisor and real CLI fixture factory. Measure rows visible without scrolling at 1440×876, exercise search, filter, disclosure and keyboard task opening at a smaller window, and fail on renderer exceptions.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/demo-task-density`, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use `nix develop --command bazel test --jobs=3 //tools/demo-task-density:regressions`, then `nix develop --command bazel test --jobs=3 //tools:quality` and `nix develop --command bazel build --jobs=3 //:desktop-bundle`. Run the new packaged proof with explicit owned display/port forwarding, for example `nix develop --command bazel run --jobs=3 --action_env=SWARM_VIRTUAL_DISPLAY=:131 --action_env=SWARM_VIRTUAL_DESKTOP_PORT=55211 //tools/demo-task-density:smoke`. Record exact executed commands in operational verification.

## Validation and Acceptance

Mounted tests must prove disclosure is after rows, warning text remains outside closed details, filter selection is retained, and Enter/double-click retain their callbacks. Existing task-surface tests must still pass. The packaged proof must show at least three entire task rows within the initially unscrolled Tasks content at 1440×876, real CLI titles and normal usable controls. A smaller-window keyboard journey must still search and open a task document. Screenshot and numeric measurements supplement rather than replace these assertions.

## Idempotence and Recovery

The proof owns its temporary Git repository, private Electron profile, X11 display and port. The existing supervisor verifies ownership and cleans those resources on failure or success. Do not target the physical desktop or ROOT preview. Never retry unchanged failures merely to obtain a pass; diagnose one bounded cause first. Keep operational evidence and branch history at handoff.

## Interfaces and Dependencies

No dependency, protocol, provider or public component signature changes. Use React, existing TaskPanelProps, native HTML details/summary, existing task fixtures for mounted tests, and existing `tools/demo-plans/fixture.mjs` for real CLI-authored packaged input.

## Surprises & Discoveries

The shared sidebar already hides the duplicate Tasks title. Most lost vertical space comes from individually stacked observation, provenance, search label, filters, explanation and count, not from row height.

## Decision Log

Keep all failure information outside the provenance disclosure. Move only secondary provenance and the Open definition; the Open button retains that definition as a tooltip. Scope CSS to this panel so task documents and Context details are unchanged. ROOT, not this child, owns normal merge and preview adoption.

## Outcomes & Retrospective

Implementation and proof pending. This is a presentation-only increment, not new task execution or live agent capability.

Plan created after inspecting actual panel/sidebar composition; validation results will be appended as they occur.
