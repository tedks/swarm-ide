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
| Execution lifecycle | [agent-lifecycle.ts](../../core/agent-lifecycle.ts), [shared lifecycle](../../protocol/agent-lifecycle.ts) | Own-session start, completion and blocking-input evidence; separate from availability |
| Send and terminal handoff | [external-agents-send.ts](../../core/external-agents-send.ts), [external-agents-handoff.ts](../../core/external-agents-handoff.ts) | Queue to checked existing session; select checked pane |
| Registration | [tools/session-registration](../../tools/session-registration/BUILD.bazel) | Explicit known rollout/session/pane/worktree, not an account-wide scan |

Trusted-local execution uses the operator's normal harness configuration and
authentication. The renderer still has no raw process authority. Interactive
approvals remain explicit; stopping an IDE-owned run cleans up its owned processes.
Reading saved history never resumes a model or replays commands.

The normal cockpit leads with the registered **Conversation** and its message
box. On first observation it restores a still-registered previous selection, or
chooses the unique locally observed top-level agent in the registered swarm.
That agent may itself be a fork of an older, unregistered session; its actual
parentage stays visible and is never rewritten. Ambiguous roots and examples require
a deliberate choice. Refresh, core recovery and disappearance of a selected
registration never silently select another agent. The preference contains only
the session ID; a new observation still validates availability before controls
are enabled.

Selecting a child switches its conversation in the persistent dock; source,
task, diff and graph surfaces remain intact. Context shows agent facts, registered
worktree/briefing links and checked terminal commands. `AgentConversation.tsx`
renders bounded user-message events and assistant replies with readable times.
Injected user-role context, reasoning and raw tool results are not conversational
input. The tool Activity stream excludes user messages.

`SessionSteering.tsx` uses one `SteeringMemory` owner in App. Per-target drafts,
pending sends and receipts survive selection, loading, tab changes and development
remounts. Before a send, `message-outbox.ts` saves its exact text, target and local
message ID in the operator profile's browser storage. `AgentConversation.tsx`
shows that outgoing row immediately, interleaved by time with transcript messages,
with a compact queue state and exact-text Copy action. Submitted messages survive
renderer reload and application restart in that same profile/origin; unsent
composer drafts still live only in memory. Outgoing text is never inserted into
the agent's message body as marker or bookkeeping data.

Queue acceptance remains **Queued**, not delivered: the queue receipt identifies
a queue item, not the separate client ID in a consumed user-message event. A
matching text, a later reply, or a missing queue item does not establish receipt.
Consequently a consumed message may appear in the transcript alongside its saved
queued copy until a future supported correlation path is added. Interrupted sends
reload as **Unconfirmed**, never retry. The outbox holds at most 100 messages and
512 KiB; capacity, invalid storage or write failure before dispatch stops sending
and preserves the draft, rather than silently evicting unresolved messages. An
explicit archive/export workflow is tracked as `swarm-outbox-archive`.

Terminal-owned sessions keep their existing queue and tmux owner; viewing them
launches nothing. Official app-server `turn/steer` requires the running owner and
its active turn ID. The inspected installation has no running default app-server
control socket; creating another server/resume is not a supported shortcut for
steering that existing TUI. The checked tmux command is the immediate manual route.

Both registered-session and native Codex message boxes use `use-chat-submit.ts`:
Enter submits their existing form, Shift-Enter inserts a newline, and composition
confirmation or a held Enter never sends. The form's original target, validity
and pending-request guards remain authoritative; this keyboard shortcut adds no
sender, retry or delivery claim. The shortcut is also available in the textarea's
hover hint. Focused checks in `tests/chat-input.test.tsx` mount both real forms
and test their existing bridge paths with controlled responses.

Native trusted conversations, approvals, forks, new drafts and saved history
remain mounted in the secondary **Native agents / New** tab. Legacy stored runs
keep their individual tabs; the competing old run-list mount is removed. Exact
obsolete isolated-policy capability text stays suppressed when trusted controls
exist, while operation errors remain visible. This changes presentation, not
capabilities, run ownership or approvals.

