# Switch registered conversations without losing your place

This ExecPlan follows .planning/PLANS.md. It is a bounded follow-up to the completed Plan-first layout in PR107, not a new agent runtime.

## Purpose / Big Picture

Running registered agents should appear as named conversation tabs. The operator can click a tab or use Ctrl-Tab/Ctrl-Shift-Tab while focused inside the agent pane. Each choice uses the same session identity and read path as the sidebar. New registrations must not select themselves or send anything. Closing a tab hides that view; it never stops its agent.

## Progress

- [x] Read the user clarification and inspected existing selection, draft memory and keyboard ownership.
- [ ] Compose the reviewed lifecycle and outgoing-message inputs and implement bounded registered tabs.
- [ ] Preserve per-session scroll through a tiny coordinated conversation hook; retain one message owner.
- [ ] Add focused mounted regressions, native review, pushed PR and human Ditz notes.

## Context and Orientation

App.tsx owns externalAgents and calls showConversation(id), which invokes externalAgents.read(id). This is distinct from AgentDock's native run client.select(). AgentDock.tsx owns the existing overflow tab strip and shared conversation panel. One App-owned SteeringMemory keeps drafts/outgoing state keyed by registered session ID. AgentConversation.tsx currently has one scroll list and resets to bottom when the selected ID changes; that file belongs to the outbox owner, so its viewport-only hunk is coordinated before edits. Shared lifecycle states come from protocol/agent-lifecycle.ts; no presentation-side transcript classifier is added.

## Assumptions and Boundaries

Only registered sessions enter this UI. Working/waiting sessions can appear automatically from the existing lifecycle field; completed, failed or unknown history appears when the user opens it. The user can dismiss a tab, and background observation must not reopen it on every refresh. An explicit sidebar open can reopen it. If a session disappears from registration, do not manufacture a live target. Keep the single conversation and sender mounted; switching tabs must not create another polling lane or send owner. The existing source editor, graph cameras and desktop Alt-Tab are outside the shortcut's scope.

## Decision Log

Use a small stacked PR above feature/usability-cockpit-layout so the completed layout can land independently. The current registered-session read API is the only selection path. Ctrl-Tab is a bubbling agent-pane shortcut, ignored during composition, default-prevented events, and open modals/palette. Existing native arrow-key tab navigation remains manual activation. Lifecycle labels are consumed from the reviewed shared producer, not inferred from registration existence.

## Surprises & Discoveries

Draft and receipt identity already survive A-to-B-to-A selection; scroll does not. Mounting one AgentConversation per tab would accidentally create multiple SessionSteering owners. Preserve the single mount and add only view memory if the exact owner seam is agreed.

## Plan of Work

Normally compose reviewed activity/lifecycle and outbox commits, preserving their independent keyboard/sender behavior. Extend the optional conversation prop with registered summaries, selected ID and the existing selection callback. Keep a bounded list of opened tabs plus dismissed IDs; reconciliation adds eligible live registrations without activating them. Closing a selected tab selects another already-open registered conversation, or returns to the existing chooser/native home when none remain. Add a visible shortcut hint and close affordances without nesting buttons. Add the coordinated viewport memory only after agreeing the exact hunk with outbox.

## Concrete Steps and Validation

Work only in /home/tedks/Projects/swarm-ide/usability-cockpit-layout on feature/registered-conversation-tabs. Run tooling through nix develop and tests/builds only through Bazel. A focused target tests registration, explicit historical opening, no focus theft, keyboard cycling/IME/modal exclusions, dismissal/reopening, disappearance, per-session drafts/outgoing receipts and scroll. Reuse existing conversation tests and mock bridge records; do not send actual user messages as a test. Native review checks the change and any correction delta. No full legacy suite, hosted CI or physical desktop automation is required under the wave instructions.

## Idempotence and Recovery

No registry, transcript, process or persisted outbox mutation is introduced by tab actions. Preserve source branches and the completed PR107. If an integration API is not available, report the narrow dependency; do not duplicate sender or lifecycle implementations.

## Artifacts and Notes

Keep tabs-seam.md, tabs-verification.md and tabs-final-recap under /tmp/swarm-ide-usability.BirZCk/cockpit-layout. Track swarm-registered-conversation-tabs with human accomplishment notes and sync Ditz. ROOT owns normal landing and managed app adoption.

## Interfaces and Dependencies

App/AgentDock are owned here. Reviewed activity/lifecycle provides current execution state and safe historical Work Log labels. Outbox provides retained outgoing messages and the single conversation owner. Optional props preserve existing mock/native callers. Scoped design documentation must distinguish tab display from agent lifecycle or termination.

## Outcomes & Retrospective

Implementation is starting. PR107 remains complete and unchanged; this follow-up is independently reviewable.
