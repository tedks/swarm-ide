# Comfortable chat input and a stable editor caret

This ExecPlan follows `.planning/PLANS.md` and is updated as work proceeds.

## Purpose / Big Picture

Pressing Enter in a live agent conversation should send the current draft through the same guarded path as the Send button. Shift-Enter should insert a newline, and confirming text through an input method must not send it. The editor caret should remain legible without changing source text, selection, undo state or graph navigation during background observations.

## Progress

- [x] (2026-09-08) Read the wave instructions, confirmed the clean designated branch, and started both Ditz issues.
- [x] (2026-09-08 13:37Z) Four new keyboard behavior tests failed on the original implementation; the invalid/modified-key case already passed.
- [x] (2026-09-08 13:39Z) Shared keyboard handler mounted in both registered-session and native Codex chat; 61 focused tests and both TypeScript boundaries passed.
- [x] (2026-09-08 13:41Z) Native review found an interrupted-composition lifecycle case; exact regression failed first, then the corrected 62-test check passed.
- [x] (2026-09-08 13:42Z) Packaged native keyboard/caret journey passed in 3.868 seconds with zero renderer exceptions and owned cleanup. No separate cursor defect reproduced.
- [x] (2026-09-08 13:43Z) Native fix-delta review CLEAN; PR109 implementation pushed. Final outcome documentation and ROOT handoff prepared.

## Surprises & Discoveries

`SessionSteering` currently has no textarea keyboard handler. Its form is the only sender and synchronously locks the shared `SteeringMemory` while a request is pending. Native Codex uses a separate `TrustedLocalPane` textarea and an existing guarded fleet control path. The plan index is already malformed on the starting revision; another department owns that repair, not this increment.

The initial test fixture omitted a required receipt ID and failed TypeScript before behavioral execution; that test-only error was corrected before recording the four-test behavior baseline. The first packaged attempt reached the caret assertions but watched the three-second registry timer for only 1.8 seconds; it failed its own observation assertion with zero renderer errors and complete cleanup. The corrected driver samples the actual successful detail-read counter until a read has completed and a full blink interval has elapsed, within five seconds. Neither failure is a production cursor cause.

The existing persistent composition ref could outlive a textarea removed by observation. A focus reset clears that stale state; a new mounted regression reproduced the bug before correction. CodeMirror suppresses the native caret and draws its own normal 1.2-second animation. Actual packaged samples retained editor identity, the exact editor state and focus during background conversation reads.

## Decision Log

The keyboard behavior will invoke the enclosing form, not call a new sender. Plain Enter is consumed even when the form cannot send; Shift-Enter and other modified keys remain ordinary editing gestures. Repeated Enter events cannot send. IME composition is tracked, with the browser composition flag and key code 229 retained as compatibility checks. These decisions prevent an input convenience from bypassing delivery authority.

Native review is the only review seat for this wave, per the user's explicit local/Codex-only directive. The interrupted-composition correction was reviewed as a delta and returned CLEAN. No speculative caret setting was changed: the user's remaining cursor report stays open with a concrete negative boundary. Outbox owns the later narrow sender adapter and receipt presentation in its own branch; it must retain this keyboard hook when composing.

## Outcomes & Retrospective

Enter/Shift-Enter now work in both actual chat components without introducing a sender. Registered-session native keyboard input was exercised in the production desktop bundle using an intercepted uncertain result before core; no message or model turn occurred. The native Codex component used its real mounted fleet control path with controlled bridge responses in focused tests, not a new model run. Cursor observation was stable; a separate reported defect remains unreproduced. The design/graph and layout repairs belong to independent departments.

## Context and Orientation

`app/renderer/external-agents/SessionSteering.tsx` renders a registered agent's message form. Its `send` function checks the selected session, bridge, draft validity and global pending lock. Drafts and uncertain receipts remain associated with the original session in `steering-memory.ts`, which belongs to the outbox department. `app/renderer/agents/TrustedLocalPane.tsx` has the native Codex message form and calls `useTrustedFleet` to steer or start the next turn. `app/renderer/EditorPane.tsx` owns one CodeMirror editor per source tab. Its effects synchronize content and language without replacing the editor on ordinary rerenders.

## Plan of Work

Add a small shared renderer keyboard hook and mount it in both message textareas without changing their sender functions. New mounted tests cover Enter, Shift-Enter, composition, repeats, invalid input, pending requests, target changes and uncertain receipts. Coordinate the exact native textarea hunk with the cockpit owner and avoid App, AgentDock and global styles. Investigate the actual editor caret styles and retain a narrow regression only for a demonstrated cause. Update `docs/design/agents.md` and `docs/design/repository.md` as appropriate; the existing component-to-build mappings remain valid unless files move.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/usability-chat-input`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run the focused existing Bazel editor entry point with explicit test files, for example `nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests --test_arg=tests/chat-input.test.tsx --test_arg=tests/session-steering-ui.test.tsx --test_output=errors`. This entry point also checks both TypeScript boundaries. Use an owned virtual X11 instance and port 55411 for a packaged keyboard/caret check; never target physical :0 or send a test instruction to a real user's session.

## Validation and Acceptance

An actual Enter gesture submits exactly once; Shift-Enter inserts a newline in the packaged textarea. Composition and repeated key events submit nothing. Failed or uncertain requests retain the original target's draft and do not resend after rerender. The editor remains the same DOM instance with its logical selection and text intact during observation-like rerenders. Any virtual proof uses a deliberately controlled local queue fixture, not a model turn, and retains that attribution.

## Idempotence and Recovery

Tests use isolated state and disposable owned desktop resources. Preserve existing branches and worktrees. Do not send or consume pending real messages. ROOT performs the normal PR merge and app adoption; this department leaves a clean pushed feature branch and a self-contained handoff.

## Artifacts and Notes

Step evidence lives in `/tmp/swarm-ide-usability.BirZCk/chat-input/`. `seam.md` identifies the exact committed API peers can consume. `verification.md` will record commands, observed behavior and remaining limits. The last response uses the assigned completion marker.

`keyboard-baseline.log` records four failures and one pass on the old behavior; `composition-red.log` records one new failure and five passes before focus reset. `final-focused.log` records both type checks and 62 tests. `packaged-corrected/run.e9gQJ3/proof.json` and `caret-observation.json` record the actual native Enter/Shift-Enter and editor samples; `retained-drafts.png` shows the final UI. The first failed driver run remains in `packaged/run.aTBllZ`.

## Interfaces and Dependencies

The helper depends only on React keyboard/composition event types and refs. It returns textarea event handlers and uses `HTMLFormElement.requestSubmit()` to reach the existing form. It adds no bridge request, provider, dependency or automatic retry. Editor corrections, if warranted, use the existing CodeMirror extensions.

Updated after implementation and actual verification to record the two real review findings, their bounded corrections, and the unreproduced cursor boundary. No historical cause or live-delivery claim is inferred from the successful test.
