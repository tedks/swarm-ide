# Connect the evaluator tour to the real task-context implementation

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An evaluator should be able to follow one feature from its authored plan through design guidance, actual repository tasks and source, a bounded prepared context, and recorded logical outcomes. This is a documentation and authored-association change, with a small packaged GUI walkthrough; it does not add execution authority or change product logic.

## Progress

- [x] (2026-09-07 21:36Z) Verified assigned branch `docs/connected-demo-tour` at merged baseline `b1db2b9`, read instructions, and started Ditz issue `demo-polish-demo-tour-20260907`.
- [x] Read actual Ditz records for D2–D6 and current Plan/Prepare controls.
- [x] (2026-09-07 21:39Z) Authored connected guide, presenter notes, briefing and actual D2–D6 associations; opened draft PR61.
- [x] (2026-09-07 21:54Z) Final owned packaged joined walkthrough passed on `f7bfa27`: actual source/task/Plan/build/Prepare/recorded Activity, retained work, zero renderer errors and model mutations, cleanup confirmed.
- [x] Native review reached CLEAN through the final proof delta; quality 1,632 tests/117 files and 13 dedicated harness checks passed with attribution below.
- [x] (2026-09-07 21:58Z) Pushed final documentation and marked PR61 ready; Ditz remains in progress for ROOT's actual merge. Local checks and native review are complete, and the executive handoff includes owned cleanup/evidence.

## Surprises & Discoveries

The old tour denies three features already merged: plan containment, task graph and external-session observation. The task-context component has no task IDs. Actual D4/D6 task descriptions are empty and the inspected D2–D6 records have no file references: source navigation must use the explicit plan source link, not an invented task Reveal. The task graph caps loaded details at 64; the Tasks rail supplies search and an All filter for closed work.

The first new harness failed before the app because Git refused fetching into an unborn checked-out branch; a separate bootstrap branch corrected it. The next failed only its native click helper's offscreen document-center hit test; clipping to the visible scrollport corrected it. Native review found ambient Git redirection risk: ten new negatives failed before rejection was implemented and then passed. The first broad rejection also rejected ordinary GIT_EDITOR/GIT_PAGER; two new positive controls failed before permitting those preferences and removing all inherited Git settings from invoked commands. The Node test filename initially collided with Vitest discovery (1 empty suite failed, all 1,632 product tests passed); a mechanical rename separated the runners.

One later joined proof correctly passed task preparation/retention but sampled build status while refreshing. The final proof now requires current status, the exact focused source and nonempty rendered targets in one observation. Its final run observed 27 targets, 64/160 task details and 96 unread; partial coverage is not missing work fabricated away.

## Decision Log

Use the task-context feature already implemented in Swarm, not a new sample app. Link actual Ditz IDs without editing historical task records or claiming department labels are session identities. Keep authored guidance separate from effective provider context. Archive/copy only committed source and the real local Ditz branch into a disposable owned checkout for the GUI proof; no private observer registry or user account material is needed. ROOT, not this lane, merges and adopts.

## Outcomes & Retrospective

The connected path is operational and documented. The final packaged GUI scenario took 7.2 seconds (8.2 seconds including virtual startup), with zero renderer exceptions, zero accepted resize warnings, no model mutations and cleanup1. The product's live-policy flag was unavailable independently of the draft confirmation checkbox. The owned checkout uses actual committed Swarm source and local Ditz history, not recreated metadata or a fixture provider. The recorded Journal and human-authored briefing retain their distinct provenance.

Quality on `c1e70fd` passed type checks, 1,632 tests/117 files and Node/renderer builds. Later deltas were confined to the manual proof: 13 launcher checks passed on `9c13f12`, and the final actual packaged tour passed on `f7bfa27`. Native convergence was CLEAN through each relevant delta; foreign seats were intentionally omitted under the Codex-only directive. No unrelated full-suite repeats, hosted CI claims, or managed execution are required for this lane.

## Context and Orientation

`.swarm/plans.json` supplies explicit containment and document/source/task/context links. `docs/demo.md` is the short user tour. New `docs/demo/task-context-briefing.md` explains the design choices, while `docs/demo/presenter-guide.md` supplies a timed script and honest fallback paths. `tools/demo-tour/` reuses `tools/virtual-desktop-run.sh`, the owned X11 driver and packaged application. A task pin identifies a specific metadata revision; it is not permission to execute a model or include every linked document.

## Plan of Work

First author the documents and add the five actual D2–D6 IDs plus the briefing to the task-context component. Then add a manual Bazel smoke target that copies the current committed repository and its actual local metadata into owned temporary storage. Drive ordinary GUI controls through Plan, source, attachment and Prepare, then Activity. Read UI state to verify source/draft/camera retention and report any limits without replacing providers. Finish with one proportional native review and local validation; keep the issue in progress until ROOT merges.

## Concrete Steps

From the assigned worktree, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Inspect tasks with `nix develop --command ditz show repo-task-context-core-d4 --json`. Commit the authored source before the walkthrough because its disposable checkout intentionally uses committed bytes. Run `nix develop --command bazel run --jobs=3 //tools/demo-tour:smoke` with `SWARM_VIRTUAL_DISPLAY=:135`, `SWARM_VIRTUAL_DESKTOP_PORT=55215` and an absolute `SWARM_ARTIFACT_DIR`. Run `nix develop --command bazel test --jobs=3 //:quality` for the changed authored index and proof code. Do not start a model or use the physical desktop.

## Validation and Acceptance

The packaged UI must open the actual task-context component and its design/source/task links, prepare an attached actual Ditz record without a launch, show the recorded Journal summary, and preserve unsaved source, draft intent and unrelated graph cameras. Screenshots and a compact JSON result identify the copied source/metadata revisions, observed controls, accepted exact resize warnings versus other errors, and cleanup. Missing optional registry is an honest unavailable state, not a proof failure. Current UI gaps belong in the presenter guide rather than undocumented automation shortcuts.

## Idempotence and Recovery

Each GUI run owns a fresh private checkout/profile and a supervisor-validated virtual display/port. Repeating it creates new evidence, never overwrites a user's buffers or task records. New failures get one bounded diagnosis, not unchanged retries. Preserve branch, PR and evidence at handoff; stop only owned processes.

## Artifacts and Notes

Operational evidence is under `/tmp/swarm-ide-demo-polish.HjpljW/demo-tour`. No private registry, raw session data or credentials enter tracked output. No routine checksum receipts are required.

Final screenshots and `proof.json` are in `final-current-graph/run.Xr7IMR/`: `01-component-guidance.png`, `05-build-relationships.png`, `06-real-prepared-task.png`, `08-logical-change-main-text.png` and `09-attributed-evidence.png`. The report preserves exact source/metadata observations and the current graph result. Earlier failed or incomplete evidence is retained in sibling run directories and is not retroactively green.

## Interfaces and Dependencies

Existing typed IPC, real Ditz Git/YAML provider and real prepared-context service remain unchanged. The proof uses Electron native inputs plus read-only DOM/IPC observations and the existing X11 supervisor. It must not replace responses, create synthetic tasks, launch agents or add provider configuration.

Initial plan authored September 7: constrain the work to a connected, truthfully labelled evaluator story and actual joined evidence.

Updated September 7 after actual validation: recorded the narrow harness corrections, review, local gate attribution, screenshots and honest remaining product gaps. ROOT still owns final merge and shared-app adoption.
