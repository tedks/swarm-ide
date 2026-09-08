# Show current agent status beside its latest accomplishment

This ExecPlan follows `.planning/PLANS.md` and is updated as the work proceeds.

## Purpose / Big Picture

An operator should see whether a registered agent is working now and what that
same agent last accomplished. The latest saved Work Log outcome appears as a
one-line rail subtitle, expanding when the agent is selected. Clicking remains
conversation navigation. Historical outcome labels must not pretend to describe
current liveness, and the open outcome document must follow refreshed data.

## Progress

- [x] Created fix/agent-status-summary from reviewed6e652e19, preserving the old branch.
- [x] Read ROOT findings: H7's saved outcome is already completed; App retains a stale object copy.
- [x] Read-only typed publication from the existing bundle reports ROOT working and H7 completed; no classifier change justified.
- [x] Share the existing single Work Log controller and add current-status/summary rail behavior.
- [x] Prove selected outcome refresh, exact session matching and no duplicated request lane.
- [x] Focused observer/Work Log/cockpit checks pass; native implementation review is CLEAN.
- [x] Fresh packaged real-registry/saved-outcome proof passes on owned virtual X11, with no model turn or renderer error.
- [ ] Push final implementation, record accomplishments and hand off for ROOT normal landing/adoption.

## Surprises & Discoveries

The old panel uses historical entry.state as a RunStatus badge and App stores the
whole selected entry. Both can display stale history as if it were current work.
ROOT's read-only investigation found valid current lifecycle events and intact
wire fields, but did not localize the reported all-unknown behavior.

A fresh ExternalAgentService instantiated from the managed worker bundle returned
ROOT working and H7 completed through its typed response. A fresh packaged desktop
also showed those states, including H7's summary and conversation selection. Neither
probe intercepted the existing core process's IPC or inspected the user's exact
window; the original all-unknown observation remains unlocalized.

The optional living-design check confirmed the new mappings, but an unchanged
repository-source-list test expects a hardcoded 20 links while the reviewed base
already contains 22. That run is 80 PASS / 1 FAIL, not an all-green design suite.
This change does not touch the repository node's source list or that test.

## Decision Log

Do not guess a run state from old outcomes, file age or process presence. First
observe the actual typed core response. Share one Work Log request/controller
between rail, panel and selected detail; UI selection never starts summarization.
Keep the saved text, recording flags, drafts, fork hierarchy and message controls.
Only the rail portion of ExternalAgents.tsx and narrow App Work Log joins are owned.

## Outcomes & Retrospective

Implemented a single shared Work Log observation, exact-session latest summaries
and refreshed outcome documents selected by ID. Historical rows now describe past
turns instead of showing a current-work badge. No parser, protocol, core producer,
historical text or Ditz-recording semantics changed. ROOT owns normal merge and
adoption, including checking the existing window after adopting the reviewed build.

Two new summary cases first failed while 141 observer checks passed (one existing
real-send test stayed skipped). The final focused run passed 143 observer tests,
28 Work Log tests and 30 cockpit tests with both TypeScript boundaries. These
counts overlap and are not a full-suite claim. The packaged scenario passed in
914 ms (1.729 s harness), zero renderer errors, cleanup complete on :90/55422.
The selected-detail refresh regression was added with implementation; it was not
independently recorded as a pre-correction RED.
The later proof-only evidence-label correction names before/after summary
equality and driver model actions precisely; the original evidence JSON is kept
unchanged, and that naming-only delta did not repeat the GUI journey.

## Context and Orientation

`core/external-agents.ts` projects registered transcript lifecycle. The rail in
`app/renderer/external-agents/ExternalAgents.tsx` displays it. `WorkLogPanel.tsx`
currently owns one polling hook and renders historical outcomes. `App.tsx` mounts
both surfaces and stores a selected Work Log object, so updates cannot replace it.

## Plan of Work

Inspect a real read-only publication through the typed core before a parser fix.
Lift or expose the existing Work Log reader so App owns one instance and passes
its observation into panel and rail. Match summaries by exact session ID and
choose the newest written outcome by timestamp with stable tie behavior. Store
selected outcome ID and resolve it from each observation. Show historical outcome
time/status separately from current registered lifecycle, with no text mutation.
Update the corresponding living component docs in the same PR.

## Concrete Steps

Work only in `/home/tedks/Projects/swarm-ide/usability-agent-state`. Materialize
dependencies with `nix develop --command pnpm install --frozen-lockfile`. Use
focused Bazel targets `//tools/demo-agents:unit`, `//tools/work-log:check` and
`//tools/operator-cockpit:checks` as applicable; do not run the broad legacy suite.
Create a draft PR early and maintain the assigned Ditz issue. Read-only actual
probes or one owned virtual desktop proof may complement mounted checks.

## Validation and Acceptance

Cover working/completed/failed/waiting/unknown publication and a resumed turn.
Two agents with the same label must never share summaries; the latest entry wins
by timestamp, not array order or label. Selection expands that same text without
losing navigation. Refresh updates an open outcome by ID without stealing focus.
The rail, panel and detail together must issue only one Work Log read per interval
and no model/start/stop/send action on selection. Preserve existing controls.

## Idempotence and Recovery

Do not modify the managed preview or user's saved Work Log. Tests use disposable
roots and owned virtual X11 only. Registered transcript probes are read-only;
never message or resume real agents to make status proof. Preserve old branches.

## Artifacts and Notes

Evidence and final handoff go to `/tmp/swarm-ide-agent-status-summary.2md4dp`.
Keep current head, scope and next step in its seam.md; queue only needed decisions.

## Interfaces and Dependencies

Reuse AgentLifecycle/RunStatus, WorkLogEntry and existing typed core requests.
No new watcher, summarizer, provider, registry or transport authority is added.
