# Make the conversation the operator's home

This living ExecPlan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Opening Swarm should show the registered root agent's conversation and message
box, not instructions to prepare an unrelated draft. Selecting a child should
switch the conversation without losing another agent's unsent message. Source,
task, graphs and worktree inspection remain in the central work area.

## Progress

- [x] Inspected existing observer, dock and messaging state; claimed Ditz
  `swarm-conversation-cockpit`.
- [ ] Add conservative initial/root selection and restore deliberate choices.
- [ ] Mount one conversation/message owner in the dock; leave facts in Context.
- [ ] Preserve native runs, drafts and errors in secondary controls.
- [ ] Focused native/local checks and owned virtual proof; push and hand off.

## Surprises & Discoveries

The current right Context panel owns SessionSteering, while AgentDock leads with
new-run preparation and the left rail repeats an older run list. The observer
already serializes reads and fences stale results; no new harness is needed.
The existing transcript projection deliberately excludes user text, so a small
explicit user-message projection is needed for a two-sided conversation.

## Decision Log

- Default only a unique locally observed root ancestry, never a role label or
  recent activity. Restore a still-registered explicit selection first. Do not
  switch a deliberate choice during refresh or after its removal.
- Keep native controls mounted in a secondary dock tab. Moving presentation must
  not change their ownership or discard queued/unknown delivery state.
- Preserve bounded conversation input/output as text, not executable markup;
  reasoning and raw tool output remain excluded.

## Context and Orientation

`app/renderer/external-agents/client.ts` owns registry and selected transcript
reads through the validated bridge. `SessionSteering.tsx` owns target-specific
drafts and queue receipts. `AgentDock.tsx` coordinates persistent conversation,
native controls and run tabs. `App.tsx` mounts those surfaces alongside source
and graphs. `core/external-agents-activity.ts` extracts bounded visible records;
`protocol/external-agents.ts` validates their exact shape.

## Plan of Work

First add default selection and mounted tests, then present the existing
conversation in a dock panel without a second SessionSteering mount. Remove only
the redundant LiveRunRail mount; retain run tabs, native fleet/history and error
notices. Keep agent facts and registered worktree links in Context. Update
`docs/design/agents.md`, `cockpit.md` and the component build mappings.
Independent navigation/worktree owners can later supply reviewed additive mount
callbacks; they do not block this first usable increment.

## Concrete Steps

Run from `/home/tedks/Projects/swarm-ide/conversation-cockpit` using
`nix develop --command bazel test --jobs=3 //tools/demo-agents:unit` and the
conversation-focused target. Package with `bazel build //:desktop-bundle` under
the same Nix environment. A new owned virtual proof uses port 55401 and a private
display, never the physical desktop. It reads real registered sessions but
intercepts Send before core with a controlled receipt; it never messages workers.

## Validation and Acceptance

Verify unique ROOT selection, ambiguity and remembered-child precedence, no
refresh selection theft, draft/receipt retention through selection/loading,
native history/error visibility and unchanged editor/graph state. The GUI should
show ROOT, allow reading and typing, switch to a child and return, and retain an
unknown-delivery message without retry. Actual transcript reads and controlled
Send evidence must be distinguished.

## Idempotence and Recovery

No unsolicited messages, new provider process, session resume, application
adoption or other worktree edits occur. Use granular commits and a draft PR;
ROOT performs normal merge. Cleanup only owned test resources and preserve the
steerable implementation tmux session until acknowledged.

## Interfaces and Dependencies

Reuse `ExternalClient`, `ExternalDetail`, `SessionSteering` and the existing
`externalAgents.send` queue. Add optional dock conversation content/selection
props; existing native run callers remain compatible. No parser packages or
global configuration changes belong to this stream.

## Outcomes & Retrospective

Implementation in progress. No merged or live Send result claimed.

## Artifacts and Notes

Concise coordination and verification live in
`/tmp/swarm-ide-finish-loop.0vkfJQ/conversation`.
