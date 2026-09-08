# Operate independent trusted-local conversations

This ExecPlan follows `.planning/PLANS.md`. It is a living account of implementation and evidence, not authority to activate a provider or merge another department.

## Purpose / Big Picture

The operator can select independent real Codex conversations, retain an unsent message for each, inspect output and activity, and direct approval, follow-up, or Stop to exactly that conversation. A second conversation can be prepared from the existing fixed-source agent draft without closing the first. Selecting or refreshing runs does not replace the source editor, task draft, or graph cameras.

## Progress

- [x] Read the designated worktree instructions, ROOT wave contract, current single-conversation pane and protocol.
- [x] Implement independently testable fleet selection, composer and response freshness state; eight mounted delayed-response cases passed with the legacy pane/reducer cases.
- [x] Normally compose exactly ROOT-cleared F1 contract a6e7c8c and T5 consumer ca1fd9a; mount explicit TaskContext-to-cockpit selection with approved AgentDock visibility effect.
- [x] Initial packaged one-run protocol peer proof passed3.5s; initial controlled fleet IPC proof passed1.979s, both owned:152/55232 cleanup1 and no model turn.
- [x] Finish review-discovered missing-selection recovery red/green: focused18 tests GREEN; stronger existing-draft virtual proof passed2.127s; native correction/App/proof convergence CLEAN.
- [x] Final code e1c600a: local quality1820 tests/139files plus typecheck/node/renderer builds PASS46.1s; focused18 PASS (cached in final aggregate, fresh earlier).
- [x] Push ready PR73, synchronize Ditz and record initial bounded handoff; ROOT subsequently authorized the final runtime join.
- [x] ROOT continuation cleared exact final F1 producer 07f64ef; normally composed as d584182 over reviewed E3/T5/A2 base b1cb03e, no conflicts.
- [x] (2026-09-08 01:29Z) Actual packaged cockpit/service join passed 4.864s using two deterministic provider processes and three protocol turns, no model. Source, logical cursor, agent draft and graph identity/cameras retained; both stopped and histories persisted; zero renderer exceptions and owned cleanup confirmed.
- [x] Normally compose ROOT-cleared landed base 4a7b25a as f9fc558, preserving W6 task/dock callbacks, E3 Activity and S3 always-mounted external steering. Fresh focused fleet/external/observer targets and package build passed; native composition review CLEAN. No repeated GUI/model proof.
- [ ] ROOT normal landing/adoption remains separate from completed child implementation and evidence.

## Surprises & Discoveries

The original pane has one snapshot, one composer, and one global response sequence. Changing selected runs requires separating the latest run-list observation from each conversation's own response freshness. Current protocol rejects extra request fields, so renderer requests cannot use the new token/expectedTurnId fields until the reviewed producer contract is available.

Native review found a missing-selection recovery edge: after restart a retained A token absent in the new core caused every subsequent read to target A, so an uncertain B launch could not be discovered. The exact mounted regression failed alone (17 passed) before correction. Manual observation and uncertain launch now request an untargeted catalog; targeted read errors also schedule catalog recovery. Old tests that assumed every manual observation targets A require only their controlled transport choreography to reflect that deliberate behavior.

The first actual-service join attempt stopped after A output because the test driver serialized a browser callback without passing its host `count` variable. Its recorded ReferenceError is a test-driver failure, not a product failure. Passing the explicit argument corrected that exact mechanism; one corrected-harness execution passed. Both original failure and corrected run evidence remain retained. Native review found no Critical/Important service/cockpit or proof-tooling issue. A static producer limitation—failed sessions can retain live capacity even after confirmed cleanup—is separately tracked in `trusted-failed-capacity-20260907`, not silently changed in this renderer lane.

## Decision Log

Use per-run state keyed by the core-issued run token, with separate list and snapshot watermarks. Run selection is UI state, never inferred from a late command response. Draft text is local presentation state and is cleared only for the exact acknowledged text of the exact run. No pending command is retried automatically.

Keep the existing trusted-local profile and preparation confirmation. Do not create another fixture-only cockpit or weaken runtime validation. F1 owns protocol/core and W6 consumes a reviewed pushed increment only after ROOT clearance. T5 can use a minimal explicit select-run prop and snapshot callback without a new global event bus.

## Outcomes & Retrospective

The bounded renderer implementation and verification are complete, ready in PR73. This lane does not prove a live model turn; controlled provider/UI evidence is labelled, and F1 owns the bounded real multi-conversation proof.

The visible list/select/output/approval/Stop implementation and minimal task-linked opening are present. The initial owned fleet proof used synthetic trusted IPC through the actual packaged renderer/preload and real core file operations. The authorized continuation then normally composed the reviewed F1 runtime and added separate `joined-*` proof tooling, with actual service/store/transport and deterministic provider processes rather than IPC substitution. Its disposable repository has no build/task metadata, so populated service/build behavior and task-attached live delivery are not claimed.

Final strengthened proof run.fk599z preserved full source and logical cursor, existing agent-draft DOM/value, per-run messages and graph DOM/cameras with zero renderer exceptions and confirmed cleanup. Long-session cache/orphaned-draft handling is a proportional follow-up in `fleet-renderer-retention-bounds-20260907`; no unlimited or refresh-persistent composer claim is made. Hosted checks were not used, and foreign review seats were intentionally unfilled under the Codex-only directive.

