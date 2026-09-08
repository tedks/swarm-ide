# Registered live fleet

The existing external-agent adapter observes only explicitly registered Codex
sessions. Fleet snapshots now carry an additive `fleet` collection of bounded
session details, so consumers can follow every registered worker without
changing the selected conversation. `useExternalAgents().fleet` exposes it.

Each summary carries its operator-registered worktree and control mode. Worktree
identity is not inferred from a nearby command or the IDE's current repository.
Entry IDs identify the transcript inode and absolute byte position and remain
stable when the tail window advances. Actual tool arguments provide command,
working directory, file path and patch information when those are literals;
arbitrary tool code is never evaluated. A patch event records a tool request,
not a guarantee that the patch succeeded. User input, reasoning and raw tool
outputs are not included in this projection.

Reading the fleet never selects tmux panes or sends messages. A selected detail
may expose copyable terminal commands only after its existing live target is
validated. Send continues through the supported `codex queue` route to that
same owner; no second process resumes the conversation.

The implementation is `protocol/external-agents.ts`, `core/external-agents*.ts`
and `app/renderer/external-agents/*`, built into `//:desktop-bundle`. The focused
live-fleet checks cover multi-session reads, tail identity, event extraction and
unchanged send/ownership boundaries. The shared system design links this
observer boundary separately from IDE-owned native execution.