Native fork preserves conversation ancestry; current native children share the
selected workspace rather than automatically allocating Git worktrees. Registered
terminal agents may already occupy different worktrees. The observer refreshes
the selected transcript and fleet Activity; source activation uses the selected
registered worktree.

The implemented fleet observer batches the explicitly registered tails into
one snapshot. Each event retains its containing session and registered worktree;
stable literal command/patch entries survive bounded-tail replacement. The
existing registry timer drives fleet reads rather than creating another agent
platform. Native app-server execution remains a separate owner path. App joins
event activation to the correct-worktree source view; a fleet observation does
not itself grant authority to send to or take over that session.

Each observed session carries an optional `lifecycle`: working means **In
progress**, blocking input means **Waiting on you**, an explicit failed completion
means **Failed**, and successful `task_complete` means **Complete**. The object
also records the evidence time and turn ID. Unknown evidence never becomes
working merely because a transcript or terminal exists. Intentional interruption
is not success or failure. A completed turn does not close every assigned issue.

The core reduces lifecycle before Activity trimming. A bounded per-registration
cache bridges observed append intervals only while the file identity and a raw
overlap anchor agree. Missing bytes, unreadable records, replacement or truncation
discard that continuity. A cold read without a usable boundary can be unknown.
Forks rewrite outer timestamps: preserved `started_at` must establish the turn
after the child's metadata birth; ambiguous second-precision birth-time turns
are not borrowed from the parent. Blocking `request_user_input` waits for its
correlated response; async questions do not pause work. A nonzero tool command or
provider diagnostic is not a failed turn. These modules are shared inputs to
`//:quality_sources` and `//:desktop-bundle`, with focused observer checks at
`//tools/demo-agents:unit`.

Native ownership remains distinct. Its `ready` status alone is not completion:
it also returns to ready after failure or interruption. A consumer must inspect
the known terminal outcome, not label every ready native run successful.

The terminal handoff selects an existing tmux pane and exposes checked copyable
attach/switch commands. Neither copying nor selecting resumes another process.
Queue support reuses the normal harness rather than another exec/resume loop.
The conversation's compact **Terminal** action copies that same checked attach
command for use outside tmux; **Agent details** retains both the attach and
inside-tmux switch commands. It is offered only for the currently selected local,
available detail, and hidden during stale observation or history-only access.
Copying is display-only: a pasted command is not a new identity check and does not
replay pending message text. Explicit launch-time project/tmux association reuses
registration; it does not convert terminal-owned agents into IDE-owned runs.

## Build connections

The conversation/client/message-state files remain shared application inputs to
`//:quality_sources` and `//:desktop-bundle`. `//tools/conversation-cockpit:unit`
checks initial selection, per-target drafts, remount/unknown-delivery behavior,
native controls and the existing observation/messaging cases. Its `:smoke` target
reads actual registered sessions on an owned virtual desktop, but intercepts Send
with a controlled receipt before core; it is not a real message to those agents.
That packaged journey uses native Enter and Shift-Enter in the registered
conversation textarea and samples the source caret across a real background
conversation read, retaining the exact editor instance, state and focus.
The shared keyboard cases can be run with
`//tools/demo-syntax:editor-tests --test_arg=tests/chat-input.test.tsx`;
the helper is already part of the shared application source inputs.

`//tools/message-outbox:checks` exercises saved exact text, queue/error/unknown
states, storage refusal, target identity, restart recovery, chronological rows,
clipboard fallback and the existing bounded queue transport. Its `:smoke` target
uses the actual packaged Electron renderer and profile storage on an owned virtual
desktop: a controlled held send is saved, acknowledged, reloaded, and copied to
that desktop's clipboard. It never sends an instruction to the observed agent.
The new renderer modules are real `//:quality_sources` inputs to `//:desktop-bundle`.

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
