# Make saved-message status describe what we know

This ExecPlan follows `.planning/PLANS.md` and is maintained with the implementation.

## Purpose / Big Picture


An operator should not see a permanent waiting indicator after their message has reached an agent. The current sender can prove acceptance into Codex's queue, but cannot correlate that queue item with a consumed transcript message. This increment makes the saved-message indicator describe the completed submission, **Sent to queue**, rather than falsely claiming that the message is still waiting or has been received.

## Progress


- [x] (2026-09-08) Read the current sender, outbox, canonical user-message reader and the supplied real ROOT record without modifying any agent or queue.
- [x] (2026-09-08) Confirm the bounded stopping boundary: the queue receipt exposes a queue item UUID; the user-message event exposes a client UUID and no queue-item link.
- [ ] Add regression coverage for submitted status, matching text/replies, different sessions and reload retention.
- [ ] Change only shared outgoing presentation and its design explanation; run focused Bazel checks and native review.
- [ ] Push the reviewed PR, sync accomplishment/follow-up notes and hand back without app adoption.

## Surprises & Discoveries


The existing design already distinguishes queue item IDs from input client IDs. The real supplied user-message record has `client_id` and message/media fields, but no queue item, receipt, submission or session field. Session identity comes from the separately validated rollout header. The current queue command's public help exposes submission, not receipt inspection. A user message at 17:25:19.576Z confirms the reported input reached ROOT, but does not identify which saved queue receipt to update.

## Decision Log


- Decision: Do not add an unproved ID join or infer delivery from text, age, replies or disappearance from a queue. Keep existing storage and transport statuses intact; change only their user-facing meaning to a completed queue submission.
  Rationale: The user explicitly authorized this small fallback if the current public records lack exact correlation. Duplicate text, copied fork history and missing acknowledgements must not become false delivery.
  Date/Author: 2026-09-08, delivery-state.
- Decision: No observer scheduling, session parser, queue database, daemon, resend or active-owner changes.
  Rationale: None supplies the absent relationship within this assignment. The chat-speed owner can finish independently.
  Date/Author: 2026-09-08, delivery-state.

## Context and Orientation


`core/external-agents-send.ts` runs the existing short-lived queue command and returns its UUID as `receiptId`. `app/renderer/external-agents/steering-memory.ts` saves exact outgoing text before dispatch, then settles only the original local message and target. `message-outbox.ts` defines storage and shared display metadata; both `AgentConversation.tsx` and `SessionSteering.tsx` render its compact symbol with accessible name and hover explanation. `core/external-agents-activity.ts` displays canonical user-message events independently. This increment changes no ID or owner contract.

## Plan of Work


First add expectations in `tests/message-outbox.test.tsx` for a static Sent to queue symbol shared by saved rows and composer receipts. Exercise same-text entries, replies, another session and reload without any inferred receipt or resend. Run the existing `//tools/message-outbox:checks` target to record the new assertions failing before the presentation change. Then update that one presentation entry and the matching paragraph in `docs/design/agents.md`. Existing Bazel/source mappings already include all changed executable files; the architecture owner can retain those unchanged.

## Concrete Steps


From `/home/tedks/Projects/swarm-ide/demo-delivery-state`, materialize dependencies with `nix develop --command pnpm install --frozen-lockfile --offline` if needed. Run `nix develop --command bazel test --jobs=3 //tools/message-outbox:checks --test_output=errors`. Request a native read-only review of the branch diff and correct important findings. Use the normal draft-PR/push workflow; ROOT owns merge and managed application adoption.

## Validation and Acceptance


Submitted messages retain their exact whitespace/Unicode and Copy action through a held response and memory reload. A successful queue acknowledgement displays **Sent to queue**, not ongoing **Queued** or **Received**. A matching canonical user message or later assistant reply, including a different session and inherited-looking history, does not alter saved identity or status. No added timer, request, model turn or GUI automation is needed for this shared presentation change. The cheap real-record check reads only the supplied ROOT JSONL record's timestamp and field names; no transcript text is committed.

## Idempotence and Recovery


Storage remains version 1 and preserves queued records unchanged. Existing saved messages automatically receive the new display without migration or data writes. Failed/rejected/sending states and no-replay behavior remain unchanged. Do not delete user queues, old messages, worktrees or branch history.

## Artifacts and Notes


Task handoff and bounded read-only findings live in `/tmp/swarm-ide-demo-close.BrSWmt/delivery-state/seam.md` and `verification.md`. No private transcript payload is added to the repository. Remaining exact delivery correlation will be tracked as a separate Ditz issue rather than marked implemented.

## Interfaces and Dependencies


No new dependency, public protocol field or observer seam. `outgoingPresentation.queued` keeps its current storage key while changing its symbol, accessible label and explanatory hover. The existing outbox checks remain the supported Bazel target.

## Outcomes & Retrospective


Implementation and review pending. This is deliberately a truthful presentation repair, not a queue-latency or delivered-status implementation.
