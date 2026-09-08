# One agent conversation header

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Root and other registered agents should be the conversation header, not tabs above a second repeated title. Session-specific Terminal, Worktree and Details icons sit to the right. Switching tabs must preserve the one mounted sender, messages, drafts and scroll positions.

## Progress

- [x] 2026-09-08: Started the designated clean branch from reviewed master 3ee62d6, preserving the completed branches.
- [ ] Implement the header and explicit native-tools access.
- [ ] Check mounted identity, empty/reconnect behavior and draft retention; native review and bounded owned visual check.
- [ ] Push ready PR, record Ditz outcomes and hand off to ROOT.

## Context and Orientation

`app/renderer/agents/AgentDock.tsx` owns the tabs and keyboard controller. `app/renderer/external-agents/AgentConversation.tsx` owns one transcript and sender. `app/renderer/App.tsx` supplies the selected external client and shared SteeringMemory. These stay mounted: tabs choose a session rather than creating another sender. Existing native controls and saved history live in the dock's hidden home panel.

## Decision Log

The header receives a presentation-only actions slot from App. A shared actions component uses the selected client's existing validated terminal command and worktree identity; it creates no process. Embedded AgentConversation omits its old heading, while standalone consumers keep their heading.

Native tools move behind an explicit icon button, not a permanent generic tab. Existing drafts and explicitly selected native runs remain reachable; a real draft gets a Draft tab. Closing the last conversation shows a neutral selection prompt and leaves native-tools access available. Discovery does not select another agent to fill that empty space.

## Surprises & Discoveries

The previous fallback always selected the permanent Native tab. Removing that category requires an explicit empty view; silently selecting another label without reading that session would display the wrong conversation. Reconnecting observations must retain disabled tabs and keep actions unavailable.

## Plan of Work

Add the actions slot and compact header to AgentDock, retaining OverflowStrip and the existing keyboard exclusions. Extract only selected-agent actions from AgentConversation and wire App's same client into that slot. Keep the sender unkeyed. Update local CSS and the living cockpit/agent design descriptions. Extend the existing mounted tab tests with actions, last-close, reconnect and actual draft access.

## Concrete Steps

In `/home/tedks/Projects/swarm-ide/usability-cockpit-layout`, run `nix develop --command bazel test --jobs=3 //tools/operator-cockpit:conversation-tabs --test_output=errors`. This includes both TypeScript boundaries and focused dock/chat/outbox/design tests. Use the existing owned virtual desktop harness for a bounded visible header check if useful; never automate the user's desktop or send model messages.

## Validation and Acceptance

Root appears once in the header; other conversations cycle with Ctrl-Tab and reverse with Ctrl-Shift-Tab. Header icons apply only to the selected session. Terminal copies the supplied command. No Native/New category appears on startup; saved native controls remain available through Agent tools, and an opened draft is not lost. Reconnect, last-close and long labels remain usable. Existing pending read-only input, drafts, receipts and source/camera retention checks stay intact.

## Idempotence and Recovery

No transport, storage schema, process or protocol changes. Preserve previous feature branches and use a normal reviewed PR; ROOT handles merge and shared app adoption. Stop only owned test resources.

## Interfaces and Dependencies

Use React and the existing inline stroked SVG icon style. `AgentDock.conversation.actions` is an optional React node. `AgentConversation` gains only an embedded-header presentation option. No additional tab controller or registry is introduced.

## Artifacts and Notes

Current progress and final evidence live in `/tmp/swarm-ide-agent-tabs.gd9Pg9/seam.md` and `verification.md`. The user already started Ditz `swarm-unified-agent-header`.

## Outcomes & Retrospective

Implementation pending. Native-only proportional review and local focused evidence are the requested gates; no hosted CI or legacy full-suite work.