Runtime join d584182 passed fresh focused 18 tests/typechecks and packaged desktop build. Corrected actual-service proof run.Hxkxsu passed 4.864s (5.833s owned harness), retaining two closed histories and showing no provider replay during same-core archive observation. It does not test restart/crash recovery. Earlier full quality 1820/139 remains attributed to e1c600a; no repeated full legacy suite or product model turn was requested or performed.

Final reviewed-base composition f9fc558 passed focused fleet 18, external/steering 78 and observer 71 tests (the latter targets overlap; each intentionally skips the manual real self-send test), with typechecks and package build. These are post-composition local checks, not a repeat or reattribution of the earlier GUI evidence. Native composition review was CLEAN; ROOT owns normal PR73 landing and visualization adoption.

## Context and Orientation

`app/renderer/agents/TrustedLocalPane.tsx` currently mounts inside the existing AgentDock in `app/renderer/App.tsx`. It uses the typed preload bridge, validates replies with `parseCoreResponseForRequest`, prepares source/task context in core, and sends explicit trusted-local commands. `protocol/trusted-local.ts` is F1's shared declaration. `tests/trusted-local-pane.test.tsx` is the existing mounted UI suite. Add fleet helpers/tests alongside these without moving or re-keying the editor, AgentDock, or graph instances.

## Plan of Work

First add a small presentation state module which can accept validated snapshots and optional frozen run summaries, retain per-run composers, and reject stale observations. Then replace the single-run presentation with an accessible list plus selected conversation, explicit New conversation preparation, live transcript/activity, and exact-run controls. Keep old snapshots without optional fleet fields usable. Poll read-only selected snapshots with one in-flight read; stop on disposal or disconnection and fence results by core generation. Commands capture run token, observed turn and generation before awaiting. Preparation remains bound to the current fixed draft input and one-use launch confirmation.

After ROOT clears F1, use its actual runtime schemas rather than local casts. Add mounted delayed-response, targeted command, archive and retention regressions. Extend an owned controlled virtual proof in a new `tools/fleet-cockpit` package, using the unchanged packaged core plus a deterministic provider where appropriate. No model request is permitted in W6.

## Concrete Steps

Run commands in `/home/tedks/Projects/swarm-ide/fleet-cockpit`. Materialize dependencies using `nix develop --command pnpm install --frozen-lockfile`. Add a focused Bazel target under `tools/fleet-cockpit` and run `nix develop --command bazel test //tools/fleet-cockpit:unit --jobs=3 --test_output=errors`. Build the actual package with `nix develop --command bazel build //:desktop-bundle --jobs=3`. Run the owned virtual target with `SWARM_VIRTUAL_DISPLAY=:152 SWARM_VIRTUAL_DESKTOP_PORT=55232`; use a different validated free pair if necessary, never the user's forwarded display.

## Validation and Acceptance

Tests must show that selecting B while A's send/approval/Stop is pending retains B's transcript and composer; A's acknowledged send cannot clear B or later text in A. Refreshes cannot replace newer same-run observations. A stale generation cannot deliver queued work or populate the new core. Archived runs cannot send, approve, stop or claim resumability. Preparing another run requires the existing explicit review and confirmation and does not dispatch on mount. Existing single-run tests remain valid. Owned virtual evidence must retain source bytes, logical cursor, draft and graph identity/cameras, with zero new renderer exceptions and no product model turn.

## Idempotence and Recovery

The renderer only issues read-only observations automatically. Uncertain command results are labelled and reconciled by observation, never repeated. Unsent messages remain local to each run while mounted. A core change clears command/preparation authority while retaining text only as non-executable local drafts. ROOT owns merge/adoption; preserve all worktrees and evidence.

## Artifacts and Notes

Operational milestone and ownership requests live in `/tmp/swarm-ide-real-swarms.Djy75P/fleet-cockpit/seam.md`. The deterministic issue ID is `fleet-cockpit-w6-20260907`.

## Interfaces and Dependencies

Use React and existing protocol types only, with no new dependencies. F1 optional fields are `runs`, `taskReference`, `activities`, and `archived`; `trusted.snapshot` accepts optional token and `trusted.send` optional expectedTurnId. New UI always supplies its observed turn expectation. A possible T5 seam is explicit `{id, runToken}` selection intent plus an `onSnapshot` callback delivering only validated core state. Agree the exact seam before App integration.

Initial plan records scope, assumptions and evidence requirements before code changes.

Updated after contract/consumer clearance, mounted/owned evidence and native-review recovery finding to preserve precise implementation-versus-proof attribution.

Updated after final local quality, actual strengthened virtual evidence and native convergence; remaining work is ROOT integration rather than an unfinished local proof.

ROOT authorized the concrete final runtime dependency continuation. Added one focused packaged actual-service scenario rather than repeating producer model proof or the full legacy suite.

Updated after the actual joined proof and ROOT-cleared final base composition, preserving the historical scope of each verification and the remaining ROOT-owned landing step.
