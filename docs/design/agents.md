# Agent owners, observation and steering

An agent has a conversation, a task, a parent and a source world. It also has one
execution owner. Swarm observes normal terminal agents and owns native IDE agents;
showing them together must not launch a second copy of a running conversation.

## Lower-level map

| Path | Actual implementation | Ownership |
| --- | --- | --- |
| Native trusted conversations/forks | [trusted-local-session.ts](../../core/agents/trusted-local-session.ts), [trusted-local.ts](../../core/agents/trusted-local.ts) | IDE-owned persistent Codex app-server |
| Native history and fleet UI | [trusted-local-store.ts](../../core/agents/trusted-local-store.ts), [TrustedLocalPane](../../app/renderer/agents/TrustedLocalPane.tsx) | Per-workspace persisted observations; targeted controls |
| Registered terminal sessions | [external-agents-registry.ts](../../core/external-agents-registry.ts), [external-agents.ts](../../core/external-agents.ts) | Existing terminal/TUI remains owner |
| Send and terminal handoff | [external-agents-send.ts](../../core/external-agents-send.ts), [external-agents-handoff.ts](../../core/external-agents-handoff.ts) | Queue to checked existing session; select checked pane |
| Registration | [tools/session-registration](../../tools/session-registration/BUILD.bazel) | Explicit known rollout/session/pane/worktree, not an account-wide scan |

Trusted-local execution uses the operator's normal harness configuration and
authentication. The renderer still has no raw process authority. Interactive
approvals remain explicit; stopping an IDE-owned run cleans up its owned processes.
Reading saved history never resumes a model or replays commands.

The normal cockpit leads with draft and trusted-local controls. When those
controls are mounted, the rail/dock omit only the exact connected legacy
`ADAPTER_POLICY_UNAVAILABLE` capability notice and its one-active-isolated-run
caption. Real disconnect/send/run errors remain visible; legacy-only surfaces
retain the notice. This is presentation in `LiveRunRail.tsx` and `AgentDock.tsx`,
not a change to capabilities, approvals, run history or task/draft ownership.

Native fork preserves conversation ancestry; current native children share the
selected workspace rather than automatically allocating Git worktrees. Registered
terminal agents may already occupy different worktrees. The current observer
refreshes the selected transcript; a fleet-wide Activity stream and correct
cross-worktree source activation are planned F7/C7 additions.

F7's concrete pending integration batches the explicitly registered tails into
one snapshot. Each event retains its containing session and registered worktree;
stable literal command/patch entries survive bounded-tail replacement. The
existing registry timer drives fleet reads rather than creating another agent
platform. Native app-server execution remains a separate owner path. C7 joins
event activation to the correct-worktree source view; a fleet observation does
not itself grant authority to send to or take over that session.

The baseline terminal handoff selects an existing tmux pane. A complete
open/copy-terminal route is an operator-increment task, not a claim that selecting
a pane opens a new terminal window. Queue support is reused rather than replacing
the normal harness with another exec/resume loop.

F7 additionally proposes copyable validated attach/switch/location targets from
the checked tmux owner. Copying or selecting that target does not resume another
process. These details are recorded from the PR84 subsystem seam and remain
pending until its reviewed implementation is integrated.

## Build connections

The observed fork rail has local subtree disclosures and an **Older sessions**
toggle. Its default recency view keeps the seven newest dated registrations,
sessions with recorded activity within 30 minutes, undated sessions and the
ancestors of those rows. The selected session and its ancestry always remain
visible. This is a display heuristic, not completion or process-liveness metadata.
All older rows can be restored in their original newest-first hierarchy with one
toggle. Per-session fold choices and the history toggle survive observer refresh;
selected ancestry temporarily opens a folded path without erasing that choice.
No backend requests, raw Activity filtering or Send authority change. These
controls live in `ExternalAgents.tsx`/`external-agents.css` and are covered by
`//tools/demo-agents:unit`, including deep-tree and refresh/selection checks.

The observed fork rail orders siblings newest first using the registered rollout's
`session_meta.payload.timestamp` as optional `createdAt`. It never uses refresh,
file-modification or activity times for ordering. Known creation times precede
missing ones; equal or missing times use ascending session ID for a stable older
record fallback. Parent-first iterative traversal preserves arbitrary depth and
solid ancestry connectors; sorting does not invent missing parents or grandchildren.
The projection passes through `protocol/external-agents.ts` to
`app/renderer/external-agents/ExternalAgents.tsx`. Focused checks at
`//tools/demo-agents:unit` cover metadata compatibility, sibling ordering, deep
connectors and focus stability as activity updates.

Agent core/protocol/renderer modules feed `//:quality_sources` and
`//:desktop-bundle`. `//tools/session-registration:bundle` consumes its dedicated
sources and the shared application sources; `//tools/session-registration:register`
runs that bundle. Registration is tooling, not an agent execution service.
F7 retains these shared application build boundaries and uses the focused
`//tools/demo-agents:unit` checks; its implementation does not edit App layout.
See [trusted execution](../trusted-local-execution.md), [forks](../trusted-child-forks.md)
and [selected live observation](../live-external-activity.md) for implemented limits.
