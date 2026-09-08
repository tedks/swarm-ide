# Keep outgoing agent messages visible

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can submit an instruction, switch agents or reload the renderer, and still find its exact text and queue state in the conversation. A copy action supports deliberate recovery in the terminal. Queue acceptance is not proof that the running agent read the instruction.

## Progress

- [x] (2026-09-08) Read the current sender, shared assignment and UI ownership; started `swarm-message-outbox`.
- [x] (2026-09-08 13:42Z) Implement bounded saved outgoing messages and mounted conversation rows;57 focused tests and both TypeScript boundaries pass.
- [x] (2026-09-08 13:47Z) Agreed narrow SessionSteering hook ownership with chat-input; actual form/save-before-dispatch unit proof and packaged held receipt/full document reload/native clipboard proof pass.
- [x] (2026-09-08 13:50Z) Final native delta CLEAN; PR110 ready and implementation pushed, Ditz outcome recorded; ROOT owns normal merge/adoption.
- [x] (2026-09-08 13:54Z) Direct user clarification: exposed the existing checked attach command beside the conversation.63 focused tests/both types pass; narrow native review CLEAN. No process or messaging call on Copy.
- [x] (2026-09-08 14:00Z) Normally composed landed keyboard PR109, preserving all IME/focus/keyboard attributes and saved-message adapter. Narrow native conflict review CLEAN; joined Enter-to-saved-outbox/reload and peer keyboard checks pass.

## Assumptions and boundaries

The Electron profile provides browser storage for private operator UI state; it is not repository data or an agent transcript. A send must be saved before dispatch. Storage denial, malformed saved data or full capacity must preserve the editor text and stop dispatch rather than silently evict unresolved instructions. Queue receipts currently identify stored queue items, not the separate user-input client IDs. No text match, missing queue row or later assistant activity establishes consumption. This increment must not resend the two existing ROOT messages, start a competing session, or send a model request as a test.

## Context and Orientation

`core/external-agents-send.ts` owns one short-lived Codex queue process and is unchanged. `app/renderer/external-agents/SessionSteering.tsx` owns the form; by direct agreement, chat-input changes only keyboard/helper attributes and this department changes the save/settle calls and compact receipt chrome. `steering-memory.ts` keeps per-target drafts and last receipts plus the saved outbox. `AgentConversation.tsx` interleaves bounded transcript entries and saved outgoing rows by time. Both subscribe to the same memory. App layout remains the cockpit department's responsibility.

## Plan of Work

First add runtime-validated outgoing records, bounded browser storage, and `SteeringMemory.beginSend`/`finishSend`. Saving precedes transport; reloading an in-flight record changes its visible state to uncertain without replay. Then render exact outgoing text with a small state symbol and copy button in `AgentConversation`, including while transcript loading is unavailable. Coordinate the form's two method calls and concise receipt chrome directly with chat-input. Finally prove the behavior with controlled responses and actual storage readback, and document the supported active-owner steering boundary from current official documentation and read-only installation inspection.

## Concrete Steps

Work in `/home/tedks/Projects/swarm-ide/usability-outbox`. Materialize dependencies with `nix develop --command pnpm install --frozen-lockfile`. Run the new focused Bazel target with `nix develop --command bazel test --jobs=3 //tools/message-outbox:checks --test_output=errors`. Use controlled transport only; no real user message is a test input. The native reviewer checks message identity, persistence failures, duplicate prevention, selection/reload retention and exact-copy behavior.

## Validation and Acceptance

A held response immediately shows the exact submitted text. A queued response clears only the unchanged composer draft and leaves the saved row. Selection and reconstruction of the memory from the same storage keep the row. Unknown/rejected delivery keeps recovery text and never retries. Storage failures prevent the request. Capacity is explicit, not eviction. Copying preserves leading/trailing whitespace and Unicode. The receipt is not shown as delivered without a supported correlated consumption event.

## Idempotence and Recovery

No send occurs during construction, reads, subscription, reload or reconciliation. Existing storage is validated before modification. Invalid or inaccessible storage is left intact; a failed pre-dispatch save leaves the editable draft. Owned test files and virtual processes only are cleaned; the user's actual sessions and queue remain untouched.

## Interfaces and Dependencies

Use existing Zod and React dependencies. The new storage contract is separate from agent lifecycle schemas. `beginSend(sessionId, text, label)` returns a local outgoing ID or null and sets pending state only after a saved write. `finishSend(sessionId, localId, receipt)` updates only the identified row and target. Both the form and conversation subscribe to the same `SteeringMemory`; no App API change is necessary.

## Surprises & Discoveries

The current queue receipt and underlying `UserInput.client_id` are different identifiers. Queue acceptance alone cannot produce an honest delivered checkmark. The existing composer cleared accepted text without putting it into any outgoing conversation row.

Native review found recovered Sending rows could reappear after another send, all outgoing rows initially sorted below newer replies, and an absent clipboard API needed an asynchronous error boundary. Each was corrected with focused regressions. The first GUI launcher failed before Electron because archive fallback used the Bazel runfiles working directory; the corrected launcher uses declared source workspace. Its next actual run passed in915ms, zero renderer errors, one controlled send and confirmed owned cleanup. Tests were added alongside implementation; no broader pre-correction RED history is claimed.

## Decision Log

Keep uncertain messages within an explicit100-message/512KiB outbox rather than evicting old pending messages. Keep storage local to the operator profile rather than adding a repository artifact or new daemon. Separate this usable fix from an unsupported active-terminal takeover. Archive/export controls and supported consumption correlation remain follow-up `swarm-outbox-archive`; a full outbox gives explicit notice and refuses dispatch without losing the editable draft.

## Outcomes & Retrospective

The user can now recover exact submitted messages after selection changes, renderer reload and application restart in the same profile/origin. Queue/error/uncertain state is compact and never replays. Unsent drafts remain in memory; messages predating this increment are not retroactively imported from Codex queue. ROOT will perform normal merge and managed preview adoption after the reviewed handoff. The installed default app-server control socket is absent, so direct active-terminal steering remains the checked manual tmux handoff.

Revision note: initial plan records concrete retention behavior and narrow peer ownership before implementation.

Revision note: completion evidence, final form ownership and bounded archive/steering limits added after actual local and packaged verification.

Revision note: the targeted project/tmux clarification adds a copy-only terminal fallback in the existing conversation header. Linux-install owns launch/discovery. This change reuses the core-provided command and performs no process/message operation; it adds no renderer callback or protocol schema.

Revision note: user-authorized keyboard composition uses normal PR109 merge17b0e328 (base a8c8ea1 plus reviewed4011805; docs only after cleared4d0226e). The only conflict was SessionSteering imports/textarea; both behaviors were preserved. The focused target includes peer keyboard/editor-observation cases and explicitly drives the existing saved-message form test via Enter. No new GUI/model run or cursor-fix claim.
