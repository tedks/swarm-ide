# Comfortable chat input and a stable editor caret

This ExecPlan follows `.planning/PLANS.md` and is updated as work proceeds.

## Purpose / Big Picture

Pressing Enter in a live agent conversation should send the current draft through the same guarded path as the Send button. Shift-Enter should insert a newline, and confirming text through an input method must not send it. The editor caret should remain legible without changing source text, selection, undo state or graph navigation during background observations.

## Progress

- [x] (2026-09-08) Read the wave instructions, confirmed the clean designated branch, and started both Ditz issues.
- [ ] Add focused keyboard regressions and prove the missing behavior.
- [ ] Implement one shared keyboard handler for registered-session and native Codex chat.
- [ ] Diagnose a concrete caret cause, fix only a reproduced cause, and check retained editor state.
- [ ] Run focused Bazel checks and an owned virtual desktop journey, converge native review, push and hand off.

## Surprises & Discoveries

`SessionSteering` currently has no textarea keyboard handler. Its form is the only sender and synchronously locks the shared `SteeringMemory` while a request is pending. Native Codex uses a separate `TrustedLocalPane` textarea and an existing guarded fleet control path. The plan index is already malformed on the starting revision; another department owns that repair, not this increment.

## Decision Log

The keyboard behavior will invoke the enclosing form, not call a new sender. Plain Enter is consumed even when the form cannot send; Shift-Enter and other modified keys remain ordinary editing gestures. Repeated Enter events cannot send. IME composition is tracked, with the browser composition flag and key code 229 retained as compatibility checks. These decisions prevent an input convenience from bypassing delivery authority.

## Outcomes & Retrospective

Work is underway. No cursor cause or model delivery is yet claimed.

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

## Interfaces and Dependencies

The helper depends only on React keyboard/composition event types and refs. It returns textarea event handlers and uses `HTMLFormElement.requestSubmit()` to reach the existing form. It adds no bridge request, provider, dependency or automatic retry. Editor corrections, if warranted, use the existing CodeMirror extensions.

Initial plan recorded before implementation; later evidence will replace hypotheses with observed results.
