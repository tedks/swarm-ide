# Keep outgoing agent messages visible

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

An operator can submit an instruction, switch agents or reload the renderer, and still find its exact text and queue state in the conversation. A copy action supports deliberate recovery in the terminal. Queue acceptance is not proof that the running agent read the instruction.

## Progress

- [x] (2026-09-08) Read the current sender, shared assignment and UI ownership; started `swarm-message-outbox`.
- [ ] Implement bounded saved outgoing messages and mounted conversation rows.
- [ ] Join the chat owner's submission hook and prove held, failed and reloaded messages.
- [ ] Native scoped review, focused Bazel checks, documentation, pushed ready PR and handoff.

## Assumptions and boundaries

The Electron profile provides browser storage for private operator UI state; it is not repository data or an agent transcript. A send must be saved before dispatch. Storage denial, malformed saved data or full capacity must preserve the editor text and stop dispatch rather than silently evict unresolved instructions. Queue receipts currently identify stored queue items, not the separate user-input client IDs. No text match, missing queue row or later assistant activity establishes consumption. This increment must not resend the two existing ROOT messages, start a competing session, or send a model request as a test.

## Context and Orientation

`core/external-agents-send.ts` owns one short-lived Codex queue process. `app/renderer/external-agents/SessionSteering.tsx` owns the form, but the chat-input department edits it. `steering-memory.ts` currently retains one draft and last receipt per selected session only in memory. `AgentConversation.tsx` renders bounded transcript entries. This work adds a bounded local saved outbox and makes the shared memory notify both form and conversation. App layout remains the cockpit department's responsibility.

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

## Decision Log

Keep uncertain messages indefinitely within an explicit bounded outbox rather than evicting old pending messages. Keep storage local to the operator profile rather than adding a repository artifact or new daemon. Separate this usable fix from an unsupported active-terminal takeover.

## Outcomes & Retrospective

Implementation and verification are in progress. ROOT will perform normal merge and managed preview adoption after the reviewed handoff.

Revision note: initial plan records concrete retention behavior and narrow peer ownership before implementation.
