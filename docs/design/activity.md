# Activity and the Work Log

Activity answers “what is happening?” The Work Log answers “what was done?”
Both are persistent cockpit instruments, but they serve different reading speeds.

Activity is a timestamped stream: an agent edited a file, ran a command, received
a tool result or completed a turn. It should preserve agent/worktree identity so
opening an event reveals the right source. A command starting is not a build
finishing; a reported file edit and the current Git diff are distinct observations.

The Work Log groups evidence into understandable accomplishments: what changed,
why it matters, what was checked and what remains. Active entries lead back to the
running agents; completed sessions remain below. A completed Ditz issue should
retain these outcome notes in-repo, not just disappear from the live roster.

## Current implementation and next increment

| Part | Actual source | Current behavior |
| --- | --- | --- |
| Observed agent activity | [ObservedActivity.tsx](../../app/renderer/external-agents/ObservedActivity.tsx), [external-agents.ts](../../core/external-agents.ts) | Bounded selected-session transcript tail |
| Recorded logical journal | [JournalPanel.tsx](../../app/renderer/changelog/JournalPanel.tsx), [changelog.ts](../../core/changelog.ts) | Reads validated `.swarm/changelog.json` |
| Journal authoring | [changelog-authoring.ts](../../core/changelog-authoring.ts) | Exports evidence and validates supervised summary output |
| GitHub PR view | [GithubPullRequests.tsx](../../app/renderer/changelog/GithubPullRequests.tsx), [github-prs.ts](../../core/github-prs.ts) | Deliberate bounded refresh through ordinary `gh` |
| Readable times | [ActivityTime.tsx](../../app/renderer/ActivityTime.tsx) | Short visible time with full timestamp on hover |

The saved journal is operational, but it is not a running in-app summarizer.
K7's planned Work Log watches registered work at meaningful boundaries, batches
new evidence and uses one in-flight configurable harness/model worker, default
Codex `gpt-5.6-luna`. It should write deduplicated Ditz accomplishment notes through
the CLI. That online producer is prospective until integrated. F7 supplies the
separate granular whole-fleet Activity stream.

## Build connections

The listed modules feed `//:quality_sources` and `//:desktop-bundle`.
[tools/demo-journal/BUILD.bazel](../../tools/demo-journal/BUILD.bazel) declares
`//tools/demo-journal:author` for supervised authoring and
`//tools/demo-journal:smoke` for its packaged evidence journey.
Real summaries and controlled transcript fixtures must remain distinguishable in
verification without covering the normal UI in diagnostic prose.

See [logical changelog](../logical-changelog.md) for saved-report behavior and
[the operator plan](../swarm-operator-hour.md) for the new online Work Log.
