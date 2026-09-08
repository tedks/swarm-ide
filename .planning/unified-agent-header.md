# One agent conversation header

This living plan follows `.planning/PLANS.md`.

## Purpose / Big Picture

Root and other registered agents should be the conversation header, not tabs above a second repeated title. Session-specific Terminal, Worktree and Details icons sit to the right. Switching tabs must preserve the one mounted sender, messages, drafts and scroll positions.

## Progress

- [x] 2026-09-08: Started the designated clean branch from reviewed master 3ee62d6, preserving the completed branches.
- [x] 2026-09-08 15:43Z: Implemented the header and explicit native-tools access in 979e1f9; opened/pushed PR120.
- [x] 2026-09-08 15:49Z: Focused mounted checks, native fix-delta review and bounded owned visual check complete. Corrected the review-found missing-tab focus fallback in b9fa7da.
- [x] 2026-09-08 15:52Z: PR120 ready/pushed, review recorded, Ditz closed/synced. Owned GUI cleaned and Bazel stopped; ROOT receives the landing handoff.

## Context and Orientation

`app/renderer/agents/AgentDock.tsx` owns the tabs and keyboard controller. `app/renderer/external-agents/AgentConversation.tsx` owns one transcript and sender. `app/renderer/App.tsx` supplies the selected external client and shared SteeringMemory. These stay mounted: tabs choose a session rather than creating another sender. Existing native controls and saved history live in the dock's hidden home panel.

## Decision Log

The header receives a presentation-only actions slot from App. A shared actions component uses the selected client's existing validated terminal command and worktree identity; it creates no process. Embedded AgentConversation omits its old heading, while standalone consumers keep their heading.

Native tools move behind an explicit icon button, not a permanent generic tab. Existing drafts and explicitly selected native runs remain reachable; a real draft gets a Draft tab. Closing the last conversation shows a neutral selection prompt and leaves native-tools access available. Discovery does not select another agent to fill that empty space.

## Surprises & Discoveries

The previous fallback always selected the permanent Native tab. Removing that category requires an explicit empty view; silently selecting another label without reading that session would display the wrong conversation. Reconnecting observations must retain disabled tabs and keep actions unavailable.

Native review found that closing a background tab from the untabbed Agent tools view tried to focus a nonexistent tab. The fallback now focuses the Agent tools icon; a mounted regression covers this exact interaction.

The initial visual driver's textarea-node identity assertion was too strong: the existing SessionSteering intentionally renders no textarea while loading a different session. The corrected driver checks the component's stable field ID and persistent conversation/list, along with exact restored drafts. This was a proof correction, not a change to the accepted PR117 loading behavior. The original failed run had zero renderer errors and complete owned cleanup.

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

One header is implemented with current-session icons and no permanent Native/New tab. The existing sender, outbox and native controls remain intact. Native initial review found one focus issue; the b9fa7da correction returned CLEAN on a delta review. Foreign reviews and hosted CI were intentionally not run under the user's native/local-only directive.

Final focused validation uses the existing `//tools/demo-syntax:editor-tests` wrapper with seven explicit files: registered-conversation-tabs, conversation-scroll, conversation-cockpit, agent-dock, message-outbox, chat-input and external-agents-ui (all `.test.tsx`). This passed 75 tests and both TypeScript boundaries in 14.2 seconds. The broader historical conversation-tabs target also contains living-design: that untouched test expects Show all 20 source files although the unchanged manifest now has 22. Its other 72 cases passed. The brittle selector is recorded separately in Ditz swarm-design-source-count-selector; no plan behavior was modified or old failure hidden.

Owned packaged evidence is `/tmp/swarm-ide-agent-tabs.gd9Pg9/visual-corrected/run.TlMm7z`: real ROOT/child transcript reads, native Ctrl-Shift-Tab, retained draft/source/cameras, one icon row at normal and deliberately constrained 320px width, 1.497-second scenario, zero sends/model turns/renderer errors, cleanup complete. This precedes only the reviewed small focus fallback; that delta has its exact mounted regression, not a repeated GUI claim. ROOT retains responsibility for normal merge and shared app adoption.

Updated after implementation to record actual proof limits and review correction, rather than claiming textarea DOM lifetime across a loading state that the existing component does not provide.
