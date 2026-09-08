# Keep the selected conversation responsive

This ExecPlan follows `.planning/PLANS.md` and remains a living record.

## Purpose / Big Picture

The selected agent conversation should not wait behind a fleet refresh when both
are due, or incur an extra full second after a slow transcript read. Keep the
existing one-request-at-a-time observer and minimum automatic start intervals of
one second for conversation reads and three seconds for registry/fleet reads.
This changes display scheduling only, not message delivery or model response time.

## Progress

- [x] (2026-09-08 18:07Z) Confirmed clean assigned worktree/base and started Ditz
  `swarm-selected-conversation-latency`; inspected observer and direct tests.
- [ ] Add deterministic regressions that expose the delay before changing code.
- [ ] Apply a small scheduling correction and update the living design.
- [ ] Run focused tests/typechecks, native review, push ready PR and hand back.

## Surprises & Discoveries

`ExternalObserver.pump` checks the fleet deadline before the selected deadline.
`run` sets the next deadline from completion time, so a 700 ms read makes the next
automatic read start 1.7 seconds later. The bridge cannot cancel a read: an already
running fleet request must drain before the selected conversation can refresh.

## Decision Log

Use the oldest due deadline, preferring the selected conversation when deadlines
tie. A newly completed read advances its deadline from its start time, not its
completion time. This naturally gives an overdue fleet read a turn without extra
queues or concurrency. Initial/core-reset registry discovery remains first when
there is no snapshot. Explicit user actions retain their existing priority.

Automatic requests never start more often than the existing one-/three-second
intervals; missed intervals collapse into one request, not catch-up batches.
Selection, core generation and visibility invalidation remain unchanged.

## Outcomes & Retrospective

Implementation and evidence pending. No measured terminal-to-IDE latency claim.

## Context and Orientation

`app/renderer/external-agents/client.ts` owns `ExternalObserver`, the renderer's
single transport lane for registry/fleet snapshots, selected transcript reads
and explicit handoffs. A deadline is the earliest next automatic request time.
`tests/external-agents-live.test.tsx` mounts the actual hook with controlled bridge
responses and a fake clock. It already checks visibility, recovery and selection.
`docs/design/agents.md` documents the behavior; `.swarm/plans.json` maps the agent
component to actual source/build inputs, coordinated with the architecture owner.

## Plan of Work

First add held-read, tied-deadline and fleet-fairness cases in the existing live
test file. Hold promises rather than sleeping, count active requests and assert
exact start times. Then adjust only `pump` arbitration and `run` deadline updates.
Keep response parsing, handoff, sender and UI state untouched. Document the
achieved scheduling guarantee and the unavoidable wait for an in-flight request.

## Concrete Steps

From `/home/tedks/Projects/swarm-ide/demo-chat-speed`, materialize dependencies
with `nix develop --command pnpm install --frozen-lockfile`. Run the selected cases
through the existing Bazel entry point:

    nix develop --command bazel test --jobs=3 //tools/demo-syntax:editor-tests --test_arg=tests/external-agents-live.test.tsx --test_output=errors

Then run `nix develop --command bazel test --jobs=3 //tools/demo-agents:unit
--test_output=errors` for the observer, steering and typed boundaries. Use a
native Codex review of the actual diff and fix important findings to convergence.
Push granular commits and a draft PR early, mark it ready only after verification.
ROOT, not this worker, performs normal merge and managed-app adoption.

## Validation and Acceptance

At equal three-second deadlines a selected tail is published before a held fleet
read starts. A read held for 700 ms starts its successor at the one-second start
deadline, not 1.7 seconds. A read held beyond both deadlines cannot starve fleet
refresh; no request overlap, second timer or catch-up burst is permitted. Selecting
another agent during a held read publishes only that latest selection. Hidden,
unmounted and recovered views retain their existing response invalidation rules.
The controlled hook observation is the cheap display check, not a real model turn
or measurement of the user's physical desktop.

## Idempotence and Recovery

All edits stay in this isolated worktree. Do not restart the shared application,
send test messages, change queues or edit other projects. Tests create only owned
resources; stop this worktree's Bazel server at handoff. Preserve committed source
and issue history, and file any unrelated limitation rather than extending scope.

## Artifacts and Notes

Keep concise progress and evidence in `/tmp/swarm-ide-demo-close.BrSWmt/chat-speed/`:
`seam.md`, `verification.md` and the final marker-qualified `final-recap`.

## Interfaces and Dependencies

No public API, protocol, dependency or sender change is intended. Existing
`//:quality_sources` includes the observer/tests as inputs; existing focused Bazel
targets cover them. Coordinate the additive observer source mapping with the
architecture owner, who owns `.swarm/plans.json` for this wave.

Revision 1: recorded the observed scheduling mechanism and narrow acceptance
before implementation, rather than attributing upstream message delay to it.
